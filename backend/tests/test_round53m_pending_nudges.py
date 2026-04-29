"""tests/test_round53m_pending_nudges.py — Personality-driven self-reminders."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest


def test_strength_from_ignores_soft_zero_one():
    from routers.pending_nudges import _strength_from_ignores
    assert _strength_from_ignores(0) == "soft"
    assert _strength_from_ignores(1) == "soft"


def test_strength_from_ignores_medium_two():
    from routers.pending_nudges import _strength_from_ignores
    assert _strength_from_ignores(2) == "medium"


def test_strength_from_ignores_strong_three_plus():
    from routers.pending_nudges import _strength_from_ignores
    assert _strength_from_ignores(3) == "strong"
    assert _strength_from_ignores(7) == "strong"


def test_ensure_aware_adds_utc_to_naive():
    from routers.pending_nudges import _ensure_aware
    naive = datetime(2026, 1, 1, 12, 0, 0)
    aware = _ensure_aware(naive)
    assert aware is not None
    assert aware.tzinfo is not None
    assert aware.tzinfo == timezone.utc


def test_ensure_aware_passes_through_aware():
    from routers.pending_nudges import _ensure_aware
    aware_in = datetime(2026, 1, 1, tzinfo=timezone.utc)
    out = _ensure_aware(aware_in)
    assert out is aware_in or out == aware_in


def test_ensure_aware_handles_none():
    from routers.pending_nudges import _ensure_aware
    assert _ensure_aware(None) is None


def test_serialise_emits_strength_and_amount_rupees():
    from routers.pending_nudges import _serialise
    from bson import ObjectId
    doc = {
        "_id": ObjectId(),
        "user_id": "u1",
        "group_id": "g1",
        "amount_paise": 12345,
        "ignore_count": 2,
        "last_nudged_at": None,
        "suppress_until": None,
        "status": "active",
    }
    out = _serialise(doc, group_name="Goa")
    assert out["amount_paise"] == 12345
    assert out["amount"] == 123.45
    assert out["strength"] == "medium"
    assert out["group_name"] == "Goa"
    assert out["ignore_count"] == 2
    assert out["status"] == "active"
    assert isinstance(out["id"], str)


def test_serialise_handles_missing_fields_gracefully():
    """Defensive: nudge docs from older schemas may lack some fields."""
    from routers.pending_nudges import _serialise
    from bson import ObjectId
    doc = {"_id": ObjectId(), "user_id": "u", "group_id": "g"}
    out = _serialise(doc)
    assert out["amount_paise"] == 0
    assert out["amount"] == 0.0
    assert out["strength"] == "soft"
    assert out["status"] == "active"


def test_constants_match_spec():
    """Spec calls for ₹50 floor, 24h cooldown, 72h suppress @ 3 ignores."""
    from routers import pending_nudges as pn
    assert pn.MIN_NUDGE_PAISE == 5000
    assert pn.COOLDOWN_HOURS == 24
    assert pn.SUPPRESS_HOURS_AFTER_IGNORE == 72
    assert pn.MAX_IGNORES_BEFORE_SUPPRESS == 3
