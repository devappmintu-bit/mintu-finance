"""User router — profile, avatar, UPI, biometric settings."""
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user
from core.upi import validate_upi_id, mask_upi_id

router = APIRouter(prefix="/user", tags=["user"])


class BiometricToggle(BaseModel):
    enabled: bool


async def _get_user_or_404(user_id: str, projection: dict | None = None) -> dict:
    user = await db.users.find_one({"_id": ObjectId(user_id)}, projection) if projection else await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/me")
async def get_user_profile(user_id: str = Depends(get_current_user)):
    user = await _get_user_or_404(user_id)
    return {
        "id": str(user["_id"]),
        "phone": user["phone"],
        "name": user["name"],
        "money_score": user.get("money_score", 50),
        "created_at": user["created_at"],
    }


@router.put("/profile")
@router.put("/me")
async def update_profile(data: dict, user_id: str = Depends(get_current_user)):
    """Update user profile — supports name, monthly_income, language, email, dob.

    Exposed under both /profile (legacy) and /me (REST convention) to keep clients
    that hit either path working.
    """
    ALLOWED = {"name", "monthly_income", "language", "email", "dob", "occupation", "city", "state"}
    updates: dict = {}
    for key in ALLOWED:
        if key not in data:
            continue
        v = data[key]
        if key == "name":
            if isinstance(v, str) and v.strip():
                updates["name"] = v.strip()
        elif key == "monthly_income":
            try:
                updates["monthly_income"] = float(v) if v is not None else 0.0
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="monthly_income must be numeric")
        elif key == "language":
            if v in ("en", "hi", "ta", "bn", "te", "mr", "gu", "kn", "ml", "pa"):
                updates["language"] = v
        else:
            # Generic string fields — just trim-store
            if isinstance(v, str): updates[key] = v.strip()
            elif v is not None: updates[key] = v
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
    return {"message": "Profile updated", **updates}


@router.post("/avatar")
async def upload_avatar(data: dict, user_id: str = Depends(get_current_user)):
    """Upload profile photo as base64 (<= ~500KB raw / ~700KB base64)."""
    avatar_b64 = data.get("avatar", "")
    if not avatar_b64:
        raise HTTPException(status_code=400, detail="No avatar data")
    if len(avatar_b64) > 700_000:
        raise HTTPException(status_code=400, detail="Image too large. Max 500KB")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"avatar": avatar_b64}})
    return {"message": "Avatar updated!"}


@router.get("/avatar")
async def get_avatar(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"avatar": 1, "name": 1}) or {}
    return {"avatar": user.get("avatar", ""), "name": user.get("name", "")}


@router.post("/upi")
async def save_upi_id(data: dict, user_id: str = Depends(get_current_user)):
    upi_id = data.get("upi_id", "").strip()
    if not upi_id:
        raise HTTPException(status_code=400, detail="UPI ID is required")
    if not validate_upi_id(upi_id):
        raise HTTPException(status_code=400, detail="Invalid UPI ID format. Use format: name@bank")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"upi_id": upi_id}})
    return {"message": "UPI ID saved", "upi_id": mask_upi_id(upi_id)}


@router.get("/upi")
async def get_upi_id(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"upi_id": 1, "name": 1}) or {}
    upi = user.get("upi_id", "")
    return {"upi_id": upi, "masked": mask_upi_id(upi), "name": user.get("name", "")}


@router.put("/biometric")
async def toggle_biometric(data: BiometricToggle, user_id: str = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"biometric_enabled": data.enabled}})
    return {"biometric_enabled": data.enabled}


@router.get("/biometric")
async def get_biometric_status(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"biometric_enabled": 1}) or {}
    return {"biometric_enabled": user.get("biometric_enabled", False)}
