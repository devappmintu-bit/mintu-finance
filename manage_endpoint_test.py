"""
Test scope: GET /api/split/groups/{group_id}/manage

Verifies the response now includes pending_invites, member_count,
pending_count, total_count, and group_code per the review request.
"""
import json
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9445564707"
OTP = "123456"
HOSTEL_GID = "69fa3f953562b77b568c507d"

results = []
def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}{(' — '+detail) if detail else ''}")
    results.append((name, cond, detail))

# Step 1: send + verify OTP
r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE})
check("send-otp 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")

r = requests.post(
    f"{BASE}/auth/verify-otp",
    json={"phone": PHONE, "otp": OTP, "device_id": "test-cli", "device_name": "Tester", "os": "web"},
)
if r.status_code != 200:
    print("verify-otp failed:", r.status_code, r.text)
    sys.exit(1)
data = r.json()
TOKEN = data.get("access_token") or data.get("token")
USER = data.get("user") or {}
USER_ID = USER.get("id") or data.get("user_id")
print(f"Authenticated as user_id={USER_ID} name={USER.get('name')!r}")
H = {"Authorization": f"Bearer {TOKEN}"}

# Step 2: GET /split/groups
r = requests.get(f"{BASE}/split/groups", headers=H)
check("GET /split/groups 200", r.status_code == 200, f"got {r.status_code}")
groups_list = r.json() if r.status_code == 200 else []
gids = [g.get("id") for g in groups_list]
print(f"  → {len(groups_list)} group(s) returned. ids={gids[:10]}")
hostel_in_list = any(g.get("id") == HOSTEL_GID for g in groups_list)
check("Hostel group present in /split/groups list", hostel_in_list)
hostel_summary = next((g for g in groups_list if g.get("id") == HOSTEL_GID), None)
goa_summary = next((g for g in groups_list if g.get("name", "").lower() == "goa"), None)
if hostel_summary:
    print(f"  → Hostel summary: {json.dumps(hostel_summary, default=str)[:400]}")
if goa_summary:
    print(f"  → Goa summary:    {json.dumps(goa_summary, default=str)[:400]}")

# Step 3: GET /split/groups/{HOSTEL}/manage
r = requests.get(f"{BASE}/split/groups/{HOSTEL_GID}/manage", headers=H)
check(f"GET /split/groups/{HOSTEL_GID[:6]}.../manage 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
if r.status_code == 200:
    body = r.json()
    print("  → Hostel /manage body:")
    print("    " + json.dumps(body, indent=2, default=str)[:1200].replace("\n", "\n    "))

    members = body.get("members", [])
    pending = body.get("pending_invites")
    check("Hostel: members is list of length 1", isinstance(members, list) and len(members) == 1, f"got {len(members) if isinstance(members, list) else members}")
    if members:
        check("Hostel: member name is Rajawat",
              "rajawat" in (members[0].get("name", "").lower()),
              f"got name={members[0].get('name')!r}")
        check("Hostel: member is_admin=true (creator)", members[0].get("is_admin") is True)

    check("Hostel: pending_invites field exists", pending is not None and isinstance(pending, list), f"type={type(pending).__name__}")
    if isinstance(pending, list):
        check("Hostel: pending_invites length == 5", len(pending) == 5, f"got {len(pending)}")
        if pending:
            sample = pending[0]
            check("Hostel: pending entry has phone field", "phone" in sample, f"keys={list(sample.keys())}")
            check("Hostel: pending entry has invited_at field", "invited_at" in sample, f"keys={list(sample.keys())}")

    check("Hostel: member_count == 1", body.get("member_count") == 1, f"got {body.get('member_count')}")
    check("Hostel: pending_count == 5", body.get("pending_count") == 5, f"got {body.get('pending_count')}")
    check("Hostel: total_count == 6", body.get("total_count") == 6, f"got {body.get('total_count')}")
    check("Hostel: group_code is set (truthy str)", isinstance(body.get("group_code"), str) and len(body.get("group_code")) > 0,
          f"got {body.get('group_code')!r}")
    check("Hostel: is_admin true (Rajawat is creator)", body.get("is_admin") is True)

# Step 4: Goa /manage shape consistency
if goa_summary:
    goa_gid = goa_summary.get("id")
    r = requests.get(f"{BASE}/split/groups/{goa_gid}/manage", headers=H)
    check(f"GET Goa /manage 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        gbody = r.json()
        for k in ("pending_invites", "member_count", "pending_count", "total_count", "group_code"):
            check(f"Goa /manage has '{k}' field", k in gbody, f"keys={list(gbody.keys())}")
        # consistency vs /split/groups list
        list_total = goa_summary.get("member_count") or goa_summary.get("total_count")
        manage_total = gbody.get("total_count")
        if list_total is not None:
            check(
                f"Goa: total_count consistent with /split/groups summary",
                list_total == manage_total,
                f"list={list_total} manage={manage_total}",
            )
        print(f"  → Goa /manage body: members={gbody.get('member_count')} pending={gbody.get('pending_count')} total={gbody.get('total_count')} code={gbody.get('group_code')!r}")

# Step 5: invalid group id (non-hex)
r = requests.get(f"{BASE}/split/groups/not-a-real-id/manage", headers=H)
check("invalid group_id → 400/404 (no 5xx)", r.status_code in (400, 404, 422), f"got {r.status_code} {r.text[:120]}")

# Step 6: nonexistent valid hex
NOEXIST = "ffffffffffffffffffffffff"
r = requests.get(f"{BASE}/split/groups/{NOEXIST}/manage", headers=H)
check("nonexistent valid hex → 404", r.status_code == 404, f"got {r.status_code} {r.text[:120]}")

# Step 7: regression — create new group with unregistered phone
NEW_PHONE = "9000000099"
r = requests.post(f"{BASE}/split/groups", headers=H,
                  json={"name": "TestR100L", "members": [NEW_PHONE]})
check("POST /split/groups TestR100L → 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
new_gid = None
if r.status_code == 200:
    new_gid = r.json().get("id") or r.json().get("group_id")

if new_gid:
    r = requests.get(f"{BASE}/split/groups/{new_gid}/manage", headers=H)
    check("GET TestR100L /manage 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        body = r.json()
        check("TestR100L: total_count == 2", body.get("total_count") == 2, f"got {body.get('total_count')} (members={body.get('member_count')} pending={body.get('pending_count')})")
        check("TestR100L: pending_count == 1", body.get("pending_count") == 1, f"got {body.get('pending_count')}")
        check(
            "TestR100L: pending_invites includes 9000000099",
            any(NEW_PHONE in (pi.get("phone") or "") for pi in (body.get("pending_invites") or [])),
            f"pending={body.get('pending_invites')}",
        )
        check("TestR100L: group_code is set", isinstance(body.get("group_code"), str) and len(body.get("group_code")) > 0,
              f"got {body.get('group_code')!r}")
    # cleanup
    requests.delete(f"{BASE}/split/groups/{new_gid}", headers=H)

# Summary
passed = sum(1 for _, c, _ in results if c)
failed = [r for r in results if not r[1]]
print(f"\n=== {passed}/{len(results)} assertions passed ===")
for n, _, d in failed:
    print(f"  FAIL: {n} — {d}")
sys.exit(0 if not failed else 1)
