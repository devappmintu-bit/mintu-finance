"""Round 99C — Recurring Subscription Detector backend tests."""
from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

GREEN = "\033[92m"; RED = "\033[91m"; END = "\033[0m"
PASS: List[str] = []
FAIL: List[Tuple[str, str]] = []


def _ok(m): PASS.append(m); print(f"{GREEN}✅ {m}{END}")
def _bad(m, d=""):
    FAIL.append((m, d)); print(f"{RED}❌ {m}{END}")
    if d: print(f"   {d[:600]}")
def _assert(c, m, d=""):
    (_ok if c else _bad)(m, d) if not c else _ok(m)
    return c


def _login() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    if r.status_code not in (200, 429):
        raise RuntimeError(f"send-otp {r.status_code}: {r.text}")
    r = requests.post(f"{BASE}/auth/verify-otp",
                      json={"phone": PHONE, "otp": OTP,
                            "device_id": "round99c", "device_name": "test", "os": "linux"},
                      timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"verify-otp {r.status_code}: {r.text}")
    body = r.json()
    return body.get("access_token") or body.get("token")


def _h(tok, extra=None):
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    if extra: h.update(extra)
    return h


def test_auth_gating():
    print("\n=== TEST 1: AUTH GATING ===")
    cases = [
        ("GET", f"{BASE}/subscriptions"),
        ("POST", f"{BASE}/subscriptions/scan"),
        ("POST", f"{BASE}/subscriptions/test-id/dismiss"),
        ("POST", f"{BASE}/subscriptions/test-id/restore"),
    ]
    for method, url in cases:
        r = requests.get(url, timeout=15) if method == "GET" else requests.post(url, json={}, timeout=15)
        _assert(r.status_code in (401, 403),
                f"{method} {url.replace(BASE, '')} no-auth → {r.status_code} (want 401/403)",
                r.text[:300])


def test_empty_state(tok):
    print("\n=== TEST 2: EMPTY STATE / SHAPE ===")
    r = requests.get(f"{BASE}/subscriptions", headers=_h(tok), timeout=20)
    _assert(r.status_code == 200, f"GET /subscriptions → 200 (got {r.status_code})", r.text[:300])
    if r.status_code != 200: return
    body = r.json()
    _assert(isinstance(body.get("subscriptions"), list), "body.subscriptions is list")
    _assert(isinstance(body.get("summary"), dict), "body.summary is dict")
    s = body.get("summary", {})
    _assert(isinstance(s.get("total"), int), f"summary.total int (got {s.get('total')})")
    _assert(isinstance(s.get("active"), int), f"summary.active int (got {s.get('active')})")
    _assert(isinstance(s.get("annualised_active"), (int, float)),
            f"summary.annualised_active number (got {s.get('annualised_active')})")
    _assert("biggest_leak" in s, "summary.biggest_leak key present")


def _post_txn(tok, description, amount, days_ago):
    dt = datetime.now(timezone.utc) - timedelta(days=days_ago)
    body = {
        "amount": amount, "category": "Subscriptions",
        "description": description, "type": "debit",
        "date": dt.isoformat(),
        "idempotency_key": str(uuid.uuid4()),
    }
    r = requests.post(f"{BASE}/transactions",
                      headers=_h(tok, {"Idempotency-Key": str(uuid.uuid4())}),
                      json=body, timeout=20)
    if r.status_code != 200:
        print(f"   txn seed failed [{r.status_code}]: {r.text[:200]}")
        return None
    return r.json().get("id")


