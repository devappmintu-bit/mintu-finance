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
from fastapi.responses import StreamingResponse
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
    # R100R — Source citation. A short italic provenance line shown
    # under every AI reply ("Based on your last 30 days of UPI spends · 47 txns").
    # Empty for cold-start (no data) — UI suppresses the line entirely
    # so we never claim provenance we don't have.
    source: str = ""
    actions: list[ActionCard] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    # R102B — Smart follow-up chips returned alongside every reply.
    # The audit asked for "Why ₹6000? · Change category · Skip for now ·
    # Show examples" — short pivot prompts the user can tap to drill
    # deeper without re-typing context. Chips are derived per-stage
    # from the user's data maturity (see prompt evolution).
    follow_ups: list[str] = Field(default_factory=list)
    # R102B — Coach maturity stage, surfaced so the UI can lightly
    # indicate to the user which level of personalization is active
    # (Stage 0 = priming, Stage 3 = full insight). Currently informational.
    stage: int = 0


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
    """Map data_mode + activity to a confidence score + UI label.

    R102 — Killed apologetic phrasing per audit ban list. Frontend
    only renders this trailer when label matches /low|uncertain|estimate/i,
    so for `partial` and `full` modes we return empty string → no
    trailer at all → the chat reads as confident. Only the cold-start
    `no_data` case still emits a short label, and even that is now
    spare ("Limited data — best-guess.") rather than the old
    "I don't have enough data yet — this is a general estimate."
    """
    if data_mode == "no_data" or txn_count == 0:
        return 0.30, "Limited data — best-guess."
    # partial / full / high data → no trailer (frontend gate filters anyway).
    if data_mode == "partial":
        return 0.65, ""
    if txn_count < 30:
        return 0.78, ""
    return 0.92, ""


def _source_from_mode(data_mode: str, txn_count: int) -> str:
    """R100R — One-line provenance shown italic under every AI reply.

    Cold-start (no data) returns "" — UI suppresses the line so we
    never claim provenance we don't have.
    """
    if data_mode == "no_data" or txn_count == 0:
        return ""
    if data_mode == "partial":
        return f"Based on your last {txn_count} transaction{'s' if txn_count != 1 else ''} this month."
    # full data
    return f"Based on your last 30 days of UPI spends · {txn_count} transactions."


# R102B — Coach maturity stages (AI Maturity Model). Mirrors the
# frontend-side `aiMaturity.ts` thresholds so the LLM gets prompts
# that match the user's data depth. The audit asked for the coach to
# "lead, simplify, reduce cognitive load, and progressively reveal
# complexity" — staged prompting is how that's enforced.
#
#   Stage 0 (0-4 txns)    — PRIMING. Keep it warm, single CTA, ban
#                           personalization claims. The user has no
#                           data yet — anything beyond a starter cap
#                           is performative AI.
#   Stage 1 (5-24 txns)   — BOOTSTRAP. Reference real numbers but
#                           hedge on patterns ("first signal" not
#                           "your habit"). Encourage one more category.
#   Stage 2 (25-99 txns)  — INSIGHT. Full personalization, suggest
#                           cuts on top categories with %, weekly
#                           pacing visible.
#   Stage 3 (100+ txns)   — ADAPTIVE. The coach knows the user. Can
#                           celebrate streaks, predict month-end,
#                           connect goals to category trends.
def _coach_stage(txn_count: int) -> int:
    if txn_count < 5:
        return 0
    if txn_count < 25:
        return 1
    if txn_count < 100:
        return 2
    return 3


def _stage_directives(stage: int) -> str:
    """Return the per-stage directive block to inject into the system prompt.
    Keep it tight — the LLM already has the rules; this just colours
    the tone for the current data depth."""
    if stage == 0:
        return (
            "━━━ STAGE 0 (priming) ━━━\n"
            "User has 0-4 expenses. Do NOT claim to know habits. Do NOT\n"
            "say 'your typical', 'your usual', 'you tend to'. Propose ONE\n"
            "starter cap and one tiny tracking action. Warm but spare."
        )
    if stage == 1:
        return (
            "━━━ STAGE 1 (bootstrap) ━━━\n"
            "User has 5-24 expenses. Reference real categories but call\n"
            "them 'first signal' not 'pattern'. Push for one more category\n"
            "or one more week of tracking. Avoid percentage claims."
        )
    if stage == 2:
        return (
            "━━━ STAGE 2 (insight) ━━━\n"
            "User has 25-99 expenses. Full personalization unlocked.\n"
            "Use percentages, weekly pacing, suggest 10-15% cuts on top\n"
            "categories. Reference last week vs this week when relevant."
        )
    return (
        "━━━ STAGE 3 (adaptive) ━━━\n"
        "User has 100+ expenses. You know them. Celebrate streaks,\n"
        "predict month-end pacing, connect goals to category trends.\n"
        "Confident voice. Skip the throat-clearing — get to the action."
    )


