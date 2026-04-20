"""Round 23 Backend tests — Budget Achievements + Split Razorpay Settlement."""
import json
import os
import sys
import time
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


def bearer(tok):
    return {"Authorization": f"Bearer {tok}"}


# ══════════════════════════════════════════════════════════════════════════
# TEST 1 — Budget Achievements
# ══════════════════════════════════════════════════════════════════════════
def test_achievements_shape(token):
    # First, wipe all existing budgets to simulate a brand-new-ish state
    rr = requests.get(f"{BASE_URL}/budgets", headers=bearer(token), timeout=15)
    assert rr.status_code == 200, f"GET /budgets: {rr.status_code} {rr.text[:200]}"
    for b in rr.json() or []:
        bid = b.get("id") or b.get("_id")
        if bid:
            requests.delete(f"{BASE_URL}/budgets/{bid}", headers=bearer(token), timeout=15)

    r = requests.get(f"{BASE_URL}/budgets/achievements", headers=bearer(token), timeout=30)
    ok = r.status_code == 200
    log(ok, "T1.0 GET /budgets/achievements (no budgets) -> 200", f"code={r.status_code}")
    if not ok:
        print("   body:", r.text[:300])
        return False
    data = r.json()

    # Validate streak
    streak = data.get("streak") or {}
    ok_streak = (
        isinstance(streak.get("current_days"), int)
        and isinstance(streak.get("longest_days"), int)
        and isinstance(streak.get("target"), int)
        and isinstance(streak.get("pct"), int)
        and 0 <= streak.get("pct", -1) <= 100
    )
    log(ok_streak, "T1.1 streak keys + types (pct 0-100)", f"streak={streak}")

    # Validate stats
    stats = data.get("stats") or {}
    required_stat_keys = [
        "days_under_budget_mtd", "days_in_month_so_far", "under_rate_pct",
        "categories_under", "categories_over", "total_categories",
        "saved_amount", "saved_pct",
    ]
    missing = [k for k in required_stat_keys if k not in stats]
    log(not missing, "T1.2 stats has all 8 required keys", f"missing={missing}")
    log(stats.get("total_categories") == 0,
        "T1.3 total_categories==0 for user with no budgets",
        f"total_categories={stats.get('total_categories')}")

    # Headline for no-budget user
    headline = data.get("headline") or ""
    headline_ok = "first budget" in headline.lower() or "set your first" in headline.lower()
    log(headline_ok, "T1.4 headline mentions 'Set your first budget'", f"headline={headline!r}")

    # Validate badges
    badges = data.get("badges") or []
    log(len(badges) == 6, "T1.5 badges has exactly 6 items", f"len={len(badges)}")
    expected_ids = ["budget_master", "streak_legend", "category_captain",
                    "savings_sprinter", "comeback_king", "perfect_month"]
    actual_ids = [b.get("id") for b in badges]
    log(actual_ids == expected_ids,
        "T1.6 badge ids match expected order",
        f"got={actual_ids}")

    # Each badge field validation
    all_fields_ok = True
    for b in badges:
        for fld in ["id", "name", "emoji", "tagline", "unlocked", "progress_pct", "progress_label"]:
            if fld not in b:
                all_fields_ok = False
                print(f"   badge {b.get('id')} missing {fld}")
        if not isinstance(b.get("unlocked"), bool):
            all_fields_ok = False
        pp = b.get("progress_pct")
        if not (isinstance(pp, int) and 0 <= pp <= 100):
            all_fields_ok = False
            print(f"   badge {b.get('id')} progress_pct out of range: {pp}")
    log(all_fields_ok, "T1.7 each badge has all 7 fields with correct types & progress_pct 0-100")

    # next_badge: first locked badge or None
    next_badge = data.get("next_badge")
    first_locked = next((b for b in badges if not b.get("unlocked")), None)
    nb_ok = (next_badge is None and first_locked is None) or (
        first_locked and next_badge and next_badge.get("id") == first_locked.get("id")
    )
    log(nb_ok, "T1.8 next_badge is first locked badge (or None)",
        f"nb_id={None if not next_badge else next_badge.get('id')}")

    return True


