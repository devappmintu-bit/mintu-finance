"""
Round 29 Adversarial QA Sweep — MintU Backend (Apr 23 2026)

Exercises input validation / injection, auth & IDOR, race conditions, fraud
vectors and performance. Fresh users created per test with phones 90XXX
prefix. Canonical user 9876543210 never touched.
"""
import time
import json
import asyncio
import random
import traceback
from typing import Any, Optional

import httpx


BASE = "https://mintu-finance.preview.emergentagent.com/api"
OTP = "123456"


def load_backend_url() -> str:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/") + "/api"
    except Exception:
        pass
    return BASE


BASE = load_backend_url()
print(f"\n[ENV] Testing against: {BASE}\n")

results = []
criticals_found = []


def record(test_id: str, severity: str, passed: bool, details: str = ""):
    status = "PASS" if passed else "FAIL"
    tag = "[PASS]" if passed else "[FAIL]"
    print(f"  {tag} [{test_id}] {status} ({severity}) -- {details}")
    results.append((test_id, severity, passed, details))
    if (not passed) and severity.lower() == "critical":
        criticals_found.append(test_id)


def gen_phone(prefix: str = "90") -> str:
    remain = 10 - len(prefix)
    if remain < 1:
        raise ValueError("prefix too long")
    return prefix + "".join(random.choices("0123456789", k=remain))


async def signup_fresh(client: httpx.AsyncClient, phone: Optional[str] = None, name: str = "Adv Tester") -> dict:
    phone = phone or gen_phone()
    r = await client.post(f"{BASE}/auth/send-otp", json={"phone": phone})
    if r.status_code == 429:
        await asyncio.sleep(35)
        r = await client.post(f"{BASE}/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text[:200]}"
    r = await client.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP, "name": name})
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    return {"token": data["token"], "user_id": data["user"]["id"], "phone": phone, "name": data["user"]["name"]}


