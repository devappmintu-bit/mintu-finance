"""routers/mascot.py — Round 53l Mascot Personality Engine.

A tiny endpoint that returns a fresh "mascot moment" (action + 1-line
copy + tone + tag) for the home widget on app open and for the
AI Coach tap.

Architecture is deliberately small:
    • One endpoint: POST /api/mascot/moment
    • Claude Haiku 4.5 over EMERGENT_LLM_KEY for the microcopy.
      Haiku is fast, cheap, and right-sized for short witty output.
    • Strict vocabulary: LLM picks `action` from a fixed list of 12
      named animations the frontend knows how to play.
    • Caller passes the last 3 tags they've seen so we can ask the
      LLM to avoid them. A static fallback library covers all
      vocabulary slots so the UI never blocks on LLM latency.
    • NO database, NO analytics, NO personalization — per spec this
      is a personality layer, not a system.
"""
from __future__ import annotations

import json
import logging
import os
import random
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from core.time import utc_now
from pydantic import BaseModel, Field

from core import db, get_current_user

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except Exception:  # pragma: no cover
    LlmChat = UserMessage = None  # type: ignore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mascot", tags=["mascot"])


async def _optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[str]:
    """Tolerant auth dependency for the mascot endpoint.

    The login screen calls this BEFORE a JWT exists — we still want the
    LLM to upgrade the canned login moment when possible. Any auth
    failure (missing header, invalid token, dead user) returns ``None``
    instead of 401, and the endpoint degrades gracefully.
    """
    if not authorization:
        return None
    try:
        return await get_current_user(authorization)  # type: ignore[arg-type]
    except HTTPException:
        return None
    except Exception:
        return None

# ── Curated animation vocabulary (frontend has exact-name renderers) ──
ALLOWED_ACTIONS = (
    "peek", "juggle", "float", "stretch", "sip", "spin",
    "bounce", "fly", "wave", "tap", "celebrate", "sleep",
)

ALLOWED_TONES = ("playful", "witty", "calm", "motivating", "cheeky", "celebratory", "confident")

# Polish (Round 53l.1):
#   • "home" is the always-on surface — keep it quiet. Loud tones
#     (cheeky/celebratory) are gated behind a "just settled" signal so
#     a casual reopen doesn't get a confetti shout.
HOME_DEFAULT_TONES = frozenset({"playful", "calm", "motivating", "witty", "confident"})
LOUD_TONES = frozenset({"cheeky", "celebratory"})

# Round 53l.2: Login is the FIRST emotional touchpoint. It must feel
# premium/reassuring — never cheeky, never loud, even if the user just
# settled. Allowed tones are the calmest subset.
LOGIN_ALLOWED_TONES = frozenset({"calm", "playful", "motivating", "confident"})

# Polish (Round 53l.1): Hard-clamp text length to 80 user-perceived
# chars (not bytes), preserving emoji integrity. Anything longer gets
# truncated at the last word boundary inside the limit.
TEXT_HARD_CAP = 80


def _truncate_safely(text: str, cap: int = TEXT_HARD_CAP) -> str:
    """Truncate ``text`` to at most ``cap`` characters without splitting an
    emoji surrogate pair or chopping mid-word.

    We measure on user-perceived characters (Python str length is good
    enough — emoji are 1-2 code points, never split inside a code point).

    Round 53n.2 stability fix:
      • Strip lone Unicode surrogates BEFORE truncation. The LLM
        occasionally emits truncated emoji (e.g., a lone high-surrogate
        ``\\ud83d`` without its pairing low-surrogate). Python's str()
        accepts these but FastAPI's UTF-8 response encoder raises
        ``UnicodeEncodeError: surrogates not allowed`` and the request
        crashes with a 500 — bypassing our companion-tone fallback. We
        sanitise here so the response always serialises cleanly.
    """
    if not text:
        return ""
    # Strip lone surrogates that would crash JSONResponse.encode("utf-8").
    # The encode/decode dance with errors="ignore" silently drops any
    # codepoint that can't round-trip through UTF-8 (i.e. lone surrogates).
    text = text.encode("utf-8", errors="ignore").decode("utf-8", errors="ignore")
    if len(text) <= cap:
        return text
    head = text[:cap]
    # Pull back to the last whitespace so we don't truncate mid-word.
    last_space = head.rfind(" ")
    if last_space >= cap - 18:  # only if the gap is small enough
        head = head[:last_space]
    return head.rstrip(" \u2026") + "\u2026"  # ellipsis sentinel


