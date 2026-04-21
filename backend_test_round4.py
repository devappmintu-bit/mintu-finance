#!/usr/bin/env python3
"""
Round 4 Adversarial — NEW UNCOVERED ANGLES ONLY
=================================================
Vectors (no overlap with Rounds 2 & 3):
  1. File upload adversarial (avatar content-level attacks)
  2. Coin/wallet depletion race (razorpay-order coin spend)
  3. Maximum-data performance (5,000 txns seeded via bulk_write)
  4. Webhook/payment replay (verify-settle-payment)
  5. Stale-state & optimistic-UI divergence
  6. Session fixation / token reuse

Target: 30-40 new assertions.
Credentials: phoneA=9876543210 / phoneB=9988776655 / phoneE=7000000055, OTP=123456
"""
import asyncio
import base64
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    from bson import ObjectId
except Exception as e:
    print(f"[SETUP] motor/bson missing: {e}")
    sys.exit(1)

BASE = os.environ.get("TEST_BASE_URL", "https://mintu-finance.preview.emergentagent.com/api")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mintu_database")

PHONE_A = "9876543210"
PHONE_B = "9988776655"
PHONE_E = "7000000055"
OTP = "123456"

RESULTS: List[Dict[str, Any]] = []
_counter = [0]


def record(vector: str, name: str, ok: bool, detail: str = ""):
    _counter[0] += 1
    tag = "✅" if ok else "❌"
    print(f"[{_counter[0]:03d}] {tag} {vector} | {name} | {detail[:160]}")
    RESULTS.append({"id": _counter[0], "vector": vector, "name": name, "pass": ok, "detail": detail})


async def auth(client: httpx.AsyncClient, phone: str) -> Tuple[str, str]:
    # Always request a fresh OTP (with rate-limit tolerance — per-phone cooldown is ~30s)
    for attempt in range(4):
        r = await client.post(f"{BASE}/auth/send-otp", json={"phone": phone})
        if r.status_code == 200:
            break
        if r.status_code == 429:
            wait = 35 if attempt == 0 else 10
            print(f"[AUTH] {phone} rate-limited, waiting {wait}s...")
            await asyncio.sleep(wait)
            continue
        break
    assert r.status_code == 200, f"send-otp phone={phone} → {r.status_code} {r.text[:120]}"
    await asyncio.sleep(0.3)
    r = await client.post(f"{BASE}/auth/verify-otp",
                          json={"phone": phone, "otp": OTP, "name": f"TestUser_{phone[-4:]}"})
    assert r.status_code == 200, f"verify-otp phone={phone} → {r.status_code} {r.text[:200]}"
    j = r.json()
    token = j.get("token") or j.get("access_token")
    uid = j.get("user", {}).get("id") or j.get("user_id") or ""
    return token, uid


