"""Round 53k Smart Settlements — backend integration tests.

Targets:
  GET  /api/split/groups/{group_id}/settle-plan
  POST /api/split/groups/{group_id}/settle-my-part

Covers all 8 review-request scenarios.
"""
import os
import sys
import time
import uuid
import json
from typing import Optional, Dict, Any

import requests
from bson import ObjectId

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://mintu-finance.preview.emergentagent.com"
API = f"{BASE.rstrip('/')}/api"
OTP = "123456"

PASS = []
FAIL = []


def log(prefix: str, msg: str):
    print(f"{prefix} {msg}")


def assertEq(name: str, got, expected):
    ok = got == expected
    if ok:
        PASS.append(name)
        log("✅", f"{name}: {got!r} == {expected!r}")
    else:
        FAIL.append((name, f"got={got!r} expected={expected!r}"))
        log("❌", f"{name}: got={got!r} expected={expected!r}")


def assertTrue(name: str, cond, detail: str = ""):
    if cond:
        PASS.append(name)
        log("✅", f"{name} {detail}")
    else:
        FAIL.append((name, detail or "condition false"))
        log("❌", f"{name} {detail}")


def post(path: str, json_body: Optional[dict] = None, token: Optional[str] = None,
         headers: Optional[dict] = None, timeout: int = 30):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if headers:
        h.update(headers)
    return requests.post(f"{API}{path}", json=json_body, headers=h, timeout=timeout)


def get(path: str, token: Optional[str] = None, timeout: int = 30):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, timeout=timeout)


def login_user(phone: str, name: Optional[str] = None) -> Dict[str, Any]:
    """Send OTP + verify, returning {token, user_id, name, phone}.
    Handles 30s rate limit by retrying after wait. Uses provided name for
    new-user signup path.
    """
    for attempt in range(3):
        r = post("/auth/send-otp", {"phone": phone})
        if r.status_code == 200:
            break
        if r.status_code == 429:
            log("⏳", f"rate-limit on send-otp for {phone}, sleeping 32s")
            time.sleep(32)
            continue
        raise RuntimeError(f"send-otp failed for {phone}: {r.status_code} {r.text}")
    else:
        raise RuntimeError(f"send-otp persistently rate-limited for {phone}")

    body = {"phone": phone, "otp": OTP}
    if name:
        body["name"] = name
    r = post("/auth/verify-otp", body)
    if r.status_code != 200:
        # If new-user, name is required; if existing user but body included name, also OK.
        raise RuntimeError(f"verify-otp failed for {phone}: {r.status_code} {r.text}")
    j = r.json()
    return {
        "token": j["token"],
        "user_id": j["user"]["id"],
        "name": j["user"]["name"],
        "phone": j["user"]["phone"],
        "is_new_user": j.get("is_new_user", False),
    }


