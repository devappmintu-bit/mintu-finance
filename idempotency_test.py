"""
Phase 2 Offline Queue — Backend Idempotency Validation
Tests POST /api/split/expenses with Idempotency-Key header.
"""
import asyncio
import os
import uuid
import json
import sys
import httpx

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = {"passed": [], "failed": []}

def report(name, ok, detail=""):
    status = "✅ PASS" if ok else "❌ FAIL"
    print(f"{status} — {name}")
    if detail:
        print(f"        {detail}")
    (results["passed"] if ok else results["failed"]).append({"name": name, "detail": detail})


async def login(client):
    r = await client.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE})
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = await client.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PHONE, "otp": OTP})
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    user_id = data.get("user", {}).get("id") or data.get("user_id")
    assert token, f"No token in response: {data}"
    return token, user_id


async def get_or_create_group(client, headers):
    """Reuse existing group, else create one with a pending member."""
    r = await client.get(f"{BASE_URL}/split/groups", headers=headers)
    assert r.status_code == 200, f"groups list failed: {r.status_code} {r.text}"
    payload = r.json()
    groups = payload if isinstance(payload, list) else payload.get("groups", [])
    # Filter for groups with at least 2 members where current user is a member
    for g in groups:
        members = g.get("members", [])
        if len(members) >= 2:
            return g
    # Create
    r = await client.post(
        f"{BASE_URL}/split/groups",
        headers=headers,
        json={"name": "Idempotency Test Group", "members": ["9000000001"]},
    )
    assert r.status_code == 200, f"group create failed: {r.status_code} {r.text}"
    return r.json()


async def count_group_expenses(client, headers, group_id, description=None):
    r = await client.get(f"{BASE_URL}/split/groups/{group_id}/expenses", headers=headers)
    if r.status_code != 200:
        return -1
    data = r.json()
    expenses = data.get("expenses", []) if isinstance(data, dict) else data
    if description:
        return [e for e in expenses if e.get("description") == description]
    return expenses


