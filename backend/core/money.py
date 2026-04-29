"""core/money.py — Integer-paise money primitives.

Round 53a — Convert all monetary values to integer paise internally to
eliminate floating-point precision loss. The API boundary still talks
in rupees (float) for backward compatibility with the frontend, but
EVERY internal computation, storage column, and ledger entry is paise.

WHY?
----
Float arithmetic is non-associative for decimals:
    >>> 0.1 + 0.2 == 0.3
    False
    >>> 33.33 + 33.33 + 33.34
    99.99999999999999

In a financial system this is unacceptable. A 1-paise drift compounded
across N transactions becomes a real reconciliation problem. By doing
all math in paise (int) we get exact arithmetic; floats only re-enter
at API serialization time.

DUAL-READ MIGRATION (Round 53a)
-------------------------------
We're transitioning the storage layer from `amount: float (rupees)` to
`amount_paise: int (paise)`. During the transition window:

    • WRITE: every new doc gets BOTH `amount` (float, legacy) AND
      `amount_paise` (int, canonical). Old code paths can still read
      `amount` while we migrate them one at a time.
    • READ:  always go through `paise_from_doc(doc, "amount")`. It
      prefers `amount_paise` and falls back to `round(amount * 100)`
      when the doc predates the migration.

A future PR will (a) backfill `amount_paise` on all legacy docs and
(b) drop the `amount` (float) field. This shim keeps production safe
during the transition.

PUBLIC API
----------
    coerce_to_paise(v)         → int    # accepts int paise OR float rupees
    rupees_to_paise(rupees)    → int    # explicit conversion
    paise_to_rupees(paise)     → float  # for API serialization only
    paise_from_doc(doc, key)   → int    # dual-read helper
    Paise                      = NewType("Paise", int)
"""
from __future__ import annotations

import math
from typing import Any, Dict, Mapping, NewType, Optional, Union

# Type alias: a value of type Paise is ALWAYS an int representing paise.
# Use this in signatures to make intent unambiguous at the type level.
Paise = NewType("Paise", int)

# ₹100 crore upper sanity cap (in paise) — matches split_common._finite_positive.
_MAX_PAISE = 100_00_00_000 * 100  # 1e12 paise

# ──────────────────────────────────────────────────────────────────────
#  EXCEPTIONS
# ──────────────────────────────────────────────────────────────────────


class MoneyError(ValueError):
    """Any conversion / coercion error in the money module."""


# ──────────────────────────────────────────────────────────────────────
#  CORE CONVERSIONS
# ──────────────────────────────────────────────────────────────────────
def rupees_to_paise(rupees: Union[int, float]) -> int:
    """Convert a rupee amount (float) to paise (int).

    Uses banker-safe rounding via `round(x * 100)`. Rejects NaN/Inf and
    disallows negative or absurdly large values.
    """
    if isinstance(rupees, bool):  # bool is a subclass of int — reject
        raise MoneyError(f"rupees_to_paise: bool is not a money type: {rupees!r}")
    if not isinstance(rupees, (int, float)):
        raise MoneyError(f"rupees_to_paise: expected int|float, got {type(rupees).__name__}")
    if isinstance(rupees, float) and not math.isfinite(rupees):
        raise MoneyError(f"rupees_to_paise: NaN/Inf is not a valid amount: {rupees!r}")
    paise = int(round(float(rupees) * 100))
    if paise < 0:
        raise MoneyError(f"rupees_to_paise: negative amount not allowed: {rupees!r}")
    if paise > _MAX_PAISE:
        raise MoneyError(f"rupees_to_paise: amount exceeds sanity cap: {rupees!r}")
    return paise


def paise_to_rupees(paise: int) -> float:
    """Convert paise (int) to rupees (float). API-serialization only.

    Returns a float rounded to 2 decimals so frontend display code
    never has to worry about ``33.33000000000002``.
    """
    if isinstance(paise, bool):
        raise MoneyError(f"paise_to_rupees: bool is not paise: {paise!r}")
    if not isinstance(paise, int):
        raise MoneyError(f"paise_to_rupees: expected int, got {type(paise).__name__}")
    return round(paise / 100.0, 2)


def coerce_to_paise(v: Any) -> int:
    """Accept either an int (already paise) or a float (rupees) and
    return paise. Used at API ingestion boundary and dual-read sites.

        >>> coerce_to_paise(450)        # explicit paise
        450
        >>> coerce_to_paise(4.50)       # rupees
        450
        >>> coerce_to_paise(33.33)
        3333
    """
    if isinstance(v, bool):
        raise MoneyError(f"coerce_to_paise: bool is not a money type: {v!r}")
    if isinstance(v, int):
        if v < 0:
            raise MoneyError(f"coerce_to_paise: negative amount not allowed: {v!r}")
        if v > _MAX_PAISE:
            raise MoneyError(f"coerce_to_paise: amount exceeds sanity cap: {v!r}")
        return v
    if isinstance(v, float):
        return rupees_to_paise(v)
    raise MoneyError(f"coerce_to_paise: expected int|float, got {type(v).__name__}: {v!r}")


# ──────────────────────────────────────────────────────────────────────
#  DUAL-READ HELPERS (read both legacy float field AND new paise field)
# ──────────────────────────────────────────────────────────────────────
def paise_from_doc(doc: Mapping[str, Any], rupees_key: str = "amount", paise_key: Optional[str] = None) -> int:
    """Dual-read: prefer the canonical paise field; fall back to the
    legacy rupees field.

    Args:
        doc: any dict-like (e.g. a Mongo document)
        rupees_key: legacy field name storing rupees as float (default "amount")
        paise_key: canonical field name storing paise as int. If None,
                   defaults to ``rupees_key + "_paise"``.

    Returns 0 if neither field exists.
    """
    if paise_key is None:
        paise_key = f"{rupees_key}_paise"
    if paise_key in doc and doc.get(paise_key) is not None:
        v = doc[paise_key]
        # Defensive: if someone stored a float in the paise field (bug),
        # coerce it instead of corrupting the read.
        if isinstance(v, float):
            return rupees_to_paise(v / 100.0)  # already paise-as-float; treat as rupees*100 was bad
        return int(v)
    if rupees_key in doc and doc.get(rupees_key) is not None:
        v = doc[rupees_key]
        if isinstance(v, (int, float)):
            return rupees_to_paise(float(v))
    return 0


def splits_paise_from_doc(doc: Mapping[str, Any]) -> Dict[str, int]:
    """Dual-read for the per-user split map.

    Prefers ``splits_paise`` (canonical: dict[user_id -> int paise]).
    Falls back to the legacy ``splits`` dict (rupees floats).
    """
    sp = doc.get("splits_paise")
    if isinstance(sp, dict) and sp:
        return {k: int(v) for k, v in sp.items()}
    legacy = doc.get("splits")
    if isinstance(legacy, dict):
        return {k: rupees_to_paise(float(v or 0)) for k, v in legacy.items()}
    return {}


def splits_to_rupees(splits_paise: Mapping[str, int]) -> Dict[str, float]:
    """Convert a paise-keyed split map back to rupees for API responses."""
    return {k: paise_to_rupees(int(v)) for k, v in splits_paise.items()}


__all__ = [
    "Paise",
    "MoneyError",
    "rupees_to_paise",
    "paise_to_rupees",
    "coerce_to_paise",
    "paise_from_doc",
    "splits_paise_from_doc",
    "splits_to_rupees",
]
