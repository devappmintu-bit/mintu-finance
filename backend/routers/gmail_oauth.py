"""Gmail OAuth + bank email auto-import router.

Flow:
  1. Frontend calls GET /api/oauth/gmail/start (authenticated) → backend returns
     the Google consent URL with a short-lived `state` tied to user_id.
  2. User completes consent → Google redirects to
     GET /api/oauth/gmail/callback?code=...&state=... → backend exchanges
     the code, saves access_token + refresh_token to `gmail_tokens` collection,
     redirects the browser to APP_DEEPLINK_BASE/gmail-connected?success=1.
  3. Frontend polls GET /api/gmail/status to show connected email + last_sync.
  4. Background worker every 15 min: iterate each connected user → fetch new
     messages (since `history_id` OR last 30 days on first run) → parse via
     routers.gmail_parser → insert deduped rows into `db.transactions`.
"""
import os
import uuid
import base64
import logging
import asyncio
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from core.time import utc_now
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from core import db, get_current_user
from routers.gmail_parser import parse_bank_body, GMAIL_QUERY, BANK_SENDERS

router = APIRouter(tags=["gmail"])
logger = logging.getLogger("gmail_oauth")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
# Default deep-link base — frontend's expo-auth-session generates `mintu://gmail-connected`
# via makeRedirectUri({ scheme: 'mintu', path: 'gmail-connected' }).
# We intentionally store WITHOUT the path so callers can append it cleanly.
APP_DEEPLINK_BASE = (os.getenv("APP_DEEPLINK_BASE", "").strip().rstrip("/")) or "mintu:/"


def _deeplink(path: str, **params) -> str:
    """Compose a clean deep-link URL — guards against double-slash issues
    from various APP_DEEPLINK_BASE conventions (`mintu://`, `mintu:/`,
    `https://app.example.com`)."""
    p = path.lstrip("/")
    base = APP_DEEPLINK_BASE.rstrip("/")
    qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
    url = f"{base}/{p}"
    if qs:
        url += f"?{qs}"
    return url

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


def _client_config() -> dict:
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [REDIRECT_URI],
        }
    }


async def _save_state(state: str, user_id: str, return_uri: Optional[str] = None) -> None:
    await db.oauth_states.insert_one({
        "state": state,
        "user_id": user_id,
        "return_uri": return_uri,
        "created_at": utc_now(),
        "expires_at": utc_now() + timedelta(minutes=10),
    })


async def _consume_state(state: str) -> Optional[dict]:
    rec = await db.oauth_states.find_one({"state": state})
    if not rec:
        return None
    await db.oauth_states.delete_one({"_id": rec["_id"]})
    if rec["expires_at"] < utc_now():
        return None
    return {"user_id": rec["user_id"], "return_uri": rec.get("return_uri")}


def _creds_from_doc(doc: dict) -> Credentials:
    return Credentials(
        token=doc.get("access_token"),
        refresh_token=doc.get("refresh_token"),
        token_uri=doc.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )


async def _get_refreshed_creds(user_id: str) -> Optional[Credentials]:
    doc = await db.gmail_tokens.find_one({"user_id": user_id})
    if not doc or not doc.get("refresh_token"):
        return None
    creds = _creds_from_doc(doc)
    expires = doc.get("expires_at")
    needs_refresh = True
    if expires:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        needs_refresh = utc_now() >= expires - timedelta(minutes=2)
    if needs_refresh:
        try:
            await asyncio.to_thread(creds.refresh, GoogleRequest())
            await db.gmail_tokens.update_one(
                {"user_id": user_id},
                {"$set": {
                    "access_token": creds.token,
                    "expires_at": creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None,
                    "refreshed_at": utc_now(),
                }},
            )
        except Exception as e:
            logger.warning(f"Token refresh failed for {user_id}: {e}")
            return None
    return creds


