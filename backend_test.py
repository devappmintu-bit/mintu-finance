"""
Phase 3 Backend Validation Test
================================
Scope (strict):
  - Group code generation on POST /api/split/groups (HSTL-7K2 format)
  - Lazy backfill on GET /api/split/groups (legacy groups → atomic claim)
  - Sparse UNIQUE index `split_groups_code_unique` enforcement
  - Concurrent creation race safety
  - POST /api/users/lookup-batch robustness

Auth: phone 9876543210, OTP 123456
"""
import asyncio
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BACKEND_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mintu-finance.preview.emergentagent.com").rstrip("/")
API = f"{BACKEND_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mintu_database")

PHONE = "9876543210"
OTP = "123456"

results: List[tuple] = []
created_group_ids: List[str] = []


def record(name: str, ok: bool, details: str = "") -> None:
    results.append((name, ok, details))
    icon = "✅" if ok else "❌"
    print(f"  {icon} {name} {('— ' + details) if details else ''}")


async def auth_token(client: httpx.AsyncClient):
    r = await client.post(f"{API}/auth/send-otp", json={"phone": PHONE})
    assert r.status_code == 200, f"send-otp: {r.status_code} {r.text}"
    r = await client.post(f"{API}/auth/verify-otp", json={"phone": PHONE, "otp": OTP})
    assert r.status_code == 200, f"verify-otp: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    user_id = body.get("user", {}).get("id") or body.get("user_id")
    if not user_id:
        h = {"Authorization": f"Bearer {token}"}
        r2 = await client.get(f"{API}/user/me", headers=h)
        if r2.status_code == 200:
            j = r2.json()
            user_id = j.get("id") or j.get("user", {}).get("id") or j.get("_id")
    return token, user_id


async def cleanup_groups(client, headers, ids):
    for gid in ids:
        try:
            await client.delete(f"{API}/split/groups/{gid}", headers=headers, timeout=10.0)
        except Exception:
            pass


