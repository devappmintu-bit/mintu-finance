"""
services/session_service.py — Round 88 auth upgrade.

Sessions collection — the refresh-token source-of-truth.

Document shape (Mongo):
  {
    _id:            ObjectId,
    user_id:        str (hex)         — ref users._id
    device_id:      str  (uuid)        — stable per-device identifier
    refresh_hash:   str  (sha256 hex)  — NEVER the plaintext
    family_id:      str  (uuid)        — groups tokens from the same login
    created_at:     datetime (utc)
    expires_at:     datetime (utc)
    revoked_at:     datetime | None    — set by logout OR by reuse detection
    reused:         bool              — true when a rotated token is presented
    last_used_at:   datetime (utc)    — updated on successful refresh
    user_agent:     str | None
    ip:             str | None
  }

Indexes (best-effort, created at module import — idempotent):
  • (user_id)                 for listing sessions in /auth/me
  • (refresh_hash)            unique, for O(1) refresh lookup
  • (family_id)               for family-wide revocation
  • (expires_at) TTL          auto-expire at Mongo level

Security posture:
  • Only the HASH is stored — compromise of the DB never leaks bearer tokens.
  • Rotation: /auth/refresh always returns a NEW plaintext + HASH, marks the
    old session `revoked_at=now`, and inserts a new session with the same
    `family_id`.
  • Reuse detection: if a client presents a refresh token whose session is
    already `revoked_at`, we set `reused=true` and revoke the WHOLE family
    (force re-OTP). OWASP / IETF draft-ietf-oauth-browser-based-apps §8.
"""
from __future__ import annotations

import hmac
import uuid
from typing import Optional

from bson import ObjectId

from core.time import utc_now
from services.token_service import (
    hash_refresh_token,
    mint_refresh_token,
    refresh_expiry,
)


# ── Index bootstrap — runs once at module import ─────────────────────
_INDEXES_READY = False


async def ensure_indexes() -> None:
    """Idempotent. Creates the four indexes on first access. Called by
    `create_session` + `find_by_refresh` on demand so we don't need a
    lifecycle hook."""
    global _INDEXES_READY
    if _INDEXES_READY:
        return
    from server import db  # deferred to break circular import
    await db.sessions.create_index("user_id")
    await db.sessions.create_index("refresh_hash", unique=True)
    await db.sessions.create_index("family_id")
    # TTL index — Mongo auto-deletes expired docs.
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    _INDEXES_READY = True


# ── Create ────────────────────────────────────────────────────────────
async def create_session(
    user_id: str,
    device_id: str,
    *,
    family_id: Optional[str] = None,
    user_agent: Optional[str] = None,
    ip: Optional[str] = None,
) -> tuple[str, str]:
    """Mint a refresh token and persist its hash. Returns
    ``(plaintext, family_id)`` — caller hands plaintext to the client,
    keeps family_id for rotation bookkeeping if needed.
    """
    from server import db
    await ensure_indexes()

    plaintext, digest = mint_refresh_token()
    fam = family_id or uuid.uuid4().hex
    now = utc_now()

    doc = {
        "user_id": user_id,
        "device_id": device_id,
        "refresh_hash": digest,
        "family_id": fam,
        "created_at": now,
        "expires_at": refresh_expiry(),
        "revoked_at": None,
        "reused": False,
        "last_used_at": now,
        "user_agent": user_agent,
        "ip": ip,
    }
    await db.sessions.insert_one(doc)
    return plaintext, fam


