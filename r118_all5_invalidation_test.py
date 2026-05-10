"""R118 ADDITIONAL re-verify: ALL 5 caches must bust on POST + DELETE.

Per the review request, in addition to mood-score and cashflow, also verify
that story / behavior / subscriptions caches are correctly invalidated when
a transaction is posted then deleted.

Strategy:
  1. Auth.
  2. For each endpoint, capture baseline tx_count.
  3. POST a debit txn → re-fetch each endpoint → tx_count must increment by 1.
  4. DELETE the txn → re-fetch each endpoint → tx_count must return to baseline.
"""
import time
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []
def log(name, ok, detail=""):
    mark = "✅" if ok else "❌"
    print(f"{mark} {name}" + (f" — {detail}" if detail else ""), flush=True)
    results.append((ok, name, detail))


def auth():
    requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    return r.json().get("access_token") or r.json().get("token")


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# Endpoints that expose a tx_count field we can check directly
ENDPOINTS = ["mood-score", "money-story", "behavior", "cashflow", "subscriptions"]


def fetch_tx_counts(tok):
    """Return dict of endpoint → tx_count (or None if missing)."""
    out = {}
    for ep in ENDPOINTS:
        r = requests.get(f"{BASE}/intelligence/{ep}", headers=H(tok), timeout=30)
        if r.status_code != 200:
            out[ep] = (None, r.status_code, r.text[:100])
            continue
        body = r.json()
        out[ep] = (body.get("tx_count"), 200, "")
    return out


def main():
    tok = auth()
    print("[T0] Auth OK\n", flush=True)

    print("[B1] Baseline tx_count snapshot across all 5 endpoints")
    base = fetch_tx_counts(tok)
    for ep, (cnt, status, _) in base.items():
        log(f"B1 {ep} baseline tx_count present", isinstance(cnt, int),
            f"tx_count={cnt} status={status}")

    print("\n[B2] POST debit ₹77, then re-snapshot all 5 endpoints")
    payload = {"amount": 77, "category": "Other",
               "description": "all5-cache-bust-test", "type": "debit"}
    r = requests.post(f"{BASE}/transactions", json=payload, headers=H(tok), timeout=30)
    log("B2 POST /transactions ₹77", r.status_code in (200, 201), f"status={r.status_code}")
    if r.status_code not in (200, 201):
        return
    txn_id = r.json().get("id") or r.json().get("_id")
    log("B2 captured txn id", bool(txn_id), f"id={txn_id}")

    time.sleep(0.5)
    after_post = fetch_tx_counts(tok)
    for ep in ENDPOINTS:
        before = base[ep][0]
        after = after_post[ep][0]
        if not isinstance(before, int) or not isinstance(after, int):
            log(f"B2 {ep} tx_count comparable", False, f"before={before} after={after}")
            continue
        ok = after == before + 1
        log(f"B2 {ep} tx_count incremented by 1 (cache busted)", ok,
            f"baseline={before} after_post={after} (expected {before+1})")

    print("\n[B3] DELETE the txn, then re-snapshot all 5 endpoints")
    r = requests.delete(f"{BASE}/transactions/{txn_id}", headers=H(tok), timeout=30)
    log("B3 DELETE /transactions/{id}", r.status_code in (200, 204),
        f"status={r.status_code}")

    time.sleep(0.5)
    after_del = fetch_tx_counts(tok)
    for ep in ENDPOINTS:
        before = base[ep][0]
        after = after_del[ep][0]
        if not isinstance(before, int) or not isinstance(after, int):
            log(f"B3 {ep} tx_count comparable", False, f"before={before} after={after}")
            continue
        ok = after == before
        log(f"B3 {ep} tx_count back to baseline (cache busted)", ok,
            f"baseline={before} post_delete={after}")

    passed = sum(1 for ok, _, _ in results if ok)
    failed = sum(1 for ok, _, _ in results if not ok)
    print(f"\n=== TOTAL: PASS={passed} FAIL={failed} ===")
    if failed:
        print("\nFailures:")
        for ok, name, detail in results:
            if not ok:
                print(f"  ❌ {name} — {detail}")


if __name__ == "__main__":
    main()