def test_achievements_with_budget(token):
    # Create a Food budget of 5000 monthly
    r = requests.post(
        f"{BASE_URL}/budgets",
        json={"category": "Food", "amount": 5000, "period": "monthly"},
        headers=bearer(token),
        timeout=15,
    )
    ok = r.status_code == 200
    log(ok, "T1.9 POST /budgets Food 5000 monthly -> 200", f"code={r.status_code}")
    if not ok:
        print("   body:", r.text[:200])

    r2 = requests.get(f"{BASE_URL}/budgets/achievements", headers=bearer(token), timeout=30)
    ok2 = r2.status_code == 200
    log(ok2, "T1.10 GET /budgets/achievements (1 budget) -> 200", f"code={r2.status_code}")
    if not ok2:
        print("   body:", r2.text[:300])
        return

    data = r2.json()
    stats = data.get("stats") or {}
    log(stats.get("total_categories") == 1,
        "T1.11 total_categories==1 after creating Food budget",
        f"total_categories={stats.get('total_categories')}")

    # streak.pct still 0-100
    pct = (data.get("streak") or {}).get("pct")
    log(isinstance(pct, int) and 0 <= pct <= 100,
        "T1.12 streak.pct still in [0,100]", f"pct={pct}")

    # progress_pct all in range
    badges = data.get("badges") or []
    bad = [b for b in badges if not (isinstance(b.get("progress_pct"), int) and 0 <= b["progress_pct"] <= 100)]
    log(not bad, "T1.13 all badge progress_pct in [0,100]",
        f"offenders={[(b.get('id'), b.get('progress_pct')) for b in bad]}")

    # Cleanup — delete Food budget
    br = requests.get(f"{BASE_URL}/budgets", headers=bearer(token), timeout=15)
    for b in br.json() or []:
        if b.get("category") == "Food":
            bid = b.get("id") or b.get("_id")
            requests.delete(f"{BASE_URL}/budgets/{bid}", headers=bearer(token), timeout=15)


# ══════════════════════════════════════════════════════════════════════════
# TEST 2 — Split Razorpay Settlement
# ══════════════════════════════════════════════════════════════════════════
def test_split_razorpay_order_errors(token):
    # Missing target_user_id
    r = requests.post(
        f"{BASE_URL}/split/razorpay-order",
        json={"amount": 500},
        headers=bearer(token),
        timeout=15,
    )
    log(r.status_code == 400, "T2a.1 POST /split/razorpay-order missing target_user_id -> 400",
        f"code={r.status_code}")

    # Non-positive amount
    r = requests.post(
        f"{BASE_URL}/split/razorpay-order",
        json={"target_user_id": str(ObjectId()), "amount": 0},
        headers=bearer(token),
        timeout=15,
    )
    log(r.status_code == 400, "T2a.2 POST /split/razorpay-order amount=0 -> 400",
        f"code={r.status_code}")

    r = requests.post(
        f"{BASE_URL}/split/razorpay-order",
        json={"target_user_id": str(ObjectId()), "amount": -100},
        headers=bearer(token),
        timeout=15,
    )
    log(r.status_code == 400, "T2a.3 POST /split/razorpay-order amount=-100 -> 400",
        f"code={r.status_code}")


def test_split_razorpay_order_success(token):
    # Use a dummy valid ObjectId as target (need not be our own)
    target_uid = str(ObjectId())

    # Try first with an actual group member if available
    try:
        gr = requests.get(f"{BASE_URL}/split/groups", headers=bearer(token), timeout=15)
        if gr.status_code == 200:
            for g in gr.json() or []:
                gid = g.get("id") or g.get("_id")
                if not gid:
                    continue
                mgr = requests.get(
                    f"{BASE_URL}/split/groups/{gid}/manage",
                    headers=bearer(token),
                    timeout=15,
                )
                if mgr.status_code == 200:
                    mdata = mgr.json()
                    for m in mdata.get("members") or []:
                        muid = m.get("user_id")
                        if muid and ObjectId.is_valid(muid):
                            target_uid = muid
                            break
                if target_uid and target_uid != str(ObjectId()):
                    break
    except Exception as e:
        print(f"   (info) could not look up group member: {e}")

    body = {"target_user_id": target_uid, "amount": 500, "coins_to_use": 0}
    r = requests.post(
        f"{BASE_URL}/split/razorpay-order",
        json=body,
        headers=bearer(token),
        timeout=30,
    )
    ok = r.status_code == 200
    log(ok, "T2a.4 POST /split/razorpay-order valid body -> 200",
        f"code={r.status_code} body={r.text[:200]}")
    if not ok:
        return None

    data = r.json()
    required = ["order_id", "amount_paise", "effective_amount", "list_amount",
                "coin_discount", "coins_to_use", "key_id", "currency", "checkout_url"]
    missing = [k for k in required if k not in data]
    log(not missing, "T2a.5 response has all required keys", f"missing={missing}")

    log(data.get("currency") == "INR", "T2a.6 currency == 'INR'",
        f"currency={data.get('currency')}")
    log(isinstance(data.get("amount_paise"), int),
        "T2a.7 amount_paise is int",
        f"amount_paise={data.get('amount_paise')!r}")

    eff = data.get("effective_amount")
    ap = data.get("amount_paise")
    log(ap == int(round(eff * 100)),
        "T2a.8 amount_paise == effective_amount*100",
        f"eff={eff} ap={ap}")

    log(data.get("coins_to_use") == 0 and data.get("coin_discount") == 0,
        "T2a.9 no coins requested -> coins_to_use=0, coin_discount=0",
        f"coins_to_use={data.get('coins_to_use')} discount={data.get('coin_discount')}")

    oid = data.get("order_id", "")
    log(oid.startswith("order_"), "T2a.10 order_id starts with 'order_'", f"order_id={oid}")

    return oid


