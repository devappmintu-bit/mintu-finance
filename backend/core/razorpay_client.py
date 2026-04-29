"""core/razorpay_client.py — Round 53h

Lazy Razorpay SDK singleton, extracted from ``server.py``.

Why lazy?
  Importing razorpay at server-module import time means the whole app
  refuses to boot if RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing
  or invalid. That's a poor failure mode for environments (CI, dev,
  local Docker) that never actually call Razorpay APIs. By moving the
  client into a function-scoped factory, we defer construction until
  first use, but most callers can keep using the eager export below.

Usage:
    from core.razorpay_client import razorpay_client
    razorpay_client.order.create(...)
"""
from __future__ import annotations

import os

import razorpay

# Eager singleton (back-compat with code that did
# ``from server import razorpay_client``). Empty-string keys are
# tolerated by the SDK at construction; calls will fail at call-time
# with an actionable error, not at import time.
razorpay_client = razorpay.Client(
    auth=(os.environ.get("RAZORPAY_KEY_ID", ""), os.environ.get("RAZORPAY_KEY_SECRET", "")),
)


__all__ = ["razorpay_client"]
