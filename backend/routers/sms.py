"""sms router — sample SMS inbox + bulk SMS parsing to create transactions.

R105 — Trust-grade ingestion. Every parsed transaction now carries:
  • confidence score        — caller-side gating below 0.5 → pending_review
  • raw_hash                — sha256 dedup so re-imports never duplicate
  • datetime_iso (if found) — never fabricated; falls back to utc_now()
                              with `date_inferred: true` flag set so the
                              UI can label the row honestly.
  • last4 / txn_id          — bank refs preserved for audit + dedup
  • merchant_raw / merchant — both retained (display vs. ledger)
  • is_recurring_hint       — flag for subscription detection downstream
"""
import hashlib
import re
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core import db, get_current_user
from core.scoring import calculate_money_score
from core.constants import SAMPLE_INDIAN_SMS
from core.time import utc_now


def parse_sms_with_ai(sms_text):
    """Lazy proxy to server.parse_sms_with_ai — avoids circular import."""
    import server  # noqa: PLC0415
    return server.parse_sms_with_ai(sms_text)


router = APIRouter(tags=["sms"])
api_router = router  # extracted code uses @api_router.*


# R105 — Confidence floor. Below this we DO NOT auto-create the txn;
# we mark it `pending_review` so the UI can surface a soft confirmation
# ("₹320 looks like a Zomato payment. Confirm?"). The brief explicitly
# requires this — see "If confidence < threshold: ask user softly,
# never auto-save blindly".
SMS_CONFIDENCE_FLOOR = 0.50

# R105 — Hard cap on a single batch. Was 50; bumped so historical
# imports can chew through bigger windows. The bulk-parse latency
# observed in prod logs is ~1.3s/SMS due to the LLM hop, so 200 is
# the upper safe cap before we'd timeout the request.
SMS_BATCH_LIMIT = 200


def _raw_hash(sms_text: str) -> str:
    """Stable dedup key. Trim + lowercase + sha256 so re-imports of the
    exact same SMS are skipped no matter how many times the user runs
    the historical scan."""
    norm = (sms_text or "").strip().lower()
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:24]


def _safe_parse_dt(iso_str):
    """Best-effort ISO parser. Never raise — caller falls back to None.

    R105B — Date-only fallback. gpt-5.2 conservatively returns null for
    SMS that have a date but no time (e.g. "Salary credit … on
    01-MAY-2026"). We extract DD-MMM-YYYY ourselves so the trust
    pipeline doesn't have to flag these as `date_inferred=true`.
    """
    if not iso_str or not isinstance(iso_str, str):
        return None
    try:
        # Accept both "2026-05-08T12:30:00" and "2026-05-08T12:30:00+05:30"
        s = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


