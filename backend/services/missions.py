"""services/missions.py — Round 99I.

The "Mission" is the north-star layer above individual actions.

PROBLEM
-------
Pre-R99I, every action card was an island. Tap "Cap food at ₹7,500"
→ a budget gets created → user thinks "ok now what?". There was no
persistent sense of *what the user was working toward this month*.
Result: high task completion, low retention.

CORE IDEA
---------
Each user has at most ONE active monthly Mission:

    "Save ₹X in 30 days."

Every action laddering up to that mission earns visible progress.
Caps lock save toward the goal. Emergency fund deposits do too.
Spending under last month's pace contributes too. The mission is
the user's monthly answer to *"why am I doing all this?"*

SCHEMA (collection: `missions`)
--------------------------------
    {
        _id: ObjectId,                     # mission id
        user_id: str,                      # owner
        title: str,                        # "Save ₹15,000 in 30 days"
        kind: 'monthly_savings',           # extensible later
        target_amount: float,              # ₹15,000
        saved_amount: float,               # rolling sum of contributions
        period_start: datetime,            # 1st of the month UTC
        period_end:   datetime,            # 1st of next month UTC
        momentum: 'up' | 'down' | 'flat',  # 7-day delta
        contributions: [
          { kind, amount, label, ts }
        ],
        status: 'active' | 'completed' | 'expired',
        completed_at: datetime?,           # set on success
        created_at: datetime,
        updated_at: datetime,
    }

PUBLIC API
----------
    seed_initial_mission(user_id, income_monthly, peer_pct) -> dict
    get_active_mission(user_id) -> dict | None
    contribute(user_id, amount, kind, label, idem_key=None) -> dict
    summarise_for_ai(user_id) -> str          # one-line context for the Coach

Idempotency on contribute:
    Same (user_id, idem_key) replay returns the mission unchanged.
    Different idem_keys with same kind+amount within the same minute
    still both apply (intentional — multiple manual taps shouldn't
    silently swallow).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from core.db import db

logger = logging.getLogger(__name__)


def _utc_month_window(now: Optional[datetime] = None) -> tuple[datetime, datetime]:
    """Return (period_start, period_end) for the user's active month
    in UTC. Period is calendar-month-aligned for deterministic display.
    """
    n = now or datetime.now(timezone.utc)
    start = n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Next month, clamped: roll over via day=28 + 4 days trick.
    next_month = (start + timedelta(days=32)).replace(day=1)
    return start, next_month


def _target_for(income_monthly: int, peer_pct: int) -> int:
    """Aspirational monthly savings target.

    Formula: income × (peer_pct + 5%). The +5% boost gives users a
    *reach* goal — beat your peers — instead of just matching them.
    Rounded to nearest ₹500 for readability.
    """
    if income_monthly <= 0:
        return 5_000
    raw = int(income_monthly * (peer_pct + 5) / 100.0)
    # Round to nearest 500.
    return max(2_000, (raw // 500) * 500)


async def seed_initial_mission(
    user_id: str,
    income_monthly: int,
    peer_pct: int,
) -> Dict[str, Any]:
    """Create the user's first monthly Mission. Idempotent — if a
    mission already exists for the current period, returns it
    unchanged.
    """
    now = datetime.now(timezone.utc)
    p_start, p_end = _utc_month_window(now)

    existing = await db.missions.find_one({
        "user_id": user_id,
        "period_start": p_start,
        "status": "active",
    })
    if existing:
        return _serialise(existing)

    target = _target_for(income_monthly, peer_pct)
    doc: Dict[str, Any] = {
        "user_id": user_id,
        "title": f"Save ₹{target:,} in 30 days",
        "kind": "monthly_savings",
        "target_amount": float(target),
        "saved_amount": 0.0,
        "period_start": p_start,
        "period_end": p_end,
        "momentum": "flat",
        "contributions": [],
        "status": "active",
        "completed_at": None,
        "created_at": now,
        "updated_at": now,
        # Indexed by (user_id + idem_key) tuple to dedupe contribute() retries.
        "_idem_seen": [],
    }
    res = await db.missions.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


async def get_active_mission(user_id: str) -> Optional[Dict[str, Any]]:
    """Return the user's currently-running mission (any status that
    falls inside the current period_start..period_end window).
    """
    p_start, _ = _utc_month_window()
    doc = await db.missions.find_one({
        "user_id": user_id,
        "period_start": p_start,
    })
    if not doc:
        return None
    return _serialise(doc)


async def contribute(
    user_id: str,
    amount: float,
    kind: str,
    label: str,
    idem_key: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Add a contribution to the user's active mission.

    `kind` examples:
      - 'budget_cap_locked'
      - 'goal_deposit'
      - 'spend_under_pace'
      - 'manual'

    Returns the updated mission, or None if no active mission exists
    (e.g. user never went through onboarding seed).
    """
    if amount <= 0:
        return await get_active_mission(user_id)
    p_start, _ = _utc_month_window()

    # Idempotency — if the (user, idem_key) was already applied to this
    # period's mission, skip.
    if idem_key:
        seen = await db.missions.find_one({
            "user_id": user_id,
            "period_start": p_start,
            "_idem_seen": idem_key,
        })
        if seen:
            return _serialise(seen)

    now = datetime.now(timezone.utc)
    update: Dict[str, Any] = {
        "$inc": {"saved_amount": float(amount)},
        "$set": {"updated_at": now},
        "$push": {
            "contributions": {
                "kind": kind,
                "amount": float(amount),
                "label": label,
                "ts": now,
            },
        },
    }
    if idem_key:
        update["$push"]["_idem_seen"] = idem_key   # type: ignore[index]

    res = await db.missions.find_one_and_update(
        {"user_id": user_id, "period_start": p_start, "status": "active"},
        update,
        return_document=True,    # ReturnDocument.AFTER — pymongo true == AFTER
    )
    if not res:
        return None

    # Auto-complete if target hit.
    if (
        res.get("status") == "active"
        and float(res.get("saved_amount") or 0) >= float(res.get("target_amount") or 1)
    ):
        await db.missions.update_one(
            {"_id": res["_id"]},
            {"$set": {"status": "completed", "completed_at": now}},
        )
        res["status"] = "completed"
        res["completed_at"] = now

    return _serialise(res)


