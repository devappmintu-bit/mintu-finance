"""
routers/coach_v2.py — Round 90 Surface 1.

Adds the new Coach-OS endpoints layered ON TOP of the existing /ai/chat:

  POST  /coach/chat                  — wraps /ai/chat with memory injection,
                                       action-card extraction, confidence,
                                       and background session summarisation.
  POST  /coach/actions/execute       — dispatches a tappable action card
                                       through to the right backend mutation.
  GET   /coach/suggestions           — 3 LLM-generated chip prompts based on
                                       the user's current financial state.
  POST  /coach/triggers/check        — checks the 3 proactive triggers
                                       (salary, overspend, weekly-review)
                                       and returns any that fired. Wiring
                                       to push notifications is left to a
                                       cron — this endpoint is the brain.

Existing /ai/chat is untouched. Frontend will migrate to /coach/chat.
"""
from __future__ import annotations

import os
import re
import json
import logging
import calendar
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from core.auth import get_current_user
from core.time import utc_now
from core.llm_safe import safe_send
from core.users import get_user_by_id
from services import coach_context
from services import coach_rewards   # Round 92 — habit loop close-out.

router = APIRouter(prefix="/coach", tags=["coach-v2"])
logger = logging.getLogger("coach_v2")

# Lazy LLM imports — keep top-level cheap.
def _llm():
    from routers.ai_common import LlmChat, UserMessage
    return LlmChat, UserMessage


# ─────────────────────────── models ──────────────────────────────


class CoachAsk(BaseModel):
    message: str
    lang: str = "en"


class ActionCard(BaseModel):
    label: str
    endpoint: str
    payload: dict
    confirm_text: str = "Done"
    method: str = "POST"
    # Round 92 — projected impact shown BEFORE tap (Duolingo move).
    projected_label: str = ""
    projected_impact: float = 0.0


class CoachReply(BaseModel):
    reply: str
    confidence: float = 0.85           # 0..1
    confidence_label: str = ""         # human-friendly trailer (empty if high)
    actions: list[ActionCard] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class ActionExecRequest(BaseModel):
    label: str
    endpoint: str
    payload: dict
    method: str = "POST"


class TriggerHit(BaseModel):
    id: str
    title: str
    body: str
    deep_link: str
    severity: str = "info"             # info | warn | critical


# ───────────────────────── helpers ───────────────────────────────


_ACTION_REGEX = re.compile(r"\[ACTION:([^\]]+)\]", re.IGNORECASE)


_KNOWN_ACTIONS = {
    # action_key → {endpoint, method, default confirm}
    "set_budget_cap": {
        "endpoint": "/api/budgets",
        "method": "POST",
        "confirm": "Cap set.",
    },
    "add_expense": {
        "endpoint": "/api/transactions",
        "method": "POST",
        "confirm": "Expense added.",
    },
    "create_goal": {
        "endpoint": "/api/goals",
        "method": "POST",
        "confirm": "Goal created.",
    },
    "revoke_device": {
        "endpoint": "/api/auth/sessions/{id}",
        "method": "DELETE",
        "confirm": "Device revoked.",
    },
}


def _confidence_from_mode(data_mode: str, txn_count: int) -> tuple[float, str]:
    """Map data_mode + activity to a confidence score + UI label."""
    if data_mode == "no_data" or txn_count == 0:
        return 0.30, "I don't have enough data yet — this is a general estimate."
    if data_mode == "partial":
        return 0.65, "Based on limited recent data — accuracy improves with more entries."
    # full data
    if txn_count < 30:
        return 0.78, "Based on the last 30 days of data."
    return 0.92, ""    # high — no trailer.


