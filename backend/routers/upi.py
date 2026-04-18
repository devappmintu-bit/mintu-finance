"""upi router — extracted from server.py.

Lazy-imports any helpers still living in server.py via _srv() shim.
"""
import os
import json
import logging
import hashlib
import hmac
import random
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core import db, get_current_user, cache_get, cache_set, cache_clear_prefix


def _srv():
    import server  # noqa: PLC0415
    return server


def _lazy_attr(name):
    class _Proxy:
        def __call__(self, *a, **kw): return getattr(_srv(), name)(*a, **kw)
        def __getitem__(self, k): return getattr(_srv(), name)[k]
        def __iter__(self): return iter(getattr(_srv(), name))
        def __len__(self): return len(getattr(_srv(), name))
        def items(self): return getattr(_srv(), name).items()
        def keys(self): return getattr(_srv(), name).keys()
        def __contains__(self, k): return k in getattr(_srv(), name)

        def get(self, k, default=None): return getattr(_srv(), name).get(k, default)
        def values(self): return getattr(_srv(), name).values()
    return _Proxy()


# Commonly needed helper proxies (harmless if unused)
calculate_money_score = _lazy_attr("calculate_money_score")
generate_insights_with_ai = _lazy_attr("generate_insights_with_ai")
get_lang_instruction = _lazy_attr("get_lang_instruction")
AGENT_PROFILES = _lazy_attr("AGENT_PROFILES")
XP_LEVELS = _lazy_attr("XP_LEVELS")
CATEGORIES = _lazy_attr("CATEGORIES")

router = APIRouter(tags=["upi"])
api_router = router  # extracted code uses @api_router.*

def _srv():
    import server  # noqa: PLC0415
    return server
def _lazy(name):
    class _P:
        def __iter__(self): return iter(getattr(_srv(), name))
        def __len__(self): return len(getattr(_srv(), name))
        def __getitem__(self, k): return getattr(_srv(), name)[k]
    return _P()
UPI_APPS = _lazy("UPI_APPS")



@api_router.get("/upi/apps")
async def get_upi_apps(user_id: str = Depends(get_current_user)):
    """Get list of supported UPI apps"""
    return {"apps": UPI_APPS}


@api_router.post("/upi/generate-qr")
async def generate_upi_qr(data: dict, user_id: str = Depends(get_current_user)):
    """Generate UPI QR code data for receiving payments"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    upi_id = user.get("upi_id", "") if user else ""
    if not upi_id:
        raise HTTPException(status_code=400, detail="Set your UPI ID first in Profile")
    
    amount = data.get("amount", 0)
    name = user.get("name", "MintU User")
    
    qr_string = f"upi://pay?pa={upi_id}&pn={name}&am={amount:.2f}&cu=INR&tn=MintU%20Payment"
    
    return {
        "qr_data": qr_string,
        "upi_id": upi_id,
        "name": name,
        "amount": amount
    }

