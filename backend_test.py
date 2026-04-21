"""
MintU Backend — RED-TEAM / ADVERSARIAL SECURITY + ROBUSTNESS TESTS
====================================================================
Goal: BREAK the backend. Report every 500, every unauthorised success,
every IDOR, every crash, every validation gap.

Covers: IDOR, AuthBypass, NoSQL injection, XSS/PathTraversal,
Negative amounts, Oversize payloads, Race conditions, Chaos input.
"""
import asyncio
import json
import os
import random
import re
import string
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

# The frontend uses EXPO_PUBLIC_BACKEND_URL. Read from frontend/.env.
FRONTEND_ENV = "/app/frontend/.env"
BASE_URL = None
with open(FRONTEND_ENV, "r") as f:
    for line in f:
        if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break
assert BASE_URL, "Could not read EXPO_PUBLIC_BACKEND_URL from frontend/.env"
API = f"{BASE_URL}/api"

# ── Results bookkeeping ────────────────────────────────────────────────
results: List[Dict[str, Any]] = []
def record(test_id: str, status: str, detail: str, severity: str = "", passed: Optional[bool] = None):
    results.append({
        "id": test_id,
        "status": status,
        "detail": detail[:500],
        "severity": severity,
        "passed": passed,
    })
    mark = "✅" if passed else ("❌" if passed is False else "•")
    print(f"{mark} {test_id:28s} {status:6s}  {detail[:180]}")


# ── Helpers ────────────────────────────────────────────────────────────
def send_otp(client: httpx.Client, phone: str) -> httpx.Response:
    return client.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=20)

def verify_otp(client: httpx.Client, phone: str, otp: str = "123456", name: str = None) -> httpx.Response:
    body = {"phone": phone, "otp": otp}
    if name: body["name"] = name
    return client.post(f"{API}/auth/verify-otp", json=body, timeout=20)

def auth_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login_user(client: httpx.Client, phone: str, name: str) -> Tuple[str, str]:
    """Return (token, user_id) for given phone."""
    for attempt in range(3):
        r = send_otp(client, phone)
        if r.status_code == 200:
            break
        if r.status_code == 429:
            time.sleep(31)
        else:
            raise RuntimeError(f"send-otp {phone} failed: {r.status_code} {r.text}")
    r = verify_otp(client, phone, "123456", name=name)
    if r.status_code != 200:
        raise RuntimeError(f"verify-otp {phone} failed: {r.status_code} {r.text}")
    data = r.json()
    return data["token"], data["user"]["id"]


# ═══════════════════════════════════════════════════════════════════════
# SETUP
# ═══════════════════════════════════════════════════════════════════════
print(f"\n{'═'*72}\n  MintU Adversarial Security Test Suite\n  Target: {API}\n{'═'*72}\n")

client = httpx.Client(timeout=30)
try:
    tokenA, uidA = login_user(client, "9876543210", "Alice Red")
    print(f"[SETUP] User A: phone=9876543210 id={uidA}")
except Exception as e:
    print(f"[SETUP FATAL] Could not create user A: {e}")
    sys.exit(1)

try:
    tokenB, uidB = login_user(client, "9988776655", "Bob Blue")
    print(f"[SETUP] User B: phone=9988776655 id={uidB}\n")
except Exception as e:
    print(f"[SETUP FATAL] Could not create user B: {e}")
    sys.exit(1)


# ═══════════════════════════════════════════════════════════════════════
# TEST 1 — AUTH-IDOR-001: Read another user's transactions
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 1: AUTH-IDOR-001 (read txns cross-user) ───")
txn_body = {"amount": 1234.0, "category": "Food", "description": "IDOR-test-A", "type": "debit"}
r = client.post(f"{API}/transactions", json=txn_body, headers=auth_headers(tokenA))
txnA_id = None
if r.status_code == 200:
    txnA_id = r.json().get("id")
    print(f"  Seeded A txn: {txnA_id}")
    r2 = client.get(f"{API}/transactions", headers=auth_headers(tokenB))
    if r2.status_code == 200:
        rows = r2.json()
        leaked = [t for t in rows if t.get("description") == "IDOR-test-A" or t.get("id") == txnA_id]
        if leaked:
            record("AUTH-IDOR-001", f"{r2.status_code}", f"LEAK: B sees A's txn {txnA_id}", "Critical", False)
        else:
            record("AUTH-IDOR-001", f"{r2.status_code}", f"B sees {len(rows)} own txns, none from A", "", True)
    else:
        record("AUTH-IDOR-001", f"{r2.status_code}", r2.text, "", False)
