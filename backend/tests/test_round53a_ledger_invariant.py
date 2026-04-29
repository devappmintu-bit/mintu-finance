"""Round 53a — Double-entry ledger-invariant tests.

Hybrid suite (~80% deterministic / 20% property-based) per directive:
  • Parametrized cases for clarity & debuggability.
  • Hypothesis-driven property tests for rounding edges & random splits.

The invariant is the load-bearing contract for every split / settlement:
    sum(debits) == sum(credits)
"""
from __future__ import annotations

import pytest

from core.ledger_invariant import (
    InvalidEntry,
    LedgerEntry,
    LedgerImbalance,
    assert_balanced_event,
    assert_double_entry,
    build_expense_entries,
    build_settlement_entries,
)
from core.money import rupees_to_paise

pytestmark = pytest.mark.unit


# ──────────────────────────────────────────────────────────────────────
#  LedgerEntry construction guards
# ──────────────────────────────────────────────────────────────────────
class TestLedgerEntryGuards:
    def test_valid_construction(self):
        e = LedgerEntry(user_id="alice", paise=100, side="debit")
        assert e.paise == 100 and e.side == "debit"

    def test_rejects_empty_user_id(self):
        with pytest.raises(InvalidEntry, match="user_id"):
            LedgerEntry(user_id="", paise=100, side="debit")

    def test_rejects_invalid_side(self):
        with pytest.raises(InvalidEntry, match="side"):
            LedgerEntry(user_id="alice", paise=100, side="left")

    def test_rejects_float_paise(self):
        with pytest.raises(InvalidEntry, match="int"):
            LedgerEntry(user_id="alice", paise=100.0, side="debit")  # type: ignore[arg-type]

    def test_rejects_bool_paise(self):
        with pytest.raises(InvalidEntry, match="int"):
            LedgerEntry(user_id="alice", paise=True, side="debit")  # type: ignore[arg-type]

    def test_rejects_negative_paise(self):
        with pytest.raises(InvalidEntry, match="non-negative"):
            LedgerEntry(user_id="alice", paise=-1, side="debit")


# ──────────────────────────────────────────────────────────────────────
#  assert_double_entry — the load-bearing assertion.
# ──────────────────────────────────────────────────────────────────────
class TestAssertDoubleEntry:
    def test_balanced_simple(self):
        # Alice paid ₹100; Bob owes ₹100 — books balance.
        entries = [
            LedgerEntry("alice", 10_000, "debit"),
            LedgerEntry("bob", 10_000, "credit"),
        ]
        assert_double_entry(entries)

    def test_balanced_complex(self):
        # ₹100 split equally 3-ways across Alice (payer), Bob, Charlie.
        entries = [
            LedgerEntry("alice", 10_000, "debit"),
            LedgerEntry("alice", 3_334, "credit"),
            LedgerEntry("bob", 3_333, "credit"),
            LedgerEntry("charlie", 3_333, "credit"),
        ]
        assert_double_entry(entries)

    def test_unbalanced_raises(self):
        # 1-paise drift — must fail.
        entries = [
            LedgerEntry("alice", 10_000, "debit"),
            LedgerEntry("bob", 9_999, "credit"),
        ]
        with pytest.raises(LedgerImbalance, match=r"diff=1p"):
            assert_double_entry(entries, context="test")

    def test_one_sided_raises(self):
        # Only debits, no credits.
        entries = [LedgerEntry("alice", 10_000, "debit")]
        with pytest.raises(LedgerImbalance):
            assert_double_entry(entries)

    def test_empty_raises(self):
        with pytest.raises(InvalidEntry, match="empty"):
            assert_double_entry([])

    def test_context_appears_in_error(self):
        entries = [
            LedgerEntry("a", 100, "debit"),
            LedgerEntry("b", 99, "credit"),
        ]
        with pytest.raises(LedgerImbalance, match=r"split_expense:abc"):
            assert_double_entry(entries, context="split_expense:abc")