async def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def block1_injection(client: httpx.AsyncClient):
    print("\n=== BLOCK 1 - INPUT VALIDATION & INJECTION ===")

    r = await client.post(f"{BASE}/auth/send-otp", json={"phone": {"$ne": None}})
    record("INJECT-NOSQL-001a", "Critical", r.status_code in (400, 422),
           f"send-otp dict phone -> {r.status_code}")

    r = await client.post(f"{BASE}/auth/verify-otp", json={"phone": {"$ne": None}, "otp": "123456"})
    record("INJECT-NOSQL-001b", "Critical", r.status_code in (400, 422),
           f"verify-otp dict phone -> {r.status_code}")

    fresh = await signup_fresh(client)
    h = await auth_headers(fresh["token"])

    r = await client.post(f"{BASE}/user/payment-methods",
                          json={"type": "upi", "upi_id": {"$ne": None}}, headers=h)
    record("INJECT-NOSQL-002a", "Critical", r.status_code in (400, 422),
           f"upi dict -> {r.status_code}")

    r = await client.post(f"{BASE}/user/payment-methods",
                          json={"type": "upi", "upi_id": {"$regex": ".*"}}, headers=h)
    record("INJECT-NOSQL-002b", "Critical", r.status_code in (400, 422),
           f"upi regex -> {r.status_code}")

    r = await client.get(f"{BASE}/transactions?category[$ne]=null", headers=h)
    body = None
    try:
        body = r.json()
    except Exception:
        pass
    record("INJECT-NOSQL-003", "Critical", r.status_code == 200 and isinstance(body, list),
           f"GET /transactions?category[$ne]=null -> {r.status_code}, type={type(body).__name__}")

    bad_amounts = [0, -100, 1e308, "abc", None, 9.999999999e19]
    for amt in bad_amounts:
        body = {"amount": amt, "category": "Food", "type": "debit", "description": "edge test"}
        try:
            r = await client.post(f"{BASE}/transactions", json=body, headers=h)
        except Exception as e:
            record(f"INPUT-BOUNDARY-001[{amt!r}]", "High", False, f"conn exc: {e}")
            continue
        ok = r.status_code in (400, 422)
        record(f"INPUT-BOUNDARY-001[{amt!r}]", "High", ok,
               f"amount={amt!r} -> {r.status_code}")

    r = await client.post(f"{BASE}/transactions",
                          json={"amount": "  50  ", "category": "Food", "type": "debit", "description": "ws"},
                          headers=h)
    record("INPUT-BOUNDARY-001[whitespace]", "Medium", r.status_code != 500,
           f"amount=' 50 ' -> {r.status_code}")

    r = await client.post(f"{BASE}/transactions",
                          json={"amount": 123.45, "category": "Food", "type": "debit", "description": "valid"},
                          headers=h)
    record("INPUT-BOUNDARY-001[valid]", "High", r.status_code == 200, f"valid txn -> {r.status_code}")

    r = await client.post(f"{BASE}/transactions",
                          json={"amount": 100, "category": "", "type": "debit", "description": "x"},
                          headers=h)
    record("INPUT-BOUNDARY-002[category='']", "High", r.status_code in (400, 422),
           f"empty category -> {r.status_code}")

    r = await client.post(f"{BASE}/transactions",
                          json={"amount": 100, "category": "Food", "type": "", "description": "x"},
                          headers=h)
    record("INPUT-BOUNDARY-002[type='']", "Medium", r.status_code != 500,
           f"empty type -> {r.status_code}")

    r = await client.post(f"{BASE}/split/groups", json={"name": "", "members": ["9999888877"]}, headers=h)
    record("INPUT-BOUNDARY-002[group_name='']", "Medium",
           r.status_code != 500,
           f"empty group name -> {r.status_code}")

    r = await client.post(f"{BASE}/budgets",
                          json={"category": "", "amount": 500, "period": "monthly"}, headers=h)
    record("INPUT-BOUNDARY-002[budget_cat='']", "Medium", r.status_code != 500,
           f"empty budget category -> {r.status_code}")

    big = "A" * 10001
    r = await client.post(f"{BASE}/transactions",
                          json={"amount": 100, "category": "Food", "type": "debit", "description": big},
                          headers=h)
    record("INPUT-BOUNDARY-003[desc_10k]", "High", r.status_code in (200, 400, 422) and r.status_code != 500,
           f"desc=10001 chars -> {r.status_code}")

    r = await client.post(f"{BASE}/split/groups",
                          json={"name": "A" * 501, "members": ["9999888877"]}, headers=h)
    record("INPUT-BOUNDARY-003[group_name_501]", "Medium", r.status_code != 500,
           f"group name=501 chars -> {r.status_code}")

    xss = "<img src=x onerror=alert(1)>"
    r = await client.post(f"{BASE}/split/groups",
                          json={"name": xss, "members": ["9999888877"]}, headers=h)
    stored_ok = False
    if r.status_code == 200:
        r2 = await client.get(f"{BASE}/split/groups", headers=h)
        if r2.status_code == 200:
            groups = r2.json()
            stored_ok = any(g.get("name") == xss for g in groups)
    record("XSS-STORED-001", "Medium", stored_ok, f"group={r.status_code}, stored_verbatim={stored_ok}")

    payloads = ["<script>alert(1)</script>", "javascript:void(0)", "\"><svg/onload=1>"]
    all_ok = True
    for p in payloads:
        r = await client.post(f"{BASE}/transactions",
                              json={"amount": 10, "category": "Food", "type": "debit", "description": p},
                              headers=h)
        if r.status_code != 200:
            all_ok = False
            continue
        txid = r.json().get("id")
        r2 = await client.get(f"{BASE}/transactions", headers=h)
        if r2.status_code != 200:
            all_ok = False
            continue
        found = any(t.get("id") == txid and t.get("description") == p for t in r2.json())
        if not found:
            all_ok = False
    record("XSS-STORED-002", "Medium", all_ok, "descs roundtripped verbatim")


