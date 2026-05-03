"""core/llm_cache.py — Round 70 architectural pass (rev 2).

Generic stale-while-revalidate cache for LLM-derived content.

Goal: Request paths NEVER block waiting for an LLM call.

CRITICAL — Round 70 fix
-----------------------
The previous implementation used ``asyncio.create_task`` from inside
the request handler to fire the regen. That FAILS under Starlette's
``BaseHTTPMiddleware`` because every middleware in the chain wraps
the request scope inside an ``anyio.create_task_group()``. Even
tasks spawned via ``loop.create_task`` get inadvertently held by
the middleware (verified empirically — see Round 70 test report).

Cite: encode/starlette#2160, #2516, #2772.

THE FIX (rev 2)
---------------
Run the regen worker in a **separate OS thread** with its OWN
asyncio event loop. This thread is fully isolated from FastAPI's
event loop / Starlette's middleware, so the request handler can
return immediately as soon as it enqueues a job — there's literally
no anyio task group on the worker thread to hold onto anything.

Communication uses a thread-safe ``queue.Queue`` (NOT
``asyncio.Queue``, which is single-loop). The endpoint enqueues
``(key, compute_fn_factory)`` synchronously; the worker thread
pulls and runs the compute on its own loop.

Note on closures
----------------
The endpoint passes a ZERO-ARG ASYNC CALLABLE that, when invoked,
constructs an ``LlmChat`` and calls ``safe_send``. The worker
thread runs ``compute_fn()`` on its own loop. Because the LLM
client (``emergentintegrations.LlmChat`` / ``litellm``) just makes
HTTPS calls, it works on any loop — no Request-tied dependencies.

Usage (unchanged)
-----------------
```python
cached = await get_or_regen(
    key="...",
    compute_fn=_compute,
    ttl_fresh=600,
    ttl_stale=86400 * 7,
    fallback={...},
)
```
"""
import asyncio
import logging
import queue
import threading
import time
from typing import Any, Awaitable, Callable, Optional, Set

from core.time import utc_now

logger = logging.getLogger(__name__)

# Thread-safe queue. We deliberately use ``queue.Queue`` (sync) NOT
# ``asyncio.Queue`` because the producer (FastAPI loop) and consumer
# (worker thread loop) live on different event loops.
_regen_queue: queue.Queue = queue.Queue(maxsize=2000)

# In-flight set, guarded by a thread lock for cross-thread safety.
_regen_in_flight: Set[str] = set()
_inflight_lock = threading.Lock()

# Worker thread handle (idempotent start).
_worker_thread: Optional[threading.Thread] = None
_worker_started_lock = threading.Lock()

# Lazy mongo handle — populated on first use to avoid import-time
# coupling with server.py (which constructs the client). The worker
# thread will ALSO have to look this up; AsyncIOMotorClient is loop-
# bound so we need a separate motor client on the worker loop.
_db = None
_worker_db = None


def _get_db():
    """Lazy-load the AsyncIOMotorClient db handle from server.py.

    Used by the FastAPI request loop only.
    """
    global _db
    if _db is None:
        from server import db as _server_db  # type: ignore
        _db = _server_db
    return _db


def _get_worker_db():
    """Construct a separate Motor client bound to the worker thread's
    event loop. AsyncIOMotorClient cannot be shared across loops.
    """
    global _worker_db
    if _worker_db is None:
        import os
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import load_dotenv
        load_dotenv()
        mongo_url = os.environ["MONGO_URL"]
        db_name = os.environ.get("DB_NAME", "mintu_database")
        client = AsyncIOMotorClient(mongo_url)
        _worker_db = client[db_name]
    return _worker_db


# ─────────────────────────────────────────────────────────────────────
#  Public surface
# ─────────────────────────────────────────────────────────────────────
async def get_or_regen(
    *,
    key: str,
    compute_fn: Callable[[], Awaitable[Any]],
    ttl_fresh: int = 600,
    ttl_stale: int = 7 * 86400,
    fallback: Any = None,
) -> Any:
    """Stale-while-revalidate cache for LLM-derived content."""
    db = _get_db()
    now_ts = time.time()
    doc = await db.llm_cache.find_one({"_id": key})

    if doc is not None:
        age = now_ts - float(doc.get("computed_at_ts", 0))
        if age < ttl_fresh:
            return doc["value"]
        if age < ttl_stale:
            _enqueue_regen(key, compute_fn)
            return doc["value"]

    _enqueue_regen(key, compute_fn)
    return fallback