# ══════════════════════════════════════════════════════════════════════
#  OAUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════
@router.get("/oauth/gmail/start")
async def gmail_oauth_start(
    request: Request,
    return_uri: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """Return the Google consent URL. Frontend opens it in a webview.

    `return_uri` is the deep-link the frontend's WebBrowser is listening on
    (e.g. `mintu://gmail-connected` for native, or `https://app/gmail-connected`
    for web). The backend stores it tied to the OAuth `state` and redirects
    to it after the Google callback succeeds. This makes the same backend
    work for web preview, dev-client, and standalone iOS/Android — no env
    var change required per platform.

    SECURITY: only allow URIs that match our app's scheme or known web
    origin to prevent open-redirect abuse.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Gmail integration not configured on server")

    # Validate return_uri against allowlist (scheme `mintu:` or our APP_DEEPLINK_BASE host).
    safe_return_uri: Optional[str] = None
    if return_uri:
        if return_uri.startswith("mintu:") or return_uri.startswith(APP_DEEPLINK_BASE):
            safe_return_uri = return_uri
        else:
            logger.warning(f"Rejected return_uri (not in allowlist): {return_uri[:120]}")

    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI)
    url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    await _save_state(state, user_id, return_uri=safe_return_uri)
    return {"auth_url": url}


@router.get("/oauth/gmail/callback")
async def gmail_oauth_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Exchange the auth code for tokens and store them per user."""
    if error:
        # We don't have state if Google omitted it, so fall back to default deep-link.
        if state:
            consumed = await _consume_state(state)
            override = (consumed or {}).get("return_uri") if consumed else None
            if override:
                sep = "&" if "?" in override else "?"
                return RedirectResponse(url=f"{override}{sep}success=0&error={error}")
        return RedirectResponse(url=_deeplink("gmail-connected", success=0, error=error))
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")
    consumed = await _consume_state(state)
    if not consumed:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    user_id = consumed["user_id"]
    return_uri_override = consumed.get("return_uri")

    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # Google reorders scopes
        await asyncio.to_thread(flow.fetch_token, code=code)
    creds = flow.credentials

    # Fetch email address for UX
    email = None
    try:
        svc = build("gmail", "v1", credentials=creds)
        prof = await asyncio.to_thread(lambda: svc.users().getProfile(userId="me").execute())
        email = prof.get("emailAddress")
    except Exception as e:
        logger.warning(f"Could not fetch Gmail profile: {e}")

    expires_at = creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None
    await db.gmail_tokens.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "email": email,
            "access_token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "scopes": list(creds.scopes or SCOPES),
            "expires_at": expires_at,
            "connected_at": utc_now(),
            "last_sync": None,
            "last_msg_id": None,
        }},
        upsert=True,
    )
    logger.info(f"✅ Gmail connected for user={user_id} email={email}")

    # Kick off an immediate initial sync in the background (don't block callback)
    try:
        asyncio.create_task(sync_user_inbox(user_id, initial=True))
    except Exception:
        pass

    return RedirectResponse(url=(
        f"{return_uri_override}{'&' if '?' in return_uri_override else '?'}success=1&email={email or ''}"
        if return_uri_override
        else _deeplink("gmail-connected", success=1, email=email or "")
    ))


@router.get("/gmail/status")
async def gmail_status(user_id: str = Depends(get_current_user)):
    doc = await db.gmail_tokens.find_one({"user_id": user_id})
    if not doc:
        return {"connected": False}
    return {
        "connected": True,
        "email": doc.get("email"),
        "connected_at": (doc.get("connected_at") or utc_now()).isoformat() if doc.get("connected_at") else None,
        "last_sync": doc.get("last_sync").isoformat() if doc.get("last_sync") else None,
        "imported_count": int(doc.get("imported_count", 0) or 0),
    }


@router.delete("/gmail/disconnect")
async def gmail_disconnect(user_id: str = Depends(get_current_user)):
    res = await db.gmail_tokens.delete_one({"user_id": user_id})
    return {"disconnected": bool(res.deleted_count), "message": "Gmail disconnected"}


@router.post("/gmail/sync-now")
async def gmail_sync_now(user_id: str = Depends(get_current_user)):
    result = await sync_user_inbox(user_id, initial=False)
    return result


# ══════════════════════════════════════════════════════════════════════
#  SYNC + PARSE
# ══════════════════════════════════════════════════════════════════════
async def _extract_body(payload: dict) -> str:
    """Recursively walk payload and decode text/plain or text/html base64url body."""
    parts = [payload]
    texts = []
    while parts:
        p = parts.pop()
        mime = p.get("mimeType", "")
        if mime.startswith("text/"):
            data = (p.get("body") or {}).get("data")
            if data:
                try:
                    decoded = base64.urlsafe_b64decode(data.encode()).decode("utf-8", errors="ignore")
                    texts.append(decoded)
                except Exception:
                    continue
        parts.extend(p.get("parts") or [])
    # Merge html+plain; strip HTML tags crudely
    raw = "\n".join(texts)
    import re as _re
    stripped = _re.sub(r"<[^>]+>", " ", raw)
    stripped = _re.sub(r"\s+", " ", stripped)
    return stripped.strip()


def _header(headers: list, name: str) -> str:
    for h in headers or []:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