# ──────────────────────────────────────────────────────────────────────
#  build_expense_entries — derive entries from a split expense.
# ──────────────────────────────────────────────────────────────────────
class TestBuildExpenseEntries:
    def test_clean_3_way_split(self):
        entries = build_expense_entries(
            amount_paise=30_000,
            paid_by="alice",
            splits_paise={"alice": 10_000, "bob": 10_000, "charlie": 10_000},
        )
        assert_double_entry(entries)
        # Spot-check shape
        debits = [e for e in entries if e.side == "debit"]
        assert len(debits) == 1 and debits[0].user_id == "alice" and debits[0].paise == 30_000

    def test_uneven_split_balances(self):
        entries = build_expense_entries(
            amount_paise=10_000,
            paid_by="alice",
            splits_paise={"alice": 3_334, "bob": 3_333, "charlie": 3_333},
        )
        assert_double_entry(entries)

    def test_zero_share_skipped(self):
        # Charlie excluded (0 share). Books still balance.
        entries = build_expense_entries(
            amount_paise=20_000,
            paid_by="alice",
            splits_paise={"alice": 10_000, "bob": 10_000, "charlie": 0},
        )
        assert_double_entry(entries)
        assert all(e.user_id != "charlie" or e.side == "debit" for e in entries)

    def test_split_total_must_equal_amount(self):
        # Build entries where splits sum to LESS than amount → imbalance.
        entries = build_expense_entries(
            amount_paise=30_000,
            paid_by="alice",
            splits_paise={"alice": 10_000, "bob": 10_000},  # missing 10k
        )
        with pytest.raises(LedgerImbalance):
            assert_double_entry(entries)

    def test_rejects_zero_amount(self):
        with pytest.raises(InvalidEntry, match="positive"):
            build_expense_entries(amount_paise=0, paid_by="a", splits_paise={"a": 0})

    def test_rejects_negative_amount(self):
        with pytest.raises(InvalidEntry, match="positive"):
            build_expense_entries(amount_paise=-100, paid_by="a", splits_paise={"a": -100})

    def test_rejects_missing_paid_by(self):
        with pytest.raises(InvalidEntry, match="paid_by"):
            build_expense_entries(amount_paise=100, paid_by="", splits_paise={"a": 100})

    def test_rejects_empty_splits(self):
        with pytest.raises(InvalidEntry, match="splits_paise"):
            build_expense_entries(amount_paise=100, paid_by="a", splits_paise={})

    def test_rejects_float_share(self):
        with pytest.raises(InvalidEntry, match="int"):
            build_expense_entries(
                amount_paise=10_000, paid_by="a",
                splits_paise={"a": 50.0},  # type: ignore[dict-item]
            )


# ──────────────────────────────────────────────────────────────────────
#  build_settlement_entries
# ──────────────────────────────────────────────────────────────────────
class TestBuildSettlementEntries:
    def test_simple_settlement(self):
        entries = build_settlement_entries(payer_id="bob", payee_id="alice", amount_paise=10_000)
        assert_double_entry(entries)
        assert len(entries) == 2

    def test_self_settlement_rejected(self):
        with pytest.raises(InvalidEntry, match="cannot be the same"):
            build_settlement_entries(payer_id="a", payee_id="a", amount_paise=100)

    def test_zero_amount_rejected(self):
        with pytest.raises(InvalidEntry, match="positive"):
            build_settlement_entries(payer_id="a", payee_id="b", amount_paise=0)


# ──────────────────────────────────────────────────────────────────────
#  assert_balanced_event — total guard
# ──────────────────────────────────────────────────────────────────────
class TestAssertBalancedEvent:
    def test_balanced_and_correct_total_passes(self):
        entries = build_expense_entries(
            amount_paise=10_000, paid_by="a",
            splits_paise={"a": 5_000, "b": 5_000},
        )
        assert_balanced_event(entries, expected_total_paise=10_000)

    def test_balanced_but_wrong_total_fails(self):
        entries = build_expense_entries(
            amount_paise=10_000, paid_by="a",
            splits_paise={"a": 5_000, "b": 5_000},
        )
        with pytest.raises(LedgerImbalance, match="Total mismatch"):
            assert_balanced_event(entries, expected_total_paise=99_999)


# ──────────────────────────────────────────────────────────────────────
#  PROPERTY TESTS — hypothesis explores random valid + invalid scenarios.
# ──────────────────────────────────────────────────────────────────────
hypothesis = pytest.importorskip("hypothesis")
from hypothesis import HealthCheck, given, settings, strategies as st  # noqa: E402


@st.composite
def valid_splits(draw):
    """Generate (amount_paise, splits_paise) where splits sum exactly to amount."""
    amount = draw(st.integers(min_value=1, max_value=10**8))
    n = draw(st.integers(min_value=1, max_value=10))
    base = amount // n
    rem = amount - base * n
    shares = [base] * n
    for i in range(rem):
        shares[i] += 1
    user_ids = [f"u{i}" for i in range(n)]
    return amount, dict(zip(user_ids, shares))


@settings(deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(valid_splits())
def test_property_balanced_split_always_passes(payload):
    amount, splits = payload
    entries = build_expense_entries(
        amount_paise=amount, paid_by=list(splits.keys())[0],
        splits_paise=splits,
    )
    assert_double_entry(entries)


@settings(deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(data=st.data())
def test_property_drift_always_detected(data):
    """ANY non-zero drift between debits and credits must fail."""
    amount = data.draw(st.integers(min_value=2, max_value=10**8))
    # drift must be in [1, amount-1] so credit stays non-negative.
    drift = data.draw(st.integers(min_value=1, max_value=amount - 1))
    entries = [
        LedgerEntry("payer", amount, "debit"),
        LedgerEntry("recipient", amount - drift, "credit"),
    ]
    with pytest.raises(LedgerImbalance):
        assert_double_entry(entries)


@settings(deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(rupees=st.floats(min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False))
def test_property_settlement_balances_for_any_amount(rupees):
    paise = rupees_to_paise(rupees)
    if paise == 0:
        return  # rounding boundary, skip
    entries = build_settlement_entries(payer_id="p", payee_id="r", amount_paise=paise)
    assert_double_entry(entries)
