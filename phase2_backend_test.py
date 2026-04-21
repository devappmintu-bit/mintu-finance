"""Phase 2 backend review tests — notification prefs, payment methods, rewards, news, delete-account validation."""
import requests
import json
import sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"

results = []

def record(name, ok, detail=""):
    status = "✅" if ok else "❌"
    results.append((ok, name, detail))
    print(f"{status} {name} — {detail}")


def get_token():
    # Send OTP first (best-effort)
    try:
        requests.post(f"{BASE}/auth/send-otp", json={"phone": "9876543210"}, timeout=15)
    except Exception:
        pass
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": "9876543210", "otp": "123456"}, timeout=15)
    assert r.status_code == 200, f"verify-otp: {r.status_code} {r.text}"
    j = r.json()
    tok = j.get("token") or j.get("access_token")
    assert tok, f"no token in: {j}"
    return tok


def main():
    tok = get_token()
    H = {"Authorization": f"Bearer {tok}"}
    print(f"\n=== Auth OK (token len={len(tok)}) ===\n")

    # ─────────── 1. NOTIFICATION PREFERENCES ───────────
    print("\n--- 1. Notification Preferences ---")
    r = requests.get(f"{BASE}/user/notification-prefs", headers=H, timeout=15)
    ok = r.status_code == 200
    record("GET /user/notification-prefs → 200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        expected_keys = {"master_enabled", "channels", "categories", "quiet_hours", "frequency"}
        missing = expected_keys - set(j.keys())
        record("  has master_enabled/channels/categories/quiet_hours/frequency", not missing, f"missing={missing or 'none'}")
        channels = j.get("channels", {})
        expected_ch = {"push", "in_app", "email", "sms"}
        record("  channels has push/in_app/email/sms", expected_ch.issubset(set(channels.keys())), f"channels={list(channels.keys())}")
        cats = j.get("categories", {})
        expected_cats = {"budget_alerts", "bill_reminders", "split_updates", "transaction_alerts", "security", "rewards", "tips_news", "marketing"}
        record("  categories has 8 required keys", expected_cats.issubset(set(cats.keys())), f"cats={sorted(cats.keys())}")

    # PUT with frequency=daily, categories.marketing=true
    r = requests.put(f"{BASE}/user/notification-prefs", headers=H,
                     json={"frequency": "daily", "categories": {"marketing": True}}, timeout=15)
    record("PUT /user/notification-prefs frequency=daily, marketing=true → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

    # GET to confirm persistence
    r = requests.get(f"{BASE}/user/notification-prefs", headers=H, timeout=15)
    if r.status_code == 200:
        j = r.json()
        record("  persisted frequency=daily", j.get("frequency") == "daily", f"got={j.get('frequency')}")
        record("  persisted categories.marketing=true", j.get("categories", {}).get("marketing") is True, f"got={j.get('categories',{}).get('marketing')}")
    else:
        record("  re-GET persistence check", False, f"status={r.status_code}")

    # ─────────── 2. PAYMENT METHODS ───────────
    print("\n--- 2. Payment Methods ---")
    r = requests.get(f"{BASE}/user/payment-methods", headers=H, timeout=15)
    ok = r.status_code == 200
    record("GET /user/payment-methods → 200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        keys = set(j.keys())
        record("  returns methods/count/default", {"methods", "count", "default"}.issubset(keys), f"keys={keys}")

    # POST upi
    r = requests.post(f"{BASE}/user/payment-methods", headers=H,
                      json={"type": "upi", "upi_id": "testuser@okicici", "is_default": True}, timeout=15)
    ok = r.status_code == 200
    record("POST /user/payment-methods {type:upi, upi_id:testuser@okicici, is_default:true} → 200", ok, f"status={r.status_code} body={r.text[:200]}")
    upi_id = None
    if ok:
        j = r.json()
        record("  returns ok:true", j.get("ok") is True)
        m = j.get("method", {})
        upi_id = m.get("id")
        record("  method has id", bool(upi_id), f"id={upi_id}")
        record("  method.is_default=true", m.get("is_default") is True, f"is_default={m.get('is_default')}")

    # POST card
    r = requests.post(f"{BASE}/user/payment-methods", headers=H,
                      json={"type": "card", "card_last4": "1234", "card_brand": "visa"}, timeout=15)
    ok = r.status_code == 200
    record("POST /user/payment-methods {type:card, last4:1234, visa} → 200", ok, f"status={r.status_code} body={r.text[:200]}")
    card_id = None
    if ok:
        card_id = r.json().get("method", {}).get("id")
        record("  card method has id", bool(card_id), f"id={card_id}")

    # PUT /payment-methods/{card_id}/default
    if card_id:
        r = requests.put(f"{BASE}/user/payment-methods/{card_id}/default", headers=H, timeout=15)
        ok = r.status_code == 200
        record("PUT /user/payment-methods/{card_id}/default → 200", ok, f"status={r.status_code} body={r.text[:200]}")

        # GET confirms card is now default
        r = requests.get(f"{BASE}/user/payment-methods", headers=H, timeout=15)
        if r.status_code == 200:
            j = r.json()
            default = j.get("default") or {}
            record("  GET shows card as default", default.get("id") == card_id, f"default.id={default.get('id')} expected={card_id}")

        # DELETE
        r = requests.delete(f"{BASE}/user/payment-methods/{card_id}", headers=H, timeout=15)
        record("DELETE /user/payment-methods/{card_id} → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

    # Invalid POST upi without upi_id → 400
    r = requests.post(f"{BASE}/user/payment-methods", headers=H, json={"type": "upi"}, timeout=15)
    record("POST upi without upi_id → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")

    # Invalid POST card with non-digit last4 → 400
    r = requests.post(f"{BASE}/user/payment-methods", headers=H,
                      json={"type": "card", "card_last4": "ABCD"}, timeout=15)
    record("POST card with last4='ABCD' → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")

    # Clean up upi method we added (best-effort)
    if upi_id:
        requests.delete(f"{BASE}/user/payment-methods/{upi_id}", headers=H, timeout=15)

    # ─────────── 3. REWARDS ───────────
    print("\n--- 3. Rewards ---")
    r = requests.get(f"{BASE}/rewards/summary", headers=H, timeout=15)
    ok = r.status_code == 200
    record("GET /rewards/summary → 200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        expected = {"coins", "spins_today", "spins_left", "spin_cost", "prizes", "recent_rewards"}
        missing = expected - set(j.keys())
        record("  has coins/spins_today/spins_left/spin_cost/prizes/recent_rewards", not missing, f"missing={missing or 'none'} | coins={j.get('coins')}")
        prizes = j.get("prizes", [])
        record("  prizes has 8 entries", len(prizes) == 8, f"len={len(prizes)}")

    r = requests.get(f"{BASE}/rewards/vouchers?category=food", headers=H, timeout=60)
    ok = r.status_code == 200
    record("GET /rewards/vouchers?category=food → 200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        record("  returns category=food", j.get("category") == "food", f"category={j.get('category')}")
        vouchers = j.get("vouchers", [])
        record("  vouchers has at least 4 items", len(vouchers) >= 4, f"len={len(vouchers)}")

    r = requests.get(f"{BASE}/rewards/wallet", headers=H, timeout=15)
    ok = r.status_code == 200
    record("GET /rewards/wallet → 200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        record("  wallet returns items key", "items" in j, f"keys={list(j.keys())}")

    # Spin — accept 200 success OR 400 "Need 10 coins" OR 429 daily cap
    r = requests.post(f"{BASE}/rewards/spin", headers=H, timeout=15)
    acceptable = r.status_code in (200, 400, 429)
    record("POST /rewards/spin → 200 or 400 (need coins) or 429", acceptable, f"status={r.status_code} body={r.text[:150]}")

    # ─────────── 4. NEWS 12 ITEMS ───────────
    print("\n--- 4. News India Finance ---")
    r = requests.get(f"{BASE}/news/india-finance", headers=H, timeout=30)
    ok = r.status_code == 200
    record("GET /news/india-finance → 200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        articles = j.get("articles", [])
        # Spec says 12 items OR 6 if old cache is acceptable
        length_ok = len(articles) in (12, 6)
        record("  articles length 12 (or 6 if old cache)", length_ok, f"len={len(articles)} | is_fallback={j.get('is_fallback')}")

    r = requests.get(f"{BASE}/news/india-finance?refresh=1", headers=H, timeout=120)
    ok = r.status_code == 200
    record("GET /news/india-finance?refresh=1 → 200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        record("  refresh response has articles array", isinstance(j.get("articles"), list) and len(j.get("articles", [])) > 0, f"len={len(j.get('articles', []))}")

    # ─────────── 5. DELETE ACCOUNT VALIDATION (NOT executing success) ───────────
    print("\n--- 5. Delete Account Validation ---")
    r = requests.post(f"{BASE}/user/delete-account", headers=H,
                      json={"mode": "hard", "confirmation": "WRONG"}, timeout=15)
    ok = r.status_code == 400
    detail_match = "DELETE" in (r.text or "")
    record("POST /user/delete-account {hard, WRONG} → 400 'Type DELETE'", ok and detail_match,
           f"status={r.status_code} body={r.text[:200]}")

    r = requests.post(f"{BASE}/user/delete-account", headers=H, json={"mode": "invalid"}, timeout=15)
    record("POST /user/delete-account {mode:invalid} → 400", r.status_code == 400,
           f"status={r.status_code} body={r.text[:200]}")

    # ─────────── SUMMARY ───────────
    print("\n" + "=" * 70)
    passed = sum(1 for ok, _, _ in results if ok)
    total = len(results)
    print(f"RESULTS: {passed}/{total} passed")
    failed = [r for r in results if not r[0]]
    if failed:
        print("\nFAILED:")
        for _, name, detail in failed:
            print(f"  ❌ {name} — {detail}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
