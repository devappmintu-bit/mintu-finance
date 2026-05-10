"""R118 — Diagnostic Score cache invalidation verification.

Single shared-auth runner that exercises:
  T1: REGRESSION — R118 26/26 cache-invalidation contract
       (5 endpoint regression + 5 auth-guards + mood-score POST/DELETE
        cache-bust + cashflow POST/DELETE cache-bust).
  T2: NEW — diagnostic_score (/api/home/diagnostic, 60s TTL) cache
       busts on transaction write via /api/cash/quick-entry, and
       restores on DELETE.
  T3: REGRESSION — R118 19/19 cash quick-entry cache-bust contract
       (mood-score + cashflow both bust on POST /api/cash/quick-entry).
"""
import sys
import time
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

# Endpoint discovered via grep:
#   /app/backend/routers/diagnostic_score.py:74 → @router.get("/home/diagnostic")
DIAG_PATH = "/home/diagnostic"

results = []  # list of (ok, name, detail)


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


# ─── T1 ────────────────────────────────────────────────────────────
def t1_regression(tok):
    print("\n=== T1 REGRESSION: R118 5 endpoints + 26/26 cache-invalidation ===\n")

    # T1a — 5 endpoints 200 with bearer
    for ep in ["mood-score", "money-story", "behavior", "cashflow", "subscriptions"]:
        r = requests.get(f"{BASE}/intelligence/{ep}", headers=H(tok), timeout=30)
        log(f"T1.5x GET /intelligence/{ep} → 200", r.status_code == 200, f"got {r.status_code}")

    # T1b — auth guards
    for ep in ["mood-score", "money-story", "behavior", "cashflow", "subscriptions"]:
        r = requests.get(f"{BASE}/intelligence/{ep}", timeout=15)
        log(f"T1.5y no-auth GET /intelligence/{ep} → 401", r.status_code == 401, f"got {r.status_code}")

    # T1c — mood-score POST/DELETE cache-bust
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
    log("T1.M1 GET mood-score baseline → 200", r.status_code == 200)
    if r.status_code != 200:
        return
    base_tx = r.json().get("tx_count")
    log("T1.M1 mood-score.tx_count is int", isinstance(base_tx, int), f"tx_count={base_tx}")

    r = requests.post(f"{BASE}/transactions",
                      json={"amount": 99, "category": "Other",
                            "description": "cache-bust-test", "type": "debit"},
                      headers=H(tok), timeout=30)
    log("T1.M2 POST /transactions debit ₹99 → 200/201", r.status_code in (200, 201),
        f"status={r.status_code}")
    if r.status_code not in (200, 201):
        return
    body = r.json()
    txn_id = body.get("id") or body.get("_id") or (body.get("transaction") or {}).get("id")
    log("T1.M2 captured txn id", bool(txn_id), f"id={txn_id}")

    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
    log("T1.M3 GET mood-score after POST → 200", r.status_code == 200)
    if r.status_code == 200:
        new_tx = r.json().get("tx_count")
        ok = isinstance(new_tx, int) and new_tx == base_tx + 1
        log("T1.M3 mood-score.tx_count == baseline+1 (cache busted)", ok,
            f"baseline={base_tx} after_post={new_tx}")

    if txn_id:
        r = requests.delete(f"{BASE}/transactions/{txn_id}", headers=H(tok), timeout=30)
        log("T1.M4 DELETE /transactions/{id} → 200/204", r.status_code in (200, 204),
            f"status={r.status_code}")
        time.sleep(0.5)
        r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
        log("T1.M5 GET mood-score after DELETE → 200", r.status_code == 200)
        if r.status_code == 200:
            post_del = r.json().get("tx_count")
            log("T1.M5 mood-score.tx_count back to baseline",
                post_del == base_tx, f"baseline={base_tx} post_delete={post_del}")

    # T1d — cashflow POST/DELETE cache-bust
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
    log("T1.C1 GET cashflow baseline → 200", r.status_code == 200)
    if r.status_code != 200:
        return
    cf_base = r.json().get("tx_count")
    log("T1.C1 cashflow.tx_count is int", isinstance(cf_base, int), f"tx_count={cf_base}")

    r = requests.post(f"{BASE}/transactions",
                      json={"amount": 50, "category": "Other",
                            "description": "cache-bust-cashflow", "type": "debit"},
                      headers=H(tok), timeout=30)
    log("T1.C2 POST /transactions debit ₹50 → 200/201", r.status_code in (200, 201),
        f"status={r.status_code}")
    if r.status_code not in (200, 201):
        return
    body = r.json()
    cf_txn_id = body.get("id") or body.get("_id") or (body.get("transaction") or {}).get("id")
    log("T1.C2 captured txn id", bool(cf_txn_id), f"id={cf_txn_id}")

    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
    log("T1.C3 GET cashflow after POST → 200", r.status_code == 200)
    if r.status_code == 200:
        cf_new = r.json().get("tx_count")
        log("T1.C3 cashflow.tx_count == baseline+1 (cache busted)",
            cf_new == cf_base + 1, f"baseline={cf_base} after_post={cf_new}")

    if cf_txn_id:
        r = requests.delete(f"{BASE}/transactions/{cf_txn_id}", headers=H(tok), timeout=30)
        log("T1.C4 DELETE /transactions/{id} → 200/204", r.status_code in (200, 204),
            f"status={r.status_code}")
        time.sleep(0.5)
        r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
        log("T1.C5 GET cashflow after DELETE → 200", r.status_code == 200)
        if r.status_code == 200:
            cf_post = r.json().get("tx_count")
            log("T1.C5 cashflow.tx_count back to baseline",
                cf_post == cf_base, f"baseline={cf_base} post_delete={cf_post}")


