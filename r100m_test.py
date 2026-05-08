"""Round 100M backend test — synthetic pending-invite ids in POST /api/split/expenses.

Tests:
1. paid_by="pi:8487978794" with split_type=equal → splits include 6 keys (1 user + 5 pi:), sum=500.
2. paid_by=Rajawat user_id with split_type=custom listing pi: ids → all 3 keys preserved.
3. paid_by="pi:9999999999" (not in pending_invites) — should not 500.
4. GET /api/split/groups/{id}/manage still returns pending_invites.
5. Idempotency: same key twice returns identical response, no duplicate.
6. Cleanup: DELETE created expenses.
"""
import asyncio
import httpx
import uuid
import json

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9445564707"
OTP = "123456"
GROUP_ID = "69fa3f953562b77b568c507d"
RAJAWAT_USER_ID = "69edeb084cc76b1fe8cfe238"

PASS = []
FAIL = []

def record(ok, msg):
    (PASS if ok else FAIL).append(msg)
    print(("PASS " if ok else "FAIL ") + msg)


async def main():
    async with httpx.AsyncClient(timeout=30) as c:
        # Auth
        r = await c.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE})
        record(r.status_code == 200, f"send-otp → {r.status_code}")
        r = await c.post(
            f"{BASE_URL}/auth/verify-otp",
            json={"phone": PHONE, "otp": OTP, "device_id": "r100m-test", "device_name": "test", "os": "web"},
        )
        record(r.status_code == 200, f"verify-otp → {r.status_code}")
        if r.status_code != 200:
            print("AUTH FAILED, body:", r.text)
            return
        body = r.json()
        token = body.get("access_token") or body.get("token")
        user_id = (body.get("user") or {}).get("id") or body.get("user_id")
        print(f"  token len={len(token) if token else 0}, user_id={user_id}")
        record(user_id == RAJAWAT_USER_ID, f"user_id matches Rajawat ({RAJAWAT_USER_ID}) — got {user_id}")
        H = {"Authorization": f"Bearer {token}"}

        # Sanity: GET /split/groups/{id}/manage
        r = await c.get(f"{BASE_URL}/split/groups/{GROUP_ID}/manage", headers=H)
        record(r.status_code == 200, f"GET /split/groups/{{id}}/manage → {r.status_code}")
        if r.status_code != 200:
            print("MANAGE FAILED:", r.text)
            return
        manage = r.json()
        pending = manage.get("pending_invites", [])
        members = manage.get("members", [])
        print(f"  members={len(members)}, pending={len(pending)}")
        record(len(members) == 1, f"manage: 1 real member (got {len(members)})")
        record(len(pending) == 5, f"manage: 5 pending invites (got {len(pending)})")
        pending_phones = [pi["phone"] for pi in pending]
        print(f"  pending phones: {pending_phones}")
        record("8487978794" in pending_phones, "manage: 8487978794 in pending")
        record("8484649787" in pending_phones, "manage: 8484649787 in pending")

        created_ids = []

        # ── Scenario 1: paid_by="pi:8487978794", equal split, 500
        idem_key_1 = str(uuid.uuid4())
        payload_1 = {
            "group_id": GROUP_ID,
            "description": "R100M auto-test paid_by_pi",
            "amount": 500,
            "paid_by": "pi:8487978794",
            "split_type": "equal",
        }
        r = await c.post(
            f"{BASE_URL}/split/expenses",
            json=payload_1,
            headers={**H, "Idempotency-Key": idem_key_1},
        )
        record(r.status_code == 200, f"S1 POST /split/expenses paid_by=pi → {r.status_code}")
        if r.status_code != 200:
            print("S1 BODY:", r.text)
        else:
            d1 = r.json()
            created_ids.append(d1["id"])
            print(f"  S1 id={d1['id']}, paid_by={d1.get('paid_by')}, splits keys={list(d1.get('splits', {}).keys())}")
            record(d1.get("paid_by") == "pi:8487978794", f"S1 paid_by preserved = {d1.get('paid_by')}")
            splits_1 = d1.get("splits", {})
            record(len(splits_1) == 6, f"S1 splits has 6 keys (got {len(splits_1)})")
            sum_1 = round(sum(splits_1.values()), 2)
            record(sum_1 == 500.0, f"S1 sum = {sum_1} (expected 500)")
            keys_1 = set(splits_1.keys())
            has_rajawat = RAJAWAT_USER_ID in keys_1
            pi_keys = [k for k in keys_1 if k.startswith("pi:")]
            record(has_rajawat, f"S1 includes Rajawat user_id: {has_rajawat}")
            record(len(pi_keys) == 5, f"S1 has 5 pi: ids (got {len(pi_keys)}: {pi_keys})")

            # ── Scenario 5 (idempotency): replay with same key
            r2 = await c.post(
                f"{BASE_URL}/split/expenses",
                json=payload_1,
                headers={**H, "Idempotency-Key": idem_key_1},
            )
            record(r2.status_code == 200, f"S5 idempotency replay → {r2.status_code}")
            if r2.status_code == 200:
                d2 = r2.json()
                record(d2["id"] == d1["id"], f"S5 same id replayed: {d2['id']} == {d1['id']}")
                record(
                    json.dumps(d2, sort_keys=True) == json.dumps(d1, sort_keys=True),
                    "S5 response byte-equal",
                )

        # ── Scenario 2: custom split with explicit pi: keys
        idem_key_2 = str(uuid.uuid4())
        payload_2 = {
            "group_id": GROUP_ID,
            "description": "R100M auto-test custom_pi",
            "amount": 500,
            "paid_by": RAJAWAT_USER_ID,
            "split_type": "custom",
            "splits": {RAJAWAT_USER_ID: 100, "pi:8487978794": 200, "pi:8484649787": 200},
        }
        r = await c.post(
            f"{BASE_URL}/split/expenses",
            json=payload_2,
            headers={**H, "Idempotency-Key": idem_key_2},
        )
        record(r.status_code == 200, f"S2 POST /split/expenses custom pi: keys → {r.status_code}")
        if r.status_code != 200:
            print("S2 BODY:", r.text)
        else:
            d = r.json()
            created_ids.append(d["id"])
            splits_2 = d.get("splits", {})
            print(f"  S2 splits = {splits_2}")
            record(len(splits_2) == 3, f"S2 splits has 3 keys (got {len(splits_2)})")
            record(RAJAWAT_USER_ID in splits_2, "S2 Rajawat key present")
            record("pi:8487978794" in splits_2, "S2 pi:8487978794 key present")
            record("pi:8484649787" in splits_2, "S2 pi:8484649787 key present")
            record(splits_2.get(RAJAWAT_USER_ID) == 100, f"S2 Rajawat = 100 (got {splits_2.get(RAJAWAT_USER_ID)})")
            record(splits_2.get("pi:8487978794") == 200, f"S2 pi:8487978794 = 200")
            record(splits_2.get("pi:8484649787") == 200, f"S2 pi:8484649787 = 200")
            record(d.get("paid_by") == RAJAWAT_USER_ID, f"S2 paid_by = Rajawat user_id")

        # ── Scenario 3: paid_by="pi:9999999999" (not in pending_invites)
        idem_key_3 = str(uuid.uuid4())
        payload_3 = {
            "group_id": GROUP_ID,
            "description": "R100M auto-test unknown_pi",
            "amount": 300,
            "paid_by": "pi:9999999999",
            "split_type": "equal",
        }
        r = await c.post(
            f"{BASE_URL}/split/expenses",
            json=payload_3,
            headers={**H, "Idempotency-Key": idem_key_3},
        )
        # Not 500 is required; 200 is acceptable per the review request
        record(r.status_code != 500, f"S3 unknown pi: paid_by → {r.status_code} (NOT 500 required)")
        print(f"  S3 status={r.status_code}, body preview={r.text[:200]}")
        if r.status_code == 200:
            d = r.json()
            created_ids.append(d["id"])
            print(f"  S3 accepted: id={d['id']}, paid_by={d.get('paid_by')}, splits keys={list(d.get('splits', {}).keys())}")

        # ── Cleanup
        print(f"\n=== Cleaning up {len(created_ids)} test expenses ===")
        for eid in created_ids:
            r = await c.delete(f"{BASE_URL}/split/expenses/{eid}", headers=H)
            record(r.status_code in (200, 204), f"DELETE /split/expenses/{eid} → {r.status_code}")

        # ── Final regression: manage still works
        r = await c.get(f"{BASE_URL}/split/groups/{GROUP_ID}/manage", headers=H)
        record(r.status_code == 200, f"manage post-cleanup → {r.status_code}")
        if r.status_code == 200:
            manage2 = r.json()
            record(
                len(manage2.get("pending_invites", [])) == 5,
                f"manage post-cleanup: 5 pending (got {len(manage2.get('pending_invites', []))})",
            )

        print(f"\n=== {len(PASS)} PASS, {len(FAIL)} FAIL ===")
        if FAIL:
            print("FAILURES:")
            for f in FAIL:
                print("  -", f)


if __name__ == "__main__":
    asyncio.run(main())
