"""sms router — extracted from server.py.

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
        def values(self): return getattr(_srv(), name).values()
    return _Proxy()


# Commonly needed helper proxies (harmless if unused)
calculate_money_score = _lazy_attr("calculate_money_score")
generate_insights_with_ai = _lazy_attr("generate_insights_with_ai")
get_lang_instruction = _lazy_attr("get_lang_instruction")
AGENT_PROFILES = _lazy_attr("AGENT_PROFILES")
XP_LEVELS = _lazy_attr("XP_LEVELS")
CATEGORIES = _lazy_attr("CATEGORIES")

router = APIRouter(tags=["sms"])
api_router = router  # extracted code uses @api_router.*

def _srv():
    import server  # noqa: PLC0415
    return server
def _lazy(name):
    class _P:
        def __call__(self, *a, **kw): return getattr(_srv(), name)(*a, **kw)
        def __getitem__(self, k): return getattr(_srv(), name)[k]
        def __iter__(self): return iter(getattr(_srv(), name))
        def __len__(self): return len(getattr(_srv(), name))
    return _P()
SAMPLE_INDIAN_SMS = _lazy("SAMPLE_INDIAN_SMS")



@api_router.get("/sms/sample-inbox")
async def get_sample_sms_inbox():
    """Return sample Indian bank SMS for demo auto-import"""
    return {"messages": SAMPLE_INDIAN_SMS, "count": len(SAMPLE_INDIAN_SMS)}


@api_router.post("/sms/bulk-parse")
async def bulk_parse_sms(data: dict, user_id: str = Depends(get_current_user)):
    """Parse multiple SMS messages and create transactions"""
    messages = data.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided")
    
    parsed_count = 0
    failed_count = 0
    
    for sms_text in messages[:50]:  # Limit to 50
        try:
            parsed = await parse_sms_with_ai(sms_text)
            if parsed:
                await db.transactions.insert_one({
                    "user_id": user_id,
                    "amount": parsed["amount"],
                    "category": parsed["category"],
                    "description": parsed.get("description", parsed.get("merchant", "Transaction")),
                    "type": parsed["type"],
                    "source": "sms_import",
                    "date": datetime.utcnow(),
                    "created_at": datetime.utcnow()
                })
                parsed_count += 1
            else:
                failed_count += 1
        except Exception:
            failed_count += 1
    
    # Recalculate money score
    new_score = await calculate_money_score(user_id)
    from bson import ObjectId
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"money_score": new_score}})
    
    return {"parsed": parsed_count, "failed": failed_count, "total": len(messages)}