def test_detect_persist(tok) -> Optional[str]:
    print("\n=== TEST 3: DETECT-AND-PERSIST ===")
    netflix_ids = []
    for i in range(6):
        days = 5 + i * 30
        tid = _post_txn(tok, "TESTRECUR_NETFLIX.COM PAYMENT", 649.0, days)
        if tid: netflix_ids.append(tid)
    _assert(len(netflix_ids) == 6, f"seeded 6 Netflix txns (got {len(netflix_ids)})")

    spotify_ids = []
    for i in range(4):
        days = 5 + i * 30
        tid = _post_txn(tok, "TESTRECUR_SPOTIFY INDIA", 119.0, days)
        if tid: spotify_ids.append(tid)
    _assert(len(spotify_ids) == 4, f"seeded 4 Spotify txns (got {len(spotify_ids)})")

    r = requests.post(f"{BASE}/subscriptions/scan", headers=_h(tok), timeout=30)
    _assert(r.status_code == 200, f"POST /subscriptions/scan → 200 (got {r.status_code})", r.text[:400])
    if r.status_code != 200: return None
    body = r.json()
    subs = body.get("subscriptions", [])
    summ = body.get("summary", {})

    by_label = {s.get("merchant_label"): s for s in subs}
    netflix = by_label.get("Netflix")
    spotify = by_label.get("Spotify")

    print(f"   detected merchant_labels: {sorted(by_label.keys())}")
    print(f"   summary: {summ}")

    _assert(netflix is not None, "Netflix detected as subscription",
            json.dumps([s.get("merchant_label") for s in subs]))
    _assert(spotify is not None, "Spotify detected as subscription",
            json.dumps([s.get("merchant_label") for s in subs]))

    if netflix:
        _assert(netflix.get("status") == "active",
                f"Netflix.status == 'active' (got {netflix.get('status')})")
        _assert(netflix.get("cadence") == "monthly",
                f"Netflix.cadence == 'monthly' (got {netflix.get('cadence')})")
        print(f"   Netflix → cadence={netflix.get('cadence')} occ={netflix.get('occurrences')} "
              f"annualised={netflix.get('annualised_cost')} amount_avg={netflix.get('amount_avg')}")
    if spotify:
        _assert(spotify.get("status") == "active",
                f"Spotify.status == 'active' (got {spotify.get('status')})")
        _assert(spotify.get("cadence") == "monthly",
                f"Spotify.cadence == 'monthly' (got {spotify.get('cadence')})")
        print(f"   Spotify → cadence={spotify.get('cadence')} occ={spotify.get('occurrences')} "
              f"annualised={spotify.get('annualised_cost')} amount_avg={spotify.get('amount_avg')}")

    active_subs = [s for s in subs if s.get("status") == "active"]
    if netflix and spotify:
        n_idx = next((i for i, s in enumerate(active_subs)
                      if s.get("merchant_label") == "Netflix"), -1)
        s_idx = next((i for i, s in enumerate(active_subs)
                      if s.get("merchant_label") == "Spotify"), -1)
        _assert(0 <= n_idx < s_idx,
                f"Netflix sorted before Spotify in active list (idx {n_idx} < {s_idx})")

    _assert(summ.get("total", 0) >= 2, f"summary.total >= 2 (got {summ.get('total')})")
    _assert(summ.get("active", 0) >= 2, f"summary.active >= 2 (got {summ.get('active')})")
    _assert(summ.get("biggest_leak") == "Netflix",
            f"summary.biggest_leak == 'Netflix' (got {summ.get('biggest_leak')})")

    r2 = requests.get(f"{BASE}/subscriptions", headers=_h(tok), timeout=20)
    _assert(r2.status_code == 200, f"GET /subscriptions after scan → 200 (got {r2.status_code})")
    if r2.status_code == 200:
        body2 = r2.json()
        ids_scan = sorted(s.get("subscription_id") for s in subs)
        ids_get  = sorted(s.get("subscription_id") for s in body2.get("subscriptions", []))
        _assert(ids_scan == ids_get, "GET /subscriptions matches scan output (cached/persisted)",
                f"\n   scan_ids={ids_scan}\n   get_ids={ids_get}")

    # Pick the FIRST sub from a fresh GET (should be the highest annualised active)
    r3 = requests.get(f"{BASE}/subscriptions", headers=_h(tok), timeout=20)
    if r3.status_code == 200:
        first = (r3.json().get("subscriptions") or [None])[0]
        if first:
            return first.get("subscription_id")
    return subs[0].get("subscription_id") if subs else None


def test_dismiss_restore(tok, sub_id):
    print(f"\n=== TEST 4: DISMISS / RESTORE on {sub_id} ===")
    if not sub_id:
        _bad("Skipping dismiss/restore (no sub_id)"); return

    r = requests.post(f"{BASE}/subscriptions/{sub_id}/dismiss", headers=_h(tok), timeout=15)
    _assert(r.status_code == 200, f"dismiss → 200 (got {r.status_code})", r.text[:300])
    if r.status_code == 200:
        b = r.json()
        _assert(b.get("ok") is True, f"dismiss body.ok==True (got {b.get('ok')})")
        _assert(b.get("subscription_id") == sub_id, f"dismiss body.subscription_id matches")
        _assert(b.get("dismissed") is True, f"dismiss body.dismissed==True (got {b.get('dismissed')})")

    r = requests.get(f"{BASE}/subscriptions", headers=_h(tok), timeout=15)
    if r.status_code == 200:
        ids = [s.get("subscription_id") for s in r.json().get("subscriptions", [])]
        _assert(sub_id not in ids, f"GET /subscriptions excludes dismissed (have {len(ids)} subs)")

    r = requests.get(f"{BASE}/subscriptions?include_dismissed=true", headers=_h(tok), timeout=15)
    if r.status_code == 200:
        ids = [s.get("subscription_id") for s in r.json().get("subscriptions", [])]
        _assert(sub_id in ids, "GET ?include_dismissed=true includes dismissed")

    r = requests.post(f"{BASE}/subscriptions/{sub_id}/restore", headers=_h(tok), timeout=15)
    _assert(r.status_code == 200, f"restore → 200 (got {r.status_code})", r.text[:300])
    if r.status_code == 200:
        b = r.json()
        _assert(b.get("ok") is True, f"restore body.ok==True")
        _assert(b.get("dismissed") is False, f"restore body.dismissed==False (got {b.get('dismissed')})")

    r = requests.get(f"{BASE}/subscriptions", headers=_h(tok), timeout=15)
    if r.status_code == 200:
        ids = [s.get("subscription_id") for s in r.json().get("subscriptions", [])]
        _assert(sub_id in ids, "GET /subscriptions has restored sub back in default list")