async def sync_user_inbox(user_id: str, initial: bool = False) -> dict:
    """Fetch new bank emails for one user, parse → insert as transactions.
    Returns summary dict {fetched, imported, skipped, error?}."""
    creds = await _get_refreshed_creds(user_id)
    if not creds:
        return {"fetched": 0, "imported": 0, "skipped": 0, "error": "not_connected"}

    doc = await db.gmail_tokens.find_one({"user_id": user_id}) or {}
    # Build query: restrict to bank senders + (newer than last_sync on incremental)
    q = GMAIL_QUERY
    if initial or not doc.get("last_sync"):
        q += " newer_than:30d"
    else:
        q += " newer_than:2d"  # small overlap for safety; dedup handled below

    try:
        svc = build("gmail", "v1", credentials=creds)
        lst = await asyncio.to_thread(
            lambda: svc.users().messages().list(userId="me", q=q, maxResults=50).execute()
        )
    except HttpError as e:
        logger.warning(f"Gmail list failed for {user_id}: {e}")
        return {"fetched": 0, "imported": 0, "skipped": 0, "error": "gmail_api_error"}
    except Exception as e:
        logger.warning(f"Gmail list failed for {user_id}: {e}")
        return {"fetched": 0, "imported": 0, "skipped": 0, "error": str(e)[:120]}

    messages = lst.get("messages") or []
    fetched = len(messages)
    imported = 0
    skipped = 0
    last_msg_id = doc.get("last_msg_id")

    for m in messages:
        mid = m["id"]
        # Already processed? (check dedup index)
        already = await db.transactions.find_one({"user_id": user_id, "source_msg_id": mid}, {"_id": 1})
        if already:
            skipped += 1
            continue
        try:
            msg = await asyncio.to_thread(
                lambda mm=mid: svc.users().messages().get(userId="me", id=mm, format="full").execute()
            )
        except Exception as e:
            logger.warning(f"Gmail get failed mid={mid}: {e}")
            skipped += 1
            continue

        headers = (msg.get("payload") or {}).get("headers") or []
        subject = _header(headers, "Subject")
        from_h = _header(headers, "From")
        internal_ts_ms = int(msg.get("internalDate") or 0)
        received_at = datetime.utcfromtimestamp(internal_ts_ms / 1000) if internal_ts_ms else None

        # Hard filter: ensure sender is one of our bank senders (query should already but re-check)
        if not any(s in from_h.lower() for s in BANK_SENDERS):
            skipped += 1
            continue

        body = await _extract_body(msg.get("payload") or {})
        parsed = parse_bank_body(body, subject=subject, received_at=received_at)
        if not parsed:
            skipped += 1
            continue

        # Secondary de-dup: user+amount+date+type within ±1 day
        same_day = await db.transactions.find_one({
            "user_id": user_id,
            "amount": parsed["amount"],
            "type": parsed["type"],
            "date": {
                "$gte": parsed["date"] - timedelta(days=1),
                "$lte": parsed["date"] + timedelta(days=1),
            },
            "source": "gmail",
        }, {"_id": 1})
        if same_day:
            skipped += 1
            continue

        txn = {
            "user_id": user_id,
            "amount": parsed["amount"],
            "type": parsed["type"],
            "category": parsed["category"],
            "description": parsed["description"],
            "merchant": parsed.get("merchant"),
            "last4": parsed.get("last4"),
            "date": parsed["date"],
            "source": "gmail",
            "source_msg_id": mid,
            "source_from": from_h,
            "created_at": utc_now(),
        }
        await db.transactions.insert_one(txn)
        imported += 1
        last_msg_id = mid

    await db.gmail_tokens.update_one(
        {"user_id": user_id},
        {"$set": {
            "last_sync": utc_now(),
            "last_msg_id": last_msg_id or doc.get("last_msg_id"),
        }, "$inc": {"imported_count": imported}},
    )
    # If Gmail import added rows, bust derivative caches (R118
    # intelligence + analytics) so the home dashboard reflects the
    # newly-imported transactions on its very next paint.
    if imported > 0:
        try:
            from core.cache import invalidate_user_transaction_caches
            invalidate_user_transaction_caches(user_id)
        except Exception:
            pass
    logger.info(f"Gmail sync user={user_id} fetched={fetched} imported={imported} skipped={skipped}")
    return {"fetched": fetched, "imported": imported, "skipped": skipped}


# ══════════════════════════════════════════════════════════════════════
#  BACKGROUND WORKER — runs every 15 min, iterates all connected users
# ══════════════════════════════════════════════════════════════════════
_sync_task = None


async def _sync_loop():
    await asyncio.sleep(30)  # small delay after boot
    while True:
        try:
            connected = db.gmail_tokens.find({}, {"user_id": 1})
            async for u in connected:
                try:
                    await sync_user_inbox(u["user_id"], initial=False)
                except Exception as e:
                    logger.warning(f"Worker sync failed for {u.get('user_id')}: {e}")
        except Exception as e:
            logger.warning(f"Gmail sync loop error: {e}")
        await asyncio.sleep(15 * 60)  # 15 min


def start_gmail_worker():
    """Fire-and-forget background task. Called from server startup."""
    global _sync_task
    if _sync_task and not _sync_task.done():
        return
    try:
        _sync_task = asyncio.create_task(_sync_loop())
        logger.info("📧 Gmail sync worker started (15-min interval)")
    except Exception as e:
        logger.warning(f"Could not start Gmail worker: {e}")
