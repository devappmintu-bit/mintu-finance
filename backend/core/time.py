"""core/time.py — single-source UTC time helpers.

Usage
-----

    created_at = utc_now()             # tz-aware datetime
    day_key    = utc_today_str()       # "YYYY-MM-DD"

Why this exists
---------------
`datetime.now(timezone.utc)` was repeated in 60+ call sites across
routers (split_settle 16×, rewards 14×, analytics 9×, etc.). That's fine
for correctness, but:
  • Hard to swap to a freeze-time mock in tests.
  • Timezone drift risk if a future developer writes `datetime.utcnow()`
    (naïve — returns wrong object for DB serialization).
  • Centralising lets us add structured logging / telemetry.
"""
from __future__ import annotations

from datetime import datetime, timezone, date, timedelta


def utc_now() -> datetime:
    """Return the current tz-aware UTC datetime."""
    return datetime.now(timezone.utc)


def utc_today_str() -> str:
    """Return today's date as 'YYYY-MM-DD' (UTC). Matches core.streak."""
    return utc_now().strftime("%Y-%m-%d")


def utc_today() -> date:
    """Return today's UTC date object (for comparisons without time)."""
    return utc_now().date()


def days_ago(n: int) -> datetime:
    """Return a tz-aware datetime `n` days before now."""
    return utc_now() - timedelta(days=n)


def to_utc_str(dt: datetime) -> str:
    """Serialise a datetime (tz-aware or naïve) as ISO-8601 UTC string."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()