async def _extract_actions_from_text(text: str, user_id: str) -> tuple[str, list[ActionCard]]:
    """Pull `[ACTION:key|payload_json]` markers out of the LLM reply.

    The LLM is instructed (in the system prompt) to emit at most one
    such marker when an action would help. Everything else is plain
    prose — we strip the markers from the displayed reply.
    """
    cards: list[ActionCard] = []
    # Two-phase: collect spec strings synchronously (regex doesn't await),
    # then in an async pass compute projected_label from coach_rewards.

    found: list[tuple[str, dict]] = []

    def _replace(match: re.Match) -> str:
        spec = match.group(1).strip()
        try:
            key, _, payload_raw = spec.partition("|")
            key = key.strip()
            cfg = _KNOWN_ACTIONS.get(key)
            if not cfg:
                return ""
            payload = {}
            if payload_raw.strip():
                try:
                    payload = json.loads(payload_raw)
                except Exception:
                    payload = {}
            found.append((key, payload))
        except Exception:    # noqa: BLE001
            pass
        return ""

    cleaned = _ACTION_REGEX.sub(_replace, text).strip()

    # Build cards with projected labels.
    for key, payload in found[:1]:  # cap at 1 (decision UI, not menu)
        cfg = _KNOWN_ACTIONS.get(key) or {}
        try:
            impact, plabel = await coach_rewards.estimate_projected_impact(
                user_id, key, payload,
            )
        except Exception:    # noqa: BLE001
            impact, plabel = 0.0, ""
        cards.append(ActionCard(
            label=_label_for(key, payload),
            endpoint=cfg.get("endpoint", ""),
            payload=payload,
            confirm_text=cfg.get("confirm", "Done"),
            method=cfg.get("method", "POST"),
            projected_impact=float(impact),
            projected_label=plabel,
        ))

    return cleaned, cards


def _label_for(key: str, payload: dict) -> str:
    if key == "set_budget_cap":
        cat = payload.get("category", "category")
        amt = payload.get("amount")
        return f"Set ₹{int(amt):,} {cat} cap" if amt else f"Set {cat} cap"
    if key == "add_expense":
        amt = payload.get("amount")
        cat = payload.get("category", "expense")
        return f"Add ₹{int(amt):,} {cat}" if amt else "Add this expense"
    if key == "create_goal":
        title = payload.get("title", "goal")
        amt = payload.get("target_amount")
        return f"Create goal: {title}" + (f" (₹{int(amt):,})" if amt else "")
    if key == "revoke_device":
        return "Revoke this device"
    return key.replace("_", " ").title()


# ─────────────────────────── endpoints ──────────────────────────