# ── Scenarios ───────────────────────────────────────────────────────
async def scenario_1(client, headers, db):
    print("\n=== SCENARIO 1 — Group code format & stability ===")
    payload = {"name": "Hostel", "members": ["9000000001"], "custom_emoji": "🏠"}
    r = await client.post(f"{API}/split/groups", json=payload, headers=headers)
    record("S1.1 POST /split/groups Hostel → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        return
    j = r.json()
    gid = j["id"]
    created_group_ids.append(gid)
    # group_code may not be in create response — fetch from DB AND from GET
    code_from_create = j.get("group_code")
    doc = await db.split_groups.find_one({"_id": ObjectId(gid)})
    code_db = doc.get("group_code") if doc else None
    code = code_from_create or code_db
    record("S1.2 group_code persisted in DB", bool(code_db), f"db_code={code_db} resp_code={code_from_create}")
    if code:
        record(
            "S1.3 group_code matches ^[A-Z0-9]{4}-[A-Z2-9]{3}$",
            bool(re.match(r"^[A-Z0-9]{4}-[A-Z2-9]{3}$", code)),
            f"code={code}",
        )
        record("S1.4 prefix starts with HOST (deterministic from 'Hostel')", code.startswith("HOST"), f"code={code}")

    r2 = await client.get(f"{API}/split/groups", headers=headers)
    record("S1.5 GET /split/groups → 200", r2.status_code == 200)
    if r2.status_code != 200:
        return
    found = next((g for g in r2.json() if g["id"] == gid), None)
    record(
        "S1.6 GET returns same group_code as create",
        bool(found and found.get("group_code") == code),
        f"got={found.get('group_code') if found else None} expected={code}",
    )

    r3 = await client.get(f"{API}/split/groups", headers=headers)
    g3 = next((g for g in r3.json() if g["id"] == gid), None)
    record(
        "S1.7 second GET returns SAME group_code (no regeneration)",
        bool(g3 and g3.get("group_code") == code),
        f"got={g3.get('group_code') if g3 else None}",
    )


async def scenario_2(client, headers, db):
    print("\n=== SCENARIO 2 — Edge case names ===")
    # Backend has min_length=1 on `name`, so "" / "   " may be rejected by pydantic.
    # Spec says "no 500 errors", so 4xx for empty names is acceptable.
    cases = [
        ("Goa", "GOA", True),     # padded to 4
        ("", None, False),        # likely 422
        ("   ", None, False),     # likely 422 if .strip then ""
        ("🍻🍕", None, True),      # all stripped → fallback
        ("Café Munch", None, True),
    ]
    for name, _, expect_ok in cases:
        payload = {"name": name, "members": ["9000000002"]}
        r = await client.post(f"{API}/split/groups", json=payload, headers=headers)
        if expect_ok:
            ok_status = r.status_code == 200
            record(f"S2 name={name!r} create → 200", ok_status, f"status={r.status_code}")
            if ok_status:
                gid = r.json()["id"]
                created_group_ids.append(gid)
                doc = await db.split_groups.find_one({"_id": ObjectId(gid)})
                code = doc.get("group_code") if doc else None
                ok_format = bool(code and re.match(r"^[A-Z2-9]{4}-[A-Z2-9]{3}$", code))
                record(f"S2 name={name!r} code matches ^[A-Z2-9]4-[A-Z2-9]3$", ok_format, f"code={code}")
        else:
            # accept 200 OR 4xx (no 500)
            no_500 = r.status_code < 500
            record(f"S2 name={name!r} no 5xx", no_500, f"status={r.status_code}")
            if r.status_code == 200:
                gid = r.json()["id"]
                created_group_ids.append(gid)
                doc = await db.split_groups.find_one({"_id": ObjectId(gid)})
                code = doc.get("group_code") if doc else None
                ok_format = bool(code and re.match(r"^[A-Z2-9]{4}-[A-Z2-9]{3}$", code))
                record(f"S2 name={name!r} code valid format (since accepted)", ok_format, f"code={code}")

    # Goa determinism check
    r1 = await client.post(f"{API}/split/groups", json={"name": "Goa", "members": ["9000000003"]}, headers=headers)
    r2 = await client.post(f"{API}/split/groups", json={"name": "Goa", "members": ["9000000004"]}, headers=headers)
    if r1.status_code == 200 and r2.status_code == 200:
        gid1, gid2 = r1.json()["id"], r2.json()["id"]
        created_group_ids.extend([gid1, gid2])
        d1 = await db.split_groups.find_one({"_id": ObjectId(gid1)})
        d2 = await db.split_groups.find_one({"_id": ObjectId(gid2)})
        c1, c2 = d1.get("group_code"), d2.get("group_code")
        p1, p2 = c1.split("-")[0], c2.split("-")[0]
        record("S2.det1 two 'Goa' groups: prefixes IDENTICAL", p1 == p2, f"{c1} vs {c2}")
        record("S2.det2 two 'Goa' groups: full codes DIFFERENT", c1 != c2, f"{c1} vs {c2}")
    else:
        record("S2.det Goa double-create failed", False, f"r1={r1.status_code} r2={r2.status_code}")


async def scenario_3(client, headers, db):
    print("\n=== SCENARIO 3 — Concurrent creation (race-safe issuance) ===")
    payload = {"name": "RaceTest", "members": ["9000000005"]}

    async def one_post():
        try:
            r = await client.post(f"{API}/split/groups", json=payload, headers=headers, timeout=30.0)
            return r.status_code, (r.json() if r.status_code == 200 else r.text)
        except Exception as e:
            return 599, str(e)

    out = await asyncio.gather(*[one_post() for _ in range(10)])
    statuses = [s for s, _ in out]
    success = sum(1 for s in statuses if s == 200)
    record("S3.1 All 10 concurrent POSTs → 200", success == 10, f"successes={success}/10")

    codes = []
    for s, b in out:
        if s == 200 and isinstance(b, dict):
            gid = b.get("id")
            if gid:
                created_group_ids.append(gid)
                doc = await db.split_groups.find_one({"_id": ObjectId(gid)})
                if doc and doc.get("group_code"):
                    codes.append(doc["group_code"])

    print(f"  📋 Returned group_codes (from DB):")
    for c in codes:
        print(f"     • {c}")
    record("S3.2 All 10 codes UNIQUE", len(set(codes)) == 10 and len(codes) == 10, f"unique={len(set(codes))} total={len(codes)}")

    db_groups = await db.split_groups.find({"name": "RaceTest"}).to_list(50)
    db_codes = [g.get("group_code") for g in db_groups if g.get("group_code")]
    record(
        "S3.3 DB shows ≥10 RaceTest groups with distinct codes",
        len(db_groups) >= 10 and len(set(db_codes)) == len(db_codes),
        f"db_groups={len(db_groups)} unique_codes={len(set(db_codes))}",
    )


async def scenario_4(client, headers, db, user_id):
    print("\n=== SCENARIO 4 — Lazy backfill atomicity ===")
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        record("S4.0 user lookup failed", False)
        return

    legacy_doc = {
        "name": "Legacy Trip",
        "members": [{"user_id": user_id, "name": user["name"], "phone": user["phone"]}],
        "created_by": user_id,
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.split_groups.insert_one(legacy_doc)
    legacy_id = str(res.inserted_id)
    created_group_ids.append(legacy_id)
    pre = await db.split_groups.find_one({"_id": res.inserted_id})
    record("S4.0 Legacy group inserted WITHOUT group_code", "group_code" not in pre, f"keys={[k for k in pre.keys() if k != 'members']}")

    # The 30s cache on /split/groups means previous GETs may have cached without this group.
    # But cache is stamped at GET time AND legacy group was just inserted directly.
    # If cache still hot from S1, the GETs may all return cached (without legacy).
    # Wait briefly to age cache — 30s TTL... too long. Instead, let's INVALIDATE by triggering a write.
    # Easier path: clear the in-process cache prefix. But we can't from here.
    # Instead: the create_split_group calls in S1-S3 all called invalidate_split_cache_for_group, which clears
    # the cache on EVERY call. So cache should be empty after S3.
    # However, GETs in S1 may have re-cached. The last GET in S1 was after the last create which invalidated.
    # Subsequent GETs in S1 cache. Fine — just sleep 31s? Too slow.
    # Better: Force-clear the cache by explicitly creating a tiny dummy (which invalidates) then deleting.
    dummy = await client.post(f"{API}/split/groups", json={"name": "CacheBuster", "members": ["9000000099"]}, headers=headers)
    if dummy.status_code == 200:
        created_group_ids.append(dummy.json()["id"])

    async def one_get():
        try:
            r = await client.get(f"{API}/split/groups", headers=headers, timeout=30.0)
            return r.status_code, (r.json() if r.status_code == 200 else r.text)
        except Exception as e:
            return 599, str(e)

    out = await asyncio.gather(*[one_get() for _ in range(5)])
    legacy_codes = []
    for s, b in out:
        if s == 200 and isinstance(b, list):
            found = next((g for g in b if g.get("id") == legacy_id), None)
            legacy_codes.append(found.get("group_code") if found else None)
        else:
            legacy_codes.append(f"ERR{s}")

    print(f"  📋 5 concurrent GET responses for Legacy Trip:")
    for c in legacy_codes:
        print(f"     • {c}")
    all_present = all(c and not str(c).startswith("ERR") for c in legacy_codes)
    record("S4.1 All 5 concurrent GETs include legacy group with code", all_present, f"codes={legacy_codes}")
    if all_present:
        unique = set(legacy_codes)
        record("S4.2 All 5 GETs return SAME group_code (atomic claim)", len(unique) == 1, f"unique={unique}")
        winner = legacy_codes[0]
    else:
        winner = None

    r_seq = await client.get(f"{API}/split/groups", headers=headers)
    if r_seq.status_code == 200:
        found = next((g for g in r_seq.json() if g.get("id") == legacy_id), None)
        seq_code = found.get("group_code") if found else None
        record("S4.3 Sequential GET returns same code (persistence)", winner is not None and seq_code == winner, f"seq={seq_code} winner={winner}")
    else:
        record("S4.3 Sequential GET", False, f"status={r_seq.status_code}")

    db_doc = await db.split_groups.find_one({"_id": res.inserted_id})
    record("S4.4 Mongo doc has group_code field", bool(db_doc.get("group_code")), f"code={db_doc.get('group_code')}")


async def scenario_5(client, headers, db):
    print("\n=== SCENARIO 5 — Unique-index DB enforcement ===")
    info = await db.split_groups.index_information()
    has_idx = "split_groups_code_unique" in info
    record("S5.1 split_groups_code_unique index exists", has_idx, f"keys={list(info.keys())}")
    if has_idx:
        idx = info["split_groups_code_unique"]
        record("S5.2 index unique=True", idx.get("unique") is True, f"unique={idx.get('unique')}")
        record("S5.3 index sparse=True", idx.get("sparse") is True, f"sparse={idx.get('sparse')}")
        record("S5.4 index key=[('group_code', 1)]", idx.get("key") == [("group_code", 1)], f"key={idx.get('key')}")

    dup_code = "ZZZZ-Z9Z"
    raised = False
    inserted_id_1 = None
    try:
        r1 = await db.split_groups.insert_one({
            "name": "DupTest1", "members": [], "created_at": datetime.now(timezone.utc), "group_code": dup_code,
        })
        inserted_id_1 = r1.inserted_id
        await db.split_groups.insert_one({
            "name": "DupTest2", "members": [], "created_at": datetime.now(timezone.utc), "group_code": dup_code,
        })
    except DuplicateKeyError:
        raised = True
    finally:
        if inserted_id_1:
            await db.split_groups.delete_one({"_id": inserted_id_1})
        await db.split_groups.delete_many({"name": "DupTest2"})
    record("S5.5 Duplicate group_code direct-insert raises DuplicateKeyError", raised)


async def scenario_6(client, headers):
    print("\n=== SCENARIO 6 — Lookup-batch robustness ===")
    # 1 phone
    r = await client.post(f"{API}/users/lookup-batch", json={"phones": ["9876543210"]}, headers=headers)
    record("S6.1 1 phone → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        record("S6.1.body has matches[]", "matches" in r.json() and isinstance(r.json()["matches"], list))

    # 50 phones
    phones50 = [f"90000{str(i).zfill(5)}" for i in range(50)]
    r = await client.post(f"{API}/users/lookup-batch", json={"phones": phones50}, headers=headers)
    record("S6.2 50 phones → 200", r.status_code == 200, f"status={r.status_code}")

    # 100 phones (cap)
    phones100 = [f"90000{str(i).zfill(5)}" for i in range(100)]
    r = await client.post(f"{API}/users/lookup-batch", json={"phones": phones100}, headers=headers)
    record("S6.3 100 phones (cap) → 200", r.status_code == 200, f"status={r.status_code}")

    # 150 phones → 400
    phones150 = [f"90000{str(i).zfill(5)}" for i in range(150)]
    r = await client.post(f"{API}/users/lookup-batch", json={"phones": phones150}, headers=headers)
    detail = ""
    try:
        detail = r.json().get("detail", "")
    except Exception:
        pass
    record("S6.4 150 phones → 400 with 'Too many phones' detail", r.status_code == 400 and "Too many phones" in detail, f"status={r.status_code} detail={detail}")

    # mixed valid/invalid
    mixed = ["9876543210", "abc", "12345", "9999999999"]
    r = await client.post(f"{API}/users/lookup-batch", json={"phones": mixed}, headers=headers)
    record("S6.5 mixed valid/invalid → 200 (no crash)", r.status_code == 200, f"status={r.status_code} body={r.text[:160]}")


async def main():
    print(f"Backend: {API}")
    print(f"Mongo:   {MONGO_URL}/{DB_NAME}")
    mongo = AsyncIOMotorClient(MONGO_URL)
    db = mongo[DB_NAME]

    async with httpx.AsyncClient(timeout=30.0) as client:
        token, user_id = await auth_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        print(f"Auth OK — user_id={user_id}")

        try:
            # Pre-cleanup: remove leftover RaceTest/Legacy Trip/Hostel/Goa groups from prior runs
            for n in ["RaceTest", "Legacy Trip", "Hostel", "Goa", "🍻🍕", "Café Munch", "CacheBuster", "DupTest1", "DupTest2"]:
                await db.split_groups.delete_many({"name": n})

            await scenario_1(client, headers, db)
            await scenario_2(client, headers, db)
            await scenario_3(client, headers, db)
            await scenario_4(client, headers, db, user_id)
            await scenario_5(client, headers, db)
            await scenario_6(client, headers)
        finally:
            print(f"\n=== CLEANUP — Deleting {len(created_group_ids)} groups via DELETE endpoint ===")
            await cleanup_groups(client, headers, created_group_ids)
            # Also delete by name as fallback
            for n in ["RaceTest", "Legacy Trip", "Hostel", "Goa", "🍻🍕", "Café Munch", "CacheBuster", "DupTest1", "DupTest2", ""]:
                await db.split_groups.delete_many({"name": n})

    print("\n" + "=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"RESULTS: {passed}/{total} passed")
    print("=" * 70)
    failed = [r for r in results if not r[1]]
    if failed:
        print("\nFAILED:")
        for n, _, d in failed:
            print(f"  ❌ {n} — {d}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
