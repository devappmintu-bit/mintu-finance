"""ab router — A/B testing groups and event tracking."""
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

router = APIRouter(tags=["ab"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/ab/paywall-group")
async def get_ab_group(user_id: str = Depends(get_current_user)):
    """Assign user to A/B test group for paywall placement"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    group = user.get("ab_paywall_group")
    if not group:
        # Deterministic 50/50 split based on user_id hash
        h = int(hashlib.md5(user_id.encode()).hexdigest(), 16)
        group = "A" if h % 2 == 0 else "B"
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"ab_paywall_group": group}})
    
    return {
        "group": group,
        "placement": "after_overspend" if group == "A" else "profile_tab",
        "description": "Group A: Paywall shown after overspend insight. Group B: Paywall in profile tab."
    }


@api_router.post("/ab/track-event")
async def track_ab_event(event: dict, user_id: str = Depends(get_current_user)):
    """Track A/B test conversion events"""
    await db.ab_events.insert_one({
        "user_id": user_id,
        "event": event.get("event", "view"),  # "view", "click", "convert"
        "group": event.get("group", ""),
        "placement": event.get("placement", ""),
        "created_at": datetime.utcnow()
    })
    return {"tracked": True}


@api_router.get("/ab/results")
async def get_ab_results():
    """Get A/B test results (admin)"""
    pipeline_a = [
        {"$match": {"group": "A"}},
        {"$group": {"_id": "$event", "count": {"$sum": 1}}}
    ]
    pipeline_b = [
        {"$match": {"group": "B"}},
        {"$group": {"_id": "$event", "count": {"$sum": 1}}}
    ]
    a_results = {r["_id"]: r["count"] for r in await db.ab_events.aggregate(pipeline_a).to_list(10)}
    b_results = {r["_id"]: r["count"] for r in await db.ab_events.aggregate(pipeline_b).to_list(10)}
    
    return {
        "group_A": {"placement": "after_overspend", "events": a_results, "conversion_rate": (a_results.get("convert", 0) / max(a_results.get("view", 1), 1)) * 100},
        "group_B": {"placement": "profile_tab", "events": b_results, "conversion_rate": (b_results.get("convert", 0) / max(b_results.get("view", 1), 1)) * 100},
    }

