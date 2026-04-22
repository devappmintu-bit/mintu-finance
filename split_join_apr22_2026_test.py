"""Tests for /api/split/groups/{group_id}/preview and /api/split/groups/{group_id}/join
(added Apr 22 2026). See review request for full spec.
"""
import os
import time
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE_A = "9876543210"
PHONE_B = "9999888877"
OTP = "123456"


results = []


def record(name, ok, detail=""):
    marker = "✅" if ok else "❌"
    line = f"{marker} {name}" + (f"  — {detail}" if detail else "")
    results.append((ok, line))
    print(line)


def auth(phone, name_hint=None):
    """Send OTP + verify. Returns token."""
    for attempt in range(3):
        r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=15)
        if r.status_code == 200:
            break
        if r.status_code == 429:
            print(f"rate-limited on send-otp, sleeping 65s (attempt {attempt+1})")
            time.sleep(65)
            continue
        print(f"send-otp {phone} → {r.status_code} {r.text[:200]}")
        return None
    body = {"phone": phone, "otp": OTP}
    if name_hint:
        body["name"] = name_hint
    r = requests.post(f"{BASE}/auth/verify-otp", json=body, timeout=15)
    if r.status_code != 200:
        print(f"verify-otp {phone} → {r.status_code} {r.text[:200]}")
        return None
    tok = r.json().get("token")
    return tok


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    # 1. Auth user A
    tokA = auth(PHONE_A)
    if not tokA:
        record("auth user A", False, "could not authenticate 9876543210")
        sys.exit(1)
    record("auth user A", True)

    # Get user A profile to know user_id later
    me_a = requests.get(f"{BASE}/user/me", headers=H(tokA), timeout=10)
    uid_a = me_a.json().get("id") if me_a.status_code == 200 else None
    record("GET /user/me (A)", me_a.status_code == 200, f"status={me_a.status_code}")

    # 2. Get existing groups or create one
    r = requests.get(f"{BASE}/split/groups", headers=H(tokA), timeout=15)
    record("GET /split/groups (A)", r.status_code == 200, f"status={r.status_code}")
    groups = r.json() if r.status_code == 200 else []
    group_id = None
    if isinstance(groups, list) and groups:
        group_id = groups[0].get("id")
        print(f"using existing group: {group_id} name={groups[0].get('name')}")
    else:
        r2 = requests.post(f"{BASE}/split/groups", headers=H(tokA),
                          json={"name": "Preview Test Group"}, timeout=15)
        record("POST /split/groups (create)", r2.status_code == 200, f"status={r2.status_code} body={r2.text[:200]}")
        if r2.status_code == 200:
            group_id = r2.json().get("id")

    if not group_id:
        record("have group_id", False, "no group available")
        sys.exit(1)
    record("have group_id", True, group_id)

    # 3. As user A (member) — GET /preview → already_member: True
    r = requests.get(f"{BASE}/split/groups/{group_id}/preview", headers=H(tokA), timeout=10)
    record("A: GET /preview → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        record("A: preview has id==group_id", body.get("id") == group_id, f"id={body.get('id')}")
        record("A: preview has name", isinstance(body.get("name"), str) and body.get("name"), f"name={body.get('name')!r}")
        record("A: preview has emoji", "emoji" in body)
        record("A: preview member_count is int", isinstance(body.get("member_count"), int), f"member_count={body.get('member_count')}")
        record("A: preview has creator key", "creator" in body)
        record("A: preview already_member==True", body.get("already_member") is True, f"already_member={body.get('already_member')}")
        mp = body.get("member_preview")
        record("A: preview member_preview is list", isinstance(mp, list))
        if isinstance(mp, list):
            record("A: preview member_preview <=6", len(mp) <= 6, f"len={len(mp)}")
            if mp:
                first = mp[0]
                record("A: member_preview item has name+avatar keys", "name" in first and "avatar" in first, f"keys={list(first.keys())}")

    # 4. As user A — POST /join → already_member: True (idempotent)
    r = requests.post(f"{BASE}/split/groups/{group_id}/join", headers=H(tokA), timeout=10)
    record("A: POST /join → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        record("A: join ok==True", body.get("ok") is True)
        record("A: join already_member==True (idempotent)", body.get("already_member") is True, f"already_member={body.get('already_member')}")
        record("A: join group_id echoed", body.get("group_id") == group_id)

    # 5. Auth user B — different phone
    # Pause to avoid rate-limit tripping on rapid OTPs
    time.sleep(2)
    tokB = auth(PHONE_B, name_hint="Rahul Sharma")
    if not tokB:
        record("auth user B", False, "could not authenticate 9999888877")
    else:
        record("auth user B", True)

        # Make sure user B is NOT already a member. If they are (stale state from
        # prior test runs), remove them first as A (group owner).
        r = requests.get(f"{BASE}/split/groups/{group_id}/manage", headers=H(tokA), timeout=10)
        if r.status_code == 200:
            mgmt = r.json()
            members = mgmt.get("members") or []
            me_b = requests.get(f"{BASE}/user/me", headers=H(tokB), timeout=10).json()
            uid_b = me_b.get("id")
            for m in members:
                if m.get("user_id") == uid_b:
                    mid = m.get("id") or m.get("_id") or m.get("user_id")
                    print(f"cleaning pre-existing membership of B via DELETE member {mid}")
                    requests.delete(f"{BASE}/split/groups/{group_id}/members/{mid}",
                                   headers=H(tokA), timeout=10)
                    break

        # 5a. As B — GET /preview → already_member: False
        r = requests.get(f"{BASE}/split/groups/{group_id}/preview", headers=H(tokB), timeout=10)
        record("B: GET /preview → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
        if r.status_code == 200:
            body = r.json()
            record("B: preview already_member==False", body.get("already_member") is False, f"already_member={body.get('already_member')}")
            record("B: preview member_count is int", isinstance(body.get("member_count"), int))

        # 5b. As B — POST /join → already_member: False (first call)
        r = requests.post(f"{BASE}/split/groups/{group_id}/join", headers=H(tokB), timeout=10)
        record("B: POST /join (1st) → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
        if r.status_code == 200:
            body = r.json()
            record("B: 1st join ok==True", body.get("ok") is True)
            record("B: 1st join already_member==False", body.get("already_member") is False, f"already_member={body.get('already_member')}")
            record("B: 1st join group_id echoed", body.get("group_id") == group_id)
            record("B: 1st join has name field", isinstance(body.get("name"), str) and body.get("name"))

        # 5c. As B — POST /join again → already_member: True (idempotent)
        r = requests.post(f"{BASE}/split/groups/{group_id}/join", headers=H(tokB), timeout=10)
        record("B: POST /join (2nd, idempotent) → 200", r.status_code == 200, f"status={r.status_code}")
        if r.status_code == 200:
            body = r.json()
            record("B: 2nd join already_member==True", body.get("already_member") is True, f"already_member={body.get('already_member')}")

        # 5d. After B's join, verify /preview now reports already_member: True for B
        r = requests.get(f"{BASE}/split/groups/{group_id}/preview", headers=H(tokB), timeout=10)
        if r.status_code == 200:
            record("B: preview after join → already_member==True", r.json().get("already_member") is True)

        # 5e. Verify B shows in /manage member list
        r = requests.get(f"{BASE}/split/groups/{group_id}/manage", headers=H(tokA), timeout=10)
        if r.status_code == 200:
            members = r.json().get("members") or []
            me_b = requests.get(f"{BASE}/user/me", headers=H(tokB), timeout=10).json()
            uid_b = me_b.get("id")
            record("B present in group.members after self-join",
                   any(m.get("user_id") == uid_b for m in members),
                   f"members_count={len(members)}")

    # 6. Edge cases
    # 6a. Invalid ObjectId → 400
    r = requests.get(f"{BASE}/split/groups/bad/preview", headers=H(tokA), timeout=10)
    record("invalid oid preview → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")

    r = requests.post(f"{BASE}/split/groups/bad/join", headers=H(tokA), timeout=10)
    record("invalid oid join → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")

    # 6b. Valid-but-missing ObjectId → 404
    missing_oid = "000000000000000000000000"
    r = requests.get(f"{BASE}/split/groups/{missing_oid}/preview", headers=H(tokA), timeout=10)
    record("missing-oid preview → 404", r.status_code == 404, f"status={r.status_code} body={r.text[:200]}")

    r = requests.post(f"{BASE}/split/groups/{missing_oid}/join", headers=H(tokA), timeout=10)
    record("missing-oid join → 404", r.status_code == 404, f"status={r.status_code} body={r.text[:200]}")

    # 6c. No auth → 401 or 422
    r = requests.get(f"{BASE}/split/groups/{group_id}/preview", timeout=10)
    record("no-auth preview → 401/422", r.status_code in (401, 422), f"status={r.status_code}")

    r = requests.post(f"{BASE}/split/groups/{group_id}/join", timeout=10)
    record("no-auth join → 401/422", r.status_code in (401, 422), f"status={r.status_code}")

    # 6d. Bad bearer token → 401
    r = requests.get(f"{BASE}/split/groups/{group_id}/preview",
                    headers={"Authorization": "Bearer notarealtoken"}, timeout=10)
    record("bad-token preview → 401", r.status_code == 401, f"status={r.status_code}")

    r = requests.post(f"{BASE}/split/groups/{group_id}/join",
                     headers={"Authorization": "Bearer notarealtoken"}, timeout=10)
    record("bad-token join → 401", r.status_code == 401, f"status={r.status_code}")

    # summary
    passed = sum(1 for ok, _ in results if ok)
    total = len(results)
    print()
    print(f"{'='*60}")
    print(f"RESULT: {passed}/{total} assertions passed")
    print(f"{'='*60}")
    if passed < total:
        print("FAILED assertions:")
        for ok, line in results:
            if not ok:
                print("  " + line)
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
