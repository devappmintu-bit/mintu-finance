"""upi router — list supported UPI apps and generate pay-intent QR codes."""
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
from core.constants import UPI_APPS

router = APIRouter(tags=["upi"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/upi/apps")
async def get_upi_apps(user_id: str = Depends(get_current_user)):
    """Get list of supported UPI apps"""
    return {"apps": list(UPI_APPS)}


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

