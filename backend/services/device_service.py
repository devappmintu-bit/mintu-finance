"""
services/device_service.py — Round 88 auth upgrade.

Devices collection — one doc per (user_id, device_id) pair.

Used to implement the \"skip OTP on known device\" short-circuit:
  • After a successful OTP verification on device X, we upsert an
    entry with `is_trusted=true`.
  • On subsequent app opens, the client's stored refresh token
    already carries device_id in its session; /auth/refresh succeeds
    WITHOUT a new OTP.
  • If a refresh token is presented from an unknown device_id, we
    still rotate it (the refresh token IS the device's credential),
    but we flag the session for step-up OTP if the action is
    sensitive (see services.step_up).

Schema:
  {
    _id:          ObjectId,
    user_id:      str (hex)
    device_id:    str (uuid)
    device_name:  str | None   — e.g. \"iPhone 15\"
    os:           str | None   — \"ios\" | \"android\" | \"web\"
    model:        str | None
    app_version:  str | None
    is_trusted:   bool         — promoted after first successful verify
    created_at:   datetime
    last_used_at: datetime
  }

Indexes:
  • compound (user_id, device_id) unique
  • (user_id) for listing
"""
from __future__ import annotations

from typing import Optional

from core.time import utc_now

_INDEXES_READY = False


async def ensure_indexes() -> None:
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    from server import db
    await db.devices.create_index([("user_id", 1), ("device_id", 1)], unique=True)
    await db.devices.create_index("user_id")
    _INDEXES_READY = True


async def register_device(
    user_id: str,
    device_id: str,
    *,
    device_name: Optional[str] = None,
    os_name: Optional[str] = None,
    model: Optional[str] = None,
    app_version: Optional[str] = None,
    mark_trusted: bool = True,
) -> dict:
    """Upsert a device for the user. Returns the stored doc (sans _id).

    Mark the device trusted when we're called right after a successful
    OTP verification — that's the gate that turns a device into a
    \"known\" device for future silent-auth.
    """
    from server import db
    await ensure_indexes()
    now = utc_now()
    set_doc = {
        "last_used_at": now,
    }
    if device_name:  set_doc["device_name"] = device_name
    if os_name:      set_doc["os"] = os_name
    if model:        set_doc["model"] = model
    if app_version:  set_doc["app_version"] = app_version
    if mark_trusted: set_doc["is_trusted"] = True

    # Round 88 fix — `is_trusted` cannot live in BOTH $set and
    # $setOnInsert (Mongo refuses with code 40 conflict). When
    # mark_trusted=True we already wrote it into $set above, so
    # $setOnInsert only carries the install-time defaults.
    insert_doc = {
        "user_id": user_id,
        "device_id": device_id,
        "created_at": now,
    }
    if not mark_trusted:
        # Only seed is_trusted=False on insert when caller didn't
        # ask to promote — otherwise $set already covers it.
        insert_doc["is_trusted"] = False

    await db.devices.update_one(
        {"user_id": user_id, "device_id": device_id},
        {
            "$set": set_doc,
            "$setOnInsert": insert_doc,
        },
        upsert=True,
    )
    doc = await db.devices.find_one(
        {"user_id": user_id, "device_id": device_id},
        {"_id": 0},
    )
    return doc or {}


async def is_trusted(user_id: str, device_id: str) -> bool:
    """Return True if the device has been promoted to trusted. Used by
    the step-up flow — trusted devices can skip OTP on routine actions
    but still trigger it on sensitive ones (delete account / AA link)."""
    from server import db
    await ensure_indexes()
    doc = await db.devices.find_one(
        {"user_id": user_id, "device_id": device_id},
        {"is_trusted": 1},
    )
    return bool(doc and doc.get("is_trusted"))


async def list_for_user(user_id: str) -> list[dict]:
    """Return the user's known devices, most-recently-used first."""
    from server import db
    await ensure_indexes()
    cursor = db.devices.find({"user_id": user_id}, {"_id": 0}).sort("last_used_at", -1)
    return [doc async for doc in cursor]


async def forget_device(user_id: str, device_id: str) -> bool:
    from server import db
    await ensure_indexes()
    r = await db.devices.delete_one({"user_id": user_id, "device_id": device_id})
    return r.deleted_count > 0


__all__ = [
    "ensure_indexes",
    "register_device",
    "is_trusted",
    "list_for_user",
    "forget_device",
]