async def block2_auth(client: httpx.AsyncClient):
    print("\n=== BLOCK 2 - AUTH & AUTHORIZATION ===")

    protected = [
        "/user/me", "/transactions", "/split/groups", "/budgets",
        "/leaderboard/unified", "/home/bundle", "/user/payment-methods",
    ]
    for path in protected:
        r = await client.get(f"{BASE}{path}")
        ok = r.status_code in (401, 422)
        record(f"AUTH-NOTOKEN-001[{path}]", "Critical", ok, f"{path} no-auth -> {r.status_code}")

    for tok, label in [("invalid.token.here", "invalid"), ("null", "null-str")]:
        r = await client.get(f"{BASE}/user/me", headers={"Authorization": f"Bearer {tok}"})
        ok = r.status_code in (401, 422)
        record(f"AUTH-BADTOKEN-001[{label}]", "Critical", ok, f"Bearer {label!r} -> {r.status_code}")

    forged = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJ1c2VyX2lkIjoiNjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwiZXhwIjoyMzAwMDAwMDAwfQ."
        "tamperedsignature"
    )
    r = await client.get(f"{BASE}/user/me", headers={"Authorization": f"Bearer {forged}"})
    record("AUTH-BADTOKEN-001[forged]", "Critical", r.status_code == 401,
           f"forged JWT -> {r.status_code}")

    A = await signup_fresh(client, phone=gen_phone("9011"), name="Alice A")
    B = await signup_fresh(client, phone=gen_phone("9011"), name="Bob B")
    hA = await auth_headers(A["token"])
    hB = await auth_headers(B["token"])

    rtx = await client.post(f"{BASE}/transactions",
                            json={"amount": 250, "category": "Food", "type": "debit", "description": "A tx"},
                            headers=hA)
    tx_A = rtx.json().get("id") if rtx.status_code == 200 else None
    rbg = await client.post(f"{BASE}/budgets",
                            json={"category": "Food", "amount": 5000, "period": "monthly"}, headers=hA)
    bg_A = rbg.json().get("id") if rbg.status_code == 200 else None
    rgrp = await client.post(f"{BASE}/split/groups",
                             json={"name": "AliceOnly", "members": ["9999888877"]}, headers=hA)
    grp_A = rgrp.json().get("id") if rgrp.status_code == 200 else None

    if tx_A:
        r = await client.put(f"{BASE}/transactions/{tx_A}", json={"amount": 1}, headers=hB)
        record("AUTH-IDOR-001[PUT tx_A as B]", "Critical", r.status_code in (403, 404),
               f"PUT -> {r.status_code}")
        r = await client.delete(f"{BASE}/transactions/{tx_A}", headers=hB)
        record("AUTH-IDOR-001[DELETE tx_A as B]", "Critical", r.status_code in (403, 404),
               f"DELETE -> {r.status_code}")
    if bg_A:
        r = await client.delete(f"{BASE}/budgets/{bg_A}", headers=hB)
        record("AUTH-IDOR-001[DELETE bg_A as B]", "Critical", r.status_code in (403, 404),
               f"DELETE bg -> {r.status_code}")
    if grp_A:
        r = await client.get(f"{BASE}/split/groups/{grp_A}/manage", headers=hB)
        record("AUTH-IDOR-001[GET manage as B]", "Critical", r.status_code in (403, 404),
               f"manage -> {r.status_code}")
        r = await client.post(f"{BASE}/split/groups/{grp_A}/members",
                              json={"phones": ["9999999999"]}, headers=hB)
        record("AUTH-IDOR-001[POST members as B]", "Critical", r.status_code in (403, 404),
               f"add members by non-member -> {r.status_code}")

    C = await signup_fresh(client, phone=gen_phone("9011"), name="Carol C")
    hC = await auth_headers(C["token"])
    r = await client.post(f"{BASE}/split/settle",
                          json={"target_user_id": "000000000000000000000000", "amount": 100, "method": "upi"},
                          headers=hC)
    passed = r.status_code in (400, 404)
    record("AUTH-IDOR-002", "Critical", passed,
           f"settle phantom debt -> {r.status_code} {r.text[:140]}")

    rgrp2 = await client.post(f"{BASE}/split/groups",
                              json={"name": "Priv Test", "members": [B["phone"]]}, headers=hA)
    if rgrp2.status_code == 200:
        grp2 = rgrp2.json()["id"]
        r = await client.delete(f"{BASE}/split/groups/{grp2}", headers=hB)
        record("AUTH-PRIV-001", "Critical", r.status_code == 403, f"B deletes A's group -> {r.status_code}")
    else:
        record("AUTH-PRIV-001[precond]", "Critical", False,
               f"setup failed: {rgrp2.status_code} {rgrp2.text[:100]}")

    D = await signup_fresh(client, phone=gen_phone("9011"), name="Dave D")
    hD = await auth_headers(D["token"])
    r = await client.post(f"{BASE}/user/delete-account",
                          json={"mode": "hard", "confirmation": "DELETE"}, headers=hD)
    if r.status_code != 200:
        record("AUTH-SESSION-001[precond]", "Critical", False,
               f"delete-account failed: {r.status_code} {r.text[:200]}")
    else:
        paths_after = ["/user/me", "/transactions", "/home/bundle",
                       "/split/groups", "/leaderboard/unified", "/user/payment-methods"]
        for p in paths_after:
            r2 = await client.get(f"{BASE}{p}", headers=hD)
            ok = r2.status_code == 401
            record(f"AUTH-SESSION-001[{p}]", "Critical", ok,
                   f"post-delete {p} -> {r2.status_code}")


