"""sms router — sample SMS inbox + bulk SMS parsing to create transactions."""
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
from core.scoring import calculate_money_score
from core.constants import SAMPLE_INDIAN_SMS


def parse_sms_with_ai(sms_text):
    """Lazy proxy to server.parse_sms_with_ai — avoids circular import."""
    import server  # noqa: PLC0415
    return server.parse_sms_with_ai(sms_text)


router = APIRouter(tags=["sms"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/sms/sample-inbox")
async def get_sample_sms_inbox():
    """Return sample Indian bank SMS for demo auto-import"""
    return {"messages": list(SAMPLE_INDIAN_SMS), "count": len(SAMPLE_INDIAN_SMS)}


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

