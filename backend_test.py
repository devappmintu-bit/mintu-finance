"""Round 36 post-frontend-audit backend smoke test.

Confirms that:
  1. POST /api/auth/send-otp + /api/auth/verify-otp still work (9876543210/123456).
  2. GET /api/home/bundle returns 200 for authed user.
  3. POST /api/goals accepts a valid payload.
  4. POST /api/transactions works with a valid payload + idempotency_key
     (repeat returns deduped=true, only one row in DB).
  5. POST /api/split/groups accepts a valid payload.
  6. POST /api/rewards/claim-marketplace is idempotent. Two calls with the
     same reward_id for the same user → ledger has ONE debit, wallet has
     ONE entry.
"""
from __future__ import annotations

import os
import sys
import time
import uuid
from typing import Any, Dict, Optional

import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE = os.environ.get("PUBLIC_BACKEND_URL", "https://mintu-finance.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
PHONE = "9876543210"
OTP = "123456"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mintu_database")

TIMEOUT = 30

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, info: str = "") -> None:
    results.append((name, ok, info))
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {name}{(' - ' + info) if info else ''}")


def h(title: str) -> None:
    print(f"\n-- {title} --")


def do_auth() -> Optional[str]:
    h("1) Auth: send-otp + verify-otp")
    try:
        r = requests.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=TIMEOUT)
        record("POST /auth/send-otp 200", r.status_code == 200, f"status={r.status_code}")
    except Exception as e:
        record("POST /auth/send-otp", False, str(e))
        return None
    try:
        r = requests.post(f"{API}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=TIMEOUT)
        ok = r.status_code == 200
        token = None
        if ok:
            js = r.json()
            token = js.get("token") or js.get("access_token") or js.get("jwt")
            ok = bool(token)
        record("POST /auth/verify-otp 200 + token", ok, f"status={r.status_code}")
        if ok and token:
            return token
    except Exception as e:
        record("POST /auth/verify-otp", False, str(e))
    return None


def do_bundle(token: str) -> None:
    h("2) GET /home/bundle")
    try:
        r = requests.get(f"{API}/home/bundle",
                         headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
        ok = r.status_code == 200
        record("GET /home/bundle 200", ok, f"status={r.status_code}")
        if ok:
            js = r.json()
            required = {"user", "stats", "recent_txns", "cached_at", "cache_ttl_s"}
            missing = required - set(js.keys())
            record("  bundle has required keys", not missing,
                   f"missing={missing}" if missing else "")
    except Exception as e:
        record("GET /home/bundle", False, str(e))


def do_goals(token: str) -> None:
    h("3) POST /goals")
    payload = {
        "name": f"Round36 smoke goal {int(time.time())}",
        "target_amount": 50000,
        "saved_amount": 2500,
        "target_date": "2026-12-31",
        "color": "#F56E1E",
        "emoji": "G",
    }
    try:
        r = requests.post(f"{API}/goals", json=payload,
                          headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
        ok = r.status_code == 200
        record("POST /goals valid payload 200", ok, f"status={r.status_code} body={r.text[:200]}")
        if ok:
            g = r.json().get("goal", {})
            record("  goal has id + target_amount",
                   "id" in g and g.get("target_amount") == 50000,
                   f"id={g.get('id')}")
    except Exception as e:
        record("POST /goals", False, str(e))


def do_transactions(token: str) -> None:
    h("4) POST /transactions with idempotency_key")
    idem = f"smoke-r36-{uuid.uuid4().hex[:12]}"
    payload = {
        "amount": 123.45,
        "category": "Food",
        "description": "Round36 smoke test latte",
        "type": "debit",
        "idempotency_key": idem,
    }
    id1: Optional[str] = None
    try:
        r = requests.post(f"{API}/transactions", json=payload,
                          headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
        ok = r.status_code == 200
        record("POST /transactions 1st call 200", ok, f"status={r.status_code} body={r.text[:160]}")
        if ok:
            id1 = r.json().get("id")
            record("  1st call NOT deduped",
                   r.json().get("deduped") in (None, False),
                   f"deduped={r.json().get('deduped')}")
    except Exception as e:
        record("POST /transactions (1st)", False, str(e))

    try:
        r = requests.post(f"{API}/transactions", json=payload,
                          headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
        ok = r.status_code == 200
        record("POST /transactions 2nd call (same idem) 200", ok, f"status={r.status_code}")
        if ok:
            js = r.json()
            record("  2nd call has deduped=true", js.get("deduped") is True,
                   f"deduped={js.get('deduped')}")
            record("  2nd call returns same id", js.get("id") == id1,
                   f"id1={id1} id2={js.get('id')}")
    except Exception as e:
        record("POST /transactions (2nd)", False, str(e))


def do_split_group(token: str) -> None:
    h("5) POST /split/groups")
    payload = {
        "name": f"Smoke Group {int(time.time())}",
        "members": ["9999888877"],
    }
    try:
        r = requests.post(f"{API}/split/groups", json=payload,
                          headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
        ok = r.status_code == 200
        record("POST /split/groups 200", ok, f"status={r.status_code} body={r.text[:200]}")
        if ok:
            js = r.json()
            record("  response has id + >=2 members",
                   bool(js.get("id")) and len(js.get("members", [])) >= 2,
                   f"members={len(js.get('members', []))}")
    except Exception as e:
        record("POST /split/groups", False, str(e))


REWARD_ID = "airtel_50"


async def _grant_coins_if_needed(user_id: str, needed: int = 200) -> int:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    from bson import ObjectId
    try:
        u = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        u = None
    current = int((u or {}).get("coins", 0) or 0)
    current_balance = int((u or {}).get("coins_balance", 0) or 0)
    pipeline = [{"$match": {"user_id": user_id}},
                {"$group": {"_id": None, "sum": {"$sum": "$amount"}}}]
    agg = await db.ledger_transactions.aggregate(pipeline).to_list(1)
    ledger_sum = int(agg[0]["sum"]) if agg else 0
    print(f"    coins (users.coins={current}, coins_balance={current_balance}, "
          f"ledger_sum={ledger_sum}) -> target>= {needed}")
    if ledger_sum < needed:
        import datetime as _dt
        top_up = needed - ledger_sum
        idem = f"smoke-r36-topup::{user_id}::{uuid.uuid4().hex[:10]}"
        await db.ledger_transactions.insert_one({
            "user_id": user_id,
            "amount": int(top_up),
            "txn_type": "earn",
            "source": "smoke:test-topup",
            "idempotency_key": idem,
            "created_at": _dt.datetime.utcnow(),
        })
        ledger_sum += top_up

    # Force cached balances to match authoritative ledger sum. (The
    # /rewards/claim-marketplace flow uses coins_balance via spend_coins,
    # which must reflect the true ledger state.)
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "coins": int(ledger_sum),
            "coins_balance": int(ledger_sum),
            "reward_coins": int(ledger_sum),
        }},
    )
    client.close()
    return ledger_sum


async def _count_claim_side_effects(user_id: str) -> Dict[str, int]:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    wallet_n = await db.rewards_wallet.count_documents({
        "user_id": user_id, "source": "marketplace", "reward_id": REWARD_ID,
    })
    ledger_n = await db.ledger_transactions.count_documents({
        "user_id": user_id,
        "source": f"rewards:marketplace_claim:{REWARD_ID}",
    })
    client.close()
    return {"wallet": wallet_n, "ledger": ledger_n}


async def _cleanup_prev_state(user_id: str) -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.rewards_wallet.delete_many({
        "user_id": user_id, "source": "marketplace", "reward_id": REWARD_ID,
    })
    await db.ledger_transactions.delete_many({
        "user_id": user_id,
        "source": f"rewards:marketplace_claim:{REWARD_ID}",
    })
    client.close()


def _decode_user_id(token: str) -> Optional[str]:
    try:
        import base64, json
        payload_b64 = token.split(".")[1]
        padded = payload_b64 + "=" * (4 - len(payload_b64) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded))
        return data.get("user_id") or data.get("sub")
    except Exception:
        return None


def do_rewards_idempotency(token: str) -> None:
    h("6) POST /rewards/claim-marketplace idempotency")
    user_id = _decode_user_id(token)
    if not user_id:
        record("decode user_id from JWT", False, "could not decode JWT payload")
        return
    record("decode user_id from JWT", True, f"user_id={user_id}")

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_cleanup_prev_state(user_id))
        balance = loop.run_until_complete(_grant_coins_if_needed(user_id, 200))
        record("pre-test balance adequate (>= 45 coins)", balance >= 45, f"balance={balance}")

        r1 = requests.post(f"{API}/rewards/claim-marketplace",
                           json={"reward_id": REWARD_ID},
                           headers={"Authorization": f"Bearer {token}"},
                           timeout=TIMEOUT)
        record("POST /rewards/claim-marketplace (1st) 200",
               r1.status_code == 200, f"status={r1.status_code} body={r1.text[:220]}")
        js1 = r1.json() if r1.status_code == 200 else {}

        r2 = requests.post(f"{API}/rewards/claim-marketplace",
                           json={"reward_id": REWARD_ID},
                           headers={"Authorization": f"Bearer {token}"},
                           timeout=TIMEOUT)
        record("POST /rewards/claim-marketplace (2nd) 200",
               r2.status_code == 200, f"status={r2.status_code} body={r2.text[:220]}")
        js2 = r2.json() if r2.status_code == 200 else {}

        record("  2nd call reports deduped=true", js2.get("deduped") is True,
               f"deduped={js2.get('deduped')}")

        counts = loop.run_until_complete(_count_claim_side_effects(user_id))
        record("  ledger_transactions has exactly 1 debit row",
               counts["ledger"] == 1, f"count={counts['ledger']}")
        record("  rewards_wallet has exactly 1 entry",
               counts["wallet"] == 1, f"count={counts['wallet']}")

        if "coins" in js1 and "coins" in js2:
            record("  coin balance identical across the two calls",
                   js1["coins"] == js2["coins"],
                   f"1st={js1.get('coins')} 2nd={js2.get('coins')}")

        loop.run_until_complete(_cleanup_prev_state(user_id))
    finally:
        loop.close()


def main() -> int:
    print(f"Smoke-testing {API}")
    token = do_auth()
    if not token:
        print("\nCould not authenticate; aborting.")
        _summary()
        return 1
    do_bundle(token)
    do_goals(token)
    do_transactions(token)
    do_split_group(token)
    do_rewards_idempotency(token)
    _summary()
    return 0 if all(ok for _, ok, _ in results) else 1


def _summary() -> None:
    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"TOTAL: {passed}/{total} passed")
    for name, ok, info in results:
        if not ok:
            print(f"  FAIL: {name}  {info}")
    print("=" * 60)


if __name__ == "__main__":
    sys.exit(main())
