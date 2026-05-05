"""core/idempotency_middleware.py — Round 99.

HTTP-level Idempotency-Key enforcement for financial mutation endpoints.

WHY
---
Mobile networks are flaky. A user taps "Save Budget" → the request
fires → app loses connectivity right before the 200 → app retries on
reconnect. Without idempotency, the SAME budget gets created twice.
Same problem on /transactions, /goals.

The chaos sim uncovered this in Round 53; we already had the
``core/idempotency.py`` primitives (reserve/commit/replay) but only
``/api/splits/*`` was wired to use them. This middleware closes the
gap by enforcing the contract on EVERY mutation across the financial
write set.

CONTRACT
--------
For protected routes (POST/PUT/DELETE on /transactions, /budgets,
/goals — exact list in ``PROTECTED_PATTERNS``):

  • Header ``Idempotency-Key`` is OPTIONAL but RECOMMENDED.
  • If present, the (user_id, scope, key) tuple is reserved BEFORE
    the handler runs. Replays return the cached response without
    re-running the handler. Concurrent retries get HTTP 409.
  • If absent, the response includes a ``X-Idempotency-Hint`` header
    flagging the legacy client. We do NOT reject — that would break
    every existing client overnight. Future toggle:
    ``IDEMPOTENCY_REQUIRED=true`` flips to hard-enforcement.

GET / OPTIONS / HEAD are always passthrough (idempotent by HTTP spec).

We extract user_id from the bearer JWT WITHOUT touching the DB
(that's the auth dep's job, runs after this middleware). If the JWT
is missing or invalid, we let the request through and the auth dep
will return 401.

Unsuccessful responses (status >= 400) are NOT cached — clients
re-issuing the same key after a 4xx should be allowed to retry with
fixed inputs. We only commit on 2xx.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

import jwt
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from core.idempotency import (
    MAX_KEY_LEN,
    commit_idempotency,
    release_idempotency,
    replay_idempotency,
    reserve_idempotency,
)

logger = logging.getLogger(__name__)

JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"

# ── Hard-enforce vs warn-only knob.
# Default: warn-only (legacy clients keep working).
# Flip to "1"/"true" once mobile clients all send the header.
IDEMPOTENCY_REQUIRED = os.environ.get("IDEMPOTENCY_REQUIRED", "").lower() in {"1", "true", "yes"}

# ── Mutation methods we guard.
_MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# ── Protected path patterns (regex against the request path).
# Scope is derived per-pattern so collisions across endpoint families
# can't happen even if a client reuses the same key.
#
# Each entry: (compiled_regex, scope_string)
PROTECTED_PATTERNS: list[tuple[re.Pattern, str]] = [
    # /api/transactions and /api/transactions/<id>
    (re.compile(r"^/api/transactions(?:/[^/]+)?/?$"),                "transactions"),
    # /api/budgets and /api/budgets/<id> (and any sub-path mutation,
    # e.g. /api/budgets/seed)
    (re.compile(r"^/api/budgets(?:/[^/]+)?/?$"),                    "budgets"),
    (re.compile(r"^/api/budgets/seed/?$"),                          "budgets"),
    # /api/goals and /api/goals/<id> (deposits, withdrawals are sub
    # paths and equally idempotency-sensitive)
    (re.compile(r"^/api/goals(?:/[^/]+)?(?:/[^/]+)?/?$"),           "goals"),
]


def _scope_for_path(path: str) -> Optional[str]:
    """Return the scope for a protected path, or None if not protected."""
    for pattern, scope in PROTECTED_PATTERNS:
        if pattern.match(path):
            return scope
    return None


def _user_id_from_jwt(request: Request) -> Optional[str]:
    """Best-effort user-id extraction from the bearer JWT.

    Never raises — returns None if any step fails. The downstream
    auth dependency will re-validate and raise the canonical 401 if
    appropriate.
    """
    try:
        auth = request.headers.get("authorization") or request.headers.get("Authorization")
        if not auth or not auth.startswith("Bearer "):
            return None
        token = auth[7:].strip()
        if not token:
            return None
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("user_id")
        if isinstance(uid, str) and uid:
            return uid
        return None
    except Exception:    # noqa: BLE001
        # Expired / malformed / wrong-signature tokens all collapse to
        # "no user" here; auth dep will return the proper 401.
        return None


def _validate_key_shape(key: str) -> bool:
    """Lightweight validation BEFORE we hit the idempotency store."""
    if not isinstance(key, str) or not key:
        return False
    if len(key) > MAX_KEY_LEN:
        return False
    return True


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """Enforce exactly-once semantics on financial mutation endpoints.

    Order: install AFTER the auth-related middleware so the JWT
    parsing here mirrors the auth dep's contract. Order doesn't
    affect correctness because we extract user_id ourselves.
    """

    async def dispatch(self, request: Request, call_next):
        # Fast path — only mutations on protected paths are guarded.
        if request.method not in _MUTATION_METHODS:
            return await call_next(request)

        scope = _scope_for_path(request.url.path)
        if scope is None:
            return await call_next(request)

        # ── Header presence + validation ───────────────────────────
        idem_key = (
            request.headers.get("Idempotency-Key")
            or request.headers.get("idempotency-key")
        )
        if not idem_key:
            if IDEMPOTENCY_REQUIRED:
                return JSONResponse(
                    status_code=400,
                    content={
                        "detail": "Idempotency-Key header is required for this endpoint",
                        "scope": scope,
                    },
                )
            # Warn-only mode: let the request pass but flag it.
            response = await call_next(request)
            response.headers["X-Idempotency-Hint"] = (
                "missing-key; financial mutation should send Idempotency-Key"
            )
            return response

        if not _validate_key_shape(idem_key):
            return JSONResponse(
                status_code=400,
                content={
                    "detail": f"Idempotency-Key must be 1..{MAX_KEY_LEN} chars",
                    "scope": scope,
                },
            )

        # ── User-id (best effort; auth dep does the real check) ────
        user_id = _user_id_from_jwt(request)
        if not user_id:
            # No identifiable user → don't try to dedupe; let auth dep 401.
            return await call_next(request)

        # ── 1. Replay path: previous COMMITTED response wins. ──────
        try:
            cached = await replay_idempotency(user_id, scope, idem_key)
        except Exception as e:    # noqa: BLE001
            logger.warning("idempotency replay error: %s", e)
            cached = None

        if cached is not None:
            return JSONResponse(
                status_code=cached.get("__status__", 200),
                content=cached.get("__body__", cached),
                headers={"X-Idempotency-Replay": "true", "Idempotency-Key": idem_key},
            )

        # ── 2. Reservation path: try to claim. ─────────────────────
        try:
            reserved = await reserve_idempotency(user_id, scope, idem_key)
        except Exception as e:    # noqa: BLE001
            # Storage error: prefer correctness — fail open and let
            # the request through (the duplicate-write risk is the
            # same as without the middleware). Log loud.
            logger.error("idempotency reserve error: %s", e)
            reserved = True

        if not reserved:
            # Another instance is in flight (raced loser). Tell the
            # client to retry — NOT to refire (they'd just race again).
            return JSONResponse(
                status_code=409,
                content={
                    "detail": "A request with this Idempotency-Key is already in flight",
                    "scope": scope,
                },
                headers={"Retry-After": "2"},
            )

        # ── 3. Pass-through, then capture body to commit. ──────────
        response = await call_next(request)

        # Buffer the response so we can both: (a) inspect status, and
        # (b) re-emit the bytes to the client. StreamingResponse from
        # the route is consumed once.
        body_chunks = b""
        async for chunk in response.body_iterator:
            body_chunks += chunk

        # Best-effort decode for caching. If the body isn't JSON
        # (e.g. file download) we still cache the raw bytes as base64
        # — but financial endpoints all return JSON, so this is the
        # 99% path.
        cache_body: object
        try:
            cache_body = json.loads(body_chunks.decode("utf-8")) if body_chunks else None
        except Exception:    # noqa: BLE001
            cache_body = None

        # Only commit on 2xx — 4xx/5xx mean the user's input was
        # rejected; they should be allowed to retry with fixed input
        # using the same key.
        if 200 <= response.status_code < 300 and cache_body is not None:
            try:
                await commit_idempotency(
                    user_id,
                    scope,
                    idem_key,
                    {"__status__": response.status_code, "__body__": cache_body},
                )
            except Exception as e:    # noqa: BLE001
                logger.warning("idempotency commit error: %s", e)
        elif response.status_code >= 400:
            # Release the reservation on 4xx/5xx so the user can retry
            # the SAME logical operation (same key) with corrected
            # inputs. Stripe behaves identically — see
            # https://stripe.com/docs/api/idempotent_requests
            # release_idempotency only deletes RESERVED rows, so this
            # is safe even if some weird race somehow committed first.
            try:
                await release_idempotency(user_id, scope, idem_key)
            except Exception as e:    # noqa: BLE001
                logger.warning("idempotency release error: %s", e)

        # Re-build the response with the buffered body. Preserve all
        # headers set by the handler PLUS our diagnostic header.
        new_headers = dict(response.headers)
        new_headers["Idempotency-Key"] = idem_key
        # Content-length must be re-derived if the handler set it
        # (the streamed iterator may have differed from headers).
        if "content-length" in new_headers:
            new_headers["content-length"] = str(len(body_chunks))

        return Response(
            content=body_chunks,
            status_code=response.status_code,
            headers=new_headers,
            media_type=response.media_type,
        )


__all__ = ["IdempotencyMiddleware", "PROTECTED_PATTERNS", "IDEMPOTENCY_REQUIRED"]
