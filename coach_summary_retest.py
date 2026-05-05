"""
Re-test: Verify that POST /api/coach/chat triggers a background summarise
that persists to the `user_coach_context` Mongo collection. After the
fire-and-forget kick (now properly awaited with `await
coach_context.kick_summarise(...)` which schedules create_task and
returns), the document for the user must have:
  - non-empty `last_session_summary`
  - at least one entry in `last_5_insights`
within 15 seconds of the API call.

Credentials: phone 9876543210 / OTP 123456 (Auth V2).
"""
import os
import asyncio
import time
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "mintu_database"


def auth() -> tuple[str, str]:
    """Send OTP then verify, return (token, user_id)."""
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    # Ignore rate-limit (30s window) — treat 200/429 as OK
    assert r.status_code in (200, 429), f"send-otp failed: {r.status_code} {r.text}"

    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": PHONE, "otp": OTP},
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    user = body.get("user") or {}
    user_id = user.get("id") or body.get("user_id")
    assert token, f"no token in verify-otp response: {body}"
    assert user_id, f"no user_id in verify-otp response: {body}"
    return token, user_id


async def wait_for_summary(user_id: str, timeout_s: float = 15.0) -> dict:
    """Poll the user_coach_context doc until summary + insights are present."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    deadline = time.time() + timeout_s
    last_doc: dict = {}
    attempts = 0
    while time.time() < deadline:
        attempts += 1
        doc = await db.user_coach_context.find_one({"user_id": user_id}) or {}
        last_doc = doc
        summary = (doc.get("last_session_summary") or "").strip()
        insights = doc.get("last_5_insights") or []
        if summary and len(insights) >= 1:
            client.close()
            return {
                "ok": True,
                "attempts": attempts,
                "summary_len": len(summary),
                "insight_count": len(insights),
                "doc": doc,
            }
        await asyncio.sleep(0.5)
    client.close()
    return {
        "ok": False,
        "attempts": attempts,
        "summary_len": len((last_doc.get("last_session_summary") or "")),
        "insight_count": len(last_doc.get("last_5_insights") or []),
        "doc": last_doc,
    }


async def main() -> None:
    print("=" * 70)
    print("Round 90 Coach Summary Persistence Re-test")
    print("=" * 70)

    # 1. Auth
    print("\n[1/4] Authenticating...")
    token, user_id = auth()
    print(f"   ✓ token obtained (len={len(token)}), user_id={user_id}")

    # 2. Clean prior state (optional — we want to verify FRESH write)
    print("\n[2/4] Snapshotting prior user_coach_context state...")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    prior = await db.user_coach_context.find_one({"user_id": user_id}) or {}
    prior_summary = (prior.get("last_session_summary") or "").strip()
    prior_insights = prior.get("last_5_insights") or []
    print(f"   prior summary_len={len(prior_summary)}, prior insight_count={len(prior_insights)}")

    # Delete the doc so we know ANY summary is fresh.
    del_res = await db.user_coach_context.delete_one({"user_id": user_id})
    print(f"   cleared prior doc (deleted_count={del_res.deleted_count})")
    client.close()

    # 3. Call POST /api/coach/chat
    print("\n[3/4] POST /api/coach/chat ...")
    t0 = time.time()
    r = requests.post(
        f"{BASE}/coach/chat",
        json={"message": "Am I overspending on food this month?", "lang": "en"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    elapsed = time.time() - t0
    print(f"   status={r.status_code} elapsed={elapsed:.2f}s")
    assert r.status_code == 200, f"coach/chat failed: {r.status_code} {r.text[:400]}"
    body = r.json()
    reply_text = (body.get("reply") or "").strip()
    print(f"   reply_len={len(reply_text)}; confidence={body.get('confidence')}")
    assert reply_text, "empty coach reply text — cannot assert summarisation"

    # 4. Poll mongo for user_coach_context summary + insights within 15s
    print("\n[4/4] Polling user_coach_context for persisted summary (timeout=15s)...")
    result = await wait_for_summary(user_id, timeout_s=15.0)
    print(f"   attempts={result['attempts']}")
    print(f"   summary_len={result['summary_len']}")
    print(f"   insight_count={result['insight_count']}")

    if result["ok"]:
        doc = result["doc"]
        print("\n" + "=" * 70)
        print("✅ PASS — user_coach_context persisted within 15s")
        print("=" * 70)
        print(f"last_session_summary (first 200 chars):\n  {doc.get('last_session_summary', '')[:200]}")
        print(f"last_5_insights count: {len(doc.get('last_5_insights') or [])}")
        first_insight = (doc.get("last_5_insights") or [{}])[0]
        print(f"first insight summary: {first_insight.get('summary', '')[:160]}")
        print(f"updated_at: {doc.get('updated_at')}")
    else:
        print("\n" + "=" * 70)
        print("❌ FAIL — summary NOT persisted within 15s")
        print("=" * 70)
        print(f"Final doc: {result['doc']}")
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