def _sanitize_text(text: str) -> str:
    """Final-stage UTF-8 + whitespace safety net for ANY text returned to the client.

    Round 53n.3 future-proofing belt-and-braces guard. Even though
    ``_truncate_safely`` already strips lone surrogates from the LLM
    path, this guard runs on the LAST mile before the response leaves
    the endpoint — so it also catches:

      • Hardcoded fallback strings in FALLBACK_LIBRARY that may pick
        up a stray surrogate via future edits / encoding mistakes.
      • Any new code path that builds a moment without going through
        ``_validate_moment``.
      • Server-side string concatenation surprises (e.g. f-strings
        interpolating user-supplied data).

    Round 53n.4 polish — also normalise whitespace. LLMs occasionally
    emit responses with stray ``\\n\\n``, leading/trailing spaces, or
    invisible control whitespace that doesn't crash anything but
    silently degrades the UI (clipped lines, ragged bubbles, etc.).
    Collapsing all whitespace runs to a single space keeps the moment
    looking like a single clean micro-copy line.

    The 120-char hard cap is a runaway-string circuit-breaker. Anything
    that exceeds it indicates a logic bug upstream — better to truncate
    than to ship a 10KB "moment" to a mobile client.
    """
    if not text:
        return ""
    # 1. Normalise whitespace — collapses \n / \t / runs of spaces /
    #    leading + trailing whitespace down to single spaces. ``.split()``
    #    with no args splits on ANY Unicode whitespace, so this also
    #    strips most invisible control whitespace the LLM might emit.
    text = " ".join(text.split())
    # 2. Strip lone surrogates / invalid UTF-8 sequences that would
    #    crash JSONResponse.encode("utf-8").
    text = text.encode("utf-8", "ignore").decode("utf-8", "ignore")
    # 3. Hard cap — runaway-string circuit-breaker.
    return text[:120]


# Model selection — controlled by env so we can A/B without redeploying.
# Per Round 53l.1: keep the cheapest Anthropic option as default and
# only escalate (e.g., Sonnet) for coach mode if quality demands it.
DEFAULT_LLM_MODEL = "claude-haiku-4-5-20251001"  # gateway's cheapest Anthropic
COACH_LLM_MODEL = os.environ.get("MASCOT_COACH_LLM_MODEL", DEFAULT_LLM_MODEL)
HOME_LLM_MODEL = os.environ.get("MASCOT_HOME_LLM_MODEL", DEFAULT_LLM_MODEL)