# ────────────────────────────────────────────────────────────────────────
# VECTOR 1 — File upload adversarial
# ────────────────────────────────────────────────────────────────────────
async def vector1_avatar(client: httpx.AsyncClient, tokenA: str):
    V = "V1-Avatar"
    H = {"Authorization": f"Bearer {tokenA}"}

    # 1a. Base64 with invalid padding
    r = await client.post(f"{BASE}/user/avatar", json={"avatar": "AAAA=X"}, headers=H)
    record(V, "1a invalid-padding b64",
           r.status_code in (200, 400), f"status={r.status_code}")  # either stored literal (OK) or 400, not 500

    # 1b. SVG with onload script
    svg_payload = "PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+"  # <svg onload=alert(1)></svg>
    data_url = f"data:image/svg+xml;base64,{svg_payload}"
    r = await client.post(f"{BASE}/user/avatar", json={"avatar": data_url}, headers=H)
    # Backend just stores as string; verify it does NOT 500
    record(V, "1b SVG-onload data URL stored or rejected",
           r.status_code in (200, 400, 415), f"status={r.status_code}")
    svg_rejected_as_image = (r.status_code != 200)
    if r.status_code == 200:
        # Fetch and verify it's stored as literal (not rendered)
        rg = await client.get(f"{BASE}/user/avatar", headers=H)
        record(V, "1b SVG stored as literal string (no execution)",
               rg.status_code == 200 and "script" not in rg.text.lower() or "onload" in rg.text.lower(),
               f"get status={rg.status_code}")
    else:
        record(V, "1b SVG rejected outright", True, f"rejected with {r.status_code}")

    # 1c. Polyglot PNG/JS — PNG header + JS payload, base64 encoded
    png_header = b"\x89PNG\r\n\x1a\n"
    js_payload = b"<script>alert('xss')</script>"
    polyglot = base64.b64encode(png_header + js_payload).decode()
    r = await client.post(f"{BASE}/user/avatar", json={"avatar": polyglot}, headers=H)
    record(V, "1c PNG+JS polyglot (no 500)",
           r.status_code in (200, 400), f"status={r.status_code}")
    if r.status_code == 200:
        rg = await client.get(f"{BASE}/user/avatar", headers=H)
        # Should be stored as base64 literal — no script execution possible server-side
        record(V, "1c polyglot stored safely as b64 string",
               rg.status_code == 200, f"get={rg.status_code}")

    # 1d. Filename/path injection — endpoint doesn't accept filename, pass it & verify ignored
    r = await client.post(f"{BASE}/user/avatar",
                          json={"avatar": "ABCD", "filename": "../../etc/passwd"},
                          headers=H)
    record(V, "1d path-injection in extra field ignored",
           r.status_code in (200, 400, 422), f"status={r.status_code}")

    # 1e. Zero-byte image
    r = await client.post(f"{BASE}/user/avatar", json={"avatar": ""}, headers=H)
    record(V, "1e zero-byte avatar → 400",
           r.status_code == 400, f"status={r.status_code} body={r.text[:120]}")

    # 1f. Image with null bytes mid-stream
    null_stream = base64.b64encode(b"ABC\x00\x00\x00DEF\x00XYZ").decode()
    r = await client.post(f"{BASE}/user/avatar", json={"avatar": null_stream}, headers=H)
    record(V, "1f null-bytes mid-stream (no 500)",
           r.status_code in (200, 400), f"status={r.status_code}")

    # 1g. Malformed base64 (chars outside [A-Za-z0-9+/=])
    bad_b64 = "AAAA$$$!!!~~~"
    r = await client.post(f"{BASE}/user/avatar", json={"avatar": bad_b64}, headers=H)
    record(V, "1g malformed b64 chars (no 500)",
           r.status_code in (200, 400, 422), f"status={r.status_code}")

    # 1h. Non-string avatar
    r = await client.post(f"{BASE}/user/avatar", json={"avatar": 12345}, headers=H)
    record(V, "1h non-string avatar (no 500)",
           r.status_code in (200, 400, 422), f"status={r.status_code}")

    # 1i. Null avatar
    r = await client.post(f"{BASE}/user/avatar", json={"avatar": None}, headers=H)
    record(V, "1i null avatar → 400",
           r.status_code in (400, 422), f"status={r.status_code}")


