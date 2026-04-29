"""Round 53a — Money primitives unit tests.

Verifies integer-paise conversions, dual-read fallback, and the
sanity guards on the money module.
"""
from __future__ import annotations

import pytest

from core.money import (
    MoneyError,
    coerce_to_paise,
    paise_from_doc,
    paise_to_rupees,
    rupees_to_paise,
    splits_paise_from_doc,
    splits_to_rupees,
)

pytestmark = pytest.mark.unit


# ──────────────────────────────────────────────────────────────────────
#  rupees_to_paise
# ──────────────────────────────────────────────────────────────────────
class TestRupeesToPaise:
    @pytest.mark.parametrize("rupees,expected", [
        (0, 0),
        (1, 100),
        (1.0, 100),
        (1.5, 150),
        (33.33, 3333),
        (100.0, 10_000),
        (0.01, 1),     # one paisa
        (9999.99, 999_999),
    ])
    def test_basic_conversions(self, rupees, expected):
        assert rupees_to_paise(rupees) == expected

    def test_rejects_nan(self):
        with pytest.raises(MoneyError, match="NaN/Inf"):
            rupees_to_paise(float("nan"))

    def test_rejects_inf(self):
        with pytest.raises(MoneyError, match="NaN/Inf"):
            rupees_to_paise(float("inf"))

    def test_rejects_negative(self):
        with pytest.raises(MoneyError, match="negative"):
            rupees_to_paise(-1)

    def test_rejects_string(self):
        with pytest.raises(MoneyError):
            rupees_to_paise("100")  # type: ignore[arg-type]

    def test_rejects_bool(self):
        # bool is a subclass of int — must be explicitly rejected.
        with pytest.raises(MoneyError, match="bool"):
            rupees_to_paise(True)  # type: ignore[arg-type]

    def test_rejects_above_sanity_cap(self):
        with pytest.raises(MoneyError, match="sanity cap"):
            rupees_to_paise(1_00_00_00_001.0)  # ₹100 crore + 1


# ──────────────────────────────────────────────────────────────────────
#  paise_to_rupees
# ──────────────────────────────────────────────────────────────────────
class TestPaiseToRupees:
    @pytest.mark.parametrize("paise,expected", [
        (0, 0.0),
        (1, 0.01),
        (100, 1.0),
        (3333, 33.33),
        (10_000, 100.0),
    ])
    def test_basic(self, paise, expected):
        assert paise_to_rupees(paise) == expected

    def test_returns_2dp(self):
        # Paise are exact ints — no fractional residue should leak in.
        assert paise_to_rupees(33_33) == 33.33
        assert paise_to_rupees(99_99) == 99.99

    def test_rejects_float(self):
        with pytest.raises(MoneyError, match="expected int"):
            paise_to_rupees(33.33)  # type: ignore[arg-type]

    def test_rejects_bool(self):
        with pytest.raises(MoneyError, match="bool"):
            paise_to_rupees(True)  # type: ignore[arg-type]


# ──────────────────────────────────────────────────────────────────────
#  coerce_to_paise — dual-input acceptance
# ──────────────────────────────────────────────────────────────────────
class TestCoerceToPaise:
    def test_int_passes_through_as_paise(self):
        # Already paise — DO NOT multiply by 100.
        assert coerce_to_paise(450) == 450
        assert coerce_to_paise(33_33) == 3333

    def test_float_treated_as_rupees(self):
        assert coerce_to_paise(4.50) == 450
        assert coerce_to_paise(33.33) == 3333

    def test_zero_allowed(self):
        # Zero is a valid amount (e.g. excluded participant share).
        assert coerce_to_paise(0) == 0
        assert coerce_to_paise(0.0) == 0

    def test_rejects_negative(self):
        with pytest.raises(MoneyError, match="negative"):
            coerce_to_paise(-100)
        with pytest.raises(MoneyError, match="negative"):
            coerce_to_paise(-0.01)

    def test_rejects_bool(self):
        with pytest.raises(MoneyError, match="bool"):
            coerce_to_paise(True)