# ── Rotate ────────────────────────────────────────────────────────────
async def rotate_refresh(plaintext: str) -> Optional[dict]:
    """Exchange an in-flight refresh token for a new one.

    Returns a dict ``{user_id, device_id, new_refresh_token, family_id}``
    on success, or ``None`` on failure (expired / revoked / unknown).

    Failure branches:
      • plaintext not found                → return None (silent reject)
      • session found but already revoked  → REUSE DETECTED
                                             → revoke whole family
                                             → return None (force re-OTP)
      • session expired                    → return None
    """
    from server import db
    await ensure_indexes()

    digest = hash_refresh_token(plaintext)
    session = await db.sessions.find_one({"refresh_hash": digest})
    if not session:
        return None

    # Constant-time comparison is moot here (we already hashed the
    # client input), but hmac.compare_digest on the hex is still a
    # belt-and-braces step against any future logic drift.
    if not hmac.compare_digest(session["refresh_hash"], digest):
        return None

    now = utc_now()

    if session.get("revoked_at"):
        # REUSE of a rotated token → assume attacker has copy.
        # Revoke the entire family so the legit device must re-OTP.
        await db.sessions.update_many(
            {"family_id": session["family_id"], "revoked_at": None},
            {"$set": {"revoked_at": now, "reused": True}},
        )
        return None

    if session["expires_at"].replace(tzinfo=None) <= now.replace(tzinfo=None):
        return None

    # Mark the current session revoked and issue a new one in the same
    # family. Atomic-ish: we don't need a txn here because MongoDB
    # single-doc updates are atomic and the legacy session going
    # revoked before the new one is stored is safe (worst case: a
    # concurrent re-use of the SAME plaintext also re-uses and the
    # family is revoked → exactly the desired reuse-detection path).
    await db.sessions.update_one(
        {"_id": session["_id"]},
        {"$set": {"revoked_at": now, "last_used_at": now}},
    )

    new_plaintext, _ = await create_session(
        user_id=session["user_id"],
        device_id=session["device_id"],
        family_id=session["family_id"],
        user_agent=session.get("user_agent"),
        ip=session.get("ip"),
    )
    return {
        "user_id": session["user_id"],
        "device_id": session["device_id"],
        "new_refresh_token": new_plaintext,
        "family_id": session["family_id"],
    }


# ── Revoke (logout) ───────────────────────────────────────────────────
async def revoke_by_refresh(plaintext: str) -> bool:
    """Logout — revoke the session matching this refresh token. Returns
    True if a session was updated."""
    from server import db
    await ensure_indexes()
    digest = hash_refresh_token(plaintext)
    now = utc_now()
    result = await db.sessions.update_one(
        {"refresh_hash": digest, "revoked_at": None},
        {"$set": {"revoked_at": now}},
    )
    return result.modified_count > 0


async def revoke_by_id(session_id: str, user_id: str) -> bool:
    """Revoke a single session by its `_id`, scoped to the owning user.

    Returns True if the session was found and revoked. Ownership check
    is enforced so a compromised access token can't kick other users.
    """
    from server import db
    await ensure_indexes()
    try:
        oid = ObjectId(session_id)
    except Exception:      # noqa: BLE001
        return False
    now = utc_now()
    result = await db.sessions.update_one(
        {"_id": oid, "user_id": user_id, "revoked_at": None},
        {"$set": {"revoked_at": now}},
    )
    return result.modified_count > 0


async def revoke_all_for_user(user_id: str) -> int:
    """Nuclear option — revoke every session for this user. Used by
    delete-account flow and \"logout from all devices\"."""
    from server import db
    await ensure_indexes()
    now = utc_now()
    result = await db.sessions.update_many(
        {"user_id": user_id, "revoked_at": None},
        {"$set": {"revoked_at": now}},
    )
    return result.modified_count


# ── List ──────────────────────────────────────────────────────────────
async def list_active_for_user(user_id: str) -> list[dict]:
    """Return all non-revoked, non-expired sessions for the user — used
    by /auth/me to show a \"your logged-in devices\" list."""
    from server import db
    await ensure_indexes()
    now = utc_now()
    cursor = db.sessions.find(
        {
            "user_id": user_id,
            "revoked_at": None,
            "expires_at": {"$gt": now},
        },
        {"refresh_hash": 0},   # never leak the hash over the wire
    ).sort("last_used_at", -1)
    out: list[dict] = []
    async for doc in cursor:
        out.append({
            "id": str(doc["_id"]),
            "device_id": doc["device_id"],
            "created_at": doc["created_at"].isoformat(),
            "last_used_at": doc["last_used_at"].isoformat(),
            "expires_at": doc["expires_at"].isoformat(),
            "user_agent": doc.get("user_agent"),
            "ip": doc.get("ip"),
        })
    return out


__all__ = [
    "ensure_indexes",
    "create_session",
    "rotate_refresh",
    "revoke_by_refresh",
    "revoke_by_id",
    "revoke_all_for_user",
    "list_active_for_user",
]