def test_split_pay_checkout(order_id):
    r = requests.get(
        f"{BASE_URL}/split/pay-checkout",
        params={"order_id": order_id},
        timeout=15,
    )
    ok = r.status_code == 200
    log(ok, "T2b.1 GET /split/pay-checkout?order_id=VALID -> 200",
        f"code={r.status_code}")
    if ok:
        ctype = r.headers.get("Content-Type", "")
        log("text/html" in ctype,
            "T2b.2 Content-Type is text/html",
            f"content-type={ctype}")
        body = r.text
        log("Razorpay" in body,
            "T2b.3 HTML body contains 'Razorpay'",
            f"has_razorpay={'Razorpay' in body}")
        has_payee_section = "Settle with" in body
        log(has_payee_section,
            "T2b.4 HTML body contains payee greeting 'Settle with'",
            f"present={has_payee_section}")

    r2 = requests.get(
        f"{BASE_URL}/split/pay-checkout",
        params={"order_id": "nonexistent_order_xyz_123"},
        timeout=15,
    )
    log(r2.status_code == 404,
        "T2b.5 GET /split/pay-checkout?order_id=nonexistent -> 404",
        f"code={r2.status_code}")


def test_split_verify_settle_payment():
    # 2c.1 empty body -> 400
    r = requests.post(
        f"{BASE_URL}/split/verify-settle-payment",
        json={},
        timeout=15,
    )
    log(r.status_code == 400,
        "T2c.1 POST /split/verify-settle-payment empty body -> 400",
        f"code={r.status_code}")

    # 2c.2 bad signature -> 400
    r2 = requests.post(
        f"{BASE_URL}/split/verify-settle-payment",
        json={"order_id": "order_fake", "payment_id": "pay_fake", "signature": "badsig"},
        timeout=15,
    )
    log(r2.status_code == 400,
        "T2c.2 POST /split/verify-settle-payment bad signature -> 400",
        f"code={r2.status_code}")

    # 2c.3 never 500 on bad input
    never_500_codes = []
    bodies = [
        {},
        {"order_id": "x"},
        {"order_id": "x", "payment_id": "y"},
        {"order_id": "x", "payment_id": "y", "signature": "z"},
        {"order_id": None, "payment_id": None, "signature": None},
    ]
    for b in bodies:
        rr = requests.post(f"{BASE_URL}/split/verify-settle-payment", json=b, timeout=15)
        never_500_codes.append(rr.status_code)
    log(all(c != 500 for c in never_500_codes),
        "T2c.3 verify-settle-payment never 500 on bad input",
        f"codes={never_500_codes}")


if __name__ == "__main__":
    try:
        tok = auth_token()
        print(f"Auth OK (token len={len(tok)})")
    except Exception as e:
        print(f"Auth failed: {e}")
        sys.exit(1)

    print("\n========== TEST 1 - Budget Achievements ==========")
    test_achievements_shape(tok)
    test_achievements_with_budget(tok)

    print("\n========== TEST 2a - Split Razorpay Order ==========")
    test_split_razorpay_order_errors(tok)
    order_id = test_split_razorpay_order_success(tok)

    if order_id:
        print("\n========== TEST 2b - Split Pay Checkout ==========")
        test_split_pay_checkout(order_id)

    print("\n========== TEST 2c - Split Verify Settle Payment ==========")
    test_split_verify_settle_payment()

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