# ──────────────────────────────────────────────────────────────────────
#  ROUND-TRIP — rupees → paise → rupees should be lossless to 2dp
# ──────────────────────────────────────────────────────────────────────
class TestRoundTrip:
    @pytest.mark.parametrize("rupees", [
        0.0, 0.01, 0.99, 1.0, 33.33, 99.99, 100.0, 12345.67,
    ])
    def test_round_trip_2dp(self, rupees):
        assert paise_to_rupees(rupees_to_paise(rupees)) == round(rupees, 2)


# ──────────────────────────────────────────────────────────────────────
#  paise_from_doc — dual-read for Mongo docs
# ──────────────────────────────────────────────────────────────────────
class TestPaiseFromDoc:
    def test_prefers_paise_field(self):
        doc = {"amount": 99.99, "amount_paise": 12345}
        # Even when both fields exist, the paise field wins.
        assert paise_from_doc(doc) == 12345

    def test_falls_back_to_legacy_float(self):
        doc = {"amount": 33.33}
        assert paise_from_doc(doc) == 3333

    def test_paise_only_doc(self):
        doc = {"amount_paise": 5500}
        assert paise_from_doc(doc) == 5500

    def test_missing_returns_zero(self):
        assert paise_from_doc({}) == 0

    def test_custom_keys(self):
        doc = {"foo": 5.0, "foo_paise": 700}
        assert paise_from_doc(doc, "foo") == 700
        assert paise_from_doc(doc, "foo", "foo_paise") == 700

    def test_none_values_treated_as_missing(self):
        assert paise_from_doc({"amount_paise": None, "amount": None}) == 0

    def test_int_in_legacy_field_treated_as_rupees(self):
        # If the legacy "amount" field stores 100 (int rupees, not paise),
        # we still convert it correctly.
        assert paise_from_doc({"amount": 100}) == 10_000


# ──────────────────────────────────────────────────────────────────────
#  splits_paise_from_doc / splits_to_rupees
# ──────────────────────────────────────────────────────────────────────
class TestSplitsHelpers:
    def test_prefers_paise_dict(self):
        doc = {"splits": {"a": 50.0}, "splits_paise": {"a": 6000}}
        assert splits_paise_from_doc(doc) == {"a": 6000}

    def test_falls_back_to_rupees_dict(self):
        doc = {"splits": {"a": 33.33, "b": 33.33, "c": 33.34}}
        assert splits_paise_from_doc(doc) == {"a": 3333, "b": 3333, "c": 3334}

    def test_missing_returns_empty(self):
        assert splits_paise_from_doc({}) == {}

    def test_to_rupees_round_trip(self):
        paise_map = {"a": 3333, "b": 3333, "c": 3334}
        rupees_map = splits_to_rupees(paise_map)
        assert rupees_map == {"a": 33.33, "b": 33.33, "c": 33.34}
        # And summing back should equal the original total exactly.
        assert sum(round(v * 100) for v in rupees_map.values()) == 10_000


# ──────────────────────────────────────────────────────────────────────
#  PROPERTY-BASED — round-trip is lossless for all reasonable rupee inputs.
# ──────────────────────────────────────────────────────────────────────
hypothesis = pytest.importorskip("hypothesis")
from hypothesis import given, strategies as st  # noqa: E402

@given(st.floats(min_value=0, max_value=1_000_000, allow_nan=False, allow_infinity=False))
def test_property_round_trip_2dp(rupees):
    """For any reasonable rupee value, rupees → paise → rupees == round(rupees, 2)."""
    paise = rupees_to_paise(rupees)
    assert paise_to_rupees(paise) == round(rupees, 2)


@given(st.integers(min_value=0, max_value=10**11))
def test_property_paise_passthrough(paise):
    """Coercing an int (paise) returns the same value; round-trip is exact."""
    assert coerce_to_paise(paise) == paise
    assert rupees_to_paise(paise_to_rupees(paise)) == paise