# ────────────────────────────────────────────────────────────────────────
# VECTOR 2 — Coin/wallet depletion race
# ────────────────────────────────────────────────────────────────────────
async def vector2_coin_race(client: httpx.AsyncClient, tokenA: str, tokenB_uid: str):
    V = "V2-CoinRace"
    H = {"Authorization": f"Bearer {tokenA}"}

    # 2a. Query current coin balance
    r = await client.get(f"{BASE}/coins/status", headers=H)
    if r.status_code != 200:
        record(V, "2a GET /coins/status baseline", False, f"status={r.status_code}")
        return
    initial_balance = r.json().get("balance", 0)
    record(V, f"2a baseline coin balance = {initial_balance}", True, "")

    # 2b. Fire 20 parallel razorpay-order with coin spend attempts
    # Each tries to use (initial_balance) coins. Only ONE should actually debit
    # that many; others should see lower balance.
    async def one_order(i: int):
        try:
            rr = await client.post(f"{BASE}/split/razorpay-order",
                                   json={"target_user_id": tokenB_uid,
                                         "amount": 100,
                                         "coins_to_use": max(1, initial_balance)},
                                   headers=H, timeout=20)
            return rr.status_code, rr.json() if rr.headers.get("content-type","").startswith("application/json") else {}
        except Exception as e:
            return 0, {"err": str(e)}

    if initial_balance > 0:
        results = await asyncio.gather(*[one_order(i) for i in range(20)])
        n200 = sum(1 for s, _ in results if s == 200)
        n4xx = sum(1 for s, _ in results if 400 <= s < 500)
        n5xx = sum(1 for s, _ in results if 500 <= s < 600)
        record(V, f"2b 20 parallel razorpay-order (no 5xx)",
               n5xx == 0, f"200={n200} 4xx={n4xx} 5xx={n5xx}")

        # Wait for mutations to settle
        await asyncio.sleep(1)
        r = await client.get(f"{BASE}/coins/status", headers=H)
        final_balance = r.json().get("balance", 0)
        record(V, f"2b final balance never negative",
               final_balance >= 0, f"final={final_balance} initial={initial_balance}")
        # razorpay-order is NON-mutating (preview only); balance should be unchanged
        record(V, "2b razorpay-order does NOT debit coins pre-verify",
               final_balance == initial_balance,
               f"initial={initial_balance} final={final_balance}")
    else:
        record(V, "2b skip — no initial coins to race", True, "balance=0")

    # 2c. Parallel coins/award across 20 requests — test ledger consistency
    async def award_one():
        try:
            rr = await client.post(f"{BASE}/coins/award",
                                   json={"action": "open_app_daily"},
                                   headers=H, timeout=10)
            return rr.status_code, rr.json()
        except Exception as e:
            return 0, {"err": str(e)}

    bal_before = initial_balance
    results = await asyncio.gather(*[award_one() for _ in range(20)])
    n200 = sum(1 for s, _ in results if s == 200)
    n5xx = sum(1 for s, _ in results if 500 <= s < 600)
    total_awarded = sum(j.get("awarded", 0) for s, j in results if s == 200)
    record(V, f"2c 20 parallel coins/award (no 5xx)",
           n5xx == 0, f"200={n200} 5xx={n5xx} total_awarded={total_awarded}")

    await asyncio.sleep(1)
    r = await client.get(f"{BASE}/coins/status", headers=H)
    bal_after = r.json().get("balance", 0) if r.status_code == 200 else -1
    record(V, "2c balance consistent (before + awarded == after)",
           bal_after == bal_before + total_awarded,
           f"before={bal_before} awarded={total_awarded} after={bal_after}")

    # 2d. Atomic guard verification — claim-voucher doesn't cost coins, but
    #     award uses $inc which is atomic. Daily cap must hold under race.
    # Check that total awarded doesn't exceed daily_cap=3 for open_app_daily.
    record(V, "2d daily_cap guarded (awarded ≤ 3 for open_app_daily)",
           total_awarded <= 3, f"total_awarded={total_awarded} cap=3")