def _enqueue_regen(
    key: str,
    compute_fn: Callable[[], Awaitable[Any]],
) -> None:
    """Push a regen job onto the cross-thread queue.

    SYNCHRONOUS — never awaits. Returns immediately so the request
    handler can return its response without being held by Starlette's
    BaseHTTPMiddleware.
    """
    # Auto-start worker thread on first call (idempotent).
    _ensure_worker_started()

    with _inflight_lock:
        if key in _regen_in_flight:
            return
        _regen_in_flight.add(key)

    try:
        _regen_queue.put_nowait((key, compute_fn))
        logger.info("llm_cache enqueued regen key=%s qsize=%d", key, _regen_queue.qsize())
    except queue.Full:
        with _inflight_lock:
            _regen_in_flight.discard(key)
        logger.warning("llm_cache regen queue full, dropping key=%s", key)


async def invalidate(key: str) -> None:
    """Manually drop a cached value (e.g., on user data change)."""
    db = _get_db()
    await db.llm_cache.delete_one({"_id": key})


async def warmup(
    *,
    key: str,
    compute_fn: Callable[[], Awaitable[Any]],
) -> None:
    """Force a synchronous regen now (for cron / scheduled warmup)."""
    db = _get_db()
    try:
        value = await compute_fn()
        if value is None:
            return
        await db.llm_cache.update_one(
            {"_id": key},
            {"$set": {
                "value": value,
                "computed_at": utc_now(),
                "computed_at_ts": time.time(),
            }},
            upsert=True,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("llm_cache warmup failed for key=%s: %s", key, type(e).__name__)


# ─────────────────────────────────────────────────────────────────────
#  Worker thread (fully isolated event loop)
# ─────────────────────────────────────────────────────────────────────
def _worker_thread_main() -> None:
    """Worker thread entry-point.

    Creates its OWN asyncio event loop, then enters an infinite
    loop pulling jobs off the cross-thread queue and running them
    on the local loop. NO connection whatsoever to the FastAPI
    event loop or any Starlette middleware.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    logger.info("🧠 llm_cache regen worker thread started (isolated event loop)")

    async def _run_job(key: str, compute_fn: Callable[[], Awaitable[Any]]) -> None:
        try:
            value = await compute_fn()
            if value is None:
                logger.info("llm_cache regen returned None for key=%s — leaving cache untouched", key)
                return
            db = _get_worker_db()
            await db.llm_cache.update_one(
                {"_id": key},
                {"$set": {
                    "value": value,
                    "computed_at": utc_now(),
                    "computed_at_ts": time.time(),
                }},
                upsert=True,
            )
            logger.info("llm_cache refreshed key=%s", key)
        except Exception as e:  # noqa: BLE001
            logger.warning("llm_cache regen failed for key=%s: %s: %s", key, type(e).__name__, e)
        finally:
            with _inflight_lock:
                _regen_in_flight.discard(key)

    async def _drain():
        # Bounded concurrency via Semaphore initialised inside the
        # worker loop (so it's bound to that loop).
        s = asyncio.Semaphore(8)
        running: set = set()

        async def _bounded(key, fn):
            async with s:
                await _run_job(key, fn)

        # Run pumper that pulls from the cross-thread queue. We use
        # ``loop.run_in_executor`` for the blocking ``queue.get`` so
        # we don't pin the loop while waiting.
        while True:
            try:
                key, compute_fn = await loop.run_in_executor(
                    None, _regen_queue.get,  # blocking get
                )
                t = asyncio.create_task(_bounded(key, compute_fn))
                running.add(t)
                t.add_done_callback(running.discard)
            except Exception as e:  # noqa: BLE001
                logger.warning("llm_cache worker iteration error: %s", e)
                await asyncio.sleep(0.5)

    try:
        loop.run_until_complete(_drain())
    except Exception as e:  # noqa: BLE001
        logger.error("llm_cache worker thread crashed: %s", e)
    finally:
        loop.close()


def _ensure_worker_started() -> None:
    """Idempotent: spawn the worker thread on first call."""
    global _worker_thread
    with _worker_started_lock:
        if _worker_thread is not None and _worker_thread.is_alive():
            return
        _worker_thread = threading.Thread(
            target=_worker_thread_main,
            name="llm_cache_regen_worker",
            daemon=True,  # dies with the process; no shutdown coord needed
        )
        _worker_thread.start()


def start_regen_worker() -> None:
    """Public entry-point — call from ``core/lifecycle.py`` at app
    startup. Idempotent.
    """
    _ensure_worker_started()


__all__ = ["get_or_regen", "invalidate", "warmup", "start_regen_worker"]
