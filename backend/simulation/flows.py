"""
Flow modules — each function takes (client, persona, rng, budget, metrics)
and drives the synthetic user through a single feature surface.

Return `True` on successful completion, `False` on drop-off / abandonment.
"""
from __future__ import annotations

import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .chaos import (
    ChaosBudget,
    maybe_double_click,
    maybe_partial_payload,
    maybe_giant_string,
    maybe_negative_amount,
)
from .metrics import Metrics
from .personas import Persona, FinancialBehaviour


# Step name constants (used by funnel reporter)
STEPS_ONBOARDING = ["send_otp", "verify_otp", "profile"]
STEPS_COACH = ["chat", "action_execute", "rewards_recent"]
STEPS_BUDGET = ["upsert_budget", "add_txn", "breach_check"]
STEPS_GOALS = ["create_goal", "contribute_goal"]


async def _record(
    metrics: Metrics, persona: Persona, flow: str, step: str,
    coro,
) -> tuple[bool, Any]:
    """Time + record a single API call. Returns (ok, response_or_None)."""
    t0 = time.perf_counter()
    ok = False
    status = 0
    err = ""
    res = None
    try:
        res = await coro
        status = res.status_code
        ok = 200 <= status < 300
        if not ok:
            err = f"{status}: {res.text[:120]}"
    except httpx.TimeoutException:
        err = "timeout"
    except Exception as exc:    # noqa: BLE001
        err = f"{type(exc).__name__}: {str(exc)[:120]}"
    dt = (time.perf_counter() - t0) * 1000
    metrics.record(
        persona_id=persona.persona_id,
        persona_behaviour=persona.behaviour.value,
        flow=flow, step=step,
        status=status, latency_ms=dt, ok=ok, error=err,
    )
    return ok, res


# ───────────────────── ONBOARDING FLOW ────────────────────

async def run_onboarding(
    client: httpx.AsyncClient, persona: Persona,
    rng: random.Random, chaos: ChaosBudget, metrics: Metrics,
) -> tuple[bool, str | None]:
    """Returns (ok, access_token)."""
    # Avoiders / debt-trapped abandon onboarding 25% of the time.
    if persona.behaviour in (FinancialBehaviour.AVOIDER, FinancialBehaviour.DEBT_TRAPPED) and rng.random() < 0.25:
        return False, None

    ok, _ = await _record(metrics, persona, "onboarding", "send_otp",
        client.post("/api/auth/send-otp", json={"phone": persona.phone}),
    )
    if not ok:
        return False, None

    ok, res = await _record(metrics, persona, "onboarding", "verify_otp",
        client.post("/api/auth/verify-otp", json={
            "phone": persona.phone, "otp": "123456",
            "name": persona.name,
            "device_id": f"sim-{persona.persona_id}",
            "device_name": "sim", "os": "web",
        }),
    )
    if not ok or not res:
        return False, None
    try:
        body = res.json()
        # Old endpoint returns `token`; new auth_v2 returns `access_token`.
        token = body.get("access_token") or body.get("token")
    except Exception:    # noqa: BLE001
        return False, None
    if not token:
        return False, None

    # Profile fetch (a lazy user might skip; consistency biases this)
    if rng.random() < persona.consistency:
        ok, _ = await _record(metrics, persona, "onboarding", "profile",
            client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}),
        )
    return True, token


# ───────────────────── BUDGET FLOW ────────────────────────

async def run_budget(
    client: httpx.AsyncClient, token: str, persona: Persona,
    rng: random.Random, chaos: ChaosBudget, metrics: Metrics,
) -> bool:
    headers = {"Authorization": f"Bearer {token}"}

    # Avoiders rarely set budgets.
    if persona.behaviour == FinancialBehaviour.AVOIDER and rng.random() > 0.25:
        return False

    # 1. Upsert a budget. Amount derived from persona income & behaviour.
    income = max(persona.income_monthly, 5000)
    pct_by_behaviour = {
        FinancialBehaviour.SAVER: 0.20,
        FinancialBehaviour.OVERSPENDER: 0.55,
        FinancialBehaviour.INVESTOR: 0.25,
        FinancialBehaviour.AVOIDER: 0.40,
        FinancialBehaviour.IMPULSIVE: 0.50,
        FinancialBehaviour.DEBT_TRAPPED: 0.45,
        FinancialBehaviour.MINIMALIST: 0.15,
        FinancialBehaviour.OPTIMIZER: 0.22,
    }
    food_cap = int(income * pct_by_behaviour[persona.behaviour])
    payload = {"category": "food", "amount": food_cap}
    payload = await maybe_partial_payload(rng, persona.persona_id, chaos, payload, key_to_drop="amount")
    payload = await maybe_negative_amount(rng, persona.persona_id, chaos, payload, field="amount")

    async def _post_budget():
        return await client.post("/api/budgets", headers=headers, json=payload)
    ok, _ = await _record(metrics, persona, "budget", "upsert_budget",
        maybe_double_click(rng, persona.persona_id, chaos, _post_budget),
    )
    if not ok:
        return False

    # 2. Add a few transactions — overspenders blow through the cap.
    overshoot = persona.behaviour in (
        FinancialBehaviour.OVERSPENDER, FinancialBehaviour.IMPULSIVE,
        FinancialBehaviour.DEBT_TRAPPED,
    )
    target = food_cap * (1.4 if overshoot else 0.6)
    spent = 0
    breach_seen = False
    n = rng.randint(3, 8)
    for i in range(n):
        amt = max(50, int(rng.gauss(target / n, target / n / 3)))
        txn = {
            "category": "food",
            "amount": amt,
            "type": "debit",   # backend accepts ^(debit|credit)$
            "note": f"sim {persona.persona_id[:8]}-{i}",
            "_synthetic": True,    # marker for cleanup
        }
        txn = await maybe_giant_string(rng, persona.persona_id, chaos, txn, field="note")
        ok, _ = await _record(metrics, persona, "budget", "add_txn",
            client.post("/api/transactions", headers=headers, json=txn),
        )
        if ok:
            spent += amt
        if spent > food_cap and not breach_seen:
            breach_seen = True
            # Lazy users (low consistency) ignore the breach; disciplined users go re-check.
            if persona.consistency > 0.5:
                await _record(metrics, persona, "budget", "breach_check",
                    client.get("/api/budgets/live", headers=headers),
                )
    return True