async def main():
    timeout = httpx.Timeout(60.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout, verify=True) as client:
        print("=" * 70)
        print("LOGIN")
        print("=" * 70)
        token, user_id = await login(client)
        headers = {"Authorization": f"Bearer {token}"}
        print(f"Logged in. user_id={user_id}, token={token[:20]}...")

        group = await get_or_create_group(client, headers)
        group_id = group.get("id") or group.get("_id")
        member_ids = [m["user_id"] for m in group.get("members", [])]
        print(f"Group: {group.get('name')} id={group_id}, members={len(member_ids)}")

        # Helper to build splits — use equal split via empty splits + split_type=equal
        def equal_body(description, amount):
            return {
                "group_id": group_id,
                "paid_by": user_id,
                "description": description,
                "amount": amount,
                "split_type": "equal",
                "splits": {},  # equal split distributes automatically
            }

        # ---------- Scenario 1: SAME key, sequential ----------
        print("\n" + "=" * 70)
        print("SCENARIO 1 — Sequential retry with SAME Idempotency-Key")
        print("=" * 70)
        uuid_A = str(uuid.uuid4())
        body1 = equal_body("test idem 1", 100)
        h1 = {**headers, "Idempotency-Key": uuid_A}

        before = await count_group_expenses(client, headers, group_id, "test idem 1")
        before_count = len(before)

        r1 = await client.post(f"{BASE_URL}/split/expenses", headers=h1, json=body1)
        r2 = await client.post(f"{BASE_URL}/split/expenses", headers=h1, json=body1)

        report("S1.r1 status 200", r1.status_code == 200, f"got {r1.status_code}: {r1.text[:200]}")
        report("S1.r2 status 200", r2.status_code == 200, f"got {r2.status_code}: {r2.text[:200]}")

        if r1.status_code == 200 and r2.status_code == 200:
            j1, j2 = r1.json(), r2.json()
            id1, id2 = j1.get("id"), j2.get("id")
            report("S1 same expense id", id1 == id2, f"id1={id1}, id2={id2}")
            # byte-equal? compare normalized json
            same_body = json.dumps(j1, sort_keys=True, default=str) == json.dumps(j2, sort_keys=True, default=str)
            report("S1 responses byte-equal", same_body, "")

        after = await count_group_expenses(client, headers, group_id, "test idem 1")
        report("S1 exactly ONE new expense", len(after) == before_count + 1,
               f"before={before_count}, after={len(after)}")

        # ---------- Scenario 2: CONCURRENT same key ----------
        print("\n" + "=" * 70)
        print("SCENARIO 2 — Concurrent retry with SAME Idempotency-Key")
        print("=" * 70)
        uuid_B = str(uuid.uuid4())
        body2 = equal_body("test idem 2", 200)
        h2 = {**headers, "Idempotency-Key": uuid_B}

        before2 = await count_group_expenses(client, headers, group_id, "test idem 2")
        before2_count = len(before2)

        async def fire():
            return await client.post(f"{BASE_URL}/split/expenses", headers=h2, json=body2)

        responses = await asyncio.gather(*[fire() for _ in range(5)], return_exceptions=True)
        statuses = [r.status_code if hasattr(r, 'status_code') else f"EXC:{r}" for r in responses]
        print(f"        Statuses: {statuses}")

        success_count = sum(1 for r in responses if hasattr(r, 'status_code') and r.status_code == 200)
        conflict_count = sum(1 for r in responses if hasattr(r, 'status_code') and r.status_code == 409)
        # Per contract: all 5 succeed OR 1 succeeds + 4 conflict OR a mix
        contract_ok = (success_count == 5) or (success_count >= 1 and (success_count + conflict_count == 5))
        report("S2 all responses 200 or 1+success+rest 409",
               contract_ok,
               f"200s={success_count}, 409s={conflict_count}, total={len(responses)}")

        # Extract ids of successful ones
        ids = set()
        for r in responses:
            if hasattr(r, 'status_code') and r.status_code == 200:
                ids.add(r.json().get("id"))
        report("S2 all successful responses share ONE id", len(ids) <= 1,
               f"distinct ids: {ids}")

        # CRITICAL: DB should have exactly ONE new expense
        # Allow propagation
        await asyncio.sleep(0.5)
        after2 = await count_group_expenses(client, headers, group_id, "test idem 2")
        report("S2 CRITICAL: exactly ONE expense row in DB",
               len(after2) == before2_count + 1,
               f"before={before2_count}, after={len(after2)}")

        # ---------- Scenario 3: DIFFERENT keys, same payload ----------
        print("\n" + "=" * 70)
        print("SCENARIO 3 — DIFFERENT keys, same payload")
        print("=" * 70)
        uuid_C1 = str(uuid.uuid4())
        uuid_C2 = str(uuid.uuid4())
        body3 = equal_body("diff keys", 300)
        before3 = await count_group_expenses(client, headers, group_id, "diff keys")
        before3_count = len(before3)

        rc1 = await client.post(f"{BASE_URL}/split/expenses",
                                headers={**headers, "Idempotency-Key": uuid_C1}, json=body3)
        rc2 = await client.post(f"{BASE_URL}/split/expenses",
                                headers={**headers, "Idempotency-Key": uuid_C2}, json=body3)
        report("S3 both 200", rc1.status_code == 200 and rc2.status_code == 200,
               f"c1={rc1.status_code}, c2={rc2.status_code}")
        if rc1.status_code == 200 and rc2.status_code == 200:
            id_c1, id_c2 = rc1.json().get("id"), rc2.json().get("id")
            report("S3 distinct ids", id_c1 != id_c2, f"c1.id={id_c1}, c2.id={id_c2}")

        after3 = await count_group_expenses(client, headers, group_id, "diff keys")
        report("S3 TWO new expense rows", len(after3) == before3_count + 2,
               f"before={before3_count}, after={len(after3)}")

        # ---------- Scenario 4: Header case insensitivity ----------
        print("\n" + "=" * 70)
        print("SCENARIO 4 — Header case insensitivity")
        print("=" * 70)
        uuid_D = str(uuid.uuid4())
        body4 = equal_body("case test", 400)
        before4 = await count_group_expenses(client, headers, group_id, "case test")
        before4_count = len(before4)

        rd_lower = await client.post(f"{BASE_URL}/split/expenses",
                                     headers={**headers, "idempotency-key": uuid_D}, json=body4)
        rd_canon = await client.post(f"{BASE_URL}/split/expenses",
                                     headers={**headers, "Idempotency-Key": uuid_D}, json=body4)
        report("S4 lower-case header 200", rd_lower.status_code == 200,
               f"got {rd_lower.status_code}: {rd_lower.text[:200]}")
        report("S4 canonical header 200", rd_canon.status_code == 200,
               f"got {rd_canon.status_code}: {rd_canon.text[:200]}")
        if rd_lower.status_code == 200 and rd_canon.status_code == 200:
            id_lower = rd_lower.json().get("id")
            id_canon = rd_canon.json().get("id")
            report("S4 same id (case-insensitive)", id_lower == id_canon,
                   f"lower.id={id_lower}, canon.id={id_canon}")

        after4 = await count_group_expenses(client, headers, group_id, "case test")
        report("S4 exactly ONE new expense", len(after4) == before4_count + 1,
               f"before={before4_count}, after={len(after4)}")

        # ---------- Scenario 5: NO key (legacy clients) ----------
        print("\n" + "=" * 70)
        print("SCENARIO 5 — No Idempotency-Key (legacy)")
        print("=" * 70)
        body5 = equal_body("no key", 500)
        before5 = await count_group_expenses(client, headers, group_id, "no key")
        before5_count = len(before5)

        re1 = await client.post(f"{BASE_URL}/split/expenses", headers=headers, json=body5)
        re2 = await client.post(f"{BASE_URL}/split/expenses", headers=headers, json=body5)
        report("S5 first 200", re1.status_code == 200, f"got {re1.status_code}")
        report("S5 second 200", re2.status_code == 200, f"got {re2.status_code}")
        if re1.status_code == 200 and re2.status_code == 200:
            id_e1 = re1.json().get("id")
            id_e2 = re2.json().get("id")
            report("S5 distinct ids (no dedup)", id_e1 != id_e2, f"e1={id_e1}, e2={id_e2}")
        after5 = await count_group_expenses(client, headers, group_id, "no key")
        report("S5 TWO new expense rows", len(after5) == before5_count + 2,
               f"before={before5_count}, after={len(after5)}")

        # ---------- MongoDB direct verification ----------
        print("\n" + "=" * 70)
        print("MongoDB idempotency_keys collection check")
        print("=" * 70)
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            mongo_url = "mongodb://localhost:27017"
            mclient = AsyncIOMotorClient(mongo_url)
            mdb = mclient["mintu_database"]
            # Look up our 5 keys
            for label, key in [("A", uuid_A), ("B", uuid_B), ("C1", uuid_C1),
                               ("C2", uuid_C2), ("D", uuid_D)]:
                composite = f"{user_id}::split_expense::{key}"
                doc = await mdb.idempotency_keys.find_one({"_id": composite})
                if doc:
                    has_resp = doc.get("response") is not None
                    has_created = doc.get("created_at") is not None
                    is_committed = doc.get("status") == "committed"
                    report(f"DB key {label} exists & committed",
                           is_committed and has_resp and has_created,
                           f"status={doc.get('status')}, response={'yes' if has_resp else 'no'}, "
                           f"created_at={'yes' if has_created else 'no'}")
                else:
                    report(f"DB key {label} exists", False, f"composite_id not found: {composite}")
            # Check TTL index
            indexes = await mdb.idempotency_keys.index_information()
            ttl_idx = None
            for name, info in indexes.items():
                if info.get("expireAfterSeconds") is not None:
                    ttl_idx = (name, info.get("expireAfterSeconds"), info.get("key"))
                    break
            if ttl_idx:
                report("DB TTL index exists",
                       ttl_idx[1] == 86400,
                       f"name={ttl_idx[0]}, expireAfterSeconds={ttl_idx[1]}, key={ttl_idx[2]}")
            else:
                report("DB TTL index exists", False, "no TTL index found")
            mclient.close()
        except Exception as e:
            print(f"        Mongo verification skipped: {e}")

        # ---------- Final summary ----------
        print("\n" + "=" * 70)
        print(f"RESULT: {len(results['passed'])} passed, {len(results['failed'])} failed")
        print("=" * 70)
        for f in results["failed"]:
            print(f"  ❌ {f['name']}: {f['detail']}")

        return 0 if not results["failed"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