async def summarise_for_ai(user_id: str) -> str:
    """One-line mission context for injecting into Coach prompts.

    Empty string if no active mission so the prompt template can
    cleanly skip the line.
    """
    m = await get_active_mission(user_id)
    if not m:
        return ""
    saved = float(m.get("saved_amount") or 0)
    tgt   = float(m.get("target_amount") or 0)
    if tgt <= 0:
        return ""
    pct = min(100, int(saved / tgt * 100))
    gap = max(0, int(tgt - saved))
    days_left = max(0, (m["period_end"] - datetime.now(timezone.utc)).days)
    return (
        f"USER MISSION (this month): {m['title']}. "
        f"Progress: ₹{int(saved):,} saved ({pct}%). "
        f"Gap: ₹{gap:,} to go. {days_left} days left. "
        f"Momentum: {m.get('momentum', 'flat')}."
    )


def _serialise(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Strip Mongo internals, ISO-fy timestamps."""
    if not doc:
        return doc
    out: Dict[str, Any] = {}
    for k, v in doc.items():
        if k.startswith("_") and k != "_id":
            continue
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, list):
            out[k] = [
                {**i, "ts": i["ts"].isoformat()} if isinstance(i, dict) and isinstance(i.get("ts"), datetime) else i
                for i in v
            ]
        else:
            out[k] = v
    out["id"] = str(doc.get("_id", ""))
    # Derived display fields the frontend can read directly.
    saved = float(doc.get("saved_amount") or 0)
    tgt   = float(doc.get("target_amount") or 0)
    out["progress_pct"] = min(100, int(saved / tgt * 100)) if tgt > 0 else 0
    out["gap_amount"]   = max(0, int(tgt - saved))
    pe = doc.get("period_end")
    if isinstance(pe, datetime):
        # Mongo returns naive UTC datetimes for offset-aware writes.
        # Reattach tzinfo so the diff against now() doesn't blow up.
        if pe.tzinfo is None:
            pe = pe.replace(tzinfo=timezone.utc)
        out["days_left"] = max(0, (pe - datetime.now(timezone.utc)).days)
    # R100Q — Surface the most-recent contribution so the Mission Card
    # on Home renders proof-of-motion instead of a static gauge. Reads
    # from the contributions[] array (newest last per push-append).
    contribs = doc.get("contributions") or []
    if contribs:
        last = contribs[-1]
        if isinstance(last, dict):
            ts = last.get("ts")
            out["last_contribution"] = {
                "amount": float(last.get("amount") or 0),
                "label": last.get("label") or "",
                "ts": ts.isoformat() if isinstance(ts, datetime) else ts,
            }
    else:
        out["last_contribution"] = None
    return out


__all__ = [
    "seed_initial_mission",
    "get_active_mission",
    "contribute",
    "summarise_for_ai",
]