@router.post("/chat", response_model=CoachReply)
async def coach_chat(
    body: CoachAsk,
    bg: BackgroundTasks,
    user_id: str = Depends(get_current_user),
):
    """Memory-injected, action-aware coach chat. Drop-in replacement
    for /ai/chat. Frontend should call this going forward."""

    # 1. Pull existing context (memory) and user profile.
    ctx = await coach_context.get_context(user_id)

    # 2. Run the existing data-aware pipeline (re-use logic by calling /ai/chat
    #    transitively would create circular imports — so we inline the
    #    minimum needed here).
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    from server import db
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    cat_pipe = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    cat_spend: dict[str, dict] = {}
    async for d in db.transactions.aggregate(cat_pipe):
        cat_spend[d["_id"]] = {"total": float(d.get("total") or 0), "count": int(d.get("count") or 0)}
    total_expense = sum(v["total"] for v in cat_spend.values())
    txn_count = sum(v["count"] for v in cat_spend.values())

    inc_docs = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    total_income = float(inc_docs[0]["total"]) if inc_docs else 0.0

    if txn_count == 0:
        data_mode = "no_data"
    elif txn_count < 5 or total_income == 0:
        data_mode = "partial"
    else:
        data_mode = "full"

    # 3. Build the system prompt with memory block prepended.
    memory_block = coach_context.render_system_block(ctx)
    top_cat = max(cat_spend, key=lambda k: cat_spend[k]["total"]) if cat_spend else None

    system_prompt = (
        "You are MintU AI Coach — a decision-first financial assistant for Indian users.\n"
        "You are OPINIONATED. You NEVER give vague choices. You decide for the user.\n\n"
        f"━━━ MEMORY ━━━\n{memory_block}\n\n"
        f"━━━ THIS MONTH ━━━\n"
        f"Income ₹{total_income:,.0f} · Expense ₹{total_expense:,.0f} · "
        f"Top category: {top_cat or 'n/a'} · Mode: {data_mode}\n\n"
        "━━━ RULES ━━━\n"
        "1. Lead with a number from the data above. Maximum 4 short lines.\n"
        "2. End with a → Action line (verb-led).\n"
        "3. **MANDATORY ACTION MARKER**: If the user's intent maps to ANY of\n"
        "   {set_budget_cap, add_expense, create_goal, revoke_device}, you MUST\n"
        "   append an [ACTION:KEY|JSON_PAYLOAD] marker on a new line. No\n"
        "   exceptions. The user taps to confirm — don't make them re-type.\n\n"
        "   Intent → action map (use these aggressively):\n"
        "   • 'cap food at X' / 'limit X to Y' / 'reduce X spending'\n"
        "        → [ACTION:set_budget_cap|{\"category\":\"<cat>\",\"amount\":<int>}]\n"
        "   • 'i spent X on Y' / 'add X expense' / 'log X'\n"
        "        → [ACTION:add_expense|{\"category\":\"<cat>\",\"amount\":<int>}]\n"
        "   • 'save for X' / 'goal: X' / 'i want to buy X'\n"
        "        → [ACTION:create_goal|{\"title\":\"<title>\",\"target_amount\":<int>}]\n"
        "   • 'overspending on X' / 'where am i leaking' / 'biggest leak'\n"
        "        → if Top category exists, propose a 15% cut as set_budget_cap\n"
        "        → [ACTION:set_budget_cap|{\"category\":\"<top_cat>\",\"amount\":<0.85*current>}]\n\n"
        "   When you're not sure of exact numbers, pick a SENSIBLE DEFAULT and\n"
        "   emit the action anyway — the user can edit before tapping. The\n"
        "   marker is parsed by the UI and never shown to the user.\n\n"
        "4. Never invent numbers for ANSWERS. ₹ with thousands separators.\n"
        "   India context only (SIPs, ELSS, NPS, PPF, UPI, Swiggy/Zomato).\n"
        "5. Do NOT use markdown headers. Plain prose. Max 1 emoji.\n"
        "6. If the user just says 'help' or 'hi' — propose a [ACTION:set_budget_cap]\n"
        "   on the top spending category as your default suggestion."
    )

    # 4. Call the LLM.
    LlmChat, UserMessage = _llm()
    llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
    chat = LlmChat(
        api_key=llm_key,
        session_id=f"coach_v2_{user_id}_{utc_now().timestamp()}",
        system_message=system_prompt,
    ).with_model("openai", "gpt-5.2")

    raw = await safe_send(
        chat, UserMessage(text=body.message), timeout=15.0, label="coach_v2"
    )
    raw_text = (raw if isinstance(raw, str) else str(raw or "")).strip()
    if not raw_text:
        raw_text = (
            "I couldn't reach the model. "
            "→ Try once more in a moment."
        )

    # 5. Extract action cards.
    cleaned_text, actions = await _extract_actions_from_text(raw_text, user_id)

    # 6. Confidence label.
    confidence, conf_label = _confidence_from_mode(data_mode, txn_count)

    # 7. Background — refresh the rolling session summary.
    await coach_context.kick_summarise(user_id, body.message, cleaned_text)

    return CoachReply(
        reply=cleaned_text,
        confidence=confidence,
        confidence_label=conf_label,
        actions=actions,
        suggestions=[],     # populated by /coach/suggestions endpoint
    )


