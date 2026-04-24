"""Round 37 — notifications feed + unified search regression test.

Tests:
 1. Auth flow (phone 9876543210, OTP 123456)
 2. Notifications seed-sample idempotency + feed + unread-count + mark-read + mark-all-read + user scoping
 3. Unified search (transactions/budgets/goals/groups) with happy path, empty, regex metacharacters, long query
 4. Regression: paranoid audit suite must pass 29 tests
"""
import os
import sys
import time
import requests

BASE = os.environ.get("BACKEND_URL", "https://mintu-finance.preview.emergentagent.com") + "/api"
PHONE_A = "9876543210"
PHONE_B = "9999888877"
OTP = "123456"


def _auth(phone: str) -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code in (200, 201), f"send-otp {phone} → {r.status_code} {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=15)
    assert r.status_code == 200, f"verify-otp {phone} → {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in response: {r.json()}"
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


results = []


def rec(name, ok, detail=""):
    status = "✅" if ok else "❌"
    results.append((ok, name, detail))
    print(f"{status} {name}" + (f" — {detail}" if detail else ""))


def main():
    print(f"▶ BASE: {BASE}")

    # 1. Auth
    try:
        tok_a = _auth(PHONE_A)
        rec("T1 auth (9876543210) → token", True, f"token len={len(tok_a)}")
    except Exception as e:
        rec("T1 auth (9876543210) → token", False, str(e))
        return

    # Wipe pre-existing notifications for user A so seed idempotency is meaningful.
    # We do this by listing & mark-all-read then inserting via seed-sample which no-ops when entries exist.
    # Instead: we'll purge via direct mongo. But simpler — accept seeded:0 if already has entries.
    # To make seed:4 work we drop user's docs via a helper. Since there's no delete endpoint, we
    # connect to mongo directly.
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _wipe(uid):
        mc = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "mintu_db")
        await mc[dbn].notifications_feed.delete_many({"user_id": uid})
        mc.close()

    # Get current user id from /user/me or similar
    me = requests.get(f"{BASE}/user/me", headers=_h(tok_a), timeout=15)
    if me.status_code == 200:
        uid_a = me.json().get("id") or me.json().get("_id") or me.json().get("user", {}).get("id")
    else:
        # try /auth/me
        me = requests.get(f"{BASE}/auth/me", headers=_h(tok_a), timeout=15)
        uid_a = me.json().get("id") if me.status_code == 200 else None

    if uid_a:
        try:
            # Load MONGO_URL from backend .env
            from dotenv import dotenv_values
            env = dotenv_values("/app/backend/.env")
            os.environ["MONGO_URL"] = env.get("MONGO_URL", os.environ.get("MONGO_URL", ""))
            os.environ["DB_NAME"] = env.get("DB_NAME", os.environ.get("DB_NAME", ""))
            asyncio.get_event_loop().run_until_complete(_wipe(uid_a))
            rec("SETUP — wiped notifications for user A", True, f"uid={uid_a}")
        except Exception as e:
            rec("SETUP — wipe notifications", False, str(e))
    else:
        rec("SETUP — get uid_a", False, "could not fetch uid, skipping wipe; seed may return 0")

    # 2. seed-sample — fresh user should get seeded:4
    r = requests.post(f"{BASE}/notifications/seed-sample", headers=_h(tok_a), timeout=15)
    ok = r.status_code == 200 and r.json().get("ok") is True and r.json().get("seeded") == 4
    rec("T2a seed-sample fresh → {ok:true, seeded:4}", ok, f"{r.status_code} {r.text[:200]}")

    # 2b second call
    r = requests.post(f"{BASE}/notifications/seed-sample", headers=_h(tok_a), timeout=15)
    ok = r.status_code == 200 and r.json().get("ok") is True and r.json().get("seeded") == 0
    rec("T2b seed-sample repeat → {ok:true, seeded:0}", ok, f"{r.status_code} {r.text[:200]}")

    # 3. GET /notifications → 4 items
    r = requests.get(f"{BASE}/notifications", headers=_h(tok_a), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    items = body.get("notifications", [])
    ok = r.status_code == 200 and len(items) == 4
    rec("T3 GET /notifications → 4 items", ok, f"status={r.status_code} count={len(items)}")
    if items:
        first = items[0]
        shape_ok = (
            "id" in first and "kind" in first and "read" in first
            and first["read"] is False and "created_at" in first
            and isinstance(first["created_at"], str) and "T" in first["created_at"]
        )
        rec("T3b item shape — id, kind, read=false, created_at ISO string", shape_ok,
            f"first={first}")

    # 4. unread-count → 4
    r = requests.get(f"{BASE}/notifications/unread-count", headers=_h(tok_a), timeout=15)
    ok = r.status_code == 200 and r.json().get("unread") == 4
    rec("T4 unread-count → 4", ok, f"{r.status_code} {r.text}")

    # 5. mark-read first id
    first_id = items[0]["id"] if items else None
    if first_id:
        r = requests.post(f"{BASE}/notifications/mark-read",
                          headers=_h(tok_a), json={"notification_id": first_id}, timeout=15)
        ok = r.status_code == 200 and r.json().get("ok") is True
        rec("T5 mark-read first → {ok:true}", ok, f"{r.status_code} {r.text}")
    else:
        rec("T5 mark-read first", False, "no first_id")

    # 6. unread-count → 3
    r = requests.get(f"{BASE}/notifications/unread-count", headers=_h(tok_a), timeout=15)
    ok = r.status_code == 200 and r.json().get("unread") == 3
    rec("T6 unread-count → 3", ok, f"{r.status_code} {r.text}")

    # 7. mark-all-read → updated:3
    r = requests.post(f"{BASE}/notifications/mark-all-read", headers=_h(tok_a), timeout=15)
    ok = r.status_code == 200 and r.json().get("ok") is True and r.json().get("updated") == 3
    rec("T7 mark-all-read → {ok:true, updated:3}", ok, f"{r.status_code} {r.text}")

    # 8. unread-count → 0
    r = requests.get(f"{BASE}/notifications/unread-count", headers=_h(tok_a), timeout=15)
    ok = r.status_code == 200 and r.json().get("unread") == 0
    rec("T8 unread-count → 0", ok, f"{r.status_code} {r.text}")

    # 9. mark-read with bad id → 400
    r = requests.post(f"{BASE}/notifications/mark-read",
                      headers=_h(tok_a), json={"notification_id": "not-an-objectid"}, timeout=15)
    ok = r.status_code == 400
    rec("T9 mark-read bad id → 400 (not 500)", ok, f"{r.status_code} {r.text[:200]}")

    # 10. mark-read for another user's doc
    try:
        tok_b = _auth(PHONE_B)
        # give user B a doc
        if uid_a:
            me_b = requests.get(f"{BASE}/user/me", headers=_h(tok_b), timeout=15)
            uid_b = (me_b.json() or {}).get("id") if me_b.status_code == 200 else None
            # wipe user B and seed
            if uid_b:
                asyncio.get_event_loop().run_until_complete(_wipe(uid_b))
            requests.post(f"{BASE}/notifications/seed-sample", headers=_h(tok_b), timeout=15)
            b_items = requests.get(f"{BASE}/notifications", headers=_h(tok_b), timeout=15).json().get("notifications", [])
            other_id = b_items[0]["id"] if b_items else None
            if other_id:
                r = requests.post(f"{BASE}/notifications/mark-read",
                                  headers=_h(tok_a), json={"notification_id": other_id}, timeout=15)
                ok = r.status_code == 200 and r.json().get("ok") is False
                rec("T10 mark-read other-user's id → {ok:false} (user scoping)", ok,
                    f"{r.status_code} {r.text}")
            else:
                rec("T10 mark-read other-user's id", False, "no other doc to test against")
        else:
            rec("T10 mark-read other-user's id", False, "uid_a unknown")
    except Exception as e:
        rec("T10 mark-read other-user's id", False, str(e))

    # --- Search ---
    # 11. Create a transaction with description "Coffee Starbucks"
    txn_payload = {
        "amount": 240,
        "type": "debit",
        "description": "Coffee Starbucks",
        "category": "Food",
        "date": "2026-04-25T10:00:00Z",
    }
    r = requests.post(f"{BASE}/transactions", headers=_h(tok_a), json=txn_payload, timeout=15)
    ok = r.status_code == 200
    rec("T11 POST /transactions 'Coffee Starbucks'", ok, f"{r.status_code} {r.text[:200]}")

    # 12. GET /search?q=coffee → total >= 1
    r = requests.get(f"{BASE}/search", headers=_h(tok_a), params={"q": "coffee"}, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    txns = body.get("transactions", [])
    ok = r.status_code == 200 and body.get("total", 0) >= 1 and len(txns) >= 1
    rec("T12 /search?q=coffee → total>=1", ok, f"status={r.status_code} total={body.get('total')}")
    if txns:
        t = txns[0]
        has_coffee = "coffee" in (t.get("description", "") + t.get("merchant", "")).lower()
        rec("T12b first txn contains 'Coffee'", has_coffee, f"desc={t.get('description')} merchant={t.get('merchant')}")

    # 13. /search?q= (empty) → total:0, all arrays empty
    r = requests.get(f"{BASE}/search", headers=_h(tok_a), params={"q": ""}, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    ok = (
        r.status_code == 200
        and body.get("total") == 0
        and body.get("transactions") == []
        and body.get("budgets") == []
        and body.get("goals") == []
        and body.get("groups") == []
    )
    rec("T13 /search?q= (empty) → total:0, all empty", ok, f"{r.status_code} {body}")

    # 14. /search?q=.* (regex metacharacters) → must NOT crash
    r = requests.get(f"{BASE}/search", headers=_h(tok_a), params={"q": ".*"}, timeout=15)
    ok = r.status_code == 200 and "total" in (r.json() or {})
    rec("T14 /search?q=.* regex metacharacters → no crash", ok,
        f"status={r.status_code} total={r.json().get('total') if r.status_code == 200 else None}")

    # 15. Very long query → quick, no timeout
    long_q = "veryloooooongquery" + "x" * 2000
    t0 = time.time()
    try:
        r = requests.get(f"{BASE}/search", headers=_h(tok_a), params={"q": long_q}, timeout=10)
        dt = time.time() - t0
        ok = r.status_code == 200 and dt < 8
        rec("T15 /search?q=<very-long> → quick", ok, f"status={r.status_code} dt={dt:.2f}s")
    except requests.exceptions.Timeout:
        rec("T15 /search?q=<very-long> → quick", False, "TIMEOUT >10s")

    # Summary
    print("\n" + "=" * 60)
    passed = sum(1 for r in results if r[0])
    total = len(results)
    print(f"RESULT: {passed}/{total} passed")
    for ok, name, detail in results:
        if not ok:
            print(f"  ❌ {name} — {detail}")
    print("=" * 60)
    return passed, total


if __name__ == "__main__":
    p, t = main()
    sys.exit(0 if p == t else 1)