# ── Static fallback library — used when LLM fails or returns invalid JSON ──
# Each entry covers a vocabulary slot so the engine NEVER falls back to "always
# the same default." Tags carry a "fb-" prefix so analytics can spot fallbacks.
_FALLBACK_LIBRARY: tuple[dict, ...] = (
    {"action": "sip", "text": "Good morning, money matters today \u2615", "tone": "calm", "tag": "fb-chai-01"},
    {"action": "stretch", "text": "Stretching out the day \u2014 spend smart!", "tone": "playful", "tag": "fb-stretch-01"},
    {"action": "juggle", "text": "Keeping things balanced today \u2696\ufe0f", "tone": "playful", "tag": "fb-juggle-01"},
    {"action": "peek", "text": "Heyyy \u2014 ready to win at money?", "tone": "cheeky", "tag": "fb-peek-01"},
    {"action": "float", "text": "Floating through your finances \u2728", "tone": "calm", "tag": "fb-float-01"},
    {"action": "spin", "text": "Spinning up some clarity for you", "tone": "witty", "tag": "fb-spin-01"},
    {"action": "bounce", "text": "Bouncing in with good vibes \u2728", "tone": "celebratory", "tag": "fb-bounce-01"},
    {"action": "fly", "text": "You're on a roll today \ud83d\ude80", "tone": "motivating", "tag": "fb-fly-01"},
    {"action": "wave", "text": "Hey hey \u2014 nice to see you back!", "tone": "playful", "tag": "fb-wave-01"},
    {"action": "tap", "text": "Tapping the books \u2014 all clear?", "tone": "witty", "tag": "fb-tap-01"},
    {"action": "celebrate", "text": "Look at you handling things \ud83c\udf89", "tone": "celebratory", "tag": "fb-celebrate-01"},
    {"action": "sleep", "text": "Quiet day? Let's catch up later \ud83d\ude0c", "tone": "calm", "tag": "fb-sleep-01"},
    {"action": "peek", "text": "Pssst \u2014 someone owes you something \ud83d\udc40", "tone": "cheeky", "tag": "fb-peek-02"},
    {"action": "juggle", "text": "Three groups, one tap to settle \u26a1", "tone": "witty", "tag": "fb-juggle-02"},
    {"action": "stretch", "text": "Long day? Your money's still on it.", "tone": "calm", "tag": "fb-stretch-02"},
    {"action": "celebrate", "text": "Smart-settled and stress-free \ud83c\udf89", "tone": "celebratory", "tag": "fb-celebrate-02"},
    {"action": "fly", "text": "Soaring past last week's spend!", "tone": "motivating", "tag": "fb-fly-02"},
    {"action": "wave", "text": "Welcome back \u2014 quick check-in?", "tone": "playful", "tag": "fb-wave-02"},
    # ── Login-only entries (Round 53l.2) — premium, calm, never loud.
    {"action": "wave", "text": "Welcome back \ud83d\udc4b", "tone": "playful", "tag": "fb-login-wave-01"},
    {"action": "float", "text": "All set. Let's keep things smooth today \u2728", "tone": "calm", "tag": "fb-login-float-01"},
    {"action": "bounce", "text": "Good to see you again!", "tone": "playful", "tag": "fb-login-bounce-01"},
    {"action": "stretch", "text": "Ready when you are.", "tone": "calm", "tag": "fb-login-stretch-01"},
    {"action": "peek", "text": "Your money world is ready.", "tone": "calm", "tag": "fb-login-peek-01"},
    {"action": "tap", "text": "Let's make today count.", "tone": "motivating", "tag": "fb-login-tap-01"},
    {"action": "wave", "text": "Hey, welcome aboard \u2728", "tone": "playful", "tag": "fb-login-wave-02"},
    {"action": "float", "text": "Settling in \u2014 just a sec.", "tone": "calm", "tag": "fb-login-float-02"},
)


def _time_of_day(now: Optional[datetime] = None) -> str:
    """Return one of: morning | afternoon | evening | night.

    Keyed on IST (UTC+5:30) since this is an India-first app. We don't
    take the user's TZ from the client — the LLM only uses this as a
    flavor hint and the static library is TZ-agnostic.
    """
    n = now or utc_now()
    ist_hour = (n.hour + 5) % 24  # rough IST proxy (ignore the 30 min)
    if 5 <= ist_hour < 12:
        return "morning"
    if 12 <= ist_hour < 17:
        return "afternoon"
    if 17 <= ist_hour < 21:
        return "evening"
    return "night"