else:
    record("AUTH-IDOR-001", f"{r.status_code}", f"seed POST failed: {r.text}", "", False)


# ═══════════════════════════════════════════════════════════════════════
# TEST 2 — AUTH-IDOR-002: Modify another user's transaction
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 2: AUTH-IDOR-002 (modify cross-user txn) ───")
if txnA_id:
    r = client.put(
        f"{API}/transactions/{txnA_id}",
        json={"description": "HACKED-BY-B", "amount": 1.0},
        headers=auth_headers(tokenB),
    )
    if r.status_code in (403, 404):
        record("AUTH-IDOR-002", f"{r.status_code}", "B blocked from editing A's txn", "", True)
    elif r.status_code == 200:
        record("AUTH-IDOR-002", f"{r.status_code}", f"CRITICAL: B edited A's txn: {r.text[:120]}", "Critical", False)
    else:
        record("AUTH-IDOR-002", f"{r.status_code}", r.text[:150], "Medium", False)

    r = client.delete(f"{API}/transactions/{txnA_id}", headers=auth_headers(tokenB))
    if r.status_code in (403, 404):
        record("AUTH-IDOR-002b", f"{r.status_code}", "B blocked from deleting A's txn", "", True)
    elif r.status_code == 200:
        record("AUTH-IDOR-002b", f"{r.status_code}", "CRITICAL: B deleted A's txn", "Critical", False)
    else:
        record("AUTH-IDOR-002b", f"{r.status_code}", r.text[:150], "Medium", False)
else:
    record("AUTH-IDOR-002", "SKIP", "No txnA to test", "", None)


# ═══════════════════════════════════════════════════════════════════════
# TEST 3 — AUTH-IDOR-003: Split group IDOR (multiple variants)
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 3: AUTH-IDOR-003 (split group IDOR) ───")
r = client.post(f"{API}/split/groups",
                json={"name": "A Private Group", "members": ["9876543210", "7000000001"]},
                headers=auth_headers(tokenA))
