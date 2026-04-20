"""Shared primitives for premium-* routers (shared APIRouter + Razorpay proxy)."""
import logging
from fastapi import APIRouter
from pydantic import BaseModel

# Razorpay client lives in server.py (bootstrapped at startup). Lazy-proxy it so
# extracted routers can keep using `razorpay_client.order.create(...)`.
def _razorpay():
    import server  # noqa: PLC0415
    return server.razorpay_client


class _RazorpayProxy:
    def __getattr__(self, name):
        return getattr(_razorpay(), name)


razorpay_client = _RazorpayProxy()

# Shared router decorated on by premium_core / premium_tax / premium_invest / premium_ai.
router = APIRouter(tags=["premium"])
api_router = router


# ── Shared Pydantic bodies ────────────────────────────────────────────
class CreateOrderRequest(BaseModel):
    plan: str  # "monthly", "yearly", "lifetime", "intro"


class MockActivateRequest(BaseModel):
    """Used by the in-app mocked payment flow (no real Razorpay call)."""
    plan: str
    coins_to_use: int = 0


__all__ = [
    "router", "api_router", "razorpay_client",
    "CreateOrderRequest", "MockActivateRequest",
]
