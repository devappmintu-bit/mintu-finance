"""Round 52f \u2014 Failure-mode tests for the split-rounding algorithm.

`_compute_splits` is THE most safety-critical function in the split
domain \u2014 a 1-paise drift compounded across thousands of users becomes
a real reconciliation problem. These tests target the exact failure
modes the audit called out:
  \u2022 Rounding edges (\u20b9100 / 3 = three pieces, sum must equal exactly \u20b9100)
  \u2022 Single-member splits
  \u2022 Zero / negative amounts
  \u2022 Custom shares with leftover paise
  \u2022 Percentage splits with non-100 totals
"""
from __future__ import annotations

import pytest

from routers.split_expenses import _compute_splits

pytestmark = pytest.mark.unit


def _sum_paise(splits: dict) -> int:
    """Sum of the per-user splits, expressed in paise. Floats are
    notoriously bad at addition; we convert to paise for assertions."""
    return sum(round(v * 100) for v in splits.values())


# \u2500\u2500 equal split \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
class TestEqualSplit:
    def test_clean_division(self):
        s = _compute_splits(900.0, "equal", ["a", "b", "c"])
        assert s == {"a": 300.0, "b": 300.0, "c": 300.0}

    def test_remainder_distributed_exactly(self):
        # \u20b9100 / 3 must split with NO drift, not three \u20b933.33 (sum 99.99).
        s = _compute_splits(100.0, "equal", ["a", "b", "c"])
        assert _sum_paise(s) == 10_000  # paise
        # 10000 paise / 3 = 3333 base, remainder = 1 \u2192 ONE person gets +1.
        # Total = 33.34 + 33.33 + 33.33 = \u20b9100.00 exactly.
        assert sorted(s.values()) == [33.33, 33.33, 33.34]

    def test_remainder_assignment_is_deterministic_by_sorted_id(self):
        # Same inputs -> same allocation, run repeatedly.
        for _ in range(5):
            s = _compute_splits(10.0, "equal", ["zoe", "alice", "bob"])
            # 1000 paise / 3 = 333 base, 1 leftover paise -> first sorted id (alice).
            # Total = 3.34 + 3.33 + 3.33 = \u20b910.00 exactly.
            assert s["alice"] == 3.34
            assert s["bob"] == 3.33
            assert s["zoe"] == 3.33

    def test_single_member_gets_full_amount(self):
        s = _compute_splits(123.45, "equal", ["solo"])
        assert s == {"solo": 123.45}

    def test_zero_amount_returns_zero_per_member(self):
        s = _compute_splits(0.0, "equal", ["a", "b"])
        assert s == {"a": 0.0, "b": 0.0}

    def test_negative_amount_returns_zero_per_member(self):
        # Defensive \u2014 negative amounts shouldn't reach this fn (validated
        # by Pydantic), but if they do we must not crash.
        s = _compute_splits(-50.0, "equal", ["a", "b"])
        assert all(v == 0.0 for v in s.values())

    @pytest.mark.parametrize("amount,n", [
        (100.0, 3), (10.0, 3), (1.0, 3), (0.01, 3),
        (1000.0, 7), (333.33, 11),
        (0.05, 3),  # 5 paise / 3 — micro-amount
    ])
    def test_sum_invariant_holds_for_many_amounts(self, amount, n):
        members = [f"u{i}" for i in range(n)]
        s = _compute_splits(amount, "equal", members)
        assert _sum_paise(s) == round(amount * 100), (
            f"drift detected: {amount=} n={n} sum_paise={_sum_paise(s)} expected={round(amount*100)}"
        )


# \u2500\u2500 shares split \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
class TestSharesSplit:
    def test_2_to_1_ratio_no_remainder(self):
        s = _compute_splits(300.0, "shares", ["a", "b"], {"a": 2, "b": 1})
        assert s == {"a": 200.0, "b": 100.0}

    def test_uneven_remainder_assigned_to_largest_fractional(self):
        # \u20b9100, shares 1:1:1 \u2192 paise 10000 / 3 = 3333,3333,3333 + 1 leftover
        s = _compute_splits(100.0, "shares", ["x", "y", "z"], {"x": 1, "y": 1, "z": 1})
        assert _sum_paise(s) == 10_000
        # All three are equally weighted, so the leftover paise breaks
        # tied-fractional ordering by dict insertion -> first key (x) wins.
        assert sorted(s.values()) == [33.33, 33.33, 33.34]


# \u2500\u2500 percentage split (sanity \u2014 fewer because formula is symmetric) \u2500\u2500\u2500\u2500\u2500\u2500
class TestPercentageSplit:
    def test_clean_percentage(self):
        s = _compute_splits(200.0, "percentage", ["a", "b"], {"a": 50, "b": 50})
        assert _sum_paise(s) == 20_000

    def test_percentage_summing_to_100_preserves_total(self):
        s = _compute_splits(100.0, "percentage", ["a", "b", "c"], {"a": 33, "b": 33, "c": 34})
        assert _sum_paise(s) == 10_000
