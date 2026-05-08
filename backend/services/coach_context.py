"""
services/coach_context.py — Round 90 Surface 1A.

Per-user coach session memory. Single source of truth for what the AI
"remembers" across sessions. Every coach reply reads + writes this.

Schema (collection: `user_coach_context`):
  {
    user_id,
    last_5_insights:        [{summary, ts}],
    last_3_actions_taken:   [{label, endpoint, payload, ts}],
    known_patterns:         ["overspends weekends", ...],
    open_goals:             [{title, target, progress}],
    last_session_summary:   str,        # 2-line LLM summary
    updated_at:             datetime,
  }

Background summarisation: at conversation end (called from coach
endpoint or when the chat surface unmounts), we run a 2-sentence
summary through claude-haiku-4-5 and persist it.
"""
from __future__ import annotations

import os
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from core.time import utc_now
from core.llm_safe import safe_send

# LLM helpers — import lazily to mirror existing pattern in ai_coach.
def _llm_chat():
    from routers.ai_common import LlmChat, UserMessage
    return LlmChat, UserMessage

logger = logging.getLogger("coach_context")

MAX_INSIGHTS = 5
MAX_ACTIONS = 3
MAX_PATTERNS = 5


async def get_context(user_id: str) -> dict:
    """Return the stored context document, or a sane empty default."""
    from server import db
    doc = await db.user_coach_context.find_one({"user_id": user_id})
    if not doc:
        return {
            "user_id": user_id,
            "last_5_insights": [],
            "last_3_actions_taken": [],
            "known_patterns": [],
            "open_goals": [],
            "last_session_summary": "",
            "updated_at": None,
        }
    doc.pop("_id", None)
    return doc


def render_system_block(ctx: dict) -> str:
    """Format the context as a compact system-prompt block.

    Kept short — token-budget matters. Empty fields render as a single
    line ("None yet") rather than empty bullets.

    R100Q — Honest cold-start. We now compute a data-availability
    snapshot and inject explicit "if data is thin, admit it" guidance.
    The LLM stops hallucinating peer comparisons and budget verdicts
    when it has nothing to base them on.
    """
    summary = (ctx.get("last_session_summary") or "").strip() or "First session."
    patterns = ctx.get("known_patterns") or []
    goals = ctx.get("open_goals") or []
    actions = ctx.get("last_3_actions_taken") or []

    pattern_str = ", ".join(p for p in patterns[:MAX_PATTERNS]) if patterns else "None tracked yet"
    goal_str = (
        "; ".join(
            f"{g.get('title', '?')} ({g.get('progress', 0)}/{g.get('target', '?')})"
            for g in goals[:3]
        )
        if goals
        else "None set"
    )
    last_action = (actions[-1].get("label") if actions else "") or "None"

    # Capability snapshot — how much data do we actually have? Derived
    # from the same context doc (no extra DB roundtrips).
    txn_days = int(ctx.get("txn_days_count") or 0)
    has_income = bool(ctx.get("income_monthly"))
    has_patterns = len(patterns) > 0
    has_goals = len(goals) > 0

    if txn_days < 3 and not has_income:
        cold_start = "VERY_COLD"   # day 0-1, nothing to reason from
    elif txn_days < 7 or not has_patterns:
        cold_start = "WARMING"      # has some signals but thin
    else:
        cold_start = "WARM"         # full reasoning OK

    honesty_rules = {
        "VERY_COLD": (
            "DATA STATUS: cold start. You have very little real data on this user. "
            "DO NOT make peer comparisons, claim spending patterns, or quote percentages. "
            "DO admit you're new to their finances. Suggest 1-2 practical next steps "
            "(connect bank, log first expense). Be brief — under 80 words."
        ),
        "WARMING": (
            "DATA STATUS: warming up. Some signals but limited history. "
            "When making any claim with a number, append a quiet hedge "
            "(e.g. 'based on your last few days') so the user knows the basis. "
            "Avoid ranking against peers until 14+ days of data."
        ),
        "WARM": (
            "DATA STATUS: warm. Reasonable history available. "
            "Cite the basis for any number you give "
            "(e.g. 'based on your last 30 days of UPI'). Keep citations short and human."
        ),
    }

    return (
        "Context from previous sessions: "
        + summary
        + "\nKnown patterns: "
        + pattern_str
        + "\nOpen goals: "
        + goal_str
        + "\nLast action you helped with: "
        + last_action
        + f"\nDATA AVAILABILITY: txn_days={txn_days} income={'yes' if has_income else 'no'} "
        + f"patterns={'yes' if has_patterns else 'no'} goals={'yes' if has_goals else 'no'}"
        + "\n" + honesty_rules[cold_start]
    )