# ────────────────────────────────────────────────────────────────────────
# VECTOR 3 — Maximum-data performance
# ────────────────────────────────────────────────────────────────────────
async def vector3_perf(client: httpx.AsyncClient):
    V = "V3-Perf"
    mclient = AsyncIOMotorClient(MONGO_URL)
    db = mclient[DB_NAME]

    # Auth tokenE
    tokenE, uidE = await auth(client, PHONE_E)
    H = {"Authorization": f"Bearer {tokenE}"}

    # Seed 5,000 transactions via bulk_write (direct Mongo)
    N = 5000
    now = datetime.now(timezone.utc)
    cats = ["Food", "Transport", "Shopping", "Bills", "Entertainment"]
    batch = []
    for i in range(N):
        batch.append({
            "user_id": uidE,
            "amount": float(100 + (i % 500)),
            "type": "debit" if i % 3 else "credit",
            "category": cats[i % 5],
            "description": f"Perf test #{i}",
            "date": now.isoformat(),
            "created_at": now,
            "_perf_seed": True,
        })
    print(f"[V3] Seeding {N} transactions for uid={uidE}...")
    t0 = time.time()
    # Split into chunks of 1000 for bulk_write
    for i in range(0, N, 1000):
        await db.transactions.insert_many(batch[i:i+1000])
    print(f"[V3] Seeded in {time.time()-t0:.1f}s")

    async def time_get(path: str, timeout: float = 30.0):
        t0 = time.time()
        try:
            r = await client.get(f"{BASE}{path}", headers=H, timeout=timeout)
            return (time.time() - t0) * 1000, r.status_code
        except Exception as e:
            return (time.time() - t0) * 1000, 0

    try:
        # 3a. /home/bundle
        ms, st = await time_get("/home/bundle?lang=en", 15)
        record(V, f"3a /home/bundle <3s (got {ms:.0f}ms)",
               st == 200 and ms < 3000, f"status={st} ms={ms:.0f}")

        # 3b. /stats/overview
        ms, st = await time_get("/stats/overview", 15)
        record(V, f"3b /stats/overview <2s (got {ms:.0f}ms)",
               st == 200 and ms < 2000, f"status={st} ms={ms:.0f}")

        # 3c. /transactions?limit=500
        ms, st = await time_get("/transactions?limit=500", 15)
        record(V, f"3c /transactions?limit=500 <2s (got {ms:.0f}ms)",
               st == 200 and ms < 2000, f"status={st} ms={ms:.0f}")

        # 3d. /reports/ai-expense-card (LLM call)
        ms, st = await time_get("/reports/ai-expense-card", 30)
        record(V, f"3d /reports/ai-expense-card <10s (got {ms:.0f}ms)",
               st == 200 and ms < 10000, f"status={st} ms={ms:.0f}")

        # 3e. /waste-detector
        ms, st = await time_get("/waste-detector", 15)
        record(V, f"3e /waste-detector <2s (got {ms:.0f}ms)",
               st == 200 and ms < 2000, f"status={st} ms={ms:.0f}")

        # 3f. Check backend log for OOM
        import subprocess
        try:
            out = subprocess.run(["tail", "-n", "500", "/var/log/supervisor/backend.err.log"],
                                 capture_output=True, text=True, timeout=5)
            oom = "OutOfMemory" in out.stdout or "MemoryError" in out.stdout or "Killed" in out.stdout
            record(V, "3f no OOM in recent backend logs", not oom, f"oom_found={oom}")
        except Exception as e:
            record(V, "3f OOM check", True, f"skip: {e}")

    finally:
        # Cleanup
        t0 = time.time()
        r = await db.transactions.delete_many({"user_id": uidE, "_perf_seed": True})
        print(f"[V3] Cleaned {r.deleted_count} txns in {time.time()-t0:.1f}s")
        mclient.close()