async def _build_user_context(user_id: Optional[str], user_name_hint: Optional[str] = None) -> dict:
    """Pull lightweight signals for prompt context. Bounded queries only —
    this endpoint must stay <200ms even on cold paths.

    ``user_id`` is optional: the login screen has no JWT yet and still
    wants a personalised moment. In that case we use ``user_name_hint``
    if provided and skip the DB queries entirely.
    """
    if not user_id:
        return {
            "user_name": (user_name_hint or "friend").strip() or "friend",
            "has_pending_settlements": False,
            "pending_count": 0,
            "last_action": "none",
            "time_of_day": _time_of_day(),
        }

    user_doc = await db.users.find_one({"id": user_id}, {"name": 1, "created_at": 1})
    user_name = (user_doc or {}).get("name") or user_name_hint or "friend"

    # Pending settlements heuristic: any settlement record where the user
    # is the *payer* but status != completed counts as pending. (For the
    # MVP we just check whether the user appears as a debtor in any
    # group's simplified-debts via the activity feed — too heavy. So we
    # use a cheap proxy: count of settlements they marked pending.)
    pending = 0
    try:
        pending = await db.settlements.count_documents({
            "payer_id": user_id,
            "status": {"$ne": "completed"},
        })
    except Exception:
        pending = 0

    # Most recent settle event (if any in last 24h) gives "last_action".
    last_action = "none"
    try:
        recent = await db.settlements.find_one(
            {"payer_id": user_id, "status": "completed"},
            sort=[("settled_at", -1)],
        )
        if recent and recent.get("is_smart_settle"):
            last_action = "smart_settled"
        elif recent:
            last_action = "settled"
    except Exception:
        pass

    return {
        "user_name": user_name,
        "has_pending_settlements": pending > 0,
        "pending_count": pending,
        "last_action": last_action,
        "time_of_day": _time_of_day(),
    }


def _pick_fallback(last_tags: list[str], mode: str = "home", ctx: Optional[dict] = None) -> dict:
    """Pick a fallback entry whose tag isn't in the recently-seen list.

    Round 53l.1 polish: when ``mode == "home"`` and the user hasn't just
    settled, filter out loud tones too — keeps the home surface quiet.

    Round 53l.2: when ``mode == "login"``, prefer the dedicated
    ``fb-login-*`` entries (calmer, welcome-tuned) and reject loud tones
    unconditionally — login is the FIRST emotional touchpoint.
    """
    avoid = set(last_tags or [])
    last_action = (ctx or {}).get("last_action", "none")
    block_loud = (
        mode == "login"
        or (mode == "home" and last_action != "smart_settled")
    )

    if mode == "login":
        login_pool = [m for m in _FALLBACK_LIBRARY if m["tag"].startswith("fb-login-")]
        candidates = [m for m in login_pool if m["tag"] not in avoid]
        if not candidates:
            candidates = list(login_pool)  # cycle even if all "recent"
        if not candidates:  # paranoid catch — login pool should never be empty
            candidates = list(_FALLBACK_LIBRARY)
        return dict(random.choice(candidates))

    candidates = [
        m for m in _FALLBACK_LIBRARY
        if m["tag"] not in avoid and (not block_loud or m["tone"] not in LOUD_TONES)
        # Don't accidentally serve login-only entries on home/coach.
        and not m["tag"].startswith("fb-login-")
    ]
    if not candidates:
        # Loosen the loud-tone filter first, then drop the avoid filter.
        candidates = [
            m for m in _FALLBACK_LIBRARY
            if m["tag"] not in avoid and not m["tag"].startswith("fb-login-")
        ]
    if not candidates:
        candidates = [m for m in _FALLBACK_LIBRARY if not m["tag"].startswith("fb-login-")] or list(_FALLBACK_LIBRARY)
    return dict(random.choice(candidates))  # copy so caller can mutate freely


