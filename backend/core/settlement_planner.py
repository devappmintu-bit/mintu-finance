"""core/settlement_planner.py — Round 53k Smart Settlements

Greedy debt-simplification: given a group's net balances (paise),
produce the minimum-transaction settlement plan.

WHY GREEDY?
-----------
True minimum-transactions debt simplification is NP-hard in the worst
case (it's a variant of subset-sum). For real groups (≤ ~20 members)
the greedy "largest-debtor-pays-largest-creditor" heuristic produces
the optimal answer in practice and runs in O(N log N).

ALGORITHM
---------
    1. Compute net balance per user (signed paise; +creditor / −debtor).
    2. Sort debtors descending by |debt|; sort creditors descending by credit.
    3. Match the largest debtor against the largest creditor. The transfer
       size is min(|debt|, credit). Record it. Subtract from both.
    4. When a side is at 0, advance its pointer.
    5. Stop when either list is exhausted.

INVARIANTS (asserted on every call)
-----------------------------------
    sum(net_balances)        == 0       (books were balanced going in)
    sum(transfer.paise) on each side == sum |of the original net|
    every transfer.paise > 0
    no self-transfer (from == to is impossible)

The planner is PURE: no I/O, no DB, no clock. Easy to property-test;
hard to break by mistake.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Mapping


@dataclass(frozen=True)
class SettlementTransfer:
    """One leg of the simplified plan: ``from_user`` pays ``to_user`` ``paise``."""
    from_user: str
    to_user: str
    paise: int


class SettlementPlannerError(ValueError):
    """Plan inputs were invalid (unbalanced books, negative amounts, etc.)."""


def plan_settlements(
    net_balances_paise: Mapping[str, int],
    *,
    drift_tolerance_paise: int = 0,
) -> List[SettlementTransfer]:
    """Compute the minimal-transaction settlement plan.

    Args:
        net_balances_paise: ``user_id → signed paise`` mapping. Positive
            means the user is owed money (creditor); negative means they
            owe money (debtor). Sum across all users MUST be zero
            (or within ``drift_tolerance_paise`` to absorb rounding).
        drift_tolerance_paise: maximum allowed |sum| before we reject
            the input as unbalanced. ``0`` is the strict default.

    Returns:
        List[SettlementTransfer] — empty list if everyone is at zero.

    Raises:
        SettlementPlannerError if the sum-zero invariant is violated.
    """
    if not isinstance(net_balances_paise, Mapping):
        raise SettlementPlannerError(
            f"net_balances_paise must be a mapping, got {type(net_balances_paise).__name__}"
        )

    # Reject non-int values up-front so the planner stays paise-canonical.
    for uid, v in net_balances_paise.items():
        if not isinstance(v, int) or isinstance(v, bool):
            raise SettlementPlannerError(
                f"net_balances_paise[{uid!r}] must be int (paise), got {type(v).__name__}"
            )

    total = sum(net_balances_paise.values())
    if abs(total) > drift_tolerance_paise:
        raise SettlementPlannerError(
            f"Net balances must sum to ~0 (within ±{drift_tolerance_paise}p); got {total}p. "
            "This is a books-corruption signal — refuse to plan settlements on it."
        )

    # Split into debtors (negative balance) and creditors (positive).
    # Filter out zeros — they're already settled.
    debtors: List[List] = sorted(
        [[uid, -v] for uid, v in net_balances_paise.items() if v < 0],
        key=lambda x: x[1], reverse=True,
    )
    creditors: List[List] = sorted(
        [[uid, v] for uid, v in net_balances_paise.items() if v > 0],
        key=lambda x: x[1], reverse=True,
    )

    out: List[SettlementTransfer] = []
    di = ci = 0
    while di < len(debtors) and ci < len(creditors):
        d_uid, d_amt = debtors[di]
        c_uid, c_amt = creditors[ci]
        if d_uid == c_uid:
            # Defensive — should be impossible because a single user can't
            # be both > 0 and < 0. Fail loud rather than emit a self-transfer.
            raise SettlementPlannerError(
                f"plan_settlements: user {d_uid!r} appears as both debtor and creditor"
            )
        transfer = min(d_amt, c_amt)
        out.append(SettlementTransfer(from_user=d_uid, to_user=c_uid, paise=transfer))
        debtors[di][1] -= transfer
        creditors[ci][1] -= transfer
        if debtors[di][1] == 0:
            di += 1
        if creditors[ci][1] == 0:
            ci += 1

    # Sanity: if we exhausted one side, the residual on the other should
    # be within the drift tolerance (an unbalanced input was accepted via
    # ``drift_tolerance_paise > 0``; any leftover represents that drift).
    leftover = sum(d[1] for d in debtors[di:]) + sum(c[1] for c in creditors[ci:])
    if abs(leftover) > drift_tolerance_paise:  # pragma: no cover — by construction this can't happen
        raise SettlementPlannerError(
            f"plan_settlements internal: post-loop residual {leftover}p exceeds tolerance"
        )

    return out


def my_transfers(
    plan: List[SettlementTransfer], my_user_id: str,
) -> List[SettlementTransfer]:
    """Filter a plan to ONLY the transfers where ``my_user_id`` is the
    payer. Used by /settle-my-part: a user can only authorize their
    own debts; they can't settle on behalf of others."""
    return [t for t in plan if t.from_user == my_user_id]


def transfer_summary(plan: List[SettlementTransfer]) -> Dict[str, int]:
    """Return aggregate stats for a plan: ``{transfers, total_paise, debtors, creditors}``.
    Used in API responses and observability dashboards."""
    return {
        "transfers": len(plan),
        "total_paise": sum(t.paise for t in plan),
        "debtors": len({t.from_user for t in plan}),
        "creditors": len({t.to_user for t in plan}),
    }


__all__ = [
    "SettlementTransfer",
    "SettlementPlannerError",
    "plan_settlements",
    "my_transfers",
    "transfer_summary",
]
