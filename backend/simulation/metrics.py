"""
Metrics collector — aggregates per-step latency, errors, drop-offs.

Designed for streaming append-only writes (so a 10k-user run doesn't
OOM on the metrics layer).  Final aggregation runs at report time.
"""
from __future__ import annotations

import statistics
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


@dataclass
class StepRecord:
    persona_id: str
    persona_behaviour: str
    flow: str                 # "onboarding" | "coach" | "budget" | "goals"
    step: str                 # specific endpoint / action
    status: int               # HTTP status (or 0 if exception)
    latency_ms: float
    ok: bool
    error: str = ""


@dataclass
class Metrics:
    started_at: float = field(default_factory=time.time)
    finished_at: float = 0.0
    records: list[StepRecord] = field(default_factory=list)

    def record(self, **kw) -> None:
        self.records.append(StepRecord(**kw))

    def finish(self) -> None:
        self.finished_at = time.time()

    # ────────────── aggregates (lazy, computed at report-time) ─────────
    def by_step(self) -> dict[str, dict[str, Any]]:
        """{ '<flow>::<step>': {count, ok, fail, p50, p95, p99, error_rate, top_errors} }"""
        groups: dict[str, list[StepRecord]] = defaultdict(list)
        for r in self.records:
            groups[f"{r.flow}::{r.step}"].append(r)
        out = {}
        for k, recs in groups.items():
            lats = sorted(r.latency_ms for r in recs)
            ok = sum(1 for r in recs if r.ok)
            errs = [r.error for r in recs if not r.ok and r.error]
            from collections import Counter
            top_err = Counter(errs).most_common(3)
            out[k] = {
                "count": len(recs),
                "ok": ok,
                "fail": len(recs) - ok,
                "error_rate": round((len(recs) - ok) / max(len(recs), 1), 3),
                "p50_ms": int(_pctile(lats, 50)),
                "p95_ms": int(_pctile(lats, 95)),
                "p99_ms": int(_pctile(lats, 99)),
                "top_errors": top_err,
            }
        return out

    def by_persona(self) -> dict[str, dict[str, Any]]:
        groups: dict[str, list[StepRecord]] = defaultdict(list)
        for r in self.records:
            groups[r.persona_behaviour].append(r)
        out = {}
        for behaviour, recs in groups.items():
            ok = sum(1 for r in recs if r.ok)
            out[behaviour] = {
                "steps": len(recs),
                "ok": ok,
                "fail": len(recs) - ok,
                "error_rate": round((len(recs) - ok) / max(len(recs), 1), 3),
            }
        return out

    def drop_off_funnel(self, flow: str, ordered_steps: list[str]) -> list[dict[str, Any]]:
        """Funnel: how many personas reached each step, and drop-off pct."""
        # Personas that hit each step at least once with ok=True.
        per_step: dict[str, set[str]] = {s: set() for s in ordered_steps}
        for r in self.records:
            if r.flow != flow or not r.ok or r.step not in per_step:
                continue
            per_step[r.step].add(r.persona_id)
        funnel = []
        prev = None
        for s in ordered_steps:
            n = len(per_step[s])
            drop = 0.0
            if prev is not None and prev > 0:
                drop = round((1 - (n / prev)) * 100, 1)
            funnel.append({"step": s, "reached": n, "drop_off_pct": drop})
            prev = n
        return funnel

    def overall(self) -> dict[str, Any]:
        ok = sum(1 for r in self.records if r.ok)
        return {
            "total_steps": len(self.records),
            "ok_steps": ok,
            "fail_steps": len(self.records) - ok,
            "overall_error_rate": round((len(self.records) - ok) / max(len(self.records), 1), 3),
            "duration_s": round(self.finished_at - self.started_at, 1) if self.finished_at else 0,
        }


def _pctile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * p / 100
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


__all__ = ["Metrics", "StepRecord"]