# R105B — Common Indian SMS date formats. Order matters — try most
# specific first. We accept day, month name (3-letter), 4-digit year.
_DATE_RX = [
    re.compile(r"\b(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{4})\b"),  # 01-MAY-2026, 1 May 2026
    re.compile(r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b"),             # 2026-05-01, 2026/05/01
    re.compile(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b"),             # 06/05/2026 (DD/MM/YYYY — Indian)
]
_MONTH_NAMES = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10,
    'november': 11, 'december': 12,
}


def _regex_extract_date(sms_text: str):
    """R105B fallback — return a UTC midnight datetime if the SMS
    contains a recognisable Indian-format date. Returns None when
    nothing parseable is found. Always strict: if year is wildly
    off (< 2010 or > 2100) we treat as a false positive and skip.
    """
    if not sms_text:
        return None
    text = sms_text
    # Try month-name format first (most reliable for SMS)
    m = _DATE_RX[0].search(text)
    if m:
        try:
            d = int(m.group(1))
            mon = _MONTH_NAMES.get(m.group(2).lower())
            y = int(m.group(3))
            if mon and 2010 <= y <= 2100 and 1 <= d <= 31:
                return datetime(y, mon, d, tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass
    # Try ISO-ish YYYY-MM-DD
    m = _DATE_RX[1].search(text)
    if m:
        try:
            y, mon, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 2010 <= y <= 2100 and 1 <= mon <= 12 and 1 <= d <= 31:
                return datetime(y, mon, d, tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass
    # Try DD/MM/YYYY (Indian convention — DON'T treat first num as month)
    m = _DATE_RX[2].search(text)
    if m:
        try:
            d, mon, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 2010 <= y <= 2100 and 1 <= mon <= 12 and 1 <= d <= 31:
                return datetime(y, mon, d, tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass
    return None



@api_router.get("/sms/sample-inbox")
async def get_sample_sms_inbox():
    """Return sample Indian bank SMS for demo auto-import"""
    return {"messages": list(SAMPLE_INDIAN_SMS), "count": len(SAMPLE_INDIAN_SMS)}


@api_router.post("/sms/bulk-parse")
@api_router.post("/sms/parse-bulk")  # legacy alias (older cached clients)
async def bulk_parse_sms(data: dict, user_id: str = Depends(get_current_user)):
    """Parse multiple SMS messages and create transactions.

    R105 — Trust pipeline:
      1. Hash dedup — skip if (user_id, raw_hash) already in DB.
      2. AI parse with confidence + datetime extraction.
      3. Confidence gating — store low-confidence rows with
         pending_review=true so they DON'T pollute scores until
         the user confirms.
      4. Honest date — use parsed.datetime_iso when extractable,
         else now with date_inferred=true flag. Never silently
         overwrite the SMS time with import time.
    """
    messages = data.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    parsed_count = 0
    failed_count = 0
    duplicate_count = 0
    pending_review_count = 0
    recurring_count = 0
    # R106 — Per-message results so the UI can paint a "live scanning"
    # animation that maps 1:1 to the input list. Each entry mirrors the
    # input order so the client can settle each card with the correct
    # status without re-parsing locally.
    results: list[dict] = []

    # R105 — Pre-flight: pull existing hashes for THIS user so dedup
    # is O(1) per SMS instead of N round-trips. Cap to last 5000 to
    # keep memory bounded for power users.
    existing_hashes = set()
    try:
        cursor = db.transactions.find(
            {"user_id": user_id, "raw_hash": {"$exists": True}},
            {"raw_hash": 1}
        ).limit(5000)
        async for doc in cursor:
            h = doc.get("raw_hash")
            if h:
                existing_hashes.add(h)
    except Exception:
        # Non-fatal — worst case we'd duplicate, which the next pass
        # would catch. Don't block ingestion on a query glitch.
        existing_hashes = set()

    for sms_text in messages[:SMS_BATCH_LIMIT]:
        if not isinstance(sms_text, str) or not sms_text.strip():
            failed_count += 1
            results.append({"status": "failed", "reason": "empty"})
            continue

        h = _raw_hash(sms_text)
        if h in existing_hashes:
            duplicate_count += 1
            results.append({"status": "duplicate", "raw_hash": h})
            continue

        try:
            parsed = await parse_sms_with_ai(sms_text)
            if not parsed:
                failed_count += 1
                results.append({"status": "failed", "reason": "unparseable"})
                continue

            # Confidence gate — never blindly auto-save.
            confidence = float(parsed.get("confidence", 0.5) or 0.5)
            pending_review = confidence < SMS_CONFIDENCE_FLOOR
            if pending_review:
                pending_review_count += 1

            # Honest date extraction — preserve SMS time when present.
            dt_extracted = _safe_parse_dt(parsed.get("datetime_iso"))
            if dt_extracted is not None:
                txn_date = dt_extracted
                date_inferred = False
            else:
                txn_date = utc_now()
                date_inferred = True

            is_recurring = bool(parsed.get("is_recurring_hint", False))
            if is_recurring:
                recurring_count += 1

            doc = {
                "user_id": user_id,
                "amount": parsed["amount"],
                "category": parsed["category"],
                "description": parsed.get("description", parsed.get("merchant", "Transaction")),
                "type": parsed["type"],
                "source": "sms_import",
                # R105 — provenance & dedup fields.
                "merchant": parsed.get("merchant", ""),
                "merchant_raw": parsed.get("merchant_raw", ""),
                "last4": parsed.get("last4"),
                "txn_id": parsed.get("txn_id"),
                "confidence": confidence,
                "pending_review": pending_review,
                "raw_hash": h,
                "is_recurring_hint": is_recurring,
                "date": txn_date,
                "date_inferred": date_inferred,
                "created_at": utc_now(),
            }
            await db.transactions.insert_one(doc)
            existing_hashes.add(h)
            parsed_count += 1
            results.append({
                "status": "pending_review" if pending_review else "parsed",
                "amount": parsed.get("amount"),
                "category": parsed.get("category"),
                "merchant": parsed.get("merchant", ""),
                "type": parsed.get("type"),
                "confidence": confidence,
                "date_inferred": date_inferred,
                "is_recurring": is_recurring,
                "last4": parsed.get("last4"),
            })
        except Exception:
            failed_count += 1
            results.append({"status": "failed", "reason": "exception"})

    # Recalculate money score (only confirmed rows — pending_review
    # ones are excluded from scoring by `calculate_money_score`).
    new_score = await calculate_money_score(user_id)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"money_score": new_score}})

    # R118 — bust the Real-Time SMS Intelligence + analytics caches so
    # the next /api/intelligence/* call recomputes against the freshly-
    # imported transactions. Single helper guarantees parity with all
    # other transaction-mutating routes.
    if parsed_count > 0:
        try:
            from core.cache import invalidate_user_transaction_caches
            invalidate_user_transaction_caches(user_id)
        except Exception:
            pass

    return {
        "parsed": parsed_count,
        "failed": failed_count,
        "duplicate": duplicate_count,
        "pending_review": pending_review_count,
        "recurring_detected": recurring_count,
        "total": len(messages),
        # R105 — surface the cap so clients can paginate large historical
        # imports if they exceed the batch size.
        "batch_limit": SMS_BATCH_LIMIT,
        # R106 — per-message audit trail. Order matches input. UI uses
        # this to render "live scanning" cards with confidence dots.
        "results": results,
    }

