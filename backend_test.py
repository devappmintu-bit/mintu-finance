"""Round 25 REFACTOR regression — validate split_razorpay.py split + all core endpoints.

Covers:
  1. Razorpay split endpoints (moved to split_razorpay.py) — 3 routes.
  2. Core split settlement endpoints (remain in split_settle.py).
  3. Budget endpoints.
  4. Transactions endpoints.
"""
import sys
import requests
from bson import ObjectId

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []


def log(ok: bool, name: str, detail: str = ""):
    mark = "✅" if ok else "❌"
    print(f"{mark} {name}  {detail}")
    results.append({"ok": ok, "name": name, "detail": detail})


def bearer(tok):
    return {"Authorization": f"Bearer {tok}"}


def auth_token() -> str:
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp {r.status_code}: {r.text[:200]}"
    r = requests.post(
        f"{BASE_URL}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15
    )
    assert r.status_code == 200, f"verify-otp {r.status_code}: {r.text[:200]}"
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    assert tok, f"No token in verify-otp response: {body}"
    return tok


# ════════════════════════════════════════════════════════════════════
# 1. Razorpay split endpoints (moved to split_razorpay.py)
# ════════════════════════════════════════════════════════════════════
def test_razorpay_order(token):
    print("\n---- Razorpay split endpoints (moved file) ----")
    # Missing target_user_id
    r = requests.post(f"{BASE_URL}/split/razorpay-order", json={"amount": 500},
                      headers=bearer(token), timeout=15)
    log(r.status_code == 400, "razorpay-order missing target_user_id → 400",
        f"code={r.status_code}")

    # Missing amount
    r = requests.post(f"{BASE_URL}/split/razorpay-order",
                      json={"target_user_id": str(ObjectId())},
                      headers=bearer(token), timeout=15)
    log(r.status_code == 400, "razorpay-order missing amount → 400",
        f"code={r.status_code}")

    # amount=0
    r = requests.post(f"{BASE_URL}/split/razorpay-order",
                      json={"target_user_id": str(ObjectId()), "amount": 0},
                      headers=bearer(token), timeout=15)
    log(r.status_code == 400, "razorpay-order amount=0 → 400",
        f"code={r.status_code}")

    # Valid body — try to use a real group member target for realism
    target_uid = str(ObjectId())
    try:
        gr = requests.get(f"{BASE_URL}/split/groups", headers=bearer(token), timeout=15)
        if gr.status_code == 200:
            for g in gr.json() or []:
                gid = g.get("id") or g.get("_id")
                if not gid:
                    continue
                mgr = requests.get(f"{BASE_URL}/split/groups/{gid}/manage",
                                   headers=bearer(token), timeout=15)
                if mgr.status_code == 200:
                    for m in mgr.json().get("members") or []:
                        muid = m.get("user_id")
                        if muid and ObjectId.is_valid(muid):
                            target_uid = muid
                            break
                if target_uid and ObjectId.is_valid(target_uid) and target_uid != str(ObjectId()):
                    break
    except Exception as e:
        print(f"  (info) could not lookup member: {e}")

    body = {"target_user_id": target_uid, "amount": 500, "coins_to_use": 0}
    r = requests.post(f"{BASE_URL}/split/razorpay-order", json=body,
                      headers=bearer(token), timeout=30)
    ok = r.status_code == 200
    log(ok, "razorpay-order valid body → 200",
        f"code={r.status_code} body={r.text[:200]}")
    if not ok:
        return None

    data = r.json()
    required = ["order_id", "amount_paise", "effective_amount", "list_amount",
                "coin_discount", "coins_to_use", "key_id", "currency", "checkout_url"]
    missing = [k for k in required if k not in data]
    log(not missing, "razorpay-order response has all required keys",
        f"missing={missing}")
    log(data.get("currency") == "INR", "razorpay-order currency == INR",
        f"currency={data.get('currency')}")
    log(isinstance(data.get("amount_paise"), int) and data.get("amount_paise") > 0,
        "razorpay-order amount_paise is positive int",
        f"amount_paise={data.get('amount_paise')}")
    log(str(data.get("order_id", "")).startswith("order_"),
        "razorpay-order order_id starts with 'order_'",
        f"order_id={data.get('order_id')}")
    return data.get("order_id")