groupA_id = None
if r.status_code == 200:
    groupA_id = r.json()["id"]
    print(f"  Seeded A group: {groupA_id}")

    # 3a list
    r2 = client.get(f"{API}/split/groups", headers=auth_headers(tokenB))
    if r2.status_code == 200:
        if any(g.get("id") == groupA_id for g in r2.json()):
            record("AUTH-IDOR-003-list", f"{r2.status_code}", "LEAK: B sees A's group in list", "Critical", False)
        else:
            record("AUTH-IDOR-003-list", f"{r2.status_code}", "B does NOT see A's group in list", "", True)

    # 3b manage
    r3 = client.get(f"{API}/split/groups/{groupA_id}/manage", headers=auth_headers(tokenB))
    if r3.status_code in (403, 404):
        record("AUTH-IDOR-003-manage", f"{r3.status_code}", "B blocked from A's group /manage", "", True)
    elif r3.status_code == 200:
        record("AUTH-IDOR-003-manage", f"{r3.status_code}",
               f"CRITICAL IDOR: B reads A's group mgmt+members+phones: {r3.text[:150]}",
               "Critical", False)
    else:
        record("AUTH-IDOR-003-manage", f"{r3.status_code}", r3.text[:150], "Medium", False)

    # 3c summary
    r4 = client.get(f"{API}/split/groups/{groupA_id}/summary", headers=auth_headers(tokenB))
    if r4.status_code in (403, 404):
        record("AUTH-IDOR-003-summary", f"{r4.status_code}", "B blocked from A's summary", "", True)
    elif r4.status_code == 200:
        record("AUTH-IDOR-003-summary", f"{r4.status_code}",
               f"IDOR: B reads A's group summary", "High", False)

    # 3d GET messages
    r5 = client.get(f"{API}/split/groups/{groupA_id}/messages", headers=auth_headers(tokenB))
    if r5.status_code in (403, 404):
        record("AUTH-IDOR-003-msgs", f"{r5.status_code}", "B blocked from A's msgs", "", True)
    elif r5.status_code == 200:
        record("AUTH-IDOR-003-msgs", f"{r5.status_code}",
               "IDOR: B reads A's group messages", "Critical", False)

    # 3e rename
    r6 = client.put(f"{API}/split/groups/{groupA_id}/name",
                    json={"name": "HACKED"}, headers=auth_headers(tokenB))
    if r6.status_code in (403, 404):
        record("AUTH-IDOR-003-rename", f"{r6.status_code}", "B blocked from renaming A's group", "", True)
    elif r6.status_code == 200:
        record("AUTH-IDOR-003-rename", f"{r6.status_code}",
               "CRITICAL: B renamed A's group", "Critical", False)

    # 3f post msg
    r7 = client.post(f"{API}/split/groups/{groupA_id}/messages",
                     json={"content": "hacked-by-B", "type": "text"},
                     headers=auth_headers(tokenB))
    if r7.status_code in (403, 404):
        record("AUTH-IDOR-003-postmsg", f"{r7.status_code}", "B blocked posting to A's group", "", True)
    elif r7.status_code == 200:
        record("AUTH-IDOR-003-postmsg", f"{r7.status_code}",
               "CRITICAL: B posted msg in A's group", "Critical", False)

    # 3g remove member
    r_rm = client.delete(f"{API}/split/groups/{groupA_id}/members/{uidA}",
                         headers=auth_headers(tokenB))
    if r_rm.status_code in (403, 404):
        record("AUTH-IDOR-003-rmember", f"{r_rm.status_code}", "B blocked from removing members", "", True)
    elif r_rm.status_code == 200:
        record("AUTH-IDOR-003-rmember", f"{r_rm.status_code}",
               "CRITICAL: B removed A (owner!) from A's group", "Critical", False)

    # 3h delete group
    r8 = client.delete(f"{API}/split/groups/{groupA_id}", headers=auth_headers(tokenB))
    if r8.status_code in (403, 404):
        record("AUTH-IDOR-003-delete", f"{r8.status_code}", "B blocked from deleting A's group", "", True)
    elif r8.status_code == 200:
        record("AUTH-IDOR-003-delete", f"{r8.status_code}",
               "CRITICAL: B DELETED A's group", "Critical", False)
else:
    record("AUTH-IDOR-003", f"{r.status_code}", f"seed group failed: {r.text[:150]}", "", False)


# ═══════════════════════════════════════════════════════════════════════
# TEST 4 — AUTH-BYPASS-001: No Authorization header
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 4: AUTH-BYPASS-001 (no Authorization header) ───")
PROTECTED_ROUTES = [
    ("GET", "/transactions"),
    ("GET", "/user/avatar"),
    ("GET", "/user/me"),
    ("GET", "/split/groups"),
    ("GET", "/budgets/live"),
    ("GET", "/stats/overview"),
    ("POST", "/transactions"),
    ("GET", "/split/balances"),
    ("POST", "/user/avatar"),
]
for method, path in PROTECTED_ROUTES:
    try:
        if method == "GET":
            r = client.get(f"{API}{path}", timeout=10)
        else:
            r = client.post(f"{API}{path}", json={}, timeout=10)
    except Exception as e:
        record(f"AUTH-BYPASS {method} {path}", "ERR", str(e), "", False)
        continue
    if r.status_code in (401, 403, 422):
        record(f"AUTH-BYPASS {method} {path}", f"{r.status_code}", "auth enforced", "", True)
    elif r.status_code == 200:
        record(f"AUTH-BYPASS {method} {path}", f"{r.status_code}",
               f"CRITICAL: unauth access! body={r.text[:120]}", "Critical", False)
    else:
        record(f"AUTH-BYPASS {method} {path}", f"{r.status_code}", r.text[:150], "Low", True)


