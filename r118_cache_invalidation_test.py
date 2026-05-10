"""R118 Cache invalidation bug-fix verification.

Verifies that POST /api/transactions and DELETE /api/transactions/{id}
correctly invalidate the 5 R118 intelligence caches so the response
of /intelligence/mood-score and /intelligence/cashflow reflect the new
tx_count immediately.
"""
import os
import sys
import time
import json
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []
def log(name, ok, detail=""):
    mark = "✅" if ok else "❌"
    line = f"{mark} {name}"
    if detail:
        line += f" — {detail}"
    print(line, flush=True)
    results.append((ok, name, detail))


def auth():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp {r.status_code} {r.text[:200]}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    assert r.status_code == 200, f"verify-otp {r.status_code} {r.text[:200]}"
    j = r.json()
    return j.get("access_token") or j.get("token")


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    tok = auth()
    print(f"\n[T0] Auth OK\n", flush=True)

    # ----- T1 REGRESSION: 5 endpoints return 200 with bearer -----
    print("[T1] Regression: 5 R118 endpoints return 200 with bearer")
    for ep in ["mood-score", "money-story", "behavior", "cashflow", "subscriptions"]:
        r = requests.get(f"{BASE}/intelligence/{ep}", headers=H(tok), timeout=30)
        log(f"T1 GET /intelligence/{ep} → 200", r.status_code == 200, f"got {r.status_code}")

    # ----- T4 AUTH GUARDS -----
    print("\n[T4] Auth guards on the 5 endpoints (no bearer → 401)")
    for ep in ["mood-score", "money-story", "behavior", "cashflow", "subscriptions"]:
        r = requests.get(f"{BASE}/intelligence/{ep}", timeout=15)
        log(f"T4 no-auth GET /intelligence/{ep} → 401", r.status_code == 401, f"got {r.status_code}")

    # ----- T2 mood-score cache invalidation on POST + DELETE /transactions -----
    print("\n[T2] mood-score cache invalidation on POST + DELETE /api/transactions")
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
    if r.status_code != 200:
        log("T2.1 GET mood-score baseline → 200", False, f"got {r.status_code}: {r.text[:200]}")
        return
    M1 = r.json()
    base_tx_count = M1.get("tx_count")
    log("T2.1 GET mood-score baseline (tx_count present)", isinstance(base_tx_count, int), f"tx_count={base_tx_count}")

    payload = {"amount": 99, "category": "Other", "description": "cache-bust-test", "type": "debit"}
    r = requests.post(f"{BASE}/transactions", json=payload, headers=H(tok), timeout=30)
    log("T2.2 POST /transactions debit ₹99", r.status_code in (200, 201), f"status={r.status_code} body={r.text[:200]}")
    if r.status_code not in (200, 201):
        return
    body = r.json()
    # try several common id locations
    txn_id = body.get("id") or body.get("_id") or (body.get("transaction") or {}).get("id") or (body.get("transaction") or {}).get("_id")
    log("T2.2 captured txn id", bool(txn_id), f"id={txn_id}")

    # T2.3 within 5s
    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
    log("T2.3 GET mood-score after POST → 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        M2 = r.json()
        new_tx = M2.get("tx_count")
        ok = isinstance(new_tx, int) and new_tx == base_tx_count + 1
        log("T2.3 mood-score tx_count == M1.tx_count + 1 (cache invalidated)", ok,
            f"M1={base_tx_count} M2={new_tx} (expected {base_tx_count + 1})")

    # T2.4 cleanup DELETE
    if txn_id:
        r = requests.delete(f"{BASE}/transactions/{txn_id}", headers=H(tok), timeout=30)
        log("T2.4 DELETE /transactions/{id}", r.status_code in (200, 204), f"status={r.status_code} body={r.text[:200]}")
    else:
        log("T2.4 DELETE skipped (no txn id)", False)

    # T2.5 mood-score back to baseline
    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
    log("T2.5 GET mood-score after DELETE → 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        M3 = r.json()
        post_del_tx = M3.get("tx_count")
        ok = isinstance(post_del_tx, int) and post_del_tx == base_tx_count
        log("T2.5 mood-score tx_count back to baseline", ok,
            f"baseline={base_tx_count} post_delete={post_del_tx}")

    # ----- T3 cashflow cache invalidation on POST + DELETE /transactions -----
    print("\n[T3] cashflow cache invalidation on POST + DELETE /api/transactions")
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
    if r.status_code != 200:
        log("T3.1 GET cashflow baseline → 200", False, f"got {r.status_code}: {r.text[:200]}")
        return
    C1 = r.json()
    cf_base = C1.get("tx_count")
    log("T3.1 GET cashflow baseline (tx_count present)", isinstance(cf_base, int), f"tx_count={cf_base}")

    payload = {"amount": 50, "category": "Other", "description": "cache-bust-cashflow", "type": "debit"}
    r = requests.post(f"{BASE}/transactions", json=payload, headers=H(tok), timeout=30)
    log("T3.2 POST /transactions debit ₹50", r.status_code in (200, 201), f"status={r.status_code}")
    if r.status_code not in (200, 201):
        return
    body = r.json()
    cf_txn_id = body.get("id") or body.get("_id") or (body.get("transaction") or {}).get("id") or (body.get("transaction") or {}).get("_id")
    log("T3.2 captured txn id", bool(cf_txn_id), f"id={cf_txn_id}")

    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
    log("T3.3 GET cashflow after POST → 200", r.status_code == 200)
    if r.status_code == 200:
        C2 = r.json()
        cf_new = C2.get("tx_count")
        ok = isinstance(cf_new, int) and cf_new == cf_base + 1
        log("T3.3 cashflow tx_count == baseline + 1 (cache invalidated)", ok,
            f"baseline={cf_base} after_post={cf_new} (expected {cf_base + 1})")

    if cf_txn_id:
        r = requests.delete(f"{BASE}/transactions/{cf_txn_id}", headers=H(tok), timeout=30)
        log("T3.4 DELETE /transactions/{id}", r.status_code in (200, 204), f"status={r.status_code}")

    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
    log("T3.5 GET cashflow after DELETE → 200", r.status_code == 200)
    if r.status_code == 200:
        C3 = r.json()
        cf_post = C3.get("tx_count")
        ok = isinstance(cf_post, int) and cf_post == cf_base
        log("T3.5 cashflow tx_count back to baseline", ok,
            f"baseline={cf_base} post_delete={cf_post}")

    # summary
    passed = sum(1 for ok, _, _ in results if ok)
    failed = sum(1 for ok, _, _ in results if not ok)
    print(f"\n=== TOTAL: PASS={passed} FAIL={failed} ===")
    if failed:
        print("\nFailures:")
        for ok, name, detail in results:
            if not ok:
                print(f"  ❌ {name} — {detail}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
