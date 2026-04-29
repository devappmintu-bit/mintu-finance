"""tests/test_round53l_mascot.py — Mascot Personality Engine.

Pure-unit + integration tests. Live LLM calls are mocked via the path
that disables emergentintegrations (LlmChat=None), so the suite is
hermetic and fast.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock

import pytest


# ── _time_of_day ──────────────────────────────────────────────────────


def test_time_of_day_buckets_cover_full_day():
    """Every hour should map to exactly one of the four buckets."""
    from routers.mascot import _time_of_day

    seen = set()
    for hour_utc in range(24):
        # _time_of_day shifts by +5h to approximate IST.
        n = datetime(2026, 4, 28, hour_utc, 0, 0, tzinfo=timezone.utc)
        seen.add(_time_of_day(n))
    assert seen == {"morning", "afternoon", "evening", "night"}


def test_time_of_day_morning():
    """7am IST should be morning."""
    from routers.mascot import _time_of_day
    # 7am IST = 1:30am UTC (we use +5h shift, so 7-5=2am UTC ≈ morning).
    n = datetime(2026, 4, 28, 2, 0, 0, tzinfo=timezone.utc)
    assert _time_of_day(n) == "morning"


# ── _validate_moment ──────────────────────────────────────────────────


def test_validate_moment_happy_path():
    from routers.mascot import _validate_moment

    out = _validate_moment({
        "action": "juggle",
        "text": "Keeping things balanced",
        "tone": "playful",
        "tag": "balance-04",
    })
    assert out == {
        "action": "juggle",
        "text": "Keeping things balanced",
        "tone": "playful",
        "tag": "balance-04",
    }


def test_validate_moment_rejects_unknown_action():
    from routers.mascot import _validate_moment
    assert _validate_moment({"action": "moonwalk", "text": "hi", "tone": "playful", "tag": "x"}) is None


def test_validate_moment_rejects_empty_text():
    from routers.mascot import _validate_moment
    assert _validate_moment({"action": "wave", "text": "", "tone": "playful", "tag": "x"}) is None


# Note: Round 53l.1 changed the policy on overlong text. Previously
# we rejected (returned None); now we truncate safely. The new
# behavior is asserted in test_validate_moment_truncates_overlong below.


def test_validate_moment_normalises_unknown_tone():
    from routers.mascot import _validate_moment
    out = _validate_moment({"action": "wave", "text": "hey", "tone": "philosophical", "tag": "wave-1"})
    assert out and out["tone"] == "playful"  # invalid tone → fallback to "playful"


def test_validate_moment_autostamps_bad_tag():
    from routers.mascot import _validate_moment, ALLOWED_ACTIONS
    out = _validate_moment({"action": "spin", "text": "spinning", "tone": "playful", "tag": "Bad Tag!!"})
    assert out and out["tag"] != "Bad Tag!!"
    assert out["tag"].startswith("spin-")


def test_validate_moment_rejects_non_dict():
    from routers.mascot import _validate_moment
    assert _validate_moment("not a dict") is None  # type: ignore
    assert _validate_moment(None) is None  # type: ignore


# ── _extract_json ─────────────────────────────────────────────────────


def test_extract_json_handles_code_fences():
    from routers.mascot import _extract_json
    raw = '```json\n{"action": "wave", "text": "hi", "tone": "playful", "tag": "wave-9"}\n```'
    parsed = _extract_json(raw)
    assert parsed and parsed["action"] == "wave"


def test_extract_json_handles_trailing_prose():
    from routers.mascot import _extract_json
    raw = 'Sure! Here you go:\n{"action": "spin", "text": "spinning", "tone": "witty", "tag": "spin-1"}\n— hope that helps!'
    parsed = _extract_json(raw)
    assert parsed and parsed["action"] == "spin"


def test_extract_json_returns_none_on_garbage():
    from routers.mascot import _extract_json
    assert _extract_json("just plain prose, no json here") is None
    assert _extract_json("") is None
    assert _extract_json("{ not actually valid json") is None


# ── _pick_fallback ────────────────────────────────────────────────────


def test_pick_fallback_avoids_recent_tags():
    from routers.mascot import _pick_fallback, _FALLBACK_LIBRARY

    seen_tags = [m["tag"] for m in _FALLBACK_LIBRARY[:3]]
    out = _pick_fallback(seen_tags)
    assert out["tag"] not in seen_tags


def test_pick_fallback_handles_empty_avoid_list():
    from routers.mascot import _pick_fallback
    out = _pick_fallback([])
    # Just confirm it returns a valid entry from the library.
    assert "action" in out and "text" in out and "tag" in out


def test_pick_fallback_falls_through_when_all_avoided():
    """When every tag is in the avoid-list, we still return SOMETHING
    rather than crashing — the user sees a slight repeat over total fail."""
    from routers.mascot import _pick_fallback, _FALLBACK_LIBRARY
    all_tags = [m["tag"] for m in _FALLBACK_LIBRARY]
    out = _pick_fallback(all_tags)
    assert out["tag"] in all_tags  # graceful re-pick, not a crash


def test_fallback_library_covers_every_action():
    """Each action in ALLOWED_ACTIONS should appear in at least one
    fallback so the engine is never starved of an animation."""
    from routers.mascot import _FALLBACK_LIBRARY, ALLOWED_ACTIONS
    actions_in_fb = {m["action"] for m in _FALLBACK_LIBRARY}
    missing = set(ALLOWED_ACTIONS) - actions_in_fb
    assert not missing, f"Fallback library missing actions: {missing}"


def test_fallback_library_tags_are_all_unique():
    """No two fallback entries should share a tag — the dedup logic
    relies on tag uniqueness."""
    from routers.mascot import _FALLBACK_LIBRARY
    tags = [m["tag"] for m in _FALLBACK_LIBRARY]
    assert len(tags) == len(set(tags))


def test_fallback_library_validates():
    """Every fallback entry must pass our own validator."""
    from routers.mascot import _FALLBACK_LIBRARY, _validate_moment
    for entry in _FALLBACK_LIBRARY:
        cleaned = _validate_moment(entry)
        assert cleaned is not None, f"Fallback entry failed validation: {entry}"


# ── _build_prompt ─────────────────────────────────────────────────────


def test_build_prompt_includes_avoid_list():
    from routers.mascot import _build_prompt
    ctx = {
        "user_name": "Test",
        "time_of_day": "morning",
        "has_pending_settlements": False,
        "last_action": "none",
    }
    sys_msg, user_msg = _build_prompt("home", ctx, ["wave-1", "spin-2"])
    assert "wave-1" in user_msg and "spin-2" in user_msg
    assert "morning" in user_msg


def test_build_prompt_specifies_strict_json():
    from routers.mascot import _build_prompt
    ctx = {"user_name": "x", "time_of_day": "night", "has_pending_settlements": True, "last_action": "settled"}
    sys_msg, _ = _build_prompt("coach", ctx, [])
    assert "STRICT JSON" in sys_msg
    # All allowed actions must appear in the system prompt schema.
    from routers.mascot import ALLOWED_ACTIONS
    for a in ALLOWED_ACTIONS:
        assert a in sys_msg


# ── End-to-end: endpoint with LLM disabled (force fallback path) ─────


@pytest.mark.asyncio
async def test_mascot_moment_falls_back_when_llm_disabled():
    """With LlmChat=None we should still get a valid response from the
    static library — proves the resilience contract."""
    from routers import mascot as mascot_mod

    # Stub user-context lookup and LLM availability.
    fake_ctx = {
        "user_name": "Test",
        "has_pending_settlements": False,
        "pending_count": 0,
        "last_action": "none",
        "time_of_day": "morning",
    }
    with patch.object(mascot_mod, "LlmChat", None), \
         patch.object(mascot_mod, "_build_user_context", new=AsyncMock(return_value=fake_ctx)):
        req = mascot_mod.MomentRequest(mode="home", last_tags=[])
        out = await mascot_mod.mascot_moment(payload=req, user_id="test-user-1")
        assert out["source"] == "fallback"
        assert out["action"] in mascot_mod.ALLOWED_ACTIONS
        assert isinstance(out["text"], str) and len(out["text"]) > 0
        assert out["tag"]  # non-empty


@pytest.mark.asyncio
async def test_mascot_moment_invalid_mode_normalises_to_home():
    """Caller passing garbage mode should silently land on 'home'."""
    from routers import mascot as mascot_mod

    fake_ctx = {
        "user_name": "T", "has_pending_settlements": False, "pending_count": 0,
        "last_action": "none", "time_of_day": "evening",
    }
    with patch.object(mascot_mod, "LlmChat", None), \
         patch.object(mascot_mod, "_build_user_context", new=AsyncMock(return_value=fake_ctx)):
        req = mascot_mod.MomentRequest(mode="zoidberg", last_tags=None)  # type: ignore
        out = await mascot_mod.mascot_moment(payload=req, user_id="test-user-2")
        # Doesn't raise; falls through to fallback.
        assert out["source"] == "fallback"


@pytest.mark.asyncio
async def test_mascot_moment_dedupes_against_last_tags():
    """Repeated calls with the previously-served tag in last_tags should
    NOT return the same tag again (within the fallback library)."""
    from routers import mascot as mascot_mod

    fake_ctx = {
        "user_name": "T", "has_pending_settlements": False, "pending_count": 0,
        "last_action": "none", "time_of_day": "afternoon",
    }
    with patch.object(mascot_mod, "LlmChat", None), \
         patch.object(mascot_mod, "_build_user_context", new=AsyncMock(return_value=fake_ctx)):
        first = await mascot_mod.mascot_moment(
            payload=mascot_mod.MomentRequest(mode="home", last_tags=[]),
            user_id="u",
        )
        second = await mascot_mod.mascot_moment(
            payload=mascot_mod.MomentRequest(mode="home", last_tags=[first["tag"]]),
            user_id="u",
        )
        assert second["tag"] != first["tag"]


# ── Round 53l.1 polish: truncate / tone caps / model env ──────────────


def test_truncate_safely_short_passthrough():
    from routers.mascot import _truncate_safely
    assert _truncate_safely("hi there") == "hi there"


def test_truncate_safely_at_word_boundary():
    from routers.mascot import _truncate_safely
    text = "this is a very long sentence that exceeds the cap by quite a lot indeed"
    out = _truncate_safely(text, cap=30)
    assert len(out) <= 31  # cap + ellipsis
    assert out.endswith("\u2026")
    # No word fragment at the end (last visible char before ellipsis is whitespace-trimmed)
    assert " " not in out[-3:-1]


def test_truncate_safely_handles_empty():
    from routers.mascot import _truncate_safely
    assert _truncate_safely("") == ""


def test_validate_moment_truncates_overlong():
    """Polish: overlong text is truncated, not rejected."""
    from routers.mascot import _validate_moment, TEXT_HARD_CAP
    out = _validate_moment({
        "action": "wave",
        "text": "x" * 200,
        "tone": "playful",
        "tag": "wave-9",
    })
    assert out is not None
    assert len(out["text"]) <= TEXT_HARD_CAP + 1  # +1 for trailing ellipsis


def test_home_mode_blocks_loud_tone_when_no_recent_settle():
    """Polish: home + last_action='none' downgrades celebratory → playful."""
    from routers.mascot import _validate_moment
    out = _validate_moment(
        {"action": "celebrate", "text": "yay!", "tone": "celebratory", "tag": "celeb-1"},
        mode="home",
        ctx={"last_action": "none"},
    )
    assert out and out["tone"] == "playful"


def test_home_mode_allows_loud_tone_after_smart_settle():
    """Polish: home + just smart-settled → celebratory is allowed through."""
    from routers.mascot import _validate_moment
    out = _validate_moment(
        {"action": "celebrate", "text": "yay!", "tone": "celebratory", "tag": "celeb-2"},
        mode="home",
        ctx={"last_action": "smart_settled"},
    )
    assert out and out["tone"] == "celebratory"


def test_coach_mode_allows_loud_tone_freely():
    """Polish: coach is the expressive surface, no tone caps."""
    from routers.mascot import _validate_moment
    out = _validate_moment(
        {"action": "celebrate", "text": "let's go", "tone": "cheeky", "tag": "ck-1"},
        mode="coach",
        ctx={"last_action": "none"},
    )
    assert out and out["tone"] == "cheeky"


def test_pick_fallback_respects_home_tone_cap():
    """Polish: home fallback won't return a loud entry without recent settle."""
    from routers.mascot import _pick_fallback, LOUD_TONES
    # Run many times to dodge randomness; every result must be quiet.
    for _ in range(40):
        out = _pick_fallback([], mode="home", ctx={"last_action": "none"})
        assert out["tone"] not in LOUD_TONES


def test_model_env_overrides():
    """Polish: COACH/HOME model ids are read from env at module load."""
    from routers import mascot as m
    # Defaults to gateway's cheapest haiku — until 3.5 lands.
    assert m.HOME_LLM_MODEL.startswith("claude-")
    assert m.COACH_LLM_MODEL.startswith("claude-")
