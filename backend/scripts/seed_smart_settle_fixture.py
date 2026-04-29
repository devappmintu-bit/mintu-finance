"""
seed_smart_settle_fixture.py — Seed a Smart-Settlements demo group.

Creates a fresh group with 4 members (the seed user + 3 others) and
3 expenses fronted by 3 different members so the simplified_debts
list will have ≥ 2 rows for the seed user. Idempotent: re-runs are
safe (always creates a uniquely-named group).

Usage:
    cd /app/backend && python scripts/seed_smart_settle_fixture.py
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

import httpx

BASE = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001") + "/api"
PHONES = ["9876543210", "9876543211", "9876543212", "9876543213"]
NAMES = ["Seed User", "Bob", "Carol", "Dave"]
OTP = "123456"


async def auth(client: httpx.AsyncClient, phone: str, name: str) -> tuple[str, str]:
    """Send OTP, verify, return (token, user_id). Auto-retries on 30s OTP cooldown."""
    for attempt in range(4):
        r = await client.post(f"{BASE}/auth/send-otp", json={"phone": phone})
        if r.status_code == 200:
            break
        if r.status_code == 429 or "wait" in r.text.lower():
            print(f"    … OTP cooldown for {phone}, sleeping 32s (attempt {attempt + 1})")
            await asyncio.sleep(32)
            continue
        r.raise_for_status()
    r = await client.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP, "name": name})
    r.raise_for_status()
    body = r.json()
    return body["token"], body["user"]["id"]


async def main() -> int:
    async with httpx.AsyncClient(timeout=60) as client:
        # 1) Auth all 4 users.
        creds = []
        for ph, nm in zip(PHONES, NAMES):
            tok, uid = await auth(client, ph, nm)
            creds.append({"phone": ph, "name": nm, "token": tok, "id": uid})
            print(f"  • auth {nm} ({ph}) → uid={uid[:8]}…")
            await asyncio.sleep(0.3)  # avoid per-IP rate limit on send-otp

        seed = creds[0]
        seed_hdr = {"Authorization": f"Bearer {seed['token']}"}

        # 2) Seed user creates a group with the other three.
        # The backend SplitGroupCreate.members expects `string[]` (phone numbers).
        gname = f"SmartSettle Demo · {datetime.now(timezone.utc).strftime('%H%M%S')}"
        r = await client.post(
            f"{BASE}/split/groups",
            json={"name": gname, "members": [c["phone"] for c in creds[1:]]},
            headers=seed_hdr,
        )
        r.raise_for_status()
        group = r.json()
        gid = group["id"]
        print(f"\n  ✔ created group: {gname}  ({gid})")

        # 3) Resolve member ids in this group (the create returns them).
        member_ids = {m["name"]: m["user_id"] for m in group.get("members", [])}
        print(f"    members: {member_ids}")

        # 4) Add 3 expenses paid by 3 different members so the seed user
        #    ends up owing 2+ creditors → simplified_debts has 2+ rows.
        equal_split = list(member_ids.values())

        async def add_expense(payer_token: str, payer_id: str, desc: str, amount: float):
            r = await client.post(
                f"{BASE}/split/expenses",
                json={
                    "group_id": gid,
                    "description": desc,
                    "amount": amount,
                    "paid_by": payer_id,
                    "split_type": "equal",
                },
                headers={"Authorization": f"Bearer {payer_token}"},
            )
            r.raise_for_status()
            print(f"    + ₹{amount:>5.0f} · {desc} (paid by {payer_id[:8]}…)")

        await add_expense(creds[1]["token"], creds[1]["id"], "Pizza party", 400)
        await add_expense(creds[2]["token"], creds[2]["id"], "Cab rides", 240)
        await add_expense(creds[3]["token"], creds[3]["id"], "Movie tickets", 600)

        # 5) Print the resulting plan so we can eyeball.
        r = await client.get(f"{BASE}/split/groups/{gid}/settle-plan", headers=seed_hdr)
        r.raise_for_status()
        plan = r.json()
        print(f"\n  ✔ settle-plan for SEED user:")
        print(f"    transfers: {len(plan['transfers'])}, my_transfers: {len(plan['my_transfers'])}")
        for t in plan["transfers"]:
            mine = " ⚡ (mine)" if t["is_mine"] else ""
            print(f"      {t['from_name']:>12} → {t['to_name']:<12} ₹{t['amount']:.0f}{mine}")
        print(f"\n    my_total_outgoing: ₹{plan['my_total_outgoing']}  ({plan['my_total_outgoing_paise']}p)")

        # 6) Sanity check: my_transfers >= 1 AND total transfers >= 2.
        ok = len(plan["my_transfers"]) >= 1 and len(plan["transfers"]) >= 2
        print(f"\n  → fixture quality: {'✅ READY' if ok else '⚠️  insufficient'}")
        print(f"\n  Seed user phone: {seed['phone']}  group_id: {gid}")
        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