# ═══════════════════════════════════════════════════════════════════════
# TEST 5 — INJ-NOSQL-001: Mongo operator injection
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 5: INJ-NOSQL-001 (Mongo $ne injection) ───")
try:
    r = client.post(f"{API}/auth/verify-otp",
                    json={"phone": {"$ne": None}, "otp": {"$ne": None}},
                    timeout=15)
    if r.status_code in (422, 400, 401):
        record("INJ-NOSQL-001", f"{r.status_code}", "Pydantic rejected $ne objects", "", True)
    elif r.status_code == 200 and "token" in r.text:
        record("INJ-NOSQL-001", f"{r.status_code}", f"CRITICAL: NoSQL bypass: {r.text[:120]}", "Critical", False)
    else:
        record("INJ-NOSQL-001", f"{r.status_code}", r.text[:150], "", r.status_code != 200)
except Exception as e:
    record("INJ-NOSQL-001", "ERR", str(e), "High", False)

try:
    r = client.post(f"{API}/auth/send-otp", json={"phone": {"$ne": None}}, timeout=15)
    if r.status_code in (400, 422):
        record("INJ-NOSQL-001b send-otp", f"{r.status_code}", "rejected dict in phone", "", True)
    else:
        record("INJ-NOSQL-001b send-otp", f"{r.status_code}", r.text[:150], "", r.status_code != 200)
except Exception as e:
    record("INJ-NOSQL-001b send-otp", "ERR", str(e), "", False)


# ═══════════════════════════════════════════════════════════════════════
# TEST 6 — XSS + PATH-TRAV
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 6: INJ-XSS-001 + PATH-TRAV ───")
xss_payloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(document.cookie)",
    "\"'`<svg/onload=alert(1)>",
]
for i, payload in enumerate(xss_payloads):
    r = client.post(f"{API}/transactions",
                    json={"amount": 50.0, "category": "Food", "description": payload, "type": "debit"},
                    headers=auth_headers(tokenA))
    if r.status_code == 200:
        record(f"INJ-XSS-001-{i}", f"{r.status_code}", "stored without crash", "", True)
    elif r.status_code == 500:
        record(f"INJ-XSS-001-{i}", f"{r.status_code}", f"CRASH: {r.text[:120]}", "High", False)
    else:
        record(f"INJ-XSS-001-{i}", f"{r.status_code}", r.text[:150], "Low", True)

r = client.post(f"{API}/transactions",
                json={"amount": 99.0, "category": "../../../etc/passwd",
                      "description": "pathtrav", "type": "debit"},
                headers=auth_headers(tokenA))
if r.status_code in (200, 400, 422):
    record("PATH-TRAV-001", f"{r.status_code}", "stored as plain string OR rejected", "", True)
elif r.status_code == 500:
    record("PATH-TRAV-001", f"{r.status_code}", f"CRASH: {r.text[:150]}", "High", False)

try:
    r = client.get(f"{API}/../etc/passwd", headers=auth_headers(tokenA))
    record("PATH-TRAV-URL", f"{r.status_code}",
           "path traversal blocked" if r.status_code in (404, 400, 405, 301, 307) else "?",
           "", r.status_code in (404, 400, 405, 301, 307))
except Exception as e:
    record("PATH-TRAV-URL", "ERR", str(e), "", True)