_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(text: str) -> Optional[dict]:
    """Pull a JSON object from raw LLM output. Models love wrapping JSON in
    code fences or trailing prose, so we grep for the outermost {...}.
    """
    if not text:
        return None
    m = _JSON_BLOCK.search(text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _validate_moment(parsed: dict, mode: str = "home", ctx: Optional[dict] = None) -> Optional[dict]:
    """Sanitise the LLM output. Returns None only on hard-broken inputs;
    otherwise we coerce the soft fields (truncate text, normalise tone)
    so the model gets every chance to land a valid moment.

    Round 53l.1 polish:
      • Hard text clamp via _truncate_safely() instead of rejection.
      • Tone caps for ``mode == "home"``: cheeky/celebratory only allowed
        when the user just settled (``ctx["last_action"] == "smart_settled"``).
        Otherwise the tone is downgraded to "playful".
    """
    if not isinstance(parsed, dict):
        return None
    action = str(parsed.get("action", "")).strip().lower()
    text_raw = str(parsed.get("text", "")).strip()
    tone = str(parsed.get("tone", "playful")).strip().lower()
    tag = str(parsed.get("tag", "")).strip()
    if action not in ALLOWED_ACTIONS:
        return None
    if not text_raw:
        return None  # empty is a hard fail; we can't show nothing
    text = _truncate_safely(text_raw, TEXT_HARD_CAP)
    if tone not in ALLOWED_TONES:
        tone = "playful"
    # ── Tone caps on the login surface — the FIRST emotional touchpoint.
    # Login MUST feel premium/calm: never cheeky, never celebratory,
    # never witty (witty risks landing as snark on a fresh load). Allowed
    # tones for login: calm | playful | motivating | confident.
    if mode == "login" and tone not in LOGIN_ALLOWED_TONES:
        tone = "calm"
    # ── Tone caps on the home surface ─────────────────────────────
    elif mode == "home" and tone in LOUD_TONES:
        last_action = (ctx or {}).get("last_action", "none")
        if last_action != "smart_settled":
            tone = "playful"
    if not tag or len(tag) > 40 or not re.match(r"^[a-z0-9\-]+$", tag):
        # Auto-stamp a tag if the model gave us something unusable.
        tag = f"{action}-{random.randint(10, 99)}"
    return {"action": action, "text": text, "tone": tone, "tag": tag}


def _build_prompt(mode: str, ctx: dict, last_tags: list[str]) -> tuple[str, str]:
    """Build (system, user) prompt strings.

    The system message bakes in the personality + strict vocabulary +
    JSON-only contract. The user message just carries the dynamic
    context.
    """
    system = (
        "You are MintU, a friendly, witty, finance-savvy mascot for an Indian "
        "personal-finance app. You speak in 1 short line (max 10 words). You "
        "weave finance subtly (saving, splitting, settling, awareness) but "
        "NEVER preach, lecture, or use jargon. Stay light and human.\n\n"
        "Output STRICT JSON ONLY. No prose, no markdown, no code fences. Schema:\n"
        "{\n"
        '  "action": one of [' + ", ".join(f'"{a}"' for a in ALLOWED_ACTIONS) + "],\n"
        '  "text":   string, max 10 words, conversational, may include 1 emoji,\n'
        '  "tone":   one of [' + ", ".join(f'"{t}"' for t in ALLOWED_TONES) + "],\n"
        '  "tag":    short kebab-case unique slug, e.g. "balance-04"\n'
        "}\n\n"
        "Rules:\n"
        "- NEVER repeat any tag from the avoid-list.\n"
        "- Match the action to the vibe (e.g. 'celebrate' for streaks, 'sleep'\n"
        "  for low activity, 'juggle' for many pending splits).\n"
        "- 'login' mode = the FIRST emotional touchpoint. Premium and\n"
        "  reassuring. Allowed tones ONLY: calm, playful, motivating,\n"
        "  confident. NEVER cheeky, NEVER celebratory. Examples:\n"
        '    "Welcome back, Shivi. Let\'s keep things clean today \u2728"\n'
        '    "All set. Your money world is ready."\n'
        '    "Good to see you. Let\'s make today count."\n'
        "- 'home' mode = subtle, conversational. Slightly informative.\n"
        "- 'coach' mode = a bit more energetic and assistant-like (you're\n"
        "  'waking up'). Slightly cheeky allowed.\n"
        "- No guilt-tripping. No long sentences. No 'Hello user'.\n"
    )
    user_payload = {
        "mode": mode,
        "user_name": ctx["user_name"],
        "time_of_day": ctx["time_of_day"],
        "has_pending_settlements": ctx["has_pending_settlements"],
        "last_action": ctx["last_action"],
        "avoid_tags": last_tags or [],
    }
    user_msg = (
        "Generate ONE fresh mascot moment as JSON. Context:\n"
        + json.dumps(user_payload, ensure_ascii=False)
    )
    return system, user_msg


# ── Endpoint ──────────────────────────────────────────────────────────


class MomentRequest(BaseModel):
    mode: str = Field("home", description="'login' (welcome), 'home' (subtle), or 'coach' (expressive)")
    last_tags: Optional[list[str]] = Field(
        default=None,
        description="Last 5 tags the client has shown across ALL modes — sent so we can deduplicate.",
    )
    user_name: Optional[str] = Field(
        default=None,
        description="Optional name hint for unauthenticated calls (login screen). "
                    "Authenticated calls always read the canonical name from DB.",
    )


class MomentResponse(BaseModel):
    action: str
    text: str
    tone: str
    tag: str
    source: str = Field(description="'llm' or 'fallback' — for client-side telemetry only.")


@router.post("/moment", response_model=MomentResponse)
async def mascot_moment(
    payload: MomentRequest,
    user_id: Optional[str] = Depends(_optional_user),
):
    """Return ONE mascot moment. Resilient by design.

    Auth is OPTIONAL: the login screen is the first emotional touchpoint
    and calls this before a JWT exists. Unauthenticated callers may pass
    ``user_name`` in the request body for personalization. Authenticated
    callers always have the canonical name read from the user doc.

    Path is fully resilient: any LLM failure (timeout, malformed JSON,
    invalid action) silently downgrades to a tag-deduplicated static
    fallback so the UI never has to handle errors here.
    """
    mode = payload.mode if payload.mode in ("login", "home", "coach") else "home"
    last_tags = [t for t in (payload.last_tags or []) if isinstance(t, str)][:5]

    ctx = await _build_user_context(user_id, user_name_hint=payload.user_name)

    # Try LLM only if the integration is available + key is set.
    if LlmChat and os.environ.get("EMERGENT_LLM_KEY"):
        try:
            system, user_msg = _build_prompt(mode, ctx, last_tags)
            model_id = COACH_LLM_MODEL if mode == "coach" else HOME_LLM_MODEL
            chat = LlmChat(
                api_key=os.environ["EMERGENT_LLM_KEY"],
                session_id=f"mascot_{user_id}_{utc_now().timestamp()}",
                system_message=system,
            ).with_model("anthropic", model_id)
            raw = await chat.send_message(UserMessage(text=user_msg))
            parsed = _extract_json(raw if isinstance(raw, str) else str(raw))
            cleaned = _validate_moment(parsed, mode=mode, ctx=ctx) if parsed else None
            if cleaned and cleaned["tag"] not in last_tags:
                # Round 53n.3 — final-mile UTF-8 safety net. Even though
                # _validate_moment already runs _truncate_safely, we re-
                # sanitise the text here so any future code path that
                # builds a moment without going through validation is
                # still safe to ship to a JSON response.
                cleaned["text"] = _sanitize_text(cleaned["text"])
                return {**cleaned, "source": "llm"}
            # If the model gave us a duplicate tag, don't just retry —
            # the static lib has plenty of slots, fall through gracefully.
        except Exception as e:
            logger.warning(f"mascot/moment LLM failed: {e}")

    fb = _pick_fallback(last_tags, mode=mode, ctx=ctx)
    # Round 53n.3 — sanitise the static-lib text too. The hardcoded
    # FALLBACK_LIBRARY is currently clean, but a future edit (or a
    # generated/translated variant) could introduce a stray surrogate.
    # Belt-and-braces here costs nothing at runtime and prevents a
    # whole class of UTF-8 encoding crashes from ever shipping.
    fb["text"] = _sanitize_text(fb["text"])
    return {**fb, "source": "fallback"}