# ─────────────────────── GOALS FLOW ───────────────────────

GOAL_TITLES = [
    "Emergency fund", "iPhone", "Goa trip", "Down payment",
    "Wedding", "MBA", "Bike", "Laptop upgrade", "Dubai vacation",
]


async def run_goals(
    client: httpx.AsyncClient, token: str, persona: Persona,
    rng: random.Random, chaos: ChaosBudget, metrics: Metrics,
) -> bool:
    headers = {"Authorization": f"Bearer {token}"}

    # Investors / Optimisers / Savers create goals; Avoiders rarely.
    p_create = {
        FinancialBehaviour.SAVER: 0.85,
        FinancialBehaviour.OVERSPENDER: 0.30,
        FinancialBehaviour.INVESTOR: 0.95,
        FinancialBehaviour.AVOIDER: 0.15,
        FinancialBehaviour.IMPULSIVE: 0.40,
        FinancialBehaviour.DEBT_TRAPPED: 0.25,
        FinancialBehaviour.MINIMALIST: 0.50,
        FinancialBehaviour.OPTIMIZER: 0.95,
    }[persona.behaviour]
    if rng.random() > p_create:
        return False

    title = rng.choice(GOAL_TITLES)
    target = int(persona.income_monthly * rng.uniform(2, 12))
    payload = {"name": title, "target_amount": target}
    payload = await maybe_negative_amount(rng, persona.persona_id, chaos, payload, field="target_amount")

    ok, _ = await _record(metrics, persona, "goals", "create_goal",
        client.post("/api/goals", headers=headers, json=payload),
    )
    if not ok:
        return False

    # Some personas immediately try to contribute (impulse).
    if rng.random() < persona.consistency * 0.4:
        # Just a fetch — represents reading the goal back. Endpoint may not
        # support contribute directly; we use list as a proxy.
        await _record(metrics, persona, "goals", "contribute_goal",
            client.get("/api/goals", headers=headers),
        )
    return True


# ─────────────────────── COACH FLOW ───────────────────────

VAGUE_QUESTIONS = [
    "how do i save money?", "i'm broke", "help", "why am i poor",
    "can you help with my finances", "what should I do",
]
PRECISE_QUESTIONS = [
    "Where is my biggest leak this month?",
    "How do I save 5000 next month?",
    "Set my food budget to 8000",
    "Am I on track to save 20% of my income?",
    "Show me where I'm overspending",
]
ADVERSARIAL = [
    "give me investment tips for crypto",
    "what is the meaning of life",
    "",
    "<script>alert(1)</script>",
]


async def run_coach(
    client: httpx.AsyncClient, token: str, persona: Persona,
    rng: random.Random, chaos: ChaosBudget, metrics: Metrics,
) -> bool:
    headers = {"Authorization": f"Bearer {token}"}

    # Digital-savvy users + investors / optimisers ask precise questions;
    # avoiders ask vague ones; impulsive sometimes ask adversarial.
    if persona.digital_savvy > 0.7 and persona.behaviour in (
        FinancialBehaviour.INVESTOR, FinancialBehaviour.OPTIMIZER, FinancialBehaviour.SAVER,
    ):
        question = rng.choice(PRECISE_QUESTIONS)
    elif persona.behaviour in (FinancialBehaviour.AVOIDER, FinancialBehaviour.DEBT_TRAPPED):
        question = rng.choice(VAGUE_QUESTIONS)
    elif persona.behaviour == FinancialBehaviour.IMPULSIVE and rng.random() < 0.2:
        question = rng.choice(ADVERSARIAL)
    else:
        question = rng.choice(PRECISE_QUESTIONS + VAGUE_QUESTIONS)

    ok, res = await _record(metrics, persona, "coach", "chat",
        client.post("/api/coach/chat", headers=headers, json={
            "message": question, "lang": persona.languages[0],
        }, timeout=20.0),
    )
    if not ok or not res:
        return False

    # If an action card was emitted, try executing it (with persona-specific
    # chance — risk-averse savers tap, lazy users skip).
    try:
        data = res.json()
    except Exception:    # noqa: BLE001
        data = {}
    actions = (data.get("actions") or [])
    if actions:
        p_tap = max(0.1, min(0.95, persona.consistency * 0.8 + persona.digital_savvy * 0.2))
        if rng.random() < p_tap:
            a = actions[0]
            await _record(metrics, persona, "coach", "action_execute",
                client.post("/api/coach/actions/execute", headers=headers, json={
                    "label": a.get("label", ""),
                    "endpoint": a.get("endpoint", ""),
                    "payload": a.get("payload", {}),
                    "method": a.get("method", "POST"),
                }, timeout=10.0),
            )
            await _record(metrics, persona, "coach", "rewards_recent",
                client.get("/api/coach/rewards/recent", headers=headers),
            )
    return True


__all__ = [
    "run_onboarding", "run_coach", "run_budget", "run_goals",
    "STEPS_ONBOARDING", "STEPS_COACH", "STEPS_BUDGET", "STEPS_GOALS",
]
