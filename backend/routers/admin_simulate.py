"""
routers/admin_simulate.py — Round 93 admin-gated simulation endpoint.

Kicks off a simulation run as a background task. Returns immediately
with a `run_id`; results are polled via GET /admin/simulate/{run_id}.

Guarded by ADMIN_PHONES env var (comma-separated phone whitelist).
In dev mode (ADMIN_PHONES unset), any authenticated user can trigger.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from core.auth import get_current_user
from core.users import get_user_by_id

router = APIRouter(tags=["admin-simulate"])
log = logging.getLogger("admin_simulate")

# In-memory run registry. Acceptable for MVP since we're single-pod.
# When sharded across pods, move to Redis or a Mongo collection.
_RUNS: dict[str, dict[str, Any]] = {}
_REPORTS_DIR = Path("/app/sim_reports")


class SimRequest(BaseModel):
    n: int = Field(50, ge=1, le=10000, description="Persona count")
    concurrency: int = Field(30, ge=1, le=200)
    chaos_budget: int = Field(100, ge=0, le=2000)
    cleanup: bool = True


async def _gate_admin(user_id: str) -> None:
    """Allow only whitelisted phone numbers. In dev (whitelist empty),
    every authenticated user passes."""
    whitelist = [p.strip() for p in (os.environ.get("ADMIN_PHONES") or "").split(",") if p.strip()]
    if not whitelist:
        return    # dev mode
    user = await get_user_by_id(user_id) or {}
    phone = (user.get("phone") or "").strip()
    if phone not in whitelist:
        raise HTTPException(403, "admin gate: phone not whitelisted")


async def _run_in_bg(req: SimRequest, run_id: str) -> None:
    from simulation.engine import run_simulation
    started = time.time()
    _RUNS[run_id] = {"status": "running", "started_at": started, "run_id": run_id}
    try:
        js = await run_simulation(
            n=req.n,
            concurrency=req.concurrency,
            chaos_budget=req.chaos_budget,
            cleanup=req.cleanup,
            run_id=run_id,
        )
        _RUNS[run_id] = {
            "status": "complete",
            "started_at": started,
            "finished_at": time.time(),
            "run_id": run_id,
            "overall": js.get("overall"),
            "action_items": js.get("action_items", []),
            "report_md": f"/api/admin/simulate/{run_id}/report.md",
            "report_json": f"/api/admin/simulate/{run_id}/report.json",
        }
    except Exception as exc:    # noqa: BLE001
        log.exception("sim run %s failed", run_id)
        _RUNS[run_id] = {
            "status": "failed",
            "started_at": started,
            "finished_at": time.time(),
            "run_id": run_id,
            "error": f"{type(exc).__name__}: {str(exc)[:200]}",
        }


@router.post("/admin/simulate")
async def kick_simulation(
    req: SimRequest, bg: BackgroundTasks,
    user_id: str = Depends(get_current_user),
) -> dict[str, Any]:
    """Kick off a simulation cohort. Returns immediately with run_id."""
    await _gate_admin(user_id)
    run_id = f"r{int(time.time())}_{uuid.uuid4().hex[:6]}"
    bg.add_task(_run_in_bg, req, run_id)
    return {
        "run_id": run_id,
        "status": "queued",
        "poll_url": f"/api/admin/simulate/{run_id}",
        "config": req.model_dump(),
    }


@router.get("/admin/simulate/{run_id}")
async def sim_status(run_id: str, user_id: str = Depends(get_current_user)) -> dict[str, Any]:
    await _gate_admin(user_id)
    info = _RUNS.get(run_id)
    if not info:
        raise HTTPException(404, "unknown run_id")
    return info


@router.get("/admin/simulate/{run_id}/report.md")
async def sim_report_md(run_id: str, user_id: str = Depends(get_current_user)) -> dict[str, Any]:
    await _gate_admin(user_id)
    p = _REPORTS_DIR / f"sim_{run_id}.md"
    if not p.exists():
        raise HTTPException(404, "report not ready")
    return {"run_id": run_id, "markdown": p.read_text()}


@router.get("/admin/simulate/{run_id}/report.json")
async def sim_report_json(run_id: str, user_id: str = Depends(get_current_user)) -> dict[str, Any]:
    await _gate_admin(user_id)
    import json
    p = _REPORTS_DIR / f"sim_{run_id}.json"
    if not p.exists():
        raise HTTPException(404, "report not ready")
    return json.loads(p.read_text())


@router.get("/admin/simulate")
async def list_runs(user_id: str = Depends(get_current_user)) -> dict[str, Any]:
    await _gate_admin(user_id)
    return {
        "runs": sorted(
            [{"run_id": k, **v} for k, v in _RUNS.items()],
            key=lambda r: r.get("started_at", 0), reverse=True,
        )[:20],
    }


__all__ = ["router"]