# ─── T2 ────────────────────────────────────────────────────────────
def t2_diagnostic_score_cache_bust(tok):
    print("\n=== T2 NEW: diagnostic_score cache busts on transaction write ===\n")

    # 1. baseline
    r = requests.get(f"{BASE}{DIAG_PATH}", headers=H(tok), timeout=30)
    log(f"T2.1 GET {DIAG_PATH} baseline → 200", r.status_code == 200,
        f"got {r.status_code}: {r.text[:200]}")
    if r.status_code != 200:
        return
    D1 = r.json()
    print(f"   D1 score={D1.get('score')} delta={D1.get('delta_week')} "
          f"weakest={D1.get('weakest_category')} computed_at={D1.get('computed_at')}",
          flush=True)

    # 2. POST /api/cash/quick-entry {"text":"60 cache test"}
    r = requests.post(f"{BASE}/cash/quick-entry",
                      json={"text": "60 cache test"},
                      headers=H(tok), timeout=30)
    log("T2.2 POST /cash/quick-entry → 200", r.status_code == 200,
        f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    body = r.json()
    txn_id = body.get("id")
    log("T2.2 response.id present", bool(txn_id), f"id={txn_id}")

    # 3. GET /api/home/diagnostic → must differ from D1 (cache busted)
    time.sleep(0.5)
    r = requests.get(f"{BASE}{DIAG_PATH}", headers=H(tok), timeout=30)
    log(f"T2.3 GET {DIAG_PATH} after POST → 200", r.status_code == 200,
        f"got {r.status_code}")
    if r.status_code == 200:
        D2 = r.json()
        diffs = [k for k in ("score", "delta_week", "percentile", "history_count",
                             "computed_at", "weakest_category", "headline")
                 if D1.get(k) != D2.get(k)]
        # Cache invalidation evidence: ANY field changing means recompute happened.
        # Most reliable witness is `computed_at` (always advances on a fresh
        # compute) but the review explicitly says "some field changed —
        # raw_amount_total, score, level_label, etc.", so we accept any diff.
        log("T2.3 D2 differs from D1 (cache was busted, NOT identical body)",
            len(diffs) > 0, f"changed_fields={diffs}")
        print(f"   D2 score={D2.get('score')} delta={D2.get('delta_week')} "
              f"weakest={D2.get('weakest_category')} computed_at={D2.get('computed_at')}",
              flush=True)

    # 4. CLEANUP: DELETE /api/transactions/{id} → GET back toward D1
    if txn_id:
        r = requests.delete(f"{BASE}/transactions/{txn_id}", headers=H(tok), timeout=30)
        log("T2.4 cleanup DELETE /transactions/{id} → 200/204",
            r.status_code in (200, 204), f"status={r.status_code}")
        time.sleep(0.5)
        r = requests.get(f"{BASE}{DIAG_PATH}", headers=H(tok), timeout=30)
        log(f"T2.5 GET {DIAG_PATH} after DELETE → 200",
            r.status_code == 200, f"got {r.status_code}")
        if r.status_code == 200:
            D3 = r.json()
            same_score = D3.get("score") == D1.get("score")
            same_weakest = D3.get("weakest_category") == D1.get("weakest_category")
            log("T2.5 D3.score == D1.score (back toward baseline after delete)",
                same_score and same_weakest,
                f"D1.score={D1.get('score')} D3.score={D3.get('score')} "
                f"D1.weakest={D1.get('weakest_category')} D3.weakest={D3.get('weakest_category')}")
            print(f"   D3 score={D3.get('score')} delta={D3.get('delta_week')} "
                  f"weakest={D3.get('weakest_category')} computed_at={D3.get('computed_at')}",
                  flush=True)


# ─── T3 ────────────────────────────────────────────────────────────
def t3_cashflow_quickentry(tok):
    print("\n=== T3 REGRESSION: R118 cash quick-entry busts mood/cashflow caches ===\n")

    # T3a — sanity 5/5 endpoints
    for ep in ["mood-score", "money-story", "behavior", "cashflow", "subscriptions"]:
        r = requests.get(f"{BASE}/intelligence/{ep}", headers=H(tok), timeout=30)
        log(f"T3.5x GET /intelligence/{ep} → 200", r.status_code == 200, f"got {r.status_code}")

    # T3b — Cash quick-entry busts mood-score
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
    log("T3.M1 GET mood-score baseline → 200", r.status_code == 200)
    if r.status_code != 200:
        return
    base_tx = r.json().get("tx_count")
    log("T3.M1 baseline tx_count is int", isinstance(base_tx, int), f"tx_count={base_tx}")

    r = requests.post(f"{BASE}/cash/quick-entry",
                      json={"text": "30 chai"},
                      headers=H(tok), timeout=30)
    log("T3.M2 POST /cash/quick-entry {'text':'30 chai'} → 200",
        r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    body = r.json()
    txn_id = body.get("id")
    log("T3.M2 response.id present", bool(txn_id), f"id={txn_id}")
    log("T3.M2 amount==30", body.get("amount") == 30, f"amount={body.get('amount')}")

    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H(tok), timeout=30)
    log("T3.M3 GET mood-score after cash quick-entry → 200", r.status_code == 200)
    if r.status_code == 200:
        new_tx = r.json().get("tx_count")
        log("T3.M3 mood-score.tx_count == baseline+1 (cache busted)",
            new_tx == base_tx + 1, f"baseline={base_tx} after={new_tx}")

    if txn_id:
        r = requests.delete(f"{BASE}/transactions/{txn_id}", headers=H(tok), timeout=30)
        log("T3.M4 cleanup DELETE", r.status_code in (200, 204),
            f"status={r.status_code}")

    # T3c — Cash quick-entry busts cashflow
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
    log("T3.C1 GET cashflow baseline → 200", r.status_code == 200)
    if r.status_code != 200:
        return
    cf_base = r.json().get("tx_count")
    log("T3.C1 baseline tx_count is int", isinstance(cf_base, int), f"tx_count={cf_base}")

    r = requests.post(f"{BASE}/cash/quick-entry",
                      json={"text": "75 lunch"},
                      headers=H(tok), timeout=30)
    log("T3.C2 POST /cash/quick-entry {'text':'75 lunch'} → 200",
        r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        return
    body = r.json()
    cf_txn_id = body.get("id")
    log("T3.C2 response.id present", bool(cf_txn_id), f"id={cf_txn_id}")
    log("T3.C2 amount==75", body.get("amount") == 75, f"amount={body.get('amount')}")

    time.sleep(0.5)
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=H(tok), timeout=30)
    log("T3.C3 GET cashflow after cash quick-entry → 200", r.status_code == 200)
    if r.status_code == 200:
        cf_new = r.json().get("tx_count")
        log("T3.C3 cashflow.tx_count == baseline+1 (cache busted)",
            cf_new == cf_base + 1, f"baseline={cf_base} after={cf_new}")

    if cf_txn_id:
        r = requests.delete(f"{BASE}/transactions/{cf_txn_id}", headers=H(tok), timeout=30)
        log("T3.C4 cleanup DELETE", r.status_code in (200, 204),
            f"status={r.status_code}")


def main():
    tok = auth()
    print(f"\n[T0] Auth OK (token len={len(tok or '')})", flush=True)

    t1_regression(tok)
    t2_diagnostic_score_cache_bust(tok)
    t3_cashflow_quickentry(tok)

    p = sum(1 for ok, _, _ in results if ok)
    f = sum(1 for ok, _, _ in results if not ok)
    print(f"\n\n=== TOTAL: PASS={p}  FAIL={f} ===")
    if f:
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