# ═══════════════════════════════════════════════════════════════════════
# TEST 7 — VAL-NEG-001
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 7: VAL-NEG-001 (negative amount) ───")
for amt in (-1_000_000_000, -1.0, -0.01):
    r = client.post(f"{API}/transactions",
                    json={"amount": amt, "category": "Food",
                          "description": f"neg-{amt}", "type": "debit"},
                    headers=auth_headers(tokenA))
    if r.status_code in (400, 422):
        record(f"VAL-NEG-001 amt={amt}", f"{r.status_code}", "rejected", "", True)
    elif r.status_code == 200:
        record(f"VAL-NEG-001 amt={amt}", f"{r.status_code}",
               f"NEGATIVE AMT STORED — corrupts stats: {r.text[:120]}", "Medium", False)
    elif r.status_code == 500:
        record(f"VAL-NEG-001 amt={amt}", f"{r.status_code}", f"CRASH: {r.text[:120]}", "High", False)

r = client.post(f"{API}/transactions",
                json={"amount": 0, "category": "Food", "description": "zero", "type": "debit"},
                headers=auth_headers(tokenA))
record("VAL-ZERO", f"{r.status_code}", f"amount=0 → {r.text[:80]}", "",
       r.status_code in (200, 400, 422))


# ═══════════════════════════════════════════════════════════════════════
# TEST 8 — VAL-OVERSIZE
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 8: VAL-OVERSIZE-001 (1MB description) ───")
huge = "A" * (1024 * 1024)
try:
    r = client.post(f"{API}/transactions",
                    json={"amount": 10, "category": "Food",
                          "description": huge, "type": "debit"},
                    headers=auth_headers(tokenA), timeout=60)
    if r.status_code in (400, 413, 422):
        record("VAL-OVERSIZE-001", f"{r.status_code}", "oversize rejected", "", True)
    elif r.status_code == 200:
        record("VAL-OVERSIZE-001", f"{r.status_code}",
               "1MB stored — may bloat db + slow queries", "Medium", False)
    elif r.status_code == 500:
        record("VAL-OVERSIZE-001", f"{r.status_code}", f"CRASH: {r.text[:120]}", "High", False)
    else:
        record("VAL-OVERSIZE-001", f"{r.status_code}", r.text[:150], "Low", True)
except Exception as e:
    record("VAL-OVERSIZE-001", "ERR", str(e), "High", False)

try:
    big_b64 = "A" * 800_000
    r = client.post(f"{API}/user/avatar", json={"avatar": big_b64},
                    headers=auth_headers(tokenA), timeout=20)
    if r.status_code == 400:
        record("VAL-OVERSIZE-avatar", f"{r.status_code}", "avatar size cap enforced", "", True)
    elif r.status_code == 200:
        record("VAL-OVERSIZE-avatar", f"{r.status_code}", "oversized avatar accepted", "Medium", False)
    else:
        record("VAL-OVERSIZE-avatar", f"{r.status_code}", r.text[:150], "Low", r.status_code != 500)
except Exception as e:
    record("VAL-OVERSIZE-avatar", "ERR", str(e), "High", False)


# ═══════════════════════════════════════════════════════════════════════
# TEST 9 — RACE-DOUBLE-001
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 9: RACE-DOUBLE-001 (10 parallel identical txns) ───")

async def race_txn():
    async with httpx.AsyncClient(timeout=30) as c:
        body = {"amount": 777.77, "category": "Food",
                "description": "RACE-IDENT", "type": "debit"}
        tasks = [c.post(f"{API}/transactions", json=body,
                        headers=auth_headers(tokenA)) for _ in range(10)]
        return await asyncio.gather(*tasks, return_exceptions=True)

try:
    resps = asyncio.run(race_txn())
    ok_count = sum(1 for r in resps if not isinstance(r, Exception) and r.status_code == 200)
    err_count = sum(1 for r in resps if isinstance(r, Exception) or (hasattr(r, 'status_code') and r.status_code >= 500))
    r = client.get(f"{API}/transactions?limit=200", headers=auth_headers(tokenA))
    ident_count = sum(1 for t in (r.json() if r.status_code == 200 else [])
                      if t.get("description") == "RACE-IDENT")
    if ok_count == 10 and ident_count == 10:
        record("RACE-DOUBLE-001", f"{ok_count}/10",
               "NO DEDUP: 10 duplicate txns — no idempotency key", "Medium", False)
    elif ident_count < 10 and ok_count == 10:
        record("RACE-DOUBLE-001", f"{ok_count}/10", f"some dedup: stored={ident_count}", "", True)
    else:
        record("RACE-DOUBLE-001", f"ok={ok_count} err={err_count} stored={ident_count}",
               "partial race", "Low", True)