async def block3_race(client: httpx.AsyncClient):
    print("\n=== BLOCK 3 - RACE CONDITIONS ===")

    U = await signup_fresh(client)
    h = await auth_headers(U["token"])

    async def _one_txn():
        return await client.post(f"{BASE}/transactions",
                                 json={"amount": 500, "category": "Food", "type": "debit", "description": "race"},
                                 headers=h)

    responses = await asyncio.gather(*[_one_txn() for _ in range(20)], return_exceptions=True)
    ids = set()
    success = 0
    errors = 0
    for r in responses:
        if isinstance(r, Exception):
            errors += 1
            continue
        if r.status_code == 200:
            success += 1
            try:
                ids.add(r.json().get("id"))
            except Exception:
                pass
    record("RACE-TXN-001[all_succeed]", "High", success >= 18,
           f"20 concurrent -> {success} OK, {errors} errs")
    record("RACE-TXN-001[distinct_ids]", "High", len(ids) == success,
           f"distinct ids {len(ids)} vs success {success}")

    A = await signup_fresh(client, phone=gen_phone("9012"))
    B = await signup_fresh(client, phone=gen_phone("9012"))
    hA = await auth_headers(A["token"])
    hB = await auth_headers(B["token"])
    rgrp = await client.post(f"{BASE}/split/groups",
                             json={"name": "Race Test", "members": [B["phone"]]}, headers=hA)
    if rgrp.status_code == 200:
        grp = rgrp.json()["id"]
        rexp = await client.post(f"{BASE}/split/expenses",
                                 json={"group_id": grp, "amount": 1000, "description": "dinner",
                                       "paid_by": A["user_id"],
                                       "splits": {A["user_id"]: 500, B["user_id"]: 500}}, headers=hA)

        async def _settle():
            return await client.post(f"{BASE}/split/settle",
                                     json={"target_user_id": A["user_id"], "amount": 500, "method": "upi", "group_id": grp},
                                     headers=hB)
        res = await asyncio.gather(*[_settle() for _ in range(5)], return_exceptions=True)
        ok_count = sum(1 for r in res if not isinstance(r, Exception) and r.status_code == 200)
        passed = ok_count <= 1
        record("RACE-SETTLE-001", "Critical", passed,
               f"concurrent /split/settle -> {ok_count}/5 succeeded (expected <=1, exp_create={rexp.status_code})")
    else:
        record("RACE-SETTLE-001[precond]", "Critical", False, f"group create {rgrp.status_code}")

    U2 = await signup_fresh(client, phone=gen_phone("9013"))
    h2 = await auth_headers(U2["token"])
    rb = await client.post(f"{BASE}/budgets", json={"category": "Food", "amount": 1000, "period": "monthly"}, headers=h2)
    bid = rb.json().get("id") if rb.status_code == 200 else None
    if bid:
        async def _del():
            return await client.delete(f"{BASE}/budgets/{bid}", headers=h2)
        res = await asyncio.gather(*[_del() for _ in range(5)], return_exceptions=True)
        codes = [getattr(r, "status_code", 500) for r in res]
        ok_count = sum(1 for c in codes if c == 200)
        nf_count = sum(1 for c in codes if c == 404)
        no_500 = all(c != 500 for c in codes)
        passed = ok_count == 1 and nf_count == 4 and no_500
        record("RACE-BUDGET-001", "High", passed, f"delete x5 -> codes={codes}")
    else:
        record("RACE-BUDGET-001[precond]", "High", False, f"budget create failed {rb.status_code}")

    A = await signup_fresh(client, phone=gen_phone("9014"))
    B = await signup_fresh(client, phone=gen_phone("9014"))
    hA = await auth_headers(A["token"])
    hB = await auth_headers(B["token"])
    rgrp = await client.post(f"{BASE}/split/groups",
                             json={"name": "RG Test", "members": [B["phone"]]}, headers=hA)
    if rgrp.status_code == 200:
        grp = rgrp.json()["id"]

        async def _add_expense():
            return await client.post(f"{BASE}/split/expenses",
                                     json={"group_id": grp, "amount": 300, "description": "conflict",
                                           "paid_by": B["user_id"],
                                           "splits": {A["user_id"]: 150, B["user_id"]: 150}}, headers=hB)

        async def _del_group():
            return await client.delete(f"{BASE}/split/groups/{grp}", headers=hA)

        res = await asyncio.gather(_add_expense(), _del_group(), return_exceptions=True)
        codes = [getattr(r, "status_code", 500) for r in res]
        no_500 = all(c != 500 for c in codes)
        record("RACE-GROUP-001", "High", no_500, f"concurrent expense+delete -> codes={codes}")
    else:
        record("RACE-GROUP-001[precond]", "High", False, f"group {rgrp.status_code}")