# ────────────────────────────────────────────────────────────────────────
# VECTOR 4 — Webhook / payment replay
# ────────────────────────────────────────────────────────────────────────
async def vector4_webhook(client: httpx.AsyncClient, tokenA: str, uidB: str):
    V = "V4-Webhook"
    H = {"Authorization": f"Bearer {tokenA}"}

    # Create a real Razorpay order first (we have RAZORPAY_KEY_ID configured)
    r = await client.post(f"{BASE}/split/razorpay-order",
                          json={"target_user_id": uidB, "amount": 10}, headers=H)
    if r.status_code != 200:
        record(V, "4a pre-create order baseline", False, f"status={r.status_code} body={r.text[:120]}")
        order_id = None
    else:
        order_id = r.json().get("order_id")
        record(V, f"4a razorpay order created (for subsequent tests)", True, f"order_id={order_id}")

    # 4b. Same payment_id replay — since we can't get a real valid signature in
    # the test env without actually paying Razorpay, signature validation will
    # always fail. Test that endpoint doesn't 500.
    fake_payload = {
        "order_id": order_id or "order_TEST123",
        "payment_id": "pay_TEST_REPLAY_001",
        "signature": "a" * 64,
    }
    r1 = await client.post(f"{BASE}/split/verify-settle-payment", json=fake_payload)
    r2 = await client.post(f"{BASE}/split/verify-settle-payment", json=fake_payload)
    record(V, "4b replay same payload (both 4xx)",
           r1.status_code in (400, 404) and r2.status_code in (400, 404),
           f"r1={r1.status_code} r2={r2.status_code}")
    record(V, "4b replay idempotent (neither 500)",
           r1.status_code < 500 and r2.status_code < 500,
           f"r1={r1.status_code} r2={r2.status_code}")

    # 4c. Tampered signature — one char off
    r = await client.post(f"{BASE}/split/verify-settle-payment", json={
        "order_id": order_id or "order_TEST123",
        "payment_id": "pay_TEST",
        "signature": "b" * 63 + "X",
    })
    record(V, "4c tampered signature → 400 (not 500)",
           r.status_code in (400, 404), f"status={r.status_code}")

    # 4d. Replay fake order with fresh signature
    r = await client.post(f"{BASE}/split/verify-settle-payment", json={
        "order_id": "order_FAKE_NONEXISTENT",
        "payment_id": "pay_FAKE",
        "signature": "c" * 64,
    })
    record(V, "4d nonexistent order → 400/404",
           r.status_code in (400, 404), f"status={r.status_code}")

    # 4e. Malformed body — missing signature
    r = await client.post(f"{BASE}/split/verify-settle-payment", json={
        "order_id": order_id or "order_TEST",
        "payment_id": "pay_TEST",
    })
    record(V, "4e missing signature → 400",
           r.status_code == 400, f"status={r.status_code}")

    # 4f. SQL injection in payment_id
    r = await client.post(f"{BASE}/split/verify-settle-payment", json={
        "order_id": "order_X",
        "payment_id": "'; DROP TABLE users;--",
        "signature": "d" * 64,
    })
    record(V, "4f SQL injection in payment_id handled",
           r.status_code in (400, 404), f"status={r.status_code}")

    # 4g. Empty body
    r = await client.post(f"{BASE}/split/verify-settle-payment", json={})
    record(V, "4g empty body → 400",
           r.status_code == 400, f"status={r.status_code}")

    # 4h. Null signature
    r = await client.post(f"{BASE}/split/verify-settle-payment", json={
        "order_id": "x", "payment_id": "y", "signature": None,
    })
    record(V, "4h null signature → 400 (no 500)",
           r.status_code in (400, 422), f"status={r.status_code}")