except Exception as e:
    record("RACE-DOUBLE-001", "ERR", str(e), "", False)


# ═══════════════════════════════════════════════════════════════════════
# TEST 10 — RACE-SPLIT-001
# ═══════════════════════════════════════════════════════════════════════
print("\n─── TEST 10: RACE-SPLIT-001 (concurrent split expenses) ───")
r = client.post(f"{API}/split/groups",
                json={"name": "Race Group", "members": ["9876543210", "9988776655"]},
                headers=auth_headers(tokenA))
if r.status_code == 200:
    raceG = r.json()["id"]
    async def race_exp():
        async with httpx.AsyncClient(timeout=30) as c:
            body = {"group_id": raceG, "description": "race-exp", "amount": 500.0,
                    "paid_by": uidA, "split_type": "equal"}
            tasks = [c.post(f"{API}/split/expenses", json=body,
                            headers=auth_headers(tokenA)) for _ in range(5)]
            return await asyncio.gather(*tasks, return_exceptions=True)
    try:
        resps = asyncio.run(race_exp())
        okc = sum(1 for r in resps if not isinstance(r, Exception) and r.status_code == 200)
        errc = sum(1 for r in resps if isinstance(r, Exception) or (hasattr(r,'status_code') and r.status_code >= 500))

        r2 = client.get(f"{API}/split/groups/{raceG}/summary", headers=auth_headers(tokenA))
        if r2.status_code == 200:
            data = r2.json()
            total = data.get("total_spent", 0)
            expected = okc * 500.0
            if abs(total - expected) < 0.01:
                record("RACE-SPLIT-001", f"ok={okc}/5 err={errc}",
                       f"arith OK: total_spent={total} == {expected}", "", True)
            else:
                record("RACE-SPLIT-001", f"ok={okc}/5",
                       f"ARITH DRIFT: total={total} expected={expected}", "High", False)
        else:
            record("RACE-SPLIT-001", f"summary {r2.status_code}", r2.text[:150], "Medium", False)
    except Exception as e:
        record("RACE-SPLIT-001", "ERR", str(e), "High", False)
else:
    record("RACE-SPLIT-001", f"{r.status_code}", f"group seed failed: {r.text[:120]}", "", False)


# ═══════════════════════════════════════════════════════════════════════
# CHAOS / BOUNDARY
# ═══════════════════════════════════════════════════════════════════════
print("\n─── CHAOS / BOUNDARY ───")

try:
    r = client.post(f"{API}/transactions",
                    content=b"{not valid json",
                    headers={**auth_headers(tokenA), "Content-Type": "application/json"})
    record("CHAOS-malformed-json", f"{r.status_code}",
           r.text[:100], "", r.status_code in (400, 422))
except Exception as e:
    record("CHAOS-malformed-json", "ERR", str(e), "", False)

r = client.post(f"{API}/auth/send-otp", json={"phone": "abc defgh"})
record("CHAOS-phone-nonnumeric", f"{r.status_code}",
       r.text[:100], "", r.status_code in (400, 422))

r = client.post(f"{API}/auth/send-otp", json={"phone": "9" * 500})
record("CHAOS-phone-500chars", f"{r.status_code}",
       r.text[:100], "", r.status_code in (400, 422))

r = client.post(f"{API}/auth/verify-otp", json={"phone": "9876543210", "otp": None})
record("CHAOS-otp-null", f"{r.status_code}", r.text[:100], "",
       r.status_code in (400, 401, 422))

