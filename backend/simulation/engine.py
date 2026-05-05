"""
Simulation engine — the orchestrator.

Drives N personas concurrently through onboarding → budget → goals →
coach.  Default concurrency 50 (tuned to keep our own backend below
the 1.5 s p95 budget; bump to 100 once you've validated production
DB throughput).

Mandatory cleanup: synthetic users + their downstream documents are
purged at run-end. Failures during cleanup are logged but do not
block the report generation.
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
import uuid
from typing import Any

import httpx

from .chaos import ChaosBudget
from .flows import run_onboarding, run_coach, run_budget, run_goals
from .metrics import Metrics
from .personas import build_personas, Persona
from .report import build_report

log = logging.getLogger("sim_engine")

DEFAULT_CONCURRENCY = 30          # active personas at once
DEFAULT_TIMEOUT_S = 25.0          # per-request hard timeout


async def _run_one(
    client: httpx.AsyncClient, persona: Persona,
    chaos: ChaosBudget, metrics: Metrics, sem: asyncio.Semaphore,
) -> None:
    rng = random.Random(persona.persona_id)
    async with sem:
        try:
            ok, token = await run_onboarding(client, persona, rng, chaos, metrics)
            if not ok or not token:
                return

            # Order: budget → goals → coach (so the coach has data to chew on).
            # Some abandonment between flows based on persona.
            if rng.random() < (0.3 + persona.consistency * 0.6):
                await run_budget(client, token, persona, rng, chaos, metrics)
            if rng.random() < (0.2 + persona.consistency * 0.7):
                await run_goals(client, token, persona, rng, chaos, metrics)
            if rng.random() < (0.4 + persona.digital_savvy * 0.5):
                await run_coach(client, token, persona, rng, chaos, metrics)
        except Exception as exc:    # noqa: BLE001
            log.exception("persona %s failed", persona.persona_id)
            metrics.record(
                persona_id=persona.persona_id,
                persona_behaviour=persona.behaviour.value,
                flow="engine", step="crash",
                status=0, latency_ms=0.0, ok=False,
                error=f"{type(exc).__name__}: {str(exc)[:120]}",
            )


async def _cleanup_synthetic(personas: list[Persona]) -> dict[str, int]:
    """Purge every synthetic doc this run wrote. Idempotent — safe to
    re-run if a previous purge crashed half-way."""
    from server import db

    phones = [p.phone for p in personas]
    # 1. Find user _ids by phone.
    users = await db.users.find(
        {"phone": {"$in": phones}}, {"_id": 1},
    ).to_list(length=len(phones))
    user_ids = [str(u["_id"]) for u in users]

    counts: dict[str, int] = {}
    if user_ids:
        for coll in (
            "transactions", "budgets", "goals",
            "coach_rewards", "user_coach_context", "coach_trigger_history",
            "notifications_log", "sessions", "refresh_tokens",
            "score_history",
        ):
            try:
                res = await db[coll].delete_many({"user_id": {"$in": user_ids}})
                counts[coll] = res.deleted_count
            except Exception as exc:    # noqa: BLE001
                log.warning("cleanup %s failed: %s", coll, exc)
                counts[coll] = -1

    # 2. Finally drop the user docs themselves.
    try:
        res = await db.users.delete_many({"phone": {"$in": phones}})
        counts["users"] = res.deleted_count
    except Exception as exc:    # noqa: BLE001
        log.warning("cleanup users failed: %s", exc)
        counts["users"] = -1

    return counts


async def run_simulation(
    *, n: int = 100, concurrency: int = DEFAULT_CONCURRENCY,
    base_url: str = "http://localhost:8001", chaos_budget: int = 100,
    cleanup: bool = True, run_id: str | None = None,
) -> dict[str, Any]:
    """Run a simulation cohort. Returns the JSON report dict."""
    run_id = run_id or f"r{int(time.time())}_{uuid.uuid4().hex[:6]}"
    log.info("🚀 Sim run %s: spawning %d personas (concurrency=%d)", run_id, n, concurrency)

    personas = build_personas(n, run_id)
    metrics = Metrics()
    chaos = ChaosBudget(total=chaos_budget)

    sem = asyncio.Semaphore(concurrency)
    timeout = httpx.Timeout(DEFAULT_TIMEOUT_S, connect=5.0)
    async with httpx.AsyncClient(base_url=base_url, timeout=timeout) as client:
        await asyncio.gather(*[
            _run_one(client, p, chaos, metrics, sem)
            for p in personas
        ])

    metrics.finish()

    cleanup_counts: dict[str, int] = {}
    if cleanup:
        try:
            cleanup_counts = await _cleanup_synthetic(personas)
            log.info("🧹 Cleanup: %s", cleanup_counts)
        except Exception as exc:    # noqa: BLE001
            log.exception("cleanup failed: %s", exc)

    config = {
        "n": n, "concurrency": concurrency,
        "base_url": base_url, "chaos_budget": chaos_budget,
        "cleanup": cleanup,
        "cleanup_counts": cleanup_counts,
    }
    md, js = build_report(run_id, personas, metrics, chaos, config)
    log.info("📝 Report: /app/sim_reports/sim_%s.md (overall_err=%.1f%%)",
             run_id, js["overall"]["overall_error_rate"] * 100)
    return js


__all__ = ["run_simulation"]
