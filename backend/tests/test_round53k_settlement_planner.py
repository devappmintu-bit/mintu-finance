"""Round 53k — Smart Settlements planner tests.

Pure-Python tests for core/settlement_planner.py. Hybrid 80/20 mix:
deterministic cases for clarity + hypothesis property tests for the
"plan is always balanced" invariant under random valid inputs.
"""
from __future__ import annotations

import pytest

from core.settlement_planner import (
    SettlementPlannerError,
    SettlementTransfer,
    my_transfers,
    plan_settlements,
    transfer_summary,
)

pytestmark = pytest.mark.unit


# ──────────────────────────────────────────────────────────────────────
#  Happy-path deterministic cases
# ──────────────────────────────────────────────────────────────────────
class TestPlanShape:
    def test_empty_input_returns_empty_plan(self):
        assert plan_settlements({}) == []

    def test_all_zero_balances_returns_empty_plan(self):
        assert plan_settlements({"a": 0, "b": 0}) == []

    def test_simple_two_party_settlement(self):
        # A owes B ₹100.
        plan = plan_settlements({"a": -10_000, "b": 10_000})
        assert plan == [SettlementTransfer("a", "b", 10_000)]

    def test_three_party_chain_is_one_transfer(self):
        # A owes ₹50, B owes ₹50, C is owed ₹100. Optimal: 2 transfers.
        plan = plan_settlements({"a": -5000, "b": -5000, "c": 10_000})
        assert len(plan) == 2
        assert all(t.to_user == "c" for t in plan)
        # Total flowing into C equals 10_000.
        assert sum(t.paise for t in plan) == 10_000

    def test_minimal_transfers_for_split_chain(self):
        # A owes ₹100 to B (B is owed ₹100 net), C owes ₹100 to D.
        # Optimal greedy: A→B 100, C→D 100 — exactly 2 transfers.
        plan = plan_settlements({"a": -10_000, "b": 10_000, "c": -10_000, "d": 10_000})
        assert len(plan) == 2
        # Largest first → A pairs with B (or D); C pairs with the other.
        # Either pairing is optimal.
        froms = {t.from_user for t in plan}
        tos = {t.to_user for t in plan}
        assert froms == {"a", "c"}
        assert tos == {"b", "d"}

    def test_uneven_amounts_split_correctly(self):
        # A owes 30, B owes 70, C is owed 100.
        plan = plan_settlements({"a": -3000, "b": -7000, "c": 10_000})
        assert len(plan) == 2
        # Largest debtor (B) pairs first: B → C 7000.
        # Then A → C 3000.
        amounts_to_c = sorted(t.paise for t in plan if t.to_user == "c")
        assert amounts_to_c == [3000, 7000]


# ──────────────────────────────────────────────────────────────────────
#  Invariants
# ──────────────────────────────────────────────────────────────────────
class TestInvariants:
    def test_unbalanced_books_rejected(self):
        # Sum != 0 → planner refuses.
        with pytest.raises(SettlementPlannerError, match="sum to ~0"):
            plan_settlements({"a": -100, "b": 50})

    def test_drift_tolerance_allows_small_imbalance(self):
        # Within tolerance → planner accepts and plans.
        plan = plan_settlements({"a": -10_000, "b": 10_001}, drift_tolerance_paise=2)
        assert len(plan) == 1

    def test_float_value_rejected(self):
        with pytest.raises(SettlementPlannerError, match="int"):
            plan_settlements({"a": -100.0, "b": 100})  # type: ignore[dict-item]

    def test_bool_value_rejected(self):
        with pytest.raises(SettlementPlannerError, match="int"):
            plan_settlements({"a": True, "b": False})  # type: ignore[dict-item]

    def test_no_self_transfer_emitted(self):
        # Ensure debtors/creditors lists never alias the same user.
        plan = plan_settlements({"a": -5000, "b": 5000})
        for t in plan:
            assert t.from_user != t.to_user

    def test_all_transfers_positive(self):
        plan = plan_settlements({"a": -3000, "b": -7000, "c": 10_000})
        assert all(t.paise > 0 for t in plan)


# ──────────────────────────────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────────────────────────────
class TestMyTransfers:
    def test_filters_to_payer_only(self):
        plan = [
            SettlementTransfer("alice", "bob", 1000),
            SettlementTransfer("bob", "carol", 500),
            SettlementTransfer("alice", "carol", 200),
        ]
        mine = my_transfers(plan, "alice")
        assert len(mine) == 2
        assert all(t.from_user == "alice" for t in mine)

    def test_user_with_no_debt_returns_empty(self):
        plan = [SettlementTransfer("alice", "bob", 1000)]
        assert my_transfers(plan, "carol") == []


class TestTransferSummary:
    def test_summary_aggregates(self):
        plan = [
            SettlementTransfer("a", "c", 5000),
            SettlementTransfer("b", "c", 3000),
            SettlementTransfer("a", "d", 2000),
        ]
        s = transfer_summary(plan)
        assert s == {
            "transfers": 3, "total_paise": 10_000,
            "debtors": 2, "creditors": 2,
        }

    def test_empty_plan_summary(self):
        assert transfer_summary([]) == {
            "transfers": 0, "total_paise": 0,
            "debtors": 0, "creditors": 0,
        }


# ──────────────────────────────────────────────────────────────────────
#  PROPERTY tests — the planner output ALWAYS balances the input.
# ──────────────────────────────────────────────────────────────────────
hypothesis = pytest.importorskip("hypothesis")
from hypothesis import given, settings, strategies as st  # noqa: E402


@st.composite
def balanced_paise_dict(draw):
    """Generate a dict whose values are signed ints summing to zero."""
    n = draw(st.integers(min_value=2, max_value=8))
    raw = draw(st.lists(st.integers(min_value=-10**6, max_value=10**6),
                        min_size=n, max_size=n))
    # Zero-pad: replace last entry with -(sum of others).
    raw[-1] = -sum(raw[:-1])
    return {f"u{i}": v for i, v in enumerate(raw)}


@settings(deadline=None, max_examples=200)
@given(balanced_paise_dict())
def test_property_plan_inflows_equal_outflows(net):
    plan = plan_settlements(net)
    inflow = {}
    outflow = {}
    for t in plan:
        outflow[t.from_user] = outflow.get(t.from_user, 0) + t.paise
        inflow[t.to_user] = inflow.get(t.to_user, 0) + t.paise
    # Every debtor's outflow == |their net|; every creditor's inflow == net.
    for uid, v in net.items():
        if v < 0:
            assert outflow.get(uid, 0) == -v, f"debtor {uid}: outflow {outflow.get(uid,0)} != {-v}"
        elif v > 0:
            assert inflow.get(uid, 0) == v, f"creditor {uid}: inflow {inflow.get(uid,0)} != {v}"
        else:
            assert uid not in inflow and uid not in outflow


@settings(deadline=None, max_examples=200)
@given(balanced_paise_dict())
def test_property_plan_size_bounded_by_n_minus_1(net):
    """Optimal greedy emits AT MOST N-1 transfers for N non-zero parties."""
    plan = plan_settlements(net)
    non_zero = sum(1 for v in net.values() if v != 0)
    if non_zero == 0:
        assert plan == []
    else:
        assert len(plan) <= non_zero - 1 if non_zero > 0 else True
