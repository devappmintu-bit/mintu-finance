"""
Chaos injectors — break things on purpose to expose fragile UX paths.

Applied probabilistically per-action so most users have a clean run
(reflecting reality) while a meaningful tail experiences the rough
edges.  All injectors are *additive* on top of the scripted flow —
they don't replace actions, they corrupt them.

Returned `ChaosEvent` objects are aggregated into the per-run report
so ops can see WHICH chaos surfaced WHICH bug.
"""
from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from typing import Any


@dataclass
class ChaosEvent:
    persona_id: str
    kind: str
    detail: str


class ChaosBudget:
    """Caps how many chaos events fire per run so we don't accidentally
    grade the simulation as 'all broken' from synthetic noise."""

    def __init__(self, total: int = 200):
        self.remaining = total
        self.events: list[ChaosEvent] = []

    def can_fire(self) -> bool:
        return self.remaining > 0

    def record(self, ev: ChaosEvent) -> None:
        if self.can_fire():
            self.events.append(ev)
            self.remaining -= 1


async def maybe_double_click(
    rng: random.Random, persona_id: str, budget: ChaosBudget,
    coro_factory,
):
    """With ~3% probability, fire the same request TWICE in parallel.
    Tests idempotency, dedupe keys, and race-prone counters."""
    fire_chaos = rng.random() < 0.03 and budget.can_fire()
    if not fire_chaos:
        return await coro_factory()
    budget.record(ChaosEvent(persona_id, "double_click", "two parallel POSTs"))
    res1, res2 = await asyncio.gather(coro_factory(), coro_factory(), return_exceptions=True)
    return res1


async def maybe_partial_payload(
    rng: random.Random, persona_id: str, budget: ChaosBudget,
    payload: dict, *, key_to_drop: str,
):
    """With ~5% probability, drop a required key. Tests server-side
    validation strength."""
    if rng.random() < 0.05 and budget.can_fire() and key_to_drop in payload:
        budget.record(ChaosEvent(persona_id, "partial_payload", f"dropped {key_to_drop}"))
        out = dict(payload)
        out.pop(key_to_drop, None)
        return out
    return payload


async def maybe_giant_string(
    rng: random.Random, persona_id: str, budget: ChaosBudget,
    payload: dict, *, field: str,
):
    """With ~2% probability, blow up a string field to 10 KB. Tests
    truncation / Mongo doc-size guards."""
    if rng.random() < 0.02 and budget.can_fire() and field in payload:
        budget.record(ChaosEvent(persona_id, "giant_string", f"{field} = 10240 chars"))
        out = dict(payload)
        out[field] = ("X" * 10240)
        return out
    return payload


async def maybe_negative_amount(
    rng: random.Random, persona_id: str, budget: ChaosBudget,
    payload: dict, *, field: str,
):
    """With ~3% probability, flip an amount negative. Tests business-rule
    guards against impossible inputs."""
    if rng.random() < 0.03 and budget.can_fire() and field in payload:
        budget.record(ChaosEvent(persona_id, "negative_amount", f"{field} negated"))
        out = dict(payload)
        out[field] = -abs(out[field])
        return out
    return payload


__all__ = [
    "ChaosBudget",
    "ChaosEvent",
    "maybe_double_click",
    "maybe_partial_payload",
    "maybe_giant_string",
    "maybe_negative_amount",
]