def test_pay_checkout(order_id):
    # Bad order_id → 404
    r = requests.get(f"{BASE_URL}/split/pay-checkout",
                     params={"order_id": "bogus_nonexistent_order_xyz"},
                     timeout=15)
    log(r.status_code == 404, "pay-checkout bad order_id → 404",
        f"code={r.status_code}")

    if not order_id:
        log(False, "pay-checkout valid order skipped — no order_id")
        return
    # Valid order_id → 200 HTML
    r = requests.get(f"{BASE_URL}/split/pay-checkout",
                     params={"order_id": order_id}, timeout=15)
    ok = r.status_code == 200
    log(ok, "pay-checkout valid order_id → 200", f"code={r.status_code}")
    if ok:
        ctype = r.headers.get("Content-Type", "")
        log("text/html" in ctype, "pay-checkout content-type is text/html",
            f"content-type={ctype}")
        log("Razorpay" in r.text, "pay-checkout HTML contains 'Razorpay'")


def test_verify_settle_payment():
    # Empty body → 400 "Missing payment details"
    r = requests.post(f"{BASE_URL}/split/verify-settle-payment", json={}, timeout=15)
    log(r.status_code == 400, "verify-settle-payment empty body → 400",
        f"code={r.status_code}")

    # Bad signature → 400
    r = requests.post(f"{BASE_URL}/split/verify-settle-payment",
                      json={"order_id": "order_fake", "payment_id": "pay_fake",
                            "signature": "badsig"}, timeout=15)
    log(r.status_code == 400, "verify-settle-payment bad signature → 400",
        f"code={r.status_code}")

    # Missing one field
    r = requests.post(f"{BASE_URL}/split/verify-settle-payment",
                      json={"order_id": "order_x"}, timeout=15)
    log(r.status_code == 400, "verify-settle-payment missing fields → 400",
        f"code={r.status_code}")

    # No 500 across multiple malformed inputs
    never_500 = True
    for b in [{}, {"order_id": "x"}, {"order_id": None}, {"signature": "z"}]:
        rr = requests.post(f"{BASE_URL}/split/verify-settle-payment", json=b, timeout=15)
        if rr.status_code == 500:
            never_500 = False
            break
    log(never_500, "verify-settle-payment never returns 500 on bad input")


# ════════════════════════════════════════════════════════════════════
# 2. Core split settlement endpoints (stay in split_settle.py)
# ════════════════════════════════════════════════════════════════════
def test_core_split(token):
    print("\n---- Core split settlement endpoints ----")
    # POST /split/settle — input validation (missing target_user_id / amount)
    # SettlePayment is a pydantic model → missing fields → 422
    r = requests.post(f"{BASE_URL}/split/settle", json={}, headers=bearer(token), timeout=15)
    log(r.status_code in (400, 422), f"/split/settle empty body → 400/422",
        f"code={r.status_code}")

    # POST /split/partial-settle — missing fields → 400
    r = requests.post(f"{BASE_URL}/split/partial-settle", json={},
                      headers=bearer(token), timeout=15)
    log(r.status_code == 400, "/split/partial-settle missing fields → 400",
        f"code={r.status_code}")

    # amount=0 → 400
    r = requests.post(f"{BASE_URL}/split/partial-settle",
                      json={"target_user_id": str(ObjectId()), "amount": 0},
                      headers=bearer(token), timeout=15)
    log(r.status_code == 400, "/split/partial-settle amount=0 → 400",
        f"code={r.status_code}")

    # GET /split/balances → 200
    r = requests.get(f"{BASE_URL}/split/balances", headers=bearer(token), timeout=15)
    log(r.status_code == 200, "/split/balances → 200", f"code={r.status_code}")

    # POST /split/remind — missing fields → 400
    r = requests.post(f"{BASE_URL}/split/remind", json={}, headers=bearer(token), timeout=15)
    log(r.status_code == 400, "/split/remind empty body → 400",
        f"code={r.status_code}")

    # amount=0 → 400
    r = requests.post(f"{BASE_URL}/split/remind",
                      json={"target_user_id": str(ObjectId()), "amount": 0},
                      headers=bearer(token), timeout=15)
    log(r.status_code == 400, "/split/remind amount=0 → 400", f"code={r.status_code}")

    # GET /split/reminders → 200
    r = requests.get(f"{BASE_URL}/split/reminders", headers=bearer(token), timeout=15)
    log(r.status_code == 200, "/split/reminders → 200", f"code={r.status_code}")
    if r.status_code == 200:
        data = r.json()
        log(isinstance(data, dict) and "received" in data and "sent" in data,
            "/split/reminders has received+sent keys",
            f"keys={list(data.keys()) if isinstance(data, dict) else 'non-dict'}")

    # GET /split/activity?limit=5 → 200
    r = requests.get(f"{BASE_URL}/split/activity", params={"limit": 5},
                     headers=bearer(token), timeout=20)
    log(r.status_code == 200, "/split/activity?limit=5 → 200", f"code={r.status_code}")


