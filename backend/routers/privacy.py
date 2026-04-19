"""privacy router — GDPR/DPDP compliance endpoints (export, delete, policy, cleanup)."""
import os
import json
import logging
import hashlib
import hmac
import random
import time
from datetime import datetime, timedelta, timezone, date
from typing import List, Optional, Dict
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core import db, get_current_user, cache_get, cache_set, cache_clear_prefix

# DATA_RETENTION_DAYS lives in server.py (security config) — keep a module-level
# constant mirror for use in the privacy policy JSON.
DATA_RETENTION_DAYS = 365

router = APIRouter(tags=["privacy"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/privacy/data-export")
async def export_user_data(user_id: str = Depends(get_current_user)):
    """Export all user data in portable JSON format (GDPR Art. 20 / DPDP Sec. 11)"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password": 0, "_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    transactions = await db.transactions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    budgets = await db.budgets.find({"user_id": user_id}, {"_id": 0}).to_list(100)

    # Convert datetime objects for JSON serialization
    def serialize(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return obj

    export_data = {
        "export_info": {
            "app": "MintU",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "format_version": "1.0",
            "legal_basis": "GDPR Art. 20 / India DPDP Act 2023 Sec. 11"
        },
        "user_profile": {k: serialize(v) for k, v in user.items()},
        "transactions": [{k: serialize(v) for k, v in t.items()} for t in transactions],
        "budgets": [{k: serialize(v) for k, v in b.items()} for b in budgets],
        "data_summary": {
            "total_transactions": len(transactions),
            "total_budgets": len(budgets),
            "account_created": serialize(user.get("created_at", ""))
        }
    }

    # Audit log
    await db.audit_logs.insert_one({
        "timestamp": datetime.now(timezone.utc),
        "action": "DATA_EXPORT",
        "user_id": user_id,
        "details": "User requested full data export"
    })

    return export_data


@api_router.delete("/privacy/delete-account")
async def delete_user_account(user_id: str = Depends(get_current_user)):
    """Permanently delete all user data (GDPR Art. 17 / DPDP Sec. 12)"""
    from bson import ObjectId

    # Audit BEFORE deletion
    await db.audit_logs.insert_one({
        "timestamp": datetime.now(timezone.utc),
        "action": "ACCOUNT_DELETION",
        "user_id": user_id,
        "details": "User requested account deletion — all data erased"
    })

    # Delete all user data
    await db.transactions.delete_many({"user_id": user_id})
    await db.budgets.delete_many({"user_id": user_id})
    await db.otps.delete_many({"phone": (await db.users.find_one({"_id": ObjectId(user_id)}, {"phone": 1}))["phone"]})
    await db.users.delete_one({"_id": ObjectId(user_id)})

    return {
        "message": "Account and all associated data permanently deleted",
        "legal_basis": "GDPR Art. 17 / India DPDP Act 2023 Sec. 12",
        "deleted_at": datetime.now(timezone.utc).isoformat()
    }


@api_router.get("/privacy/policy")
async def get_privacy_policy():
    """Return privacy policy and data processing details"""
    return {
        "app": "MintU",
        "version": "1.0",
        "last_updated": "2026-04-15",
        "data_controller": "MintU Finance Technologies",
        "legal_frameworks": [
            "India Digital Personal Data Protection Act (DPDP) 2023",
            "EU General Data Protection Regulation (GDPR) 2018",
            "India Information Technology Act 2000 (IT Act)",
            "RBI Master Direction on Digital Payment Security Controls 2021",
            "PCI-DSS v4.0 (Payment Card Industry Data Security Standard)"
        ],
        "data_collected": {
            "phone_number": {"purpose": "Authentication", "retention": "Until account deletion", "legal_basis": "Consent + Contract"},
            "name": {"purpose": "Personalization", "retention": "Until account deletion", "legal_basis": "Consent"},
            "transactions": {"purpose": "Expense tracking & insights", "retention": f"{DATA_RETENTION_DAYS} days", "legal_basis": "Consent + Legitimate Interest"},
            "sms_text": {"purpose": "Expense extraction", "retention": "NOT STORED — processed and discarded", "legal_basis": "Consent"},
            "budgets": {"purpose": "Budget tracking", "retention": "Until account deletion", "legal_basis": "Consent"},
        },
        "data_not_collected": [
            "Bank account numbers",
            "Card details",
            "Aadhaar/PAN numbers",
            "Location data",
            "Contact list",
            "Full SMS inbox"
        ],
        "third_party_sharing": {
            "openai": {"purpose": "AI insights generation", "data_shared": "Anonymized spending summaries only", "no_PII": True}
        },
        "user_rights": {
            "access": "GET /api/privacy/data-export",
            "deletion": "DELETE /api/privacy/delete-account",
            "portability": "GET /api/privacy/data-export (JSON format)",
            "rectification": "Contact support to correct data",
            "objection": "Disable AI insights in settings"
        },
        "security_measures": [
            "Passwords hashed with bcrypt (cost factor 12)",
            "OTPs hashed before storage, auto-deleted after expiry",
            "JWT tokens with expiration",
            "Rate limiting on all endpoints",
            "IP-based brute force protection",
            "Audit logging of all API access",
            "Security headers (X-Frame-Options, CSP, HSTS)",
            "Input sanitization against XSS/injection",
            "No sensitive data in API responses",
            "SMS text processed and immediately discarded"
        ],
        "data_breach_notification": "Within 72 hours as per GDPR Art. 33 and DPDP Sec. 8",
        "dpo_contact": "privacy@mintu.app"
    }


@api_router.post("/privacy/cleanup-expired")
async def cleanup_expired_data():
    """Remove expired OTPs and rate limit entries — called by cron"""
    now = datetime.now(timezone.utc)

    # Clean expired OTPs
    otp_result = await db.otps.delete_many({"expires_at": {"$lt": now}})

    # Clean old rate limit entries (older than 2 minutes)
    rl_result = await db.rate_limits.delete_many({"window": {"$lt": time.time() - 120}})

    # Clean audit logs older than 90 days (configurable)
    ninety_days_ago = now - timedelta(days=90)
    audit_result = await db.audit_logs.delete_many({"timestamp": {"$lt": ninety_days_ago}})

    return {
        "expired_otps_removed": otp_result.deleted_count,
        "rate_limits_cleaned": rl_result.deleted_count,
        "old_audit_logs_removed": audit_result.deleted_count
    }