@router.get("/suggestions")
async def coach_suggestions(user_id: str = Depends(get_current_user)):
    """Surface 1E — 3 contextual suggested questions as tappable chips.

    Generated fresh per call (cached 10 minutes per-user inside the LLM
    cache layer). Skips the LLM and falls back to deterministic templates
    if the call fails or no data exists.
    """
    from server import db

    # Quick aggregate for context.
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cat_pipe = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
        {"$sort": {"total": -1}},
        {"$limit": 3},
    ]
    top = []
    async for d in db.transactions.aggregate(cat_pipe):
        top.append({"category": d.get("_id") or "uncategorised", "total": float(d.get("total") or 0)})

    goals = await db.goals.find({"user_id": user_id}).sort("updated_at", -1).limit(2).to_list(2)

    # ── deterministic fallbacks (used if LLM fails OR no data)
    if not top:
        return {
            "suggestions": [
                "How do I start tracking my expenses?",
                "What's a good first money goal in India?",
                "How much should I save each month?",
            ]
        }

    fallback = [
        f"Why is {top[0]['category']} my biggest spend?" if top else "What's my biggest leak?",
        "Am I saving enough for my goals?" if goals else "Help me set my first money goal.",
        "What's one thing I can fix this week?",
    ]

    # ── LLM-personalised
    try:
        LlmChat, UserMessage = _llm()
        llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"coach_suggest_{user_id}_{utc_now().timestamp()}",
            system_message=(
                "Generate exactly 3 short questions a user might tap to ask "
                "their finance coach. India context. ≤8 words each. No "
                "markdown, no numbering — output JSON: "
                '{"suggestions":["...","...","..."]}'
            ),
        ).with_model("anthropic", "claude-haiku-4-5")
        prompt = (
            "USER STATE: top-spend "
            + ", ".join(f"{t['category']} (₹{int(t['total']):,})" for t in top)
            + (" — open goals: " + ", ".join(g.get("title", "?") for g in goals) if goals else "")
            + "\nReturn the JSON object now."
        )
        out = await safe_send(chat, UserMessage(text=prompt), timeout=8.0, label="coach_suggest")
        text = (out if isinstance(out, str) else str(out or "")).strip()
        # Best-effort JSON extraction.
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            obj = json.loads(m.group(0))
            arr = obj.get("suggestions") or []
            arr = [s.strip()[:80] for s in arr if isinstance(s, str)][:3]
            if len(arr) == 3:
                return {"suggestions": arr}
    except Exception as e:
        logger.warning("coach_suggestions LLM fallback: %s", e)

    return {"suggestions": fallback}