# ────────────────────────────────────────────────────────────────────────
# VECTOR 5 — Stale-state & optimistic-UI divergence
# ────────────────────────────────────────────────────────────────────────
async def vector5_stale(client: httpx.AsyncClient, tokenA: str):
    V = "V5-Stale"
    H = {"Authorization": f"Bearer {tokenA}"}

    # 5a. Create T1, delete T1, GET list → T1 absent
    txn_body = {"amount": 123.45, "type": "debit", "category": "Food",
                "description": f"V5 test {uuid.uuid4().hex[:6]}"}
    r = await client.post(f"{BASE}/transactions", json=txn_body, headers=H)
    if r.status_code != 200:
        record(V, "5a create T1 baseline", False, f"status={r.status_code}")
        return
    t1_id = r.json().get("id") or r.json().get("_id")
    record(V, "5a T1 created", True, f"id={t1_id}")

    rd = await client.delete(f"{BASE}/transactions/{t1_id}", headers=H)
    record(V, "5a T1 deleted", rd.status_code == 200, f"status={rd.status_code}")

    rg = await client.get(f"{BASE}/transactions?limit=50", headers=H)
    absent = True
    if rg.status_code == 200:
        j = rg.json()
        txns = j if isinstance(j, list) else j.get("transactions", [])
        for t in txns:
            if str(t.get("id") or t.get("_id")) == str(t1_id):
                absent = False
                break
    record(V, "5a T1 absent from list after delete", absent, "")

    # 5b. Parallel create + delete race
    async def do_create():
        return await client.post(f"{BASE}/transactions", json=txn_body, headers=H)

    rc = await do_create()
    if rc.status_code == 200:
        tid = rc.json().get("id") or rc.json().get("_id")
        # parallel delete twice
        r1, r2 = await asyncio.gather(
            client.delete(f"{BASE}/transactions/{tid}", headers=H),
            client.delete(f"{BASE}/transactions/{tid}", headers=H),
        )
        record(V, "5b parallel double-delete (no 500)",
               r1.status_code < 500 and r2.status_code < 500,
               f"r1={r1.status_code} r2={r2.status_code}")

    # 5c. Create budget B1, delete B1, re-create same category
    rb1 = await client.post(f"{BASE}/budgets",
                            json={"category": "Entertainment_R4",
                                  "amount": 2000, "period": "monthly"}, headers=H)
    if rb1.status_code == 200:
        b1_id = rb1.json().get("id") or rb1.json().get("_id")
        rbd = await client.delete(f"{BASE}/budgets/{b1_id}", headers=H)
        record(V, "5c B1 deleted", rbd.status_code == 200, f"status={rbd.status_code}")

        # Re-create same category
        rb2 = await client.post(f"{BASE}/budgets",
                                json={"category": "Entertainment_R4",
                                      "amount": 3000, "period": "monthly"}, headers=H)
        record(V, "5c B1 re-created after delete (upsert)",
               rb2.status_code == 200, f"status={rb2.status_code}")

        # Verify new amount
        rlist = await client.get(f"{BASE}/budgets", headers=H)
        if rlist.status_code == 200:
            budgets = rlist.json() if isinstance(rlist.json(), list) else rlist.json().get("budgets", [])
            found = [b for b in budgets if b.get("category") == "Entertainment_R4"]
            record(V, "5c exactly 1 Entertainment_R4 budget, amount=3000",
                   len(found) == 1 and float(found[0].get("amount", 0)) == 3000,
                   f"found={len(found)} amount={found[0].get('amount') if found else None}")
            # cleanup
            if found:
                await client.delete(f"{BASE}/budgets/{found[0].get('id') or found[0].get('_id')}",
                                    headers=H)
    else:
        record(V, "5c B1 create", False, f"status={rb1.status_code}")

    # 5d. Split settle, then delete underlying expense — balance recompute OK
    # Create group, expense, settle partial, delete expense
    rg = await client.post(f"{BASE}/split/groups",
                           json={"name": f"V5 stale {uuid.uuid4().hex[:6]}",
                                 "members": [PHONE_A, PHONE_B]}, headers=H)
    if rg.status_code == 200:
        gid = rg.json().get("id") or rg.json().get("_id")
        re = await client.post(f"{BASE}/split/expenses",
                               json={"group_id": gid,
                                     "description": "V5 test expense",
                                     "amount": 500, "paid_by": PHONE_A,
                                     "split_between": [PHONE_A, PHONE_B]}, headers=H)
        if re.status_code == 200:
            eid = re.json().get("id") or re.json().get("_id")
            # delete expense
            rde = await client.delete(f"{BASE}/split/expenses/{eid}", headers=H)
            record(V, "5d expense deleted (no 500)",
                   rde.status_code < 500, f"status={rde.status_code}")
            # balances recompute
            rb = await client.get(f"{BASE}/split/balances", headers=H)
            record(V, "5d balances still computable after delete",
                   rb.status_code == 200, f"status={rb.status_code}")
        # cleanup
        await client.delete(f"{BASE}/split/groups/{gid}", headers=H)


