"""Avatar CUD endpoints test — POST/DELETE/GET /api/user/avatar.

Targets the live preview deployment. Read-only code; no backend edits.
"""
import os
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

SMALL_AVATAR_1 = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=="
)
SMALL_AVATAR_2 = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=="
)


def log(ok: bool, msg: str):
    print(("✅ " if ok else "❌ ") + msg)
    return ok


results = []


def check(cond, msg):
    results.append((cond, msg))
    log(cond, msg)
    return cond


def get_token() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    if r.status_code != 200:
        print("send-otp failed:", r.status_code, r.text)
        sys.exit(1)
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
    if r.status_code != 200:
        print("verify-otp failed:", r.status_code, r.text)
        sys.exit(1)
    j = r.json()
    tok = j.get("token") or j.get("access_token")
    assert tok, f"No token in verify-otp response: {j}"
    return tok


def main():
    tok = get_token()
    H = {"Authorization": f"Bearer {tok}"}

    # ──────────────────────────────────────────────
    # 1. CREATE
    # ──────────────────────────────────────────────
    r = requests.post(f"{BASE}/user/avatar", headers=H, json={"avatar": SMALL_AVATAR_1}, timeout=20)
    check(r.status_code == 200, f"POST create avatar → {r.status_code} (expected 200)")
    j = r.json() if r.status_code == 200 else {}
    check(j.get("message") == "Avatar updated!", f"POST create response message = {j.get('message')!r}")
    check(j.get("avatar") == SMALL_AVATAR_1, "POST create response echoes avatar")

    r = requests.get(f"{BASE}/user/avatar", headers=H, timeout=20)
    check(r.status_code == 200, f"GET after create → {r.status_code}")
    check(r.json().get("avatar") == SMALL_AVATAR_1, "GET after create returns same avatar")

    # ──────────────────────────────────────────────
    # 2. UPDATE
    # ──────────────────────────────────────────────
    r = requests.post(f"{BASE}/user/avatar", headers=H, json={"avatar": SMALL_AVATAR_2}, timeout=20)
    check(r.status_code == 200, f"POST update avatar → {r.status_code}")
    check(r.json().get("avatar") == SMALL_AVATAR_2, "POST update echoes new avatar")

    r = requests.get(f"{BASE}/user/avatar", headers=H, timeout=20)
    check(r.json().get("avatar") == SMALL_AVATAR_2, "GET reflects updated avatar")

    # ──────────────────────────────────────────────
    # 3. DELETE via POST-empty
    # ──────────────────────────────────────────────
    r = requests.post(f"{BASE}/user/avatar", headers=H, json={"avatar": ""}, timeout=20)
    check(r.status_code == 200, f"POST empty-avatar → {r.status_code} (new: should be 200)")
    j = r.json() if r.status_code == 200 else {}
    check(j.get("message") == "Avatar removed", f"POST empty message = {j.get('message')!r}")
    check(j.get("avatar") == "", "POST empty response avatar == ''")

    r = requests.get(f"{BASE}/user/avatar", headers=H, timeout=20)
    check(r.json().get("avatar") == "", "GET after POST-empty returns ''")

    # ──────────────────────────────────────────────
    # 4. DELETE via DELETE — first create avatar, then DELETE twice
    # ──────────────────────────────────────────────
    r = requests.post(f"{BASE}/user/avatar", headers=H, json={"avatar": SMALL_AVATAR_1}, timeout=20)
    check(r.status_code == 200, "Re-create avatar before DELETE test")

    r = requests.delete(f"{BASE}/user/avatar", headers=H, timeout=20)
    check(r.status_code == 200, f"DELETE avatar → {r.status_code}")
    j = r.json() if r.status_code == 200 else {}
    check(j.get("message") == "Avatar removed", f"DELETE message = {j.get('message')!r}")
    check(j.get("avatar") == "", "DELETE response avatar == ''")

    r = requests.get(f"{BASE}/user/avatar", headers=H, timeout=20)
    check(r.json().get("avatar") == "", "GET after DELETE returns ''")

    # Idempotent DELETE
    r = requests.delete(f"{BASE}/user/avatar", headers=H, timeout=20)
    check(r.status_code == 200, f"DELETE again (idempotent) → {r.status_code}")

    # ──────────────────────────────────────────────
    # 5. SIZE GUARD
    # ──────────────────────────────────────────────
    big = "A" * 700_001  # strictly > 700_000
    r = requests.post(f"{BASE}/user/avatar", headers=H, json={"avatar": big}, timeout=30)
    check(r.status_code == 400, f"POST oversize (700_001 chars) → {r.status_code} (expected 400)")
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = ""
    check("Image too large" in detail, f"Oversize detail contains 'Image too large': {detail!r}")

    # Just above threshold — exactly 700_001 handled; just at 700_000 should still work
    ok_size = "B" * 700_000
    r = requests.post(f"{BASE}/user/avatar", headers=H, json={"avatar": ok_size}, timeout=30)
    check(r.status_code == 200, f"POST exactly 700_000 chars → {r.status_code} (expected 200 — boundary)")

    # Cleanup
    requests.delete(f"{BASE}/user/avatar", headers=H, timeout=20)

    # ──────────────────────────────────────────────
    # 6. AUTH GUARDS
    # ──────────────────────────────────────────────
    r = requests.get(f"{BASE}/user/avatar", timeout=20)
    check(r.status_code in (401, 422), f"GET no-auth → {r.status_code} (expected 401/422)")

    r = requests.post(f"{BASE}/user/avatar", json={"avatar": "x"}, timeout=20)
    check(r.status_code in (401, 422), f"POST no-auth → {r.status_code} (expected 401/422)")

    r = requests.delete(f"{BASE}/user/avatar", timeout=20)
    check(r.status_code in (401, 422), f"DELETE no-auth → {r.status_code} (expected 401/422)")

    bad = {"Authorization": "Bearer not.a.valid.jwt"}
    r = requests.get(f"{BASE}/user/avatar", headers=bad, timeout=20)
    check(r.status_code == 401, f"GET bad-token → {r.status_code} (expected 401)")
    r = requests.post(f"{BASE}/user/avatar", headers=bad, json={"avatar": "x"}, timeout=20)
    check(r.status_code == 401, f"POST bad-token → {r.status_code} (expected 401)")
    r = requests.delete(f"{BASE}/user/avatar", headers=bad, timeout=20)
    check(r.status_code == 401, f"DELETE bad-token → {r.status_code} (expected 401)")

    # Summary
    passed = sum(1 for c, _ in results if c)
    total = len(results)
    print(f"\n{'='*60}\nPASS {passed}/{total}\n{'='*60}")
    if passed < total:
        print("FAILED CHECKS:")
        for c, m in results:
            if not c:
                print("  -", m)
        sys.exit(2)


if __name__ == "__main__":
    main()