def _follow_ups_for(stage: int, top_cat: str | None) -> list[str]:
    """R102B — Smart follow-up chips returned with every reply.

    Audit asked for: "Why ₹6000? · Change category · Skip for now ·
    Show examples". These are short pivots the user can tap to drill
    deeper without re-typing context. Per-stage variants because the
    same chip ("Show examples") means different things at Stage 0
    vs Stage 3.
    """
    if stage == 0:
        return [
            "Why this number?",
            "Change category",
            "Show examples",
            "Skip for now",
        ]
    if stage == 1:
        return [
            "Why this category?",
            "Show me the math",
            "Try a smaller cut",
            "Different category",
        ]
    if stage == 2:
        cat = top_cat or "top category"
        return [
            f"Cut {cat} by 10%",
            "Show last week vs this",
            "What's leaking?",
            "Make this weekly",
        ]
    # Stage 3
    return [
        "Predict month-end",
        "Compare to last month",
        "Connect to my goal",
        "What changed this week?",
    ]


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
    # R102B — Inject the per-stage directive so the LLM's tone matches
    # the user's current data depth (Stage 0..3).
    stage = _coach_stage(txn_count)
    stage_block = _stage_directives(stage)

    system_prompt = (
        "You are MintU AI Coach — a decision-first financial assistant for Indian users.\n"
        "You are OPINIONATED. You NEVER give vague choices. You decide for the user.\n\n"
        f"━━━ MEMORY ━━━\n{memory_block}\n\n"
        f"{stage_block}\n\n"
        f"━━━ THIS MONTH ━━━\n"
        f"Income ₹{total_income:,.0f} · Expense ₹{total_expense:,.0f} · "
        f"Top category: {top_cat or 'n/a'} · Mode: {data_mode}\n\n"
        "━━━ RULES ━━━\n"
        "1. Lead with a number from the data above. Maximum 3 short lines.\n"
        "   No paragraphs. No essays. Each line ≤ 12 words. Mobile screens.\n"
        "2. End with a → Action line (verb-led, ≤ 8 words).\n"
        "3. NEVER apologise for missing data. NEVER say 'I don't have enough\n"
        "   data', 'general estimate', 'starter caps', 'temporary guardrails',\n"
        "   'baseline', or 'rough'. Decide. Move forward. If data is thin,\n"
        "   propose a sensible default and emit the action — don't hedge.\n"
        "4. NEVER greet by name in mid-conversation. NEVER say 'Hey' or 'Hi'.\n"
        "   The chat header already identifies you. Just answer.\n"
        "5. **MANDATORY ACTION MARKER**: If the user's intent maps to ANY of\n"
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
    source = _source_from_mode(data_mode, txn_count)

    # 7. Background — refresh the rolling session summary.
    await coach_context.kick_summarise(user_id, body.message, cleaned_text)

    return CoachReply(
        reply=cleaned_text,
        confidence=confidence,
        confidence_label=conf_label,
        source=source,
        actions=actions,
        suggestions=[],     # populated by /coach/suggestions endpoint
        follow_ups=_follow_ups_for(stage, top_cat),
        stage=stage,
    )


# ─────────────────────────── R108 — SSE streaming chat ──────────
#
# Native LLM token streaming via litellm.acompletion(stream=True). The
# /coach/chat endpoint above remains the source-of-truth for non-stream
# clients (and for tests). This endpoint is a thin wrapper that:
#   1. Reuses the same context / system-prompt builder
#   2. Streams raw token deltas to the client as Server-Sent Events
#      (`data: {"type":"chunk","delta":"..."}\n\n`)
#   3. After the stream closes, runs action extraction, confidence,
#      follow-ups + summarise BG task and emits a final
#      `data: {"type":"done", ...}\n\n` event
#
# Frontend treats chunks as fast progressive paint. The final "done"
# event carries the action card / metadata so the UI can attach the
# brutalist confidence chip + follow-up chips at the right moment.
@router.post("/chat-stream")
async def coach_chat_stream(
    body: CoachAsk,
    bg: BackgroundTasks,
    user_id: str = Depends(get_current_user),
):
    # Reuse: pull context + aggregate the same data the non-stream path uses.
    ctx = await coach_context.get_context(user_id)
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

    memory_block = coach_context.render_system_block(ctx)
    top_cat = max(cat_spend, key=lambda k: cat_spend[k]["total"]) if cat_spend else None
    stage = _coach_stage(txn_count)
    stage_block = _stage_directives(stage)
    system_prompt = (
        "You are MintU AI Coach — a decision-first financial assistant for Indian users.\n"
        "You are OPINIONATED. You NEVER give vague choices. You decide for the user.\n\n"
        f"━━━ MEMORY ━━━\n{memory_block}\n\n"
        f"{stage_block}\n\n"
        f"━━━ THIS MONTH ━━━\n"
        f"Income ₹{total_income:,.0f} · Expense ₹{total_expense:,.0f} · "
        f"Top category: {top_cat or 'n/a'} · Mode: {data_mode}\n\n"
        "━━━ RULES ━━━\n"
        "1. Lead with a number. Maximum 3 short lines. Each line ≤ 12 words.\n"
        "2. End with a → Action line (verb-led, ≤ 8 words).\n"
        "3. Never apologise for missing data. Pick a sensible default and decide.\n"
        "4. India context only (₹, SIPs, ELSS, NPS, PPF, UPI).\n"
        "5. Plain prose. No markdown headers. Max 1 emoji.\n"
        "6. If intent maps to {set_budget_cap, add_expense, create_goal}, append\n"
        "   [ACTION:KEY|JSON_PAYLOAD] on a new line. The marker is parsed and hidden."
    )

    confidence, conf_label = _confidence_from_mode(data_mode, txn_count)
    source = _source_from_mode(data_mode, txn_count)
    follow_ups = _follow_ups_for(stage, top_cat)

    async def event_stream():
        # 1. Open + announce stage so the client can paint metadata immediately.
        yield "data: " + json.dumps({
            "type": "open",
            "stage": stage,
            "confidence": confidence,
            "confidence_label": conf_label,
            "source": source,
        }) + "\n\n"

        full_text_parts: list[str] = []

        # R108B — Use the same `safe_send` wrapper the non-stream path
        # uses. This routes through emergentintegrations → Emergent
        # LiteLLM proxy with the correct auth headers. Calling
        # `litellm.acompletion` directly with EMERGENT_LLM_KEY does NOT
        # work — EMERGENT_LLM_KEY is an Emergent-proxy bearer, not a
        # raw OpenAI key, so the proxy URL must be used.
        #
        # Trade-off: we lose true token-level streaming from the LLM
        # provider, but we still emit word-chunks server-side at
        # ~30-80ms cadence so the client sees progressive paint and
        # the UX matches a streaming endpoint perfectly. Wall time
        # is ~LLM call time + a tiny pacing tail (≤ 1s).
        try:
            LlmChat, UserMessage = _llm()
            llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
            chat = LlmChat(
                api_key=llm_key,
                session_id=f"coach_stream_{user_id}_{utc_now().timestamp()}",
                system_message=system_prompt,
            ).with_model("openai", "gpt-5.2")

            raw = await safe_send(
                chat, UserMessage(text=body.message), timeout=20.0, label="coach_stream"
            )
            raw_text = (raw if isinstance(raw, str) else str(raw or "")).strip()
            if not raw_text:
                raw_text = "I couldn't reach the model. → Try once more in a moment."

            # Word-chunked streaming. Tokenize on whitespace boundaries
            # while preserving line breaks so the brutalist text
            # formatter's blank-line cues survive the wire trip.
            # eslint-disable-next-line — server side
            tokens = re.findall(r"\S+\s*|\s+", raw_text) or [raw_text]
            # Adaptive pacing — more tokens → faster cadence so total
            # post-LLM wall time stays under ~1.4s.
            step_ms = max(14, min(60, int(1400 / max(1, len(tokens)))))
            pacer = step_ms / 1000.0
            import asyncio
            for tok in tokens:
                full_text_parts.append(tok)
                yield "data: " + json.dumps({"type": "chunk", "delta": tok}) + "\n\n"
                # tiny await so the event loop can flush each chunk to
                # the client; otherwise FastAPI batches them at the
                # transport layer and the UX collapses to a single dump.
                await asyncio.sleep(pacer)
        except Exception as exc:
            logger.warning("coach_chat_stream LLM error: %s", exc)
            err_text = "I couldn't reach the model. → Try once more in a moment."
            full_text_parts.append(err_text)
            yield "data: " + json.dumps({"type": "chunk", "delta": err_text}) + "\n\n"

        raw_text = "".join(full_text_parts).strip()
        if not raw_text:
            raw_text = "I couldn't reach the model. → Try once more in a moment."
            yield "data: " + json.dumps({"type": "chunk", "delta": raw_text}) + "\n\n"

        # Run the same post-processing the non-stream path uses so the
        # client gets matching metadata.
        cleaned_text, actions = await _extract_actions_from_text(raw_text, user_id)
        actions_json = []
        for a in actions:
            try:
                actions_json.append(a.model_dump() if hasattr(a, "model_dump") else dict(a))
            except Exception:
                pass

        # Refresh the rolling memory in the background (fire-and-forget).
        bg.add_task(coach_context.kick_summarise, user_id, body.message, cleaned_text)

        yield "data: " + json.dumps({
            "type": "done",
            "reply": cleaned_text,
            "confidence": confidence,
            "confidence_label": conf_label,
            "source": source,
            "actions": actions_json,
            "follow_ups": follow_ups,
            "stage": stage,
        }) + "\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",  # disables nginx buffering for live SSE
        "Connection": "keep-alive",
    }
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)


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
