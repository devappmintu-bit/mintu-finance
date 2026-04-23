"""Round 27 — Delete Account end-to-end fix tests."""
import random
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
OTP = "123456"

def rand_phone():
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(9))

def seed_user():
    phone = rand_phone()
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, f"send-otp failed {r.status_code} {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP, "name": "Test User R27"}, timeout=30)
    assert r.status_code == 200, f"verify-otp failed {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token")
    user_id = (body.get("user") or {}).get("id")
    assert token and user_id, f"missing token/user_id in {body}"
    return phone, token, user_id

results = []

def record(name, ok, msg=""):
    flag = "✅" if ok else "❌"
    print(f"{flag} {name}: {msg}")
    results.append((name, ok, msg))

# ────────────────────────────────────────────────────────────
# T1 — seed user
# ────────────────────────────────────────────────────────────
try:
    phone, token, user_id = seed_user()
    record("T1 seed user", True, f"phone={phone} user_id={user_id}")
except Exception as e:
    record("T1 seed user", False, str(e))
    print("aborting — cannot seed")
    sys.exit(1)

H = {"Authorization": f"Bearer {token}"}

# ────────────────────────────────────────────────────────────
# T2 — baseline GET /user/me
# ────────────────────────────────────────────────────────────
r = requests.get(f"{BASE}/user/me", headers=H, timeout=30)
ok = r.status_code == 200
body = r.json() if r.headers.get("content-type","").startswith("application/json") else {}
required = {"id", "phone", "name", "money_score", "created_at"}
ok = ok and required.issubset(body.keys())
record("T2 GET /user/me baseline", ok, f"status={r.status_code} keys={set(body.keys()) & required}")

# ────────────────────────────────────────────────────────────
# T3 — HARD DELETE
# ────────────────────────────────────────────────────────────
r = requests.post(f"{BASE}/user/delete-account",
                  headers=H,
                  json={"mode": "hard", "confirmation": "DELETE"},
                  timeout=30)
ok = r.status_code == 200
body = r.json() if r.status_code == 200 else {}
ok = ok and body.get("ok") is True and body.get("mode") == "hard" and isinstance(body.get("deleted_documents"), int) and "message" in body
record("T3 hard delete", ok,
       f"status={r.status_code} ok={body.get('ok')} mode={body.get('mode')} "
       f"deleted_documents={body.get('deleted_documents')} msg={body.get('message')!r}")

# ────────────────────────────────────────────────────────────
# T4 — DEAD TOKEN on /user/me — MUST be 401 (not 404)
# ────────────────────────────────────────────────────────────
r = requests.get(f"{BASE}/user/me", headers=H, timeout=30)
is_401 = r.status_code == 401
detail = ""
try:
    detail = r.json().get("detail", "")
except Exception:
    pass
detail_ok = "no longer exists" in detail.lower() or "account" in detail.lower() or "dead" in detail.lower() or "invalid" in detail.lower()
ok = is_401  # headline fix
record("T4 dead-token GET /user/me → 401 (HEADLINE FIX)", ok,
       f"status={r.status_code} detail={detail!r} (previously 404, now MUST be 401)")
record("T4b detail mentions account deletion", detail_ok,
       f"detail={detail!r}")

# ────────────────────────────────────────────────────────────
# T5 — DEAD TOKEN spread on /user/payment-methods
# ────────────────────────────────────────────────────────────
r = requests.get(f"{BASE}/user/payment-methods", headers=H, timeout=30)
# Accept 401 OR 200 with empty list (per spec). Must NOT be 500 or 2xx with stale data.
if r.status_code == 401:
    ok = True
    msg = "401 (ideal)"
elif r.status_code == 200:
    try:
        body = r.json()
        # Should be empty or have empty methods list
        methods = body.get("methods") or body.get("payment_methods") or body
        if isinstance(methods, list):
            ok = len(methods) == 0
        elif isinstance(body, dict):
            ok = True  # acceptable per spec
        else:
            ok = False
        msg = f"200 (acceptable per spec) body={body}"
    except Exception as e:
        ok = False
        msg = f"200 but body not JSON: {e}"
elif 500 <= r.status_code < 600:
    ok = False
    msg = f"500-class error ({r.status_code}) — BAD"
else:
    ok = r.status_code < 500  # any non-500 4xx is fine
    msg = f"status={r.status_code} text={r.text[:200]}"
record("T5 dead-token GET /user/payment-methods", ok, msg)

# ────────────────────────────────────────────────────────────
# T6 — DELETE confirmation guard
# ────────────────────────────────────────────────────────────
phone2, token2, user_id2 = seed_user()
H2 = {"Authorization": f"Bearer {token2}"}

r = requests.post(f"{BASE}/user/delete-account", headers=H2, json={"mode": "hard"}, timeout=30)
ok = r.status_code == 400
detail = ""
try:
    detail = r.json().get("detail", "")
except Exception:
    pass
ok = ok and "DELETE" in detail
record("T6 hard delete without confirmation → 400", ok,
       f"status={r.status_code} detail={detail!r}")

# user still exists
r = requests.get(f"{BASE}/user/me", headers=H2, timeout=30)
record("T6b user still exists after guard", r.status_code == 200,
       f"status={r.status_code}")

# ────────────────────────────────────────────────────────────
# T7 — SOFT DELETE regression
# ────────────────────────────────────────────────────────────
phone3, token3, user_id3 = seed_user()
H3 = {"Authorization": f"Bearer {token3}"}

r = requests.post(f"{BASE}/user/delete-account", headers=H3, json={"mode": "soft"}, timeout=30)
ok = r.status_code == 200
body = r.json() if r.status_code == 200 else {}
msg_field = body.get("message", "")
ok = ok and body.get("ok") is True and body.get("mode") == "soft" and "30 days" in msg_field
record("T7 soft delete", ok,
       f"status={r.status_code} ok={body.get('ok')} mode={body.get('mode')} message={msg_field!r}")

# soft-deleted user /user/me should still return 200 (doc still exists, flagged)
r = requests.get(f"{BASE}/user/me", headers=H3, timeout=30)
record("T7b soft-deleted user GET /user/me still 200", r.status_code == 200,
       f"status={r.status_code}")

# ────────────────────────────────────────────────────────────
# T8 — INVALID MODE regression
# ────────────────────────────────────────────────────────────
phone4, token4, _ = seed_user()
H4 = {"Authorization": f"Bearer {token4}"}

r = requests.post(f"{BASE}/user/delete-account", headers=H4, json={"mode": "nuke"}, timeout=30)
ok = r.status_code == 400
detail = ""
try:
    detail = r.json().get("detail", "")
except Exception:
    pass
ok = ok and "soft" in detail and "hard" in detail
record("T8 invalid mode → 400", ok, f"status={r.status_code} detail={detail!r}")

# ────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────
total = len(results)
passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{'='*60}")
print(f"SUMMARY: {passed}/{total} assertions passed")
print(f"{'='*60}")
for name, ok, msg in results:
    flag = "✅" if ok else "❌"
    print(f"{flag} {name}")

sys.exit(0 if passed == total else 1)