@router.post("/actions/execute")
async def coach_actions_execute(req: ActionExecRequest, user_id: str = Depends(get_current_user)):
    """Surface 1C — server-side dispatcher for action cards.

    Validates the endpoint is on the allow-list, executes the mutation
    in-process (we do NOT proxy HTTP — too brittle), and pushes the
    completed action onto the user's coach memory.
    """
    from server import db

    ep = req.endpoint
    payload = req.payload or {}
    method = (req.method or "POST").upper()

    try:
        if ep == "/api/budgets" and method == "POST":
            cat = (payload.get("category") or "").strip().lower()
            amt = float(payload.get("amount") or 0)
            if not cat or amt <= 0:
                raise HTTPException(400, "category and amount required")
            await db.budgets.update_one(
                {"user_id": user_id, "category": cat},
                {"$set": {
                    "user_id": user_id,
                    "category": cat,
                    "amount": amt,
                    "updated_at": utc_now(),
                }},
                upsert=True,
            )

        elif ep == "/api/transactions" and method == "POST":
            cat = (payload.get("category") or "uncategorised").strip().lower()
            amt = float(payload.get("amount") or 0)
            note = (payload.get("note") or "").strip()[:200]
            if amt <= 0:
                raise HTTPException(400, "amount required")
            await db.transactions.insert_one({
                "user_id": user_id,
                "category": cat,
                "amount": amt,
                "type": "expense",
                "note": note,
                "date": utc_now(),
                "created_at": utc_now(),
                "source": "coach_action",
            })

        elif ep == "/api/goals" and method == "POST":
            title = (payload.get("title") or "").strip()[:80]
            tgt = float(payload.get("target_amount") or 0)
            if not title or tgt <= 0:
                raise HTTPException(400, "title and target_amount required")
            await db.goals.insert_one({
                "user_id": user_id,
                "title": title,
                "target_amount": tgt,
                "current_amount": 0,
                "created_at": utc_now(),
                "updated_at": utc_now(),
                "source": "coach_action",
            })

        elif ep.startswith("/api/auth/sessions/") and method == "DELETE":
            sid = ep.rsplit("/", 1)[-1]
            from services import session_service
            await session_service.revoke_by_id(session_id=sid, user_id=user_id)

        else:
            raise HTTPException(400, f"Action endpoint not allow-listed: {method} {ep}")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Coach action failed")
        raise HTTPException(500, f"Action failed: {e}")

    # Memory: record the action.
    await coach_context.append_action(user_id, req.label, ep, payload)

    # Round 92 — close the habit loop. Compute projected impact and
    # persist a reward event so the daily brief / home reward strip
    # can read it back tomorrow.
    impact, plabel = 0.0, ""
    try:
        # Derive the action_key from the endpoint we just dispatched.
        action_key_map = {
            "/api/budgets": "set_budget_cap",
            "/api/transactions": "add_expense",
            "/api/goals": "create_goal",
        }
        if ep.startswith("/api/auth/sessions/"):
            action_key = "revoke_device"
        else:
            action_key = action_key_map.get(ep, "")
        if action_key:
            impact, plabel = await coach_rewards.estimate_projected_impact(
                user_id, action_key, payload,
            )
            await coach_rewards.record_reward(
                user_id=user_id,
                action_key=action_key,
                action_label=req.label,
                projected_impact=impact,
                projected_label=plabel,
            )
    except Exception:    # noqa: BLE001 — never block the action on reward write
        logger.exception("coach_rewards.record_reward failed (non-fatal)")

    return {
        "ok": True,
        "projected_impact": float(impact),
        "projected_label": plabel,
    }


# ─────────────── Round 92 — Coach Rewards (habit-loop) ──────────────

@router.get("/rewards/recent")
async def coach_rewards_recent(user_id: str = Depends(get_current_user)):
    """Return the most recent unread reward event (within 36 h).

    UI consumes this for the home "you saved ₹X" strip and the daily
    brief opener. Returns `{reward: null}` when nothing is pending.
    """
    doc = await coach_rewards.get_recent_unread(user_id)
    return {"reward": doc}


@router.post("/rewards/mark-read")
async def coach_rewards_mark_read(user_id: str = Depends(get_current_user)):
    n = await coach_rewards.mark_all_read(user_id)
    return {"ok": True, "marked": int(n)}


@router.get("/rewards/summary")
async def coach_rewards_summary(user_id: str = Depends(get_current_user)):
    """Total projected savings across this calendar month — used in the
    daily brief ("Your coach saved you ₹X this month so far")."""
    from server import db
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    agg = await db.coach_rewards.aggregate([
        {"$match": {"user_id": user_id, "created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$projected_impact"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    if not agg:
        return {"total_projected": 0.0, "count": 0, "headline": "No actions this month yet — ask Mintu for one."}
    total = float(agg[0].get("total") or 0)
    count = int(agg[0].get("count") or 0)
    if total <= 0:
        return {"total_projected": 0.0, "count": count, "headline": f"{count} action{'s' if count != 1 else ''} taken this month."}
    return {
        "total_projected": total,
        "count": count,
        "headline": f"Your coach saved you ₹{int(total):,} this month.",
    }


@router.post("/triggers/check")
async def coach_triggers_check(user_id: str = Depends(get_current_user)):
    """Surface 1B — runs the 3 proactive triggers and returns any that
    fired RIGHT NOW for this user. UI/manual call; no cooldown applied
    (the cron worker is responsible for cooldown + delivery)."""
    from services import coach_triggers
    fires = await coach_triggers.evaluate_for_user(user_id)
    return {"fired": fires}


__all__ = ["router"]