def test_unknown_id(tok):
    print("\n=== TEST 5: UNKNOWN ID ===")
    r = requests.post(f"{BASE}/subscriptions/nonexistent_id/dismiss", headers=_h(tok), timeout=15)
    _assert(r.status_code == 404, f"unknown/dismiss → 404 (got {r.status_code})", r.text[:200])
    r = requests.post(f"{BASE}/subscriptions/nonexistent_id/restore", headers=_h(tok), timeout=15)
    _assert(r.status_code == 404, f"unknown/restore → 404 (got {r.status_code})", r.text[:200])


def test_smoke(tok):
    print("\n=== TEST 6: SMOKE REGRESSION ===")
    r = requests.get(f"{BASE}/onboarding/starter-cards", headers=_h(tok), timeout=15)
    _assert(r.status_code == 200, f"GET /onboarding/starter-cards → 200 (got {r.status_code})", r.text[:200])
    r = requests.get(f"{BASE}/transactions", headers=_h(tok), timeout=15)
    _assert(r.status_code == 200, f"GET /transactions → 200 (got {r.status_code})", r.text[:200])
    r = requests.get(f"{BASE}/budgets/live", headers=_h(tok), timeout=15)
    _assert(r.status_code == 200, f"GET /budgets/live → 200 (got {r.status_code})", r.text[:200])

    idem = str(uuid.uuid4())
    body = {"amount": 99.0, "category": "Other", "description": "TESTRECUR_smoke_idem",
            "type": "debit", "idempotency_key": idem}
    r1 = requests.post(f"{BASE}/transactions",
                       headers=_h(tok, {"Idempotency-Key": str(uuid.uuid4())}),
                       json=body, timeout=15)
    _assert(r1.status_code == 200, f"POST /transactions w/ idem → 200 (got {r1.status_code})", r1.text[:300])
    if r1.status_code == 200:
        id1 = r1.json().get("id")
        r2 = requests.post(f"{BASE}/transactions",
                           headers=_h(tok, {"Idempotency-Key": str(uuid.uuid4())}),
                           json=body, timeout=15)
        _assert(r2.status_code == 200, f"POST /transactions repeat idem → 200 (got {r2.status_code})", r2.text[:300])
        if r2.status_code == 200:
            id2 = r2.json().get("id")
            _assert(id1 == id2, f"idempotency dedupe → same id ({id1} vs {id2})")


def cleanup(tok):
    print("\n=== CLEANUP ===")
    r = requests.get(f"{BASE}/transactions?limit=500", headers=_h(tok), timeout=20)
    if r.status_code != 200:
        print("   skipped — could not list transactions"); return
    body = r.json()
    txns = body if isinstance(body, list) else (body.get("transactions") or body.get("items") or [])
    deleted = 0
    for t in txns:
        if "TESTRECUR_" in (t.get("description") or ""):
            tid = t.get("id") or t.get("_id")
            if not tid: continue
            d = requests.delete(f"{BASE}/transactions/{tid}", headers=_h(tok), timeout=10)
            if d.status_code in (200, 204, 404):
                deleted += 1
    print(f"   deleted {deleted} TESTRECUR_ txns")


def main():
    print(f"BASE: {BASE}")
    test_auth_gating()
    try:
        tok = _login()
        print(f"   token acquired (len={len(tok)})")
    except Exception as e:
        _bad("login failed", str(e)); sys.exit(1)

    test_empty_state(tok)
    sub_id = test_detect_persist(tok)
    if sub_id:
        test_dismiss_restore(tok, sub_id)
    test_unknown_id(tok)
    test_smoke(tok)
    cleanup(tok)

    print("\n" + "=" * 60)
    print(f"PASS: {len(PASS)}   FAIL: {len(FAIL)}")
    if FAIL:
        print(f"\n{RED}Failures:{END}")
        for m, d in FAIL:
            print(f"  • {m}")
            if d: print(f"    {d[:200]}")
        sys.exit(1)
    print(f"{GREEN}ALL GREEN{END}")


if __name__ == "__main__":
    main()