def main():
    # ── 0. Bootstrap: 3 users (A=caller, B, C) and a 4th for non-member tests.
    print("\n══════ 0. Bootstrap users ══════")
    A = login_user("9876543210", name="MintU Tester")
    log("👤", f"A user_id={A['user_id']} name={A['name']}")
    time.sleep(1)
    B = login_user("9876543211", name="Riya Patel")
    log("👤", f"B user_id={B['user_id']} name={B['name']}")
    time.sleep(1)
    C = login_user("9876543212", name="Aman Verma")
    log("👤", f"C user_id={C['user_id']} name={C['name']}")
    time.sleep(1)
    D = login_user("9876543213", name="Outsider Dev")
    log("👤", f"D (non-member) user_id={D['user_id']} name={D['name']}")

    # ── 1. Auth boundary / 400 invalid id ──
    print("\n══════ 1. Auth boundary (400 / 404) ══════")
    r = get("/split/groups/abc123/settle-plan", token=A["token"])
    assertEq("1.1 invalid group_id → 400 (settle-plan)", r.status_code, 400)
    r = post("/split/groups/abc123/settle-my-part", {}, token=A["token"])
    assertEq("1.2 invalid group_id → 400 (settle-my-part)", r.status_code, 400)

    # Create a group between B and C only — A should be 404 on it.
    r = post("/split/groups", {"name": "Riya+Aman duo", "members": [C["phone"]]}, token=B["token"])
    assertEq("1.3 BC group create", r.status_code, 200)
    bc_group_id = r.json()["id"]

    r = get(f"/split/groups/{bc_group_id}/settle-plan", token=A["token"])
    assertEq("1.4 non-member → 404 (settle-plan)", r.status_code, 404)
    r = post(f"/split/groups/{bc_group_id}/settle-my-part", {}, token=A["token"])
    assertEq("1.5 non-member → 404 (settle-my-part)", r.status_code, 404)

    # ── 2. Empty zero-balance group ──
    print("\n══════ 2. Empty zero-balance group ══════")
    r = post("/split/groups",
             {"name": "Zero balance group", "members": [B["phone"], C["phone"]]},
             token=A["token"])
    assertEq("2.1 empty group create", r.status_code, 200)
    empty_gid = r.json()["id"]

    r = get(f"/split/groups/{empty_gid}/settle-plan", token=A["token"])
    assertEq("2.2 settle-plan empty → 200", r.status_code, 200)
    plan = r.json()
    assertEq("2.3 transfers == []", plan.get("transfers"), [])
    assertEq("2.4 my_transfers == []", plan.get("my_transfers"), [])
    assertEq("2.5 my_total_outgoing == 0", float(plan.get("my_total_outgoing", -1)), 0.0)
    assertEq("2.6 summary.transfers == 0", plan.get("summary", {}).get("transfers"), 0)
    assertTrue("2.7 group_id matches", plan.get("group_id") == empty_gid)
    assertTrue("2.8 members dict has 3", len(plan.get("members", {})) == 3)

    r = post(f"/split/groups/{empty_gid}/settle-my-part", {}, token=A["token"])
    assertEq("2.9 settle-my-part empty → 400", r.status_code, 400)
    assertTrue("2.10 detail mentions Nothing to settle",
               "Nothing to settle" in (r.json().get("detail") or ""),
               detail=str(r.json().get("detail")))

    # ── 3. Realistic 3-member plan ──
    print("\n══════ 3. Realistic 3-member plan ══════")
    r = post("/split/groups",
             {"name": "Trip group", "members": [B["phone"], C["phone"]]},
             token=A["token"])
    assertEq("3.1 trip group create", r.status_code, 200)
    trip_gid = r.json()["id"]
    members = r.json()["members"]
    log("👥", f"trip members = {[(m['name'], m['user_id']) for m in members]}")

    # B paid ₹150 for "Pizza" split equally (3 ways) → A owes B ₹50
    r = post("/split/expenses", {
        "group_id": trip_gid,
        "description": "Pizza",
        "amount": 150,
        "paid_by": B["user_id"],
        "split_type": "equal",
    }, token=B["token"])
    assertEq("3.2 expense Pizza by B", r.status_code, 200)

    # C paid ₹150 for "Cab" split equally → A owes C ₹50
    r = post("/split/expenses", {
        "group_id": trip_gid,
        "description": "Cab",
        "amount": 150,
        "paid_by": C["user_id"],
        "split_type": "equal",
    }, token=C["token"])
    assertEq("3.3 expense Cab by C", r.status_code, 200)

    # Plan preview
    r = get(f"/split/groups/{trip_gid}/settle-plan", token=A["token"])
    assertEq("3.4 settle-plan trip → 200", r.status_code, 200)
    plan = r.json()
    log("📋", f"plan.transfers={json.dumps(plan.get('transfers'), indent=0)[:300]}")
    log("📋", f"my_transfers={plan.get('my_transfers')}")
    log("📋", f"my_total_outgoing={plan.get('my_total_outgoing')}, paise={plan.get('my_total_outgoing_paise')}")

    transfers = plan["transfers"]
    my_transfers = plan["my_transfers"]
    # Each split is 50 → A owes B 50, A owes C 50; optimal plan = 2 transfers from A
    assertTrue("3.5 transfers count is 2 (optimal)", len(transfers) == 2,
               detail=f"got {len(transfers)} transfers")
    assertEq("3.6 my_transfers count == 2", len(my_transfers), 2)
    for t in my_transfers:
        assertEq("3.7 my_transfer.from == A", t["from"], A["user_id"])
        assertTrue("3.8 my_transfer.is_mine == True", t.get("is_mine") is True)
    sum_my = sum(t["amount_paise"] for t in my_transfers)
    assertEq("3.9 my_total_outgoing_paise matches sum",
             plan["my_total_outgoing_paise"], sum_my)
    assertEq("3.10 my_total_outgoing_paise == 10000 (₹100)",
             plan["my_total_outgoing_paise"], 10000)
    assertEq("3.11 drift_paise == 0 on clean group", plan.get("drift_paise"), 0)
    assertTrue("3.12 transfer recipients are B and C",
               sorted([t["to"] for t in my_transfers]) == sorted([B["user_id"], C["user_id"]]),
               detail=f"got {[t['to'] for t in my_transfers]}")

    # ── 4. Happy path settle-my-part ──
    print("\n══════ 4. Happy path /settle-my-part ══════")
    expected_count = len(my_transfers)
    expected_total_paise = plan["my_total_outgoing_paise"]
    pre_settles = list(plan["my_transfers"])

    r = post(f"/split/groups/{trip_gid}/settle-my-part",
             {"method": "upi"}, token=A["token"])
    assertEq("4.1 settle-my-part → 200", r.status_code, 200)
    body = r.json()
    log("💸", f"response = {json.dumps(body, indent=0)[:400]}")
    assertEq("4.2 settled_count matches", body.get("settled_count"), expected_count)
    assertEq("4.3 total_paise matches preview", body.get("total_paise"), expected_total_paise)
    sids = body.get("settlement_ids") or []
    assertEq("4.4 settlement_ids count == settled_count", len(sids), expected_count)
    for sid in sids:
        assertTrue("4.5 settlement_id is valid ObjectId hex",
                   ObjectId.is_valid(sid), detail=f"sid={sid}")
    assertTrue("4.6 batch_ref starts with SMART",
               (body.get("batch_ref") or "").startswith("SMART"))
    assertTrue("4.7 transfers list len matches", len(body.get("transfers") or []) == expected_count)

    batch_ref = body["batch_ref"]

    # Verify settlement docs in DB via /split/settlements
    time.sleep(0.5)
    r = get("/split/settlements", token=A["token"])
    assertEq("4.8 GET /split/settlements", r.status_code, 200)
    all_setts = r.json()
    matching = []
    for s in all_setts:
        if s["id"] in sids:
            matching.append(s)
    assertEq("4.9 all settlement_ids retrievable via /settlements", len(matching), expected_count)
    for s in matching:
        assertEq("4.10 payer_name resolved", s.get("payer_name") is not None, True)
        assertTrue("4.11 amount > 0", float(s.get("amount", 0)) > 0)
        assertEq("4.12 status completed", s.get("status"), "completed")
        assertEq("4.13 is_payer True (A paid)", s.get("is_payer"), True)

    # ── 5. No outgoing → 400 (B is creditor, not debtor) ──
    print("\n══════ 5. No outgoing → 400 (creditor B) ══════")
    r = post(f"/split/groups/{trip_gid}/settle-my-part", {}, token=B["token"])
    # After A settles, B has no outgoing transfers (B was a creditor, now paid).
    # Even if A hadn't settled, B has no outgoing transfers (creditor).
    assertEq("5.1 B settle-my-part → 400", r.status_code, 400)
    detail5 = (r.json().get("detail") or "")
    assertTrue("5.2 detail mentions Nothing to settle",
               "Nothing to settle" in detail5, detail=detail5)

    # ── 6. Idempotency ──
    print("\n══════ 6. Idempotency on settle-my-part ══════")
    # Need a fresh group with new debt for A so we have something to settle.
    r = post("/split/groups",
             {"name": "Idem trip", "members": [B["phone"], C["phone"]]},
             token=A["token"])
    assertEq("6.1 idem group create", r.status_code, 200)
    idem_gid = r.json()["id"]
    # B paid ₹120 → A owes B ₹40
    r = post("/split/expenses", {
        "group_id": idem_gid, "description": "Snacks", "amount": 120,
        "paid_by": B["user_id"], "split_type": "equal",
    }, token=B["token"])
    assertEq("6.2 expense Snacks", r.status_code, 200)

    idem_key = str(uuid.uuid4())
    r1 = post(f"/split/groups/{idem_gid}/settle-my-part", {},
              token=A["token"], headers={"Idempotency-Key": idem_key})
    assertEq("6.3 first call → 200", r1.status_code, 200)
    body1 = r1.json()

    # Count settlement docs for A in this group BEFORE the duplicate call.
    r = get("/split/settlements", token=A["token"])
    pre_count = sum(1 for s in r.json()
                    if s.get("is_payer") and s["id"] in (body1.get("settlement_ids") or []))

    r2 = post(f"/split/groups/{idem_gid}/settle-my-part", {},
              token=A["token"], headers={"Idempotency-Key": idem_key})
    assertEq("6.4 second (idem) call → 200", r2.status_code, 200)
    body2 = r2.json()

    assertEq("6.5 batch_ref byte-identical", body2.get("batch_ref"), body1.get("batch_ref"))
    assertEq("6.6 settlement_ids byte-identical",
             body2.get("settlement_ids"), body1.get("settlement_ids"))
    assertEq("6.7 total_paise byte-identical",
             body2.get("total_paise"), body1.get("total_paise"))
    # Full body equality check (excluding optional fields that might drift in time)
    assertEq("6.8 full response byte-identical", body2, body1)

    # Verify no duplicate settlement rows in DB
    r = get("/split/settlements", token=A["token"])
    post_count = sum(1 for s in r.json()
                     if s.get("is_payer") and s["id"] in (body1.get("settlement_ids") or []))
    assertEq("6.9 NO duplicate settlements created (count unchanged)",
             post_count, pre_count)

    # ── 7. expected_total_paise drift detection ──
    print("\n══════ 7. expected_total_paise drift detection ══════")
    # Need a fresh group again with debt
    r = post("/split/groups",
             {"name": "Drift trip", "members": [B["phone"], C["phone"]]},
             token=A["token"])
    drift_gid = r.json()["id"]
    r = post("/split/expenses", {
        "group_id": drift_gid, "description": "Coffee", "amount": 90,
        "paid_by": B["user_id"], "split_type": "equal",
    }, token=B["token"])
    assertEq("7.1 expense Coffee", r.status_code, 200)

    r = post(f"/split/groups/{drift_gid}/settle-my-part",
             {"expected_total_paise": 99999999}, token=A["token"])
    assertEq("7.2 wrong expected_total_paise → 409", r.status_code, 409)
    detail7 = (r.json().get("detail") or "")
    assertTrue("7.3 detail mentions 'Plan changed since preview'",
               "Plan changed since preview" in detail7, detail=detail7)

    # ── 8. Post-settle plan recomputation ──
    print("\n══════ 8. Post-settle plan recomputation ══════")
    # After /settle-my-part on the trip_gid (test #4), A should have my_transfers=[]
    r = get(f"/split/groups/{trip_gid}/settle-plan", token=A["token"])
    assertEq("8.1 settle-plan after settle → 200", r.status_code, 200)
    plan = r.json()
    log("📋", f"post-settle plan.my_transfers={plan.get('my_transfers')}")
    log("📋", f"post-settle plan.my_total_outgoing={plan.get('my_total_outgoing')}")
    assertEq("8.2 my_transfers empty post-settle", plan.get("my_transfers"), [])
    assertEq("8.3 my_total_outgoing == 0 post-settle",
             float(plan.get("my_total_outgoing", -1)), 0.0)
    assertEq("8.4 my_total_outgoing_paise == 0 post-settle",
             plan.get("my_total_outgoing_paise"), 0)

    # ── Summary ──
    print("\n══════════════ SUMMARY ══════════════")
    print(f"PASSED: {len(PASS)}")
    print(f"FAILED: {len(FAIL)}")
    for n, why in FAIL:
        print(f"  ❌ {n} — {why}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(2)