async def append_insight(user_id: str, summary: str) -> None:
    """Push an insight onto the last_5_insights ring."""
    from server import db
    if not summary:
        return
    entry = {"summary": summary[:240], "ts": utc_now()}
    await db.user_coach_context.update_one(
        {"user_id": user_id},
        {
            "$push": {
                "last_5_insights": {
                    "$each": [entry],
                    "$slice": -MAX_INSIGHTS,
                }
            },
            "$set": {"updated_at": utc_now()},
        },
        upsert=True,
    )


async def append_action(user_id: str, label: str, endpoint: str, payload: dict) -> None:
    """Push an action onto last_3_actions_taken (ring) — fired when the
    user actually taps an action card."""
    from server import db
    entry = {
        "label": (label or "")[:120],
        "endpoint": endpoint,
        "payload": payload or {},
        "ts": utc_now(),
    }
    await db.user_coach_context.update_one(
        {"user_id": user_id},
        {
            "$push": {
                "last_3_actions_taken": {
                    "$each": [entry],
                    "$slice": -MAX_ACTIONS,
                }
            },
            "$set": {"updated_at": utc_now()},
        },
        upsert=True,
    )


async def update_patterns(user_id: str, patterns: list[str]) -> None:
    """Replace the known_patterns set (LLM-extracted)."""
    from server import db
    cleaned = [p.strip()[:60] for p in patterns if p and isinstance(p, str)][:MAX_PATTERNS]
    await db.user_coach_context.update_one(
        {"user_id": user_id},
        {"$set": {"known_patterns": cleaned, "updated_at": utc_now()}},
        upsert=True,
    )


async def summarise_session(user_id: str, last_user_msg: str, last_ai_reply: str) -> None:
    """Background task — boil the just-completed turn into a 2-sentence
    rolling summary using claude-haiku (fast + cheap).

    Never raises — we do not want a summary failure to break the chat.
    """
    if not last_user_msg or not last_ai_reply:
        return
    try:
        LlmChat, UserMessage = _llm_chat()
        llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
        prior = await get_context(user_id)
        prior_summary = prior.get("last_session_summary") or "(none)"

        chat = LlmChat(
            api_key=llm_key,
            session_id=f"coach_summary_{user_id}_{utc_now().timestamp()}",
            system_message=(
                "You are summarising a personal-finance coaching session for "
                "future continuity. Output exactly 2 short sentences. "
                "Sentence 1: what the user asked or surfaced. "
                "Sentence 2: what the coach recommended or set up. "
                "No bullet points. No newlines. Past tense."
            ),
        ).with_model("anthropic", "claude-haiku-4-5")

        prompt = (
            f"PRIOR SUMMARY (for continuity, may be empty): {prior_summary}\n\n"
            f"NEW USER MESSAGE: {last_user_msg[:600]}\n\n"
            f"NEW COACH REPLY: {last_ai_reply[:600]}\n\n"
            "Now produce the updated 2-sentence summary."
        )

        new_summary = await safe_send(
            chat, UserMessage(text=prompt), timeout=8.0, label="coach_summary"
        )
        if not new_summary:
            return
        text = (new_summary if isinstance(new_summary, str) else str(new_summary)).strip()
        if not text:
            return

        from server import db
        await db.user_coach_context.update_one(
            {"user_id": user_id},
            {"$set": {"last_session_summary": text[:400], "updated_at": utc_now()}},
            upsert=True,
        )
        # Insight ring — store the AI reply (short) too.
        await append_insight(user_id, last_ai_reply[:200])
    except Exception as e:
        logger.warning("summarise_session failed for %s: %s", user_id, e)


async def kick_summarise(user_id: str, user_msg: str, ai_reply: str) -> None:
    """Schedule summarise_session as a fire-and-forget background task.

    Designed to be called from inside an HTTP handler without blocking
    the response. Wrapped to never raise.
    """
    try:
        asyncio.create_task(summarise_session(user_id, user_msg, ai_reply))
    except RuntimeError:
        # No running loop (rare — tests). Skip.
        pass


__all__ = [
    "get_context",
    "render_system_block",
    "append_insight",
    "append_action",
    "update_patterns",
    "summarise_session",
    "kick_summarise",
]