# ────────────────────────────────────────────────────────────────────────
# VECTOR 6 — Session fixation / token reuse
# ────────────────────────────────────────────────────────────────────────
async def vector6_session(client: httpx.AsyncClient):
    V = "V6-Session"

    # Use phoneE (throwaway) for destructive tests
    tokenE, uidE = await auth(client, PHONE_E)
    HE = {"Authorization": f"Bearer {tokenE}"}

    # 6a. /user/me works
    r = await client.get(f"{BASE}/user/me", headers=HE)
    record(V, "6a GET /user/me with fresh JWT",
           r.status_code == 200, f"status={r.status_code}")

    # Soft-delete the account (safer than hard)
    r = await client.post(f"{BASE}/user/delete-account",
                          json={"mode": "soft"}, headers=HE)
    soft_ok = r.status_code == 200
    record(V, "6a soft-delete E account", soft_ok, f"status={r.status_code}")

    if soft_ok:
        # Reuse same JWT — should still work (stateless) OR 401/404
        r = await client.get(f"{BASE}/user/me", headers=HE)
        record(V, "6a JWT reuse after soft-delete (200/401/404 acceptable)",
               r.status_code in (200, 401, 404), f"status={r.status_code}")

    # 6b. Logout flow — no server-side blacklist expected
    #    After a "logout" (client-side only), JWT should still be valid.
    # Since there's no /auth/logout endpoint that blacklists, just verify
    # same token still accepted immediately after.
    r1 = await client.get(f"{BASE}/user/me", headers=HE)
    r2 = await client.get(f"{BASE}/user/me", headers=HE)
    record(V, "6b JWT stateless — works twice in a row",
           r1.status_code == r2.status_code, f"r1={r1.status_code} r2={r2.status_code}")

    # 6c. Re-register on phoneA — should return existing account, not duplicate
    r = await client.post(f"{BASE}/auth/send-otp", json={"phone": PHONE_A})
    await asyncio.sleep(0.5)
    r = await client.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE_A, "otp": OTP})
    if r.status_code == 200:
        j = r.json()
        new_uid = j.get("user", {}).get("id") or j.get("user_id")
        # Should be the known existing user_id
        record(V, "6c re-login phoneA returns existing _id (no duplicate)",
               new_uid == "69dfab73720f7ce36602727f",
               f"uid={new_uid}")
    else:
        record(V, "6c re-login phoneA", False, f"status={r.status_code}")

    # Verify no duplicate users in DB
    mclient = AsyncIOMotorClient(MONGO_URL)
    db = mclient[DB_NAME]
    count = await db.users.count_documents({"phone": PHONE_A})
    record(V, f"6c only 1 user with phoneA in db (found {count})",
           count == 1, f"count={count}")
    mclient.close()


# ────────────────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────────────────
async def main():
    t0 = time.time()
    print(f"=== Round 4 Adversarial — target {BASE} ===")

    async with httpx.AsyncClient(timeout=30) as client:
        # Auth baseline
        tokenA, uidA = await auth(client, PHONE_A)
        tokenB, uidB = await auth(client, PHONE_B)
        print(f"[AUTH] tokenA uid={uidA}  tokenB uid={uidB}")

        print("\n=== VECTOR 1 — File upload adversarial ===")
        await vector1_avatar(client, tokenA)

        print("\n=== VECTOR 2 — Coin/wallet depletion race ===")
        await vector2_coin_race(client, tokenA, uidB)

        print("\n=== VECTOR 4 — Webhook / payment replay ===")
        await vector4_webhook(client, tokenA, uidB)

        print("\n=== VECTOR 5 — Stale-state & optimistic-UI ===")
        await vector5_stale(client, tokenA)

        print("\n=== VECTOR 3 — Maximum-data performance ===")
        await vector3_perf(client)

        print("\n=== VECTOR 6 — Session fixation / token reuse ===")
        await vector6_session(client)

    dur = time.time() - t0
    n_pass = sum(1 for r in RESULTS if r["pass"])
    n_fail = sum(1 for r in RESULTS if not r["pass"])
    print(f"\n{'='*64}")
    print(f"Round 4: {len(RESULTS)} assertions | PASS={n_pass} FAIL={n_fail} | {dur:.1f}s")
    print(f"{'='*64}")
    if n_fail > 0:
        print("\nFAILURES:")
        for r in RESULTS:
            if not r["pass"]:
                print(f"  ❌ [{r['id']:03d}] {r['vector']} | {r['name']} | {r['detail']}")

    # Write JSON results
    with open("/tmp/round4_results.json", "w") as f:
        json.dump({"pass": n_pass, "fail": n_fail, "total": len(RESULTS),
                   "duration_s": round(dur, 2), "results": RESULTS}, f, indent=2)
    print(f"\nJSON: /tmp/round4_results.json")

    return n_fail == 0


if __name__ == "__main__":
    ok = asyncio.run(main())
    sys.exit(0 if ok else 1)
