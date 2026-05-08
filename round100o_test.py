"""Round 100O — Backend test for dual-shape POST /api/split/groups/{id}/members.

Auth: phone 9445564707 / OTP 123456 (Rajawat).
Target group: hostel_id = "69fa3f953562b77b568c507d"
Base URL: https://mintu-finance.preview.emergentagent.com/api
"""
import json
import sys
import httpx

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9445564707"
OTP = "123456"
HOSTEL_ID = "69fa3f953562b77b568c507d"

results = []


def check(name: str, cond: bool, detail: str = ""):
    status = "PASS" if cond else "FAIL"
    results.append((status, name, detail))
    print(f"[{status}] {name}  {detail}")


def main():
    with httpx.Client(base_url=BASE, timeout=60.0) as c:
        # --- AUTH ---
        r = c.post("/auth/send-otp", json={"phone": PHONE})
        check("auth.send-otp 200", r.status_code == 200, f"status={r.status_code}")
        r = c.post("/auth/verify-otp", json={"phone": PHONE, "otp": OTP, "device_id": "round100o", "device_name": "Test", "os": "web"})
        check("auth.verify-otp 200", r.status_code == 200, f"status={r.status_code}")
        if r.status_code != 200:
            print("Cannot authenticate, aborting"); print(r.text); sys.exit(1)
        token = r.json().get("access_token") or r.json().get("token")
        check("auth.token present", bool(token), f"len={len(token) if token else 0}")
        H = {"Authorization": f"Bearer {token}"}

        # Verify Rajawat & group exists
        r_user = c.get("/user/me", headers=H)
        check("user.me 200", r_user.status_code == 200, f"name={r_user.json().get('name') if r_user.status_code==200 else r_user.text[:120]}")

        r_manage_pre = c.get(f"/split/groups/{HOSTEL_ID}/manage", headers=H)
        check("group.manage pre 200", r_manage_pre.status_code == 200, f"status={r_manage_pre.status_code}")
        if r_manage_pre.status_code != 200:
            print("Group not accessible; aborting", r_manage_pre.text); sys.exit(1)
        pre = r_manage_pre.json()
        print(f"\n[INFO] Pre-state: members={pre.get('member_count')} pending={pre.get('pending_count')}")
        pre_pending_phones = {pi.get("phone") for pi in pre.get("pending_invites", [])}
        print(f"[INFO] Pre-pending phones: {pre_pending_phones}\n")

        # ============================================================
        # SCENARIO 1 — New entries shape
        # ============================================================
        print("--- Scenario 1: entries shape ---")
        r1 = c.post(f"/split/groups/{HOSTEL_ID}/members", headers=H,
                    json={"entries": [{"name": "Test100O", "phone": "9555555555"}]})
        check("S1.status==200", r1.status_code == 200, f"status={r1.status_code} body={r1.text[:200]}")
        if r1.status_code == 200:
            j1 = r1.json()
            # "9555555555" exists in pre_pending? If yes it'd be skipped. Let's be aware
            invited = j1.get("invited", [])
            added = j1.get("added", [])
            if "9555555555" in pre_pending_phones:
                print("[NOTE] 9555555555 was already pending pre-run — expect empty response.")
                check("S1.invited contains Test100O OR already-added case", True,
                      f"already pre-existing; response={j1}")
            else:
                check("S1.invited contains Test100O", "Test100O" in invited, f"invited={invited} added={added}")

        # ============================================================
        # SCENARIO 2 — Verify name persisted
        # ============================================================
        print("\n--- Scenario 2: verify name persisted in /manage ---")
        r2 = c.get(f"/split/groups/{HOSTEL_ID}/manage", headers=H)
        check("S2.manage 200", r2.status_code == 200, f"status={r2.status_code}")
        if r2.status_code == 200:
            pending = r2.json().get("pending_invites", [])
            match = next((pi for pi in pending if pi.get("phone") == "9555555555"), None)
            check("S2.pending entry for 9555555555 exists", match is not None, f"entry={match}")
            if match:
                check("S2.name == 'Test100O'", match.get("name") == "Test100O", f"name={match.get('name')!r}")

        # ============================================================
        # SCENARIO 3 — Legacy phones shape regression
        # ============================================================
        print("\n--- Scenario 3: legacy phones shape ---")
        r3 = c.post(f"/split/groups/{HOSTEL_ID}/members", headers=H,
                    json={"phones": ["9555555555"]})
        check("S3.status==200 (not 5xx)", r3.status_code == 200, f"status={r3.status_code} body={r3.text[:200]}")
        if r3.status_code == 200:
            j3 = r3.json()
            check("S3.added empty", j3.get("added") == [], f"added={j3.get('added')}")
            check("S3.invited empty", j3.get("invited") == [], f"invited={j3.get('invited')}")
            check("S3.message mentions 'No new members'",
                  "No new members" in (j3.get("message", "") or ""),
                  f"message={j3.get('message')!r}")

        # ============================================================
        # SCENARIO 4 — Edge case: entry without name
        # ============================================================
        print("\n--- Scenario 4: entries without name field ---")
        r4 = c.post(f"/split/groups/{HOSTEL_ID}/members", headers=H,
                    json={"entries": [{"phone": "9111111111"}]})
        check("S4.status==200", r4.status_code == 200, f"status={r4.status_code} body={r4.text[:200]}")

        # Verify pending invite stored without a name (or empty)
        r4v = c.get(f"/split/groups/{HOSTEL_ID}/manage", headers=H)
        if r4v.status_code == 200:
            pending = r4v.json().get("pending_invites", [])
            match = next((pi for pi in pending if pi.get("phone") == "9111111111"), None)
            check("S4.pending entry for 9111111111 exists", match is not None, f"entry={match}")
            if match:
                nm = match.get("name", "")
                check("S4.name missing or empty string", nm == "" or nm is None, f"name={nm!r}")

        # ============================================================
        # SCENARIO 5 — Empty payload
        # ============================================================
        print("\n--- Scenario 5: empty payload ---")
        r5 = c.post(f"/split/groups/{HOSTEL_ID}/members", headers=H, json={})
        check("S5.status==400", r5.status_code == 400, f"status={r5.status_code} body={r5.text[:200]}")
        if r5.status_code == 400:
            try:
                detail = r5.json().get("detail", "")
            except Exception:
                detail = r5.text
            check("S5.detail contains 'Provide phone numbers'",
                  "Provide phone numbers" in str(detail), f"detail={detail!r}")

        # ============================================================
        # SCENARIO 6 — Invalid phones (silent skip)
        # ============================================================
        print("\n--- Scenario 6: invalid phone <10 digits ---")
        r6 = c.post(f"/split/groups/{HOSTEL_ID}/members", headers=H,
                    json={"entries": [{"name": "Bad", "phone": "123"}]})
        check("S6.status==200", r6.status_code == 200, f"status={r6.status_code} body={r6.text[:200]}")
        if r6.status_code == 200:
            j6 = r6.json()
            check("S6.added empty", j6.get("added") == [], f"added={j6.get('added')}")
            check("S6.invited empty", j6.get("invited") == [], f"invited={j6.get('invited')}")

        # ============================================================
        # SCENARIO 7 — Backwards compat: existing name-less pending
        # ============================================================
        print("\n--- Scenario 7: backcompat — existing pending w/o name (8487978794) ---")
        r7 = c.get(f"/split/groups/{HOSTEL_ID}/manage", headers=H)
        check("S7.manage 200", r7.status_code == 200, f"status={r7.status_code}")
        if r7.status_code == 200:
            pending = r7.json().get("pending_invites", [])
            match = next((pi for pi in pending if pi.get("phone") == "8487978794"), None)
            check("S7.pending entry 8487978794 present", match is not None, f"entry={match}")
            if match:
                nm = match.get("name", "")
                check("S7.name is empty or missing (backcompat)",
                      nm == "" or nm is None,
                      f"name={nm!r}")

        # ==== SUMMARY ====
        print("\n=========================================")
        passes = sum(1 for s, _, _ in results if s == "PASS")
        fails = sum(1 for s, _, _ in results if s == "FAIL")
        print(f"TOTAL: {passes} PASS / {fails} FAIL / {len(results)} total")
        if fails:
            print("\nFAILURES:")
            for s, n, d in results:
                if s == "FAIL":
                    print(f"  - {n}: {d}")
        # Final snapshot
        r_final = c.get(f"/split/groups/{HOSTEL_ID}/manage", headers=H)
        if r_final.status_code == 200:
            fj = r_final.json()
            print(f"\n[FINAL] members={fj.get('member_count')} pending={fj.get('pending_count')}")
            print(f"[FINAL] pending_invites:")
            for pi in fj.get("pending_invites", []):
                print(f"   - phone={pi.get('phone')}  name={pi.get('name')!r}")


if __name__ == "__main__":
    main()
