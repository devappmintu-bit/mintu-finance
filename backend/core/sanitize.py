"""core/sanitize.py — Round 53h

Input-sanitization helpers extracted from ``server.py``.

``sanitize_string`` strips HTML tags / null bytes and bounds the
length; ``sanitize_phone`` reduces any string to its trailing 10
digits. Both are pure, side-effect free, and unit-testable in
isolation — exactly the kind of utility that doesn't belong in
the FastAPI bootstrap file.

These were never the *security* layer — XSS protection, schema
validation, etc. live elsewhere. Treat these as ergonomic guards
for user-entered free-text fields.
"""
from __future__ import annotations

import re

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_NON_DIGIT_RE = re.compile(r"\D")


def sanitize_string(value: str, max_length: int = 500) -> str:
    """Strip HTML tags + null bytes from ``value`` and cap length.

    Accepts None/empty and returns the input untouched in those
    cases — callers don't need to wrap in ``if value:`` guards.
    """
    if not value:
        return value
    value = _HTML_TAG_RE.sub("", value)
    value = value.replace("\x00", "")
    return value[:max_length].strip()


def sanitize_phone(phone: str) -> str:
    """Reduce ``phone`` to exactly its trailing 10 digits.

    Tolerates formatting (``+91 98765 43210``, dashes, parens, etc.).
    Returns at most 10 chars, never more.
    """
    cleaned = _NON_DIGIT_RE.sub("", phone or "")
    if len(cleaned) > 10:
        cleaned = cleaned[-10:]
    return cleaned


__all__ = ["sanitize_string", "sanitize_phone"]
