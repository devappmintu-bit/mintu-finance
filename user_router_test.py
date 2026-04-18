"""Quick smoke test for user router extraction (Apr 18 2026)."""
import os
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []


def log(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((name, ok, detail))
    print(f"[{status}] {name} — {detail}")


def auth():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    assert r.status_code == 200, f"send-otp {r.status_code} {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
    assert r.status_code == 200, f"verify-otp {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]["id"]


def main():
    token, user_id = auth()
    h = {"Authorization": f"Bearer {token}"}

    # 1. GET /user/me
    r = requests.get(f"{BASE}/user/me", headers=h, timeout=20)
    ok = r.status_code == 200 and all(k in r.json() for k in ("id", "phone", "name", "money_score"))
    log("1. GET /user/me", ok, f"status={r.status_code} body_keys={list(r.json().keys()) if r.status_code==200 else r.text[:120]}")

    # 2. PUT /user/profile
    r = requests.put(f"{BASE}/user/profile", json={"name": "Test Updated"}, headers=h, timeout=20)
    ok = r.status_code == 200 and r.json().get("name") == "Test Updated"
    log("2. PUT /user/profile", ok, f"status={r.status_code} body={r.text[:120]}")

    # 3. POST /user/upi valid
    r = requests.post(f"{BASE}/user/upi", json={"upi_id": "test@okicici"}, headers=h, timeout=20)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    ok = r.status_code == 200 and "****" in body.get("upi_id", "")
    log("3. POST /user/upi valid", ok, f"status={r.status_code} masked={body.get('upi_id')}")

    # 4. GET /user/upi
    r = requests.get(f"{BASE}/user/upi", headers=h, timeout=20)
    body = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and "****" in body.get("masked", "")
    log("4. GET /user/upi", ok, f"status={r.status_code} masked={body.get('masked')} full={body.get('upi_id')}")

    # 5. POST /user/upi invalid
    r = requests.post(f"{BASE}/user/upi", json={"upi_id": "invalid format"}, headers=h, timeout=20)
    ok = r.status_code == 400
    log("5. POST /user/upi invalid → 400", ok, f"status={r.status_code} body={r.text[:120]}")

    # 6. GET /user/avatar
    r = requests.get(f"{BASE}/user/avatar", headers=h, timeout=20)
    ok = r.status_code == 200 and "avatar" in r.json() and "name" in r.json()
    log("6. GET /user/avatar", ok, f"status={r.status_code} keys={list(r.json().keys()) if r.status_code==200 else r.text[:120]}")

    # 7. PUT /user/biometric
    r = requests.put(f"{BASE}/user/biometric", json={"enabled": True}, headers=h, timeout=20)
    ok = r.status_code == 200 and r.json().get("biometric_enabled") is True
    log("7. PUT /user/biometric", ok, f"status={r.status_code} body={r.text[:120]}")

    # 8. GET /split/pay-intent — uses mask_upi_id from core/upi.py re-export
    r = requests.get(f"{BASE}/split/pay-intent/{user_id}?amount=100", headers=h, timeout=20)
    ok = r.status_code in (200, 400)
    log("8. GET /split/pay-intent (re-export mask_upi_id)", ok, f"status={r.status_code} body={r.text[:140]}")

    # 9. GET /transactions
    r = requests.get(f"{BASE}/transactions", headers=h, timeout=20)
    ok = r.status_code == 200 and isinstance(r.json(), list)
    log("9. GET /transactions", ok, f"status={r.status_code} count={len(r.json()) if r.status_code==200 else 'n/a'}")

    # 10. GET /stats/overview
    r = requests.get(f"{BASE}/stats/overview", headers=h, timeout=20)
    ok = r.status_code == 200 and "total_income" in r.json()
    log("10. GET /stats/overview", ok, f"status={r.status_code} keys={list(r.json().keys()) if r.status_code==200 else r.text[:120]}")

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{'='*60}\nRESULT: {passed}/{total} passed\n{'='*60}")
    return passed == total


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