# ════════════════════════════════════════════════════════════════════
# 3. Budget endpoints (migrated routers)
# ════════════════════════════════════════════════════════════════════
def test_budgets(token):
    print("\n---- Budget endpoints ----")
    # GET /budgets → 200
    r = requests.get(f"{BASE_URL}/budgets", headers=bearer(token), timeout=15)
    log(r.status_code == 200, "GET /budgets → 200", f"code={r.status_code}")

    # GET /budgets/live → 200
    r = requests.get(f"{BASE_URL}/budgets/live", headers=bearer(token), timeout=20)
    log(r.status_code == 200, "GET /budgets/live → 200", f"code={r.status_code}")

    # GET /budgets/smart-suggest → 200
    r = requests.get(f"{BASE_URL}/budgets/smart-suggest", headers=bearer(token), timeout=30)
    log(r.status_code == 200, "GET /budgets/smart-suggest → 200",
        f"code={r.status_code}")

    # GET /budgets/achievements → 200, correct shape
    r = requests.get(f"{BASE_URL}/budgets/achievements", headers=bearer(token), timeout=30)
    ok = r.status_code == 200
    log(ok, "GET /budgets/achievements → 200", f"code={r.status_code}")
    if ok:
        d = r.json()
        has_keys = all(k in d for k in ["streak", "stats", "badges", "headline"])
        log(has_keys, "/budgets/achievements has streak/stats/badges/headline",
            f"keys={list(d.keys())}")
        log(isinstance(d.get("badges"), list) and len(d.get("badges", [])) == 6,
            "/budgets/achievements has 6 badges",
            f"count={len(d.get('badges', []))}")

    # POST /budgets — missing fields → 400/422
    r = requests.post(f"{BASE_URL}/budgets", json={}, headers=bearer(token), timeout=15)
    log(r.status_code in (400, 422), "POST /budgets empty body → 400/422",
        f"code={r.status_code}")

    # POST /budgets — missing amount (only category) → 400
    r = requests.post(f"{BASE_URL}/budgets", json={"category": "Entertainment"},
                      headers=bearer(token), timeout=15)
    log(r.status_code == 400, "POST /budgets missing amount → 400",
        f"code={r.status_code}")

    # POST /budgets — valid body → 200
    r = requests.post(f"{BASE_URL}/budgets",
                      json={"category": "Entertainment", "amount": 2500, "period": "monthly"},
                      headers=bearer(token), timeout=15)
    ok = r.status_code == 200
    log(ok, "POST /budgets valid body → 200", f"code={r.status_code} body={r.text[:200]}")
    budget_id = None
    if ok:
        budget_id = r.json().get("id")

    # PUT /budgets/{bad_id} → 404
    # Use a valid-shape ObjectId that doesn't exist
    bogus = str(ObjectId())
    r = requests.put(f"{BASE_URL}/budgets/{bogus}",
                     json={"amount": 3000}, headers=bearer(token), timeout=15)
    log(r.status_code == 404, "PUT /budgets/{bad_id} → 404", f"code={r.status_code}")

    # DELETE /budgets/{bad_id} → 404
    r = requests.delete(f"{BASE_URL}/budgets/{bogus}", headers=bearer(token), timeout=15)
    log(r.status_code == 404, "DELETE /budgets/{bad_id} → 404", f"code={r.status_code}")

    # DELETE /budgets/{real_id} → 200 (cleanup)
    if budget_id:
        r = requests.delete(f"{BASE_URL}/budgets/{budget_id}",
                            headers=bearer(token), timeout=15)
        log(r.status_code == 200, "DELETE /budgets/{real_id} → 200",
            f"code={r.status_code}")


