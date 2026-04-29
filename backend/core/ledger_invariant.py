"""core/ledger_invariant.py — Double-entry bookkeeping invariant.

Round 53a — Mathematical guard rail for split / settlement money flow.

THE INVARIANT
-------------
For every monetary "event" (an expense, a settlement, a transfer), the
sum of all DEBITS must equal the sum of all CREDITS:

        sum(debit_paise) == sum(credit_paise)

If this property ever fails to hold, our books are *corrupted* and we
must fail fast — never persist the event. This module exposes a single
entry point, ``assert_double_entry``, that any ledger-touching code
path must call BEFORE its DB transaction begins.

WHY CHECK BEFORE THE TRANSACTION (not inside)?
----------------------------------------------
1. **Fail fast** — zero DB I/O is wasted on bad inputs.
2. **No phantom side-effects** — websocket emits, cache invalidations,
   etc. live AFTER the transaction. Pre-transaction failure ensures
   none of them fire on a corrupt event.
3. **Cleaner mental model** — invariant validation is *input* validation,
   not *post-write* verification.

USAGE
-----
    from core.money import coerce_to_paise
    from core.ledger_invariant import (
        LedgerEntry, assert_double_entry, build_expense_entries,
        build_settlement_entries,
    )

    amount_paise = coerce_to_paise(expense.amount)
    splits_paise = compute_splits_paise(amount_paise, ...)

    entries = build_expense_entries(
        amount_paise=amount_paise,
        paid_by=expense.paid_by,
        splits_paise=splits_paise,
    )
    assert_double_entry(entries)   # raises LedgerImbalance → no DB writes

    async def _do_writes(session):
        await db.split_expenses.insert_one({...amount_paise, splits_paise...}, session=session)

    await with_atomic(db.client, _do_writes)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Mapping, Sequence

# ──────────────────────────────────────────────────────────────────────
#  EXCEPTIONS
# ──────────────────────────────────────────────────────────────────────


class LedgerInvariantError(ValueError):
    """Base class for any ledger-invariant violation."""


class LedgerImbalance(LedgerInvariantError):
    """sum(debits) != sum(credits) in paise."""


class InvalidEntry(LedgerInvariantError):
    """An entry is malformed (negative, zero, missing party, etc.)."""


# ──────────────────────────────────────────────────────────────────────
#  CORE TYPES
# ──────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class LedgerEntry:
    """One side of a journal entry.

    Convention:
      • ``side == "debit"``   — the user GAVE money / is OWED (asset++)
      • ``side == "credit"``  — the user RECEIVED money / OWES (liability++)

    For a split expense where Alice pays ₹300 for a ₹300 dinner equally
    shared between Alice (₹100), Bob (₹100), Charlie (₹100):

        debit:  Alice  300_00 paise   (she gave money to the group)
        credit: Alice  100_00 paise   (her own share)
        credit: Bob    100_00 paise   (he owes Alice)
        credit: Charlie 100_00 paise  (he owes Alice)

        sum(debits)  = 30000 paise
        sum(credits) = 30000 paise   ✅
    """
    user_id: str
    paise: int                # ALWAYS positive; the side determines direction
    side: str                 # "debit" | "credit"
    memo: str = ""            # free-form audit string

    def __post_init__(self) -> None:  # noqa: D401 — invariant on construction
        if not self.user_id:
            raise InvalidEntry("LedgerEntry.user_id must be a non-empty string")
        if self.side not in ("debit", "credit"):
            raise InvalidEntry(f"LedgerEntry.side must be 'debit'|'credit', got {self.side!r}")
        if not isinstance(self.paise, int) or isinstance(self.paise, bool):
            raise InvalidEntry(f"LedgerEntry.paise must be int (paise), got {type(self.paise).__name__}")
        if self.paise < 0:
            raise InvalidEntry(f"LedgerEntry.paise must be non-negative, got {self.paise}")


# ──────────────────────────────────────────────────────────────────────
#  THE INVARIANT
# ──────────────────────────────────────────────────────────────────────
def assert_double_entry(entries: Sequence[LedgerEntry], *, context: str = "") -> None:
    """Raise ``LedgerImbalance`` if sum(debits) != sum(credits).

    Args:
        entries: list of LedgerEntry objects.
        context: optional human-readable label used in the error message
                 (e.g. ``"split_expense:62...d"``).

    Raises:
        LedgerImbalance: when the books don't balance.
        InvalidEntry: when ``entries`` is empty.
    """
    if not entries:
        raise InvalidEntry(
            f"assert_double_entry: empty entries list ({context!r})"
        )
    debits = sum(e.paise for e in entries if e.side == "debit")
    credits = sum(e.paise for e in entries if e.side == "credit")
    if debits != credits:
        # Build a small breakdown so the error message is actionable.
        breakdown = ", ".join(
            f"{e.user_id}:{e.side[0]}{e.paise}p"
            for e in entries
        )
        raise LedgerImbalance(
            f"Ledger imbalance ({context!r}): debits={debits}p credits={credits}p "
            f"diff={debits - credits}p :: {breakdown}"
        )


# ──────────────────────────────────────────────────────────────────────
#  BUILDERS — the only blessed way to construct entries for our domain
# ──────────────────────────────────────────────────────────────────────
def build_expense_entries(
    *,
    amount_paise: int,
    paid_by: str,
    splits_paise: Mapping[str, int],
) -> List[LedgerEntry]:
    """Build the journal entries for ONE split expense.

        Debit  paid_by amount_paise               (the payer fronted the cash)
        Credit each_user splits_paise[user]       (each user's share)

    Returns the list. Caller passes it to ``assert_double_entry`` BEFORE
    persisting the expense.
    """
    if amount_paise <= 0:
        raise InvalidEntry(f"build_expense_entries: amount_paise must be positive, got {amount_paise}")
    if not paid_by:
        raise InvalidEntry("build_expense_entries: paid_by is required")
    if not splits_paise:
        raise InvalidEntry("build_expense_entries: splits_paise must be non-empty")
    for uid, p in splits_paise.items():
        if not isinstance(p, int) or isinstance(p, bool):
            raise InvalidEntry(f"build_expense_entries: splits_paise[{uid!r}] must be int, got {type(p).__name__}")
        if p < 0:
            raise InvalidEntry(f"build_expense_entries: splits_paise[{uid!r}] must be non-negative, got {p}")

    entries: List[LedgerEntry] = [
        LedgerEntry(user_id=paid_by, paise=int(amount_paise), side="debit", memo="expense.payer"),
    ]
    for uid, share in splits_paise.items():
        # Skip zero-shares (excluded participants) — they don't affect the books.
        if int(share) == 0:
            continue
        entries.append(LedgerEntry(user_id=uid, paise=int(share), side="credit", memo="expense.share"))
    return entries


def build_settlement_entries(
    *,
    payer_id: str,
    payee_id: str,
    amount_paise: int,
) -> List[LedgerEntry]:
    """Build the journal entries for ONE settlement.

        Debit  payee_id amount_paise   (their receivable shrinks)
        Credit payer_id amount_paise   (their payable shrinks)

    NOTE: by convention, "debit" here means "this party's debt-they-owe
    decreases" — semantically inverse to the expense path. The double-
    entry property is identical: balanced totals.
    """
    if amount_paise <= 0:
        raise InvalidEntry(f"build_settlement_entries: amount_paise must be positive, got {amount_paise}")
    if not payer_id or not payee_id:
        raise InvalidEntry("build_settlement_entries: payer_id and payee_id are required")
    if payer_id == payee_id:
        raise InvalidEntry("build_settlement_entries: payer and payee cannot be the same user")

    return [
        LedgerEntry(user_id=payee_id, paise=int(amount_paise), side="debit", memo="settle.payee"),
        LedgerEntry(user_id=payer_id, paise=int(amount_paise), side="credit", memo="settle.payer"),
    ]


# ──────────────────────────────────────────────────────────────────────
#  CONVENIENCE: aggregate check across MULTIPLE events
# ──────────────────────────────────────────────────────────────────────
def assert_balanced_event(
    entries: Iterable[LedgerEntry],
    *,
    expected_total_paise: int,
    context: str = "",
) -> None:
    """Stronger check: not just balanced, but balanced to a specific total.

    Use when you know the gross movement size and want to also verify
    no entry was *dropped* (e.g. a missing participant from a split).
    """
    entries = list(entries)
    assert_double_entry(entries, context=context)
    debits = sum(e.paise for e in entries if e.side == "debit")
    if debits != expected_total_paise:
        raise LedgerImbalance(
            f"Total mismatch ({context!r}): debits={debits}p expected={expected_total_paise}p"
        )


__all__ = [
    "LedgerEntry",
    "LedgerInvariantError",
    "LedgerImbalance",
    "InvalidEntry",
    "assert_double_entry",
    "assert_balanced_event",
    "build_expense_entries",
    "build_settlement_entries",
]