for bad in ("NaN", "Infinity", "-Infinity"):
    try:
        payload = f'{{"amount": {bad}, "category":"Food","description":"x","type":"debit"}}'
        r = client.post(f"{API}/transactions", content=payload.encode(),
                        headers={**auth_headers(tokenA), "Content-Type": "application/json"})
        if r.status_code in (400, 422):
            record(f"CHAOS-amount-{bad}", f"{r.status_code}", "rejected", "", True)
        elif r.status_code == 200:
            record(f"CHAOS-amount-{bad}", f"{r.status_code}",
                   f"ACCEPTED — corrupts stats: {r.text[:80]}", "High", False)
        elif r.status_code == 500:
            record(f"CHAOS-amount-{bad}", f"{r.status_code}", f"CRASH: {r.text[:100]}", "High", False)
        else:
            record(f"CHAOS-amount-{bad}", f"{r.status_code}", r.text[:100], "", True)
    except Exception as e:
        record(f"CHAOS-amount-{bad}", "ERR", str(e), "", False)

r = client.post(f"{API}/transactions",
                json={"amount": 42, "category": "Food", "description": "💰🚀😱🎉", "type": "debit"},
                headers=auth_headers(tokenA))
record("CHAOS-emoji", f"{r.status_code}", r.text[:120], "", r.status_code == 200)

# swap-signature bearer
valid = tokenA
head_body, sig = valid.rsplit(".", 1)
bad_token = head_body + "." + "".join(random.choices(string.ascii_letters + string.digits + "-_", k=len(sig)))
r = client.get(f"{API}/user/me", headers={"Authorization": f"Bearer {bad_token}"})
record("CHAOS-bad-sig", f"{r.status_code}", r.text[:100], "",
       r.status_code == 401)

try:
    r = client.get(f"{API}/user/me", headers={"Authorization": "Bearer"})
    record("CHAOS-empty-bearer", f"{r.status_code}", r.text[:100], "",
           r.status_code in (401, 403, 422))
except Exception as e:
    record("CHAOS-empty-bearer", "ERR", str(e)[:100], "", False)

r = client.get(f"{API}/user/me", headers={"Authorization": "Bearer not-a-jwt-at-all"})
record("CHAOS-garbage-bearer", f"{r.status_code}", r.text[:100], "",
       r.status_code == 401)


# ═══════════════════════════════════════════════════════════════════════
# VERIFY-OTP EDGE CASES
# ═══════════════════════════════════════════════════════════════════════
print("\n─── VERIFY-OTP EDGE CASES ───")
r = client.post(f"{API}/auth/verify-otp", json={"phone": "", "otp": "123456"})
record("VERIFY-empty-phone", f"{r.status_code}", r.text[:100], "",
       r.status_code in (400, 422))


# ═══════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════
print("\n" + "═" * 72)
total = len(results)
passed = sum(1 for r in results if r["passed"] is True)
failed = sum(1 for r in results if r["passed"] is False)
unknown = sum(1 for r in results if r["passed"] is None)
crit = [r for r in results if r.get("severity") == "Critical" and r["passed"] is False]
high = [r for r in results if r.get("severity") == "High" and r["passed"] is False]
med = [r for r in results if r.get("severity") == "Medium" and r["passed"] is False]

print(f"  TOTAL: {total}  |  ✅ passed: {passed}  |  ❌ failed: {failed}  |  • skipped: {unknown}")
print(f"  SEVERITY — Critical: {len(crit)}  High: {len(high)}  Medium: {len(med)}")
print("═" * 72)

if crit:
    print("\n🔴 CRITICAL FAILURES:")
    for c in crit:
        print(f"   [{c['id']}] {c['status']}  {c['detail']}")
if high:
    print("\n🟠 HIGH FAILURES:")
    for h in high:
        print(f"   [{h['id']}] {h['status']}  {h['detail']}")
if med:
    print("\n🟡 MEDIUM FAILURES:")
    for m in med:
        print(f"   [{m['id']}] {m['status']}  {m['detail']}")

sys.exit(0)