# ════════════════════════════════════════════════════════════════════
# 4. Transactions endpoints
# ════════════════════════════════════════════════════════════════════
def test_transactions(token):
    print("\n---- Transactions endpoints ----")
    # GET /transactions → 200
    r = requests.get(f"{BASE_URL}/transactions", headers=bearer(token), timeout=15)
    log(r.status_code == 200, "GET /transactions → 200", f"code={r.status_code}")

    # POST /transactions — missing fields → 422 (pydantic)
    r = requests.post(f"{BASE_URL}/transactions", json={},
                      headers=bearer(token), timeout=15)
    log(r.status_code in (400, 422), "POST /transactions empty body → 400/422",
        f"code={r.status_code}")

    # POST /transactions — valid → 200
    r = requests.post(f"{BASE_URL}/transactions",
                      json={"amount": 150.5, "category": "Food",
                            "description": "Regression test chai", "type": "debit"},
                      headers=bearer(token), timeout=15)
    ok = r.status_code == 200
    log(ok, "POST /transactions valid → 200",
        f"code={r.status_code} body={r.text[:200]}")
    txn_id = None
    if ok:
        txn_id = r.json().get("id")

    # PUT /transactions/{bad_id} → 404
    bogus = str(ObjectId())
    r = requests.put(f"{BASE_URL}/transactions/{bogus}",
                     json={"description": "updated"}, headers=bearer(token), timeout=15)
    log(r.status_code == 404, "PUT /transactions/{bad_id} → 404",
        f"code={r.status_code}")

    # DELETE /transactions/{bad_id} → 404
    r = requests.delete(f"{BASE_URL}/transactions/{bogus}",
                        headers=bearer(token), timeout=15)
    log(r.status_code == 404, "DELETE /transactions/{bad_id} → 404",
        f"code={r.status_code}")

    # DELETE /transactions/{real_id} → 200 (cleanup)
    if txn_id:
        r = requests.delete(f"{BASE_URL}/transactions/{txn_id}",
                            headers=bearer(token), timeout=15)
        log(r.status_code == 200, "DELETE /transactions/{real_id} → 200",
            f"code={r.status_code}")


if __name__ == "__main__":
    try:
        tok = auth_token()
        print(f"Auth OK (token len={len(tok)})")
    except Exception as e:
        print(f"Auth failed: {e}")
        sys.exit(1)

    order_id = test_razorpay_order(tok)
    test_pay_checkout(order_id)
    test_verify_settle_payment()
    test_core_split(tok)
    test_budgets(tok)
    test_transactions(tok)

    print("\n========== SUMMARY ==========")
    passed = sum(1 for r in results if r["ok"])
    total = len(results)
    print(f"{passed}/{total} assertions passed")
    failed = [r for r in results if not r["ok"]]
    if failed:
        print("\nFailed assertions:")
        for r in failed:
            print(f"  - {r['name']}  {r['detail']}")
        sys.exit(1)
    sys.exit(0)
