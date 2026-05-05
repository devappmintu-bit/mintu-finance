"""
Report generator — Markdown + JSON output.

The Markdown is the human-facing artefact. The JSON is the raw data
for diffing across builds (you'll want this in CI to detect regressions
in error rates / drop-offs).
"""
from __future__ import annotations

import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .chaos import ChaosBudget
from .metrics import Metrics
from .personas import Persona, BEHAVIOUR_WEIGHTS
from .flows import (
    STEPS_ONBOARDING, STEPS_COACH, STEPS_BUDGET, STEPS_GOALS,
)


REPORTS_DIR = Path("/app/sim_reports")


def _severity(error_rate: float, sample_size: int) -> str:
    if sample_size < 5:
        return "⚪ info"
    if error_rate >= 0.30:
        return "🔴 critical"
    if error_rate >= 0.10:
        return "🟠 high"
    if error_rate >= 0.03:
        return "🟡 medium"
    return "🟢 low"


def build_report(
    run_id: str, personas: list[Persona], metrics: Metrics, chaos: ChaosBudget,
    config: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    overall = metrics.overall()
    by_step = metrics.by_step()
    by_persona = metrics.by_persona()
    funnels = {
        "onboarding": metrics.drop_off_funnel("onboarding", STEPS_ONBOARDING),
        "coach":      metrics.drop_off_funnel("coach",      STEPS_COACH),
        "budget":     metrics.drop_off_funnel("budget",     STEPS_BUDGET),
        "goals":      metrics.drop_off_funnel("goals",      STEPS_GOALS),
    }

    # Persona mix actually realised (sanity check vs target weights).
    realised = Counter(p.behaviour.value for p in personas)

    # Top action items — endpoints with high error rate + decent volume.
    action_items = []
    for step, stats in sorted(by_step.items(), key=lambda kv: -kv[1]["error_rate"]):
        if stats["count"] < 5:
            continue
        sev = _severity(stats["error_rate"], stats["count"])
        if sev.startswith("🟢") or sev.startswith("⚪"):
            continue
        action_items.append({
            "step": step, "severity": sev, **stats,
        })
        if len(action_items) >= 10:
            break

    chaos_summary = Counter(ev.kind for ev in chaos.events)

    # Markdown rendering
    md_lines = [
        f"# MintU Simulation Report · `{run_id}`",
        "",
        f"**Generated**: {datetime.now(timezone.utc).isoformat()}",
        f"**Personas**: {len(personas)}",
        f"**Duration**: {overall['duration_s']} s",
        f"**Total API calls**: {overall['total_steps']}",
        f"**Overall error rate**: `{overall['overall_error_rate'] * 100:.1f}%`",
        "",
        "## Persona mix (realised vs target)",
        "",
        "| Behaviour | Realised | Target |",
        "|---|---|---|",
    ]
    for b, target in BEHAVIOUR_WEIGHTS.items():
        actual = realised.get(b.value, 0)
        actual_pct = actual / max(len(personas), 1) * 100
        md_lines.append(f"| {b.value} | {actual} ({actual_pct:.0f}%) | {target * 100:.0f}% |")

    md_lines += ["", "## Drop-off funnels", ""]
    for flow, fn in funnels.items():
        md_lines.append(f"### {flow}")
        md_lines.append("")
        md_lines.append("| Step | Reached | Drop-off |")
        md_lines.append("|---|---|---|")
        for row in fn:
            md_lines.append(f"| `{row['step']}` | {row['reached']} | {row['drop_off_pct']}% |")
        md_lines.append("")

    md_lines += ["## Per-step performance", ""]
    md_lines.append("| Step | Count | OK | Fail | Err% | p50 | p95 | p99 |")
    md_lines.append("|---|---|---|---|---|---|---|---|")
    for step, stats in sorted(by_step.items()):
        md_lines.append(
            f"| `{step}` | {stats['count']} | {stats['ok']} | {stats['fail']} | "
            f"{stats['error_rate'] * 100:.1f}% | {stats['p50_ms']} | {stats['p95_ms']} | {stats['p99_ms']} |"
        )

    md_lines += ["", "## Per-persona behaviour outcomes", ""]
    md_lines.append("| Behaviour | Steps | Errors | Err% |")
    md_lines.append("|---|---|---|---|")
    for behaviour, stats in sorted(by_persona.items()):
        md_lines.append(
            f"| {behaviour} | {stats['steps']} | {stats['fail']} | "
            f"{stats['error_rate'] * 100:.1f}% |"
        )

    md_lines += ["", "## Chaos events injected", ""]
    if chaos_summary:
        md_lines.append("| Kind | Count |")
        md_lines.append("|---|---|")
        for k, v in chaos_summary.most_common():
            md_lines.append(f"| `{k}` | {v} |")
    else:
        md_lines.append("_No chaos events fired in this run._")

    md_lines += ["", "## 🚨 Action items (severity-bucketed)", ""]
    if action_items:
        for it in action_items:
            md_lines.append(
                f"- {it['severity']} · `{it['step']}` — "
                f"{it['fail']}/{it['count']} fails ({it['error_rate'] * 100:.1f}%) · "
                f"top: {it['top_errors'][:1]}"
            )
    else:
        md_lines.append("_No action items above the 'medium' severity threshold._")

    md_lines += [
        "",
        "---",
        f"_Run config_: {json.dumps(config, default=str)}",
    ]
    md = "\n".join(md_lines)

    # JSON shape
    json_out = {
        "run_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": config,
        "overall": overall,
        "persona_mix": {b.value: realised.get(b.value, 0) for b in BEHAVIOUR_WEIGHTS},
        "funnels": funnels,
        "by_step": by_step,
        "by_persona": by_persona,
        "chaos": {
            "events_capacity_remaining": chaos.remaining,
            "by_kind": dict(chaos_summary),
            "events": [{"persona_id": e.persona_id, "kind": e.kind, "detail": e.detail} for e in chaos.events[:50]],
        },
        "action_items": action_items,
    }

    md_path = REPORTS_DIR / f"sim_{run_id}.md"
    js_path = REPORTS_DIR / f"sim_{run_id}.json"
    md_path.write_text(md)
    js_path.write_text(json.dumps(json_out, indent=2, default=str))
    return md, json_out


__all__ = ["build_report", "REPORTS_DIR"]
