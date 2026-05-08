"""R104H — Setu AA Trust Fix verification (read-only).

Verifies that fake bank data is NOT injected when SETU_LIVE=false and
ALLOW_SETU_MOCK is unset (default false).
"""
import json
import os
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9111122221"
OTP = "123456"


def banner(s: str) -> None:
    print("\n" + "=" * 78)
    print(s)
    print("=" * 78)


def main() -> int:
    failures: list[str] = []

    banner("T1 — Auth (send-otp + verify-otp)")
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    print(f"  send-otp → {r.status_code}")
    if r.status_code != 200:
        failures.append(f"send-otp returned {r.status_code}: {r.text[:200]}")

    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": PHONE, "otp": OTP, "device_id": "cli-r104h", "device_name": "CLI", "os": "web"},
        timeout=15,
    )
    print(f"  verify-otp → {r.status_code}")
    if r.status_code != 200:
        failures.append(f"verify-otp returned {r.status_code}: {r.text[:200]}")
        print("\n".join(failures))
        return 1
    token = r.json().get("access_token")
    if not token:
        failures.append("No access_token in verify-otp response")
        return 1
    print(f"  ✅ Auth OK (token len={len(token)})")
    H = {"Authorization": f"Bearer {token}"}

    banner("T2 — GET /api/setu/status (sanity)")
    r = requests.get(f"{BASE}/setu/status", headers=H, timeout=10)
    print(f"  status code → {r.status_code}")
    body = r.json() if r.status_code == 200 else {}
    print(f"  body → {json.dumps(body)}")
    if r.status_code != 200:
        failures.append(f"T2 status code {r.status_code}, expected 200")
    if body.get("live") is not False:
        failures.append(f"T2 live should be False, got {body.get('live')!r}")
    if body.get("mock") is not True:
        failures.append(f"T2 mock should be True, got {body.get('mock')!r}")
    if body.get("base_url") is not None:
        failures.append(f"T2 base_url should be null, got {body.get('base_url')!r}")
    if not any(f.startswith("T2 ") for f in failures):
        print("  ✅ status sanity OK")

    banner("T3 — POST /api/setu/consent/init")
    r = requests.post(
        f"{BASE}/setu/consent/init",
        headers=H,
        json={"purpose": "profile", "duration_days": 90, "fi_types": ["DEPOSIT"]},
        timeout=15,
    )
    print(f"  status code → {r.status_code}")
    body = r.json() if r.status_code == 200 else {}
    print(f"  body → {json.dumps(body)[:300]}")
    if r.status_code != 200:
        failures.append(f"T3 consent/init returned {r.status_code}: {r.text[:200]}")
        print("\n".join(failures))
        return 1
    consent_id = body.get("consent_id")
    if not consent_id:
        failures.append("T3 missing consent_id in response")
        return 1
    print(f"  ✅ consent_id captured: {consent_id}")

    banner("T4 — POST /api/setu/consent/callback")
    r = requests.post(
        f"{BASE}/setu/consent/callback",
        headers=H,
        json={"consent_id": consent_id},
        timeout=15,
    )
    print(f"  status code → {r.status_code}")
    body = r.json() if r.status_code == 200 else {}
    print(f"  body → {json.dumps(body)}")
    if r.status_code != 200:
        failures.append(f"T4 callback returned {r.status_code}, expected 200")
    if body.get("ok") is not True:
        failures.append(f"T4 ok should be True, got {body.get('ok')!r}")
    if body.get("status") != "ACTIVE":
        failures.append(f"T4 status should be ACTIVE, got {body.get('status')!r}")
    if not any(f.startswith("T4 ") for f in failures):
        print("  ✅ consent activated")

    banner("T5 — CRITICAL: POST /api/setu/fi-data/fetch")
    r = requests.post(f"{BASE}/setu/fi-data/fetch", headers=H, timeout=15)
    print(f"  status code → {r.status_code}")
    print(f"  raw body → {r.text[:600]}")
    try:
        body = r.json()
    except Exception:
        body = {}
    if r.status_code == 200:
        failures.append(
            "T5 ❌ TRUST CONTRACT VIOLATION: /fi-data/fetch returned 200 with body — "
            "fake transactions should be blocked when ALLOW_SETU_MOCK is false."
        )
    elif r.status_code != 503:
        failures.append(f"T5 expected 503, got {r.status_code}")
    else:
        detail = (body.get("detail") or "").lower()
        if "setu is not configured" not in detail and "bank data unavailable" not in detail:
            failures.append(
                f"T5 detail does not mention 'Setu is not configured' or 'Bank data unavailable': {detail!r}"
            )
        else:
            print("  ✅ T5 returned 503 with correct trust message — fake txns BLOCKED")

    banner("T6 — CRITICAL: GET /api/setu/accounts")
    r = requests.get(f"{BASE}/setu/accounts", headers=H, timeout=15)
    print(f"  status code → {r.status_code}")
    print(f"  raw body → {r.text[:600]}")
    try:
        body = r.json()
    except Exception:
        body = {}
    if r.status_code != 200:
        failures.append(f"T6 expected 200, got {r.status_code}")
    accounts = body.get("accounts")
    if accounts is None or not isinstance(accounts, list):
        failures.append(f"T6 'accounts' missing or not a list: {accounts!r}")
    elif len(accounts) != 0:
        failures.append(
            f"T6 ❌ TRUST CONTRACT VIOLATION: accounts must be EMPTY when "
            f"ALLOW_SETU_MOCK is false; got {len(accounts)} entries: {accounts}"
        )
    if body.get("connected") is not False:
        failures.append(f"T6 connected should be False, got {body.get('connected')!r}")
    if body.get("is_mock") is not False:
        failures.append(f"T6 is_mock should be False, got {body.get('is_mock')!r}")
    # Check no HDFC/ICICI leakage
    raw = json.dumps(body).lower()
    if "hdfc" in raw or "icici" in raw or "xxxx3421" in raw or "xxxx8865" in raw:
        failures.append(f"T6 ❌ leaked mock bank labels (HDFC/ICICI/masked nums) in body: {body}")
    if not any(f.startswith("T6 ") for f in failures):
        print("  ✅ T6 accounts is empty, connected=false, is_mock=false")

    banner("FINAL RESULT")
    if failures:
        print(f"❌ {len(failures)} FAILURE(S):")
        for f in failures:
            print(f"  • {f}")
        return 1
    print("✅ ALL ASSERTIONS PASS — R104H trust contract holds.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