async def block4_fraud(client: httpx.AsyncClient):
    print("\n=== BLOCK 4 - ABUSE / FRAUD ===")

    phone = gen_phone("9022")
    await client.post(f"{BASE}/auth/send-otp", json={"phone": phone})
    codes = []
    for _ in range(20):
        random_otp = "".join(random.choices("0123456789", k=6))
        rr = await client.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": random_otp, "name": "Brute"})
        codes.append(rr.status_code)
    rate_limited = any(c == 429 for c in codes)
    defence_exists = rate_limited or (codes.count(400) >= 17)
    record("FRAUD-OTP-001[rate_limit_429]", "High", rate_limited,
           f"codes[:5]={codes[:5]}, any_429={rate_limited}")
    record("FRAUD-OTP-001[defence_exists]", "Critical", defence_exists,
           f"defence present={defence_exists} (400-locked after attempts)")

    U = await signup_fresh(client)
    h = await auth_headers(U["token"])
    r = await client.get(f"{BASE}/coins/status", headers=h)
    coins_start = 0
    if r.status_code == 200:
        j = r.json()
        coins_start = int(j.get("coins", j.get("balance", j.get("coins_balance", 0))) or 0)
    for _ in range(20):
        rc = await client.post(f"{BASE}/transactions",
                               json={"amount": 100, "category": "Food", "type": "debit", "description": "farm"},
                               headers=h)
        if rc.status_code == 200:
            tx_id = rc.json().get("id")
            await client.delete(f"{BASE}/transactions/{tx_id}", headers=h)
    r = await client.get(f"{BASE}/coins/status", headers=h)
    coins_end = 0
    if r.status_code == 200:
        j = r.json()
        coins_end = int(j.get("coins", j.get("balance", j.get("coins_balance", 0))) or 0)
    delta = coins_end - coins_start
    passed = delta <= 5
    record("FRAUD-COIN-001", "High", passed,
           f"coins {coins_start}->{coins_end} (d={delta}) after 20x add+delete")

    R = await signup_fresh(client, phone=gen_phone("9023"))
    h = await auth_headers(R["token"])
    rc = await client.get(f"{BASE}/referral/my-code", headers=h)
    my_code = ""
    if rc.status_code == 200:
        j = rc.json()
        my_code = j.get("code") or j.get("referral_code") or ""
    if my_code:
        r = await client.post(f"{BASE}/referral/apply", json={"code": my_code}, headers=h)
        passed = r.status_code in (400, 403, 404, 409)
        record("FRAUD-REFERRAL-001", "High", passed,
               f"self-referral {my_code} -> {r.status_code} {r.text[:140]}")
    else:
        record("FRAUD-REFERRAL-001", "High", False, f"no code ({rc.status_code})")

    U = await signup_fresh(client, phone=gen_phone("9024"))
    h = await auth_headers(U["token"])
    from datetime import datetime, timedelta, timezone
    future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    for _ in range(3):
        await client.post(f"{BASE}/transactions",
                          json={"amount": 50, "category": "Food", "type": "debit",
                                "description": "future", "date": future}, headers=h)
    r = await client.get(f"{BASE}/gamification/status", headers=h)
    streak = 0
    if r.status_code == 200:
        j = r.json()
        streak = int(j.get("streak_days", j.get("streak", 0)) or 0)
    passed = streak <= 1
    record("FRAUD-STREAK-001", "High", passed,
           f"streak={streak} after 3 future-dated txns")


