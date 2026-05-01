"""core/users.py — centralised user document accessors.

Why this exists
---------------
Static analysis (Phase 3b detector) surfaced that
`db.users.find_one({"_id": ObjectId(user_id)})` appears in **27 routers**
verbatim. That's fine for correctness today, but:

  1. If we ever add soft-delete filtering (`deleted_at: null`), we'd need
     to touch every one of the 27 sites.
  2. Caching user reads (hot path for auth + profile) can't be bolted on
     centrally if every router queries the collection directly.
  3. Drift risk — one router forgetting the ObjectId wrap would 500.

This module exposes a single `get_user_by_id()` helper so new routers
pick it up and legacy sites can migrate one-at-a-time without coordination.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from core import db
from core.ids import safe_oid, try_oid


async def get_user_by_id(user_id: str, *, validate: bool = True) -> Optional[Dict[str, Any]]:
    """Fetch a user document by its string ID.

    Parameters
    ----------
    user_id : str
        24-char hex string. Usually sourced from ``Depends(get_current_user)``.
    validate : bool, default True
        When True (router path), a malformed ID raises 400.
        When False (background worker / trusted internal call), invalid IDs
        silently return None.

    Returns
    -------
    dict or None
        The user document (or None if not found).
    """
    oid = safe_oid(user_id, field_name="user_id") if validate else try_oid(user_id)
    if oid is None:
        return None
    return await db.users.find_one({"_id": oid})


async def get_user_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    """Fetch user by phone number (E.164 without +). Used by auth flow."""
    if not phone:
        return None
    return await db.users.find_one({"phone": phone})


async def user_exists(user_id: str) -> bool:
    """Cheap existence check — projects _id only to avoid loading fields."""
    oid = try_oid(user_id)
    if oid is None:
        return False
    doc = await db.users.find_one({"_id": oid}, {"_id": 1})
    return doc is not None
