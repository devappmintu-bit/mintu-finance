"""R118 — Cash quick-entry cache invalidation verification.

Verifies that POST /api/cash/quick-entry correctly invalidates the
intelligence caches so /intelligence/mood-score and /intelligence/cashflow
reflect the new tx_count immediately.
"""
import sys
import time
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
    print("\n[T0] Auth OK\n", flush=True)

    # T1 REGRESSION (sanity)
    print("[T1] Regression: 5 R118 endpoints return 200 with bearer")
    for ep in ["mood-score", "money-story", "behavior", "cashflow", "subscriptions"]:
        r = requests.get(f"{BASE}/intelligence/{ep}", headers=H(tok), timeout=30)
        log(f"T1 GET /intelligence/{ep} → 200", r.status_code == 200, f"got {r.status_code}")

    # ----- T3 NEW: Cash quick-entry busts mood-score cache -----
    print("\n[T3] Cash quick-entry busts /intelligence/mood-score cache")
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
    if r.status_code != 200:
        log("T3.1 GET mood-score baseline → 200", False, f"got {r.status_code}: {r.text[:200]}")
        return
    M1 = r.json()
    base_tx = M1.get("tx_count")
    log("T3.1 GET mood-score baseline (tx_count present)", isinstance(base_tx, int), f"tx_count={base_tx}")

    payload = {"text": "30 chai"}
    r = requests.post(f"{BASE}/cash/quick-entry", json=payload, headers=H(tok), timeout=30)
    log("T3.2 POST /cash/quick-entry {'text':'30 chai'}", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    body = r.json()
    txn_id = body.get("id")
    log("T3.2 response.id present", bool(txn_id), f"id={txn_id}")
    log("T3.2 amount==30", body.get("amount") == 30, f"amount={body.get('amount')}")

    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
    log("T3.3 GET mood-score after cash quick-entry → 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        M2 = r.json()
        new_tx = M2.get("tx_count")
        ok = isinstance(new_tx, int) and new_tx == base_tx + 1
        log("T3.3 mood-score tx_count == M1.tx_count + 1 (cache busted)", ok,
            f"M1={base_tx} M2={new_tx} (expected {base_tx + 1})")

    # cleanup the chai txn
    if txn_id:
        r = requests.delete(f"{BASE}/transactions/{txn_id}", headers=H(tok), timeout=30)
        log("T3.4 cleanup DELETE /transactions/{id}", r.status_code in (200, 204), f"status={r.status_code}")

    # ----- T4 NEW: Cash quick-entry busts cashflow cache -----
    print("\n[T4] Cash quick-entry busts /intelligence/cashflow cache")
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
    if r.status_code != 200:
        log("T4.1 GET cashflow baseline → 200", False, f"got {r.status_code}: {r.text[:200]}")
        return
    C1 = r.json()
    cf_base = C1.get("tx_count")
    log("T4.1 GET cashflow baseline (tx_count present)", isinstance(cf_base, int), f"tx_count={cf_base}")

    payload = {"text": "75 lunch"}
    r = requests.post(f"{BASE}/cash/quick-entry", json=payload, headers=H(tok), timeout=30)
    log("T4.2 POST /cash/quick-entry {'text':'75 lunch'}", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        return
    body = r.json()
    cf_txn_id = body.get("id")
    log("T4.2 response.id present", bool(cf_txn_id), f"id={cf_txn_id}")
    log("T4.2 amount==75", body.get("amount") == 75, f"amount={body.get('amount')}")

    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
    log("T4.3 GET cashflow after cash quick-entry → 200", r.status_code == 200)
    if r.status_code == 200:
        C2 = r.json()
        cf_new = C2.get("tx_count")
        ok = isinstance(cf_new, int) and cf_new == cf_base + 1
        log("T4.3 cashflow tx_count == baseline + 1 (cache busted)", ok,
            f"baseline={cf_base} after_post={cf_new} (expected {cf_base + 1})")

    if cf_txn_id:
        r = requests.delete(f"{BASE}/transactions/{cf_txn_id}", headers=H(tok), timeout=30)
        log("T4.4 cleanup DELETE /transactions/{id}", r.status_code in (200, 204), f"status={r.status_code}")

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