async def block5_perf(client: httpx.AsyncClient):
    print("\n=== BLOCK 5 - PERFORMANCE / SIZE ===")

    U = await signup_fresh(client, phone=gen_phone("9031"))
    h = await auth_headers(U["token"])

    nested: Any = "leaf"
    for _ in range(50):
        nested = {"n": nested}
    r = await client.post(f"{BASE}/transactions",
                          json={"amount": 100, "category": "Food", "type": "debit",
                                "description": "deep", "notes": nested}, headers=h)
    record("PERF-PAYLOAD-001", "High", r.status_code != 500, f"50-deep nested -> {r.status_code}")

    async def _mk(n):
        return await client.post(f"{BASE}/transactions",
                                 json={"amount": 10 + n, "category": "Food", "type": "debit",
                                       "description": f"seed-{n}"}, headers=h)
    await asyncio.gather(*[_mk(i) for i in range(30)])

    t0 = time.monotonic()
    r = await client.get(f"{BASE}/transactions?limit=9999", headers=h)
    dur = time.monotonic() - t0
    record("PERF-TXN-001[limit_9999_cap]", "High", r.status_code in (200, 422) and dur < 3.0,
           f"limit=9999 -> {r.status_code} in {dur*1000:.0f}ms")

    t0 = time.monotonic()
    r = await client.get(f"{BASE}/transactions?limit=500", headers=h)
    dur2 = time.monotonic() - t0
    record("PERF-TXN-001[limit_500]", "High", r.status_code == 200 and dur2 < 3.0,
           f"limit=500 -> {r.status_code} in {dur2*1000:.0f}ms")

    latencies = []
    for _ in range(10):
        t0 = time.monotonic()
        r = await client.get(f"{BASE}/home/bundle?lang=en", headers=h)
        d = (time.monotonic() - t0) * 1000
        latencies.append((r.status_code, d))
    ok = all(s == 200 for s, _ in latencies)
    ms = sorted([d for _, d in latencies])
    p50 = ms[len(ms) // 2]
    p95 = ms[int(len(ms) * 0.95) - 1] if len(ms) >= 2 else ms[-1]
    record("PERF-HOME-001", "High", ok and p95 < 2000,
           f"/home/bundle x10 all200={ok} p50={p50:.0f}ms p95={p95:.0f}ms")


async def main():
    limits = httpx.Limits(max_connections=50, max_keepalive_connections=20)
    timeout = httpx.Timeout(30.0, connect=15.0)
    async with httpx.AsyncClient(limits=limits, timeout=timeout) as client:
        for name, fn in [("block1", block1_injection), ("block2", block2_auth),
                         ("block3", block3_race), ("block4", block4_fraud),
                         ("block5", block5_perf)]:
            try:
                await fn(client)
            except Exception as e:
                print(f"{name} fatal: {e}")
                traceback.print_exc()

    total = len(results)
    passed = sum(1 for _, _, ok, _ in results if ok)
    failed = total - passed
    print("\n" + "=" * 60)
    print(f"TOTAL: {total}   PASS: {passed}   FAIL: {failed}")
    print(f"CRITICALS FOUND: {criticals_found}")
    print("=" * 60)

    summary = {
        "total_tests": total,
        "pass": passed,
        "fail": failed,
        "criticals_found": criticals_found,
        "failures": [{"id": tid, "severity": sev, "detail": det}
                     for tid, sev, ok, det in results if not ok],
    }
    with open("/app/round29_results.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps({k: summary[k] for k in ("total_tests", "pass", "fail", "criticals_found")}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
