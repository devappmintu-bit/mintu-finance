"""MintU 2.0 Phase 3 — Smoke Tests for /api/split/activity + /api/split/invite-to-settle"""
import os
import sys
import json
import requests

BASE = os.environ.get("BACKEND_URL", "https://mintu-finance.preview.emergentagent.com").rstrip("/") + "/api"

def log(tag, ok, msg):
    mark = "✅" if ok else "❌"
    print(f"{mark} [{tag}] {msg}")

def auth():
    r = requests.post(f"{BASE}/auth/login", json={"phone": "9876543210", "password": "test123"}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"No token in response: {r.json()}"
    return tok

def main():
    results = {"pass": 0, "fail": 0, "items": []}
    def rec(name, ok, detail=""):
        results["items"].append((name, ok, detail))
        if ok: results["pass"] += 1
        else: results["fail"] += 1
        log(name, ok, detail)

    try:
        tok = auth()
        log("AUTH", True, f"token len={len(tok)}")
    except Exception as e:
        log("AUTH", False, str(e))
        return 1
    H = {"Authorization": f"Bearer {tok}"}

    # ===== T1: GET /api/split/activity =====
    try:
        r = requests.get(f"{BASE}/split/activity", headers=H, timeout=30)
        if r.status_code != 200:
            rec("T1 status 200", False, f"got {r.status_code}: {r.text[:300]}")
        else:
            rec("T1 status 200", True, "OK")
            d = r.json()
            # Required top-level keys
            for k in ("feed", "headline", "settled_this_month", "top_friend"):
                rec(f"T1 key '{k}' present", k in d, f"keys={list(d.keys())}")
            # feed shape
            feed = d.get("feed", [])
            rec("T1 feed is list", isinstance(feed, list), f"type={type(feed).__name__}")
            allowed_types = {"settled_out", "settled_in", "expense_added"}
            allowed_dirs = {"in", "out", "neutral"}
            if isinstance(feed, list) and feed:
                item = feed[0]
                req_fields = {"type", "emoji", "title", "subtitle", "amount", "direction", "timestamp", "group_id"}
                missing = req_fields - set(item.keys())
                rec("T1 feed item has all required fields", not missing, f"missing={missing}; item_keys={list(item.keys())}")
                # Check all items
                bad_type = [i for i, it in enumerate(feed) if it.get("type") not in allowed_types]
                rec("T1 all items.type in enum", not bad_type, f"bad indexes={bad_type[:3]}")
                bad_dir = [i for i, it in enumerate(feed) if it.get("direction") not in allowed_dirs]
                rec("T1 all items.direction in enum", not bad_dir, f"bad indexes={bad_dir[:3]}")
            else:
                rec("T1 feed has items (may be empty)", True, f"feed len={len(feed)} — acceptable per spec")
            # headline
            headline = d.get("headline", "")
            rec("T1 headline non-empty str", isinstance(headline, str) and len(headline) > 0, f"headline={headline!r}")
            # check emotional — keywords or emoji
            kw = ("settled", "activity", "momentum", "splitting", "Keep", "bill")
            has_kw = any(k.lower() in headline.lower() for k in kw)
            # accept emoji presence too
            has_emoji = any(ord(c) > 10000 for c in headline) if headline else False
            rec("T1 headline emotional (keyword or emoji)", has_kw or has_emoji, f"kw={has_kw} emoji={has_emoji} headline={headline!r}")
            # settled_this_month
            stm = d.get("settled_this_month", {})
            rec("T1 settled_this_month.count int>=0", isinstance(stm.get("count"), int) and stm.get("count", -1) >= 0, f"stm={stm}")
            rec("T1 settled_this_month.amount number>=0", isinstance(stm.get("amount"), (int, float)) and stm.get("amount", -1) >= 0, f"stm={stm}")
            print(f"[DEBUG T1] feed_len={len(feed)}, headline={headline!r}, settled_this_month={stm}, top_friend={d.get('top_friend')}")
    except Exception as e:
        rec("T1 exception", False, str(e))

    # ===== T2: GET /api/split/activity?limit=5 =====
    try:
        r = requests.get(f"{BASE}/split/activity?limit=5", headers=H, timeout=30)
        rec("T2 status 200", r.status_code == 200, f"got {r.status_code}")
        if r.status_code == 200:
            feed = r.json().get("feed", [])
            rec("T2 feed length <= 5", len(feed) <= 5, f"len={len(feed)}")
    except Exception as e:
        rec("T2 exception", False, str(e))

    # ===== T3: POST invite-to-settle happy =====
    try:
        body = {"target_name": "Riya", "amount": 500, "group_name": "Goa Trip", "note": "Dinner"}
        r = requests.post(f"{BASE}/split/invite-to-settle", headers=H, json=body, timeout=20)
        if r.status_code != 200:
            rec("T3 status 200", False, f"got {r.status_code}: {r.text[:300]}")
        else:
            rec("T3 status 200", True, "OK")
            d = r.json()
            for k in ("upi_link", "whatsapp_url", "whatsapp_text", "share_text", "payee_upi", "has_upi"):
                rec(f"T3 key '{k}' present", k in d, f"keys={list(d.keys())}")
            rec("T3 upi_link starts with 'upi://pay?pa='", (d.get("upi_link") or "").startswith("upi://pay?pa="), f"upi_link={d.get('upi_link','')[:80]}")
            rec("T3 whatsapp_url starts with 'https://wa.me/'", (d.get("whatsapp_url") or "").startswith("https://wa.me/"), f"wa_url={d.get('whatsapp_url','')[:80]}")
            wtxt = d.get("whatsapp_text", "")
            rec("T3 whatsapp_text non-empty", isinstance(wtxt, str) and len(wtxt) > 0, f"len={len(wtxt)}")
            rec("T3 whatsapp_text contains '500'", "500" in wtxt, f"snippet={wtxt[:120]!r}")
            rec("T3 whatsapp_text contains 'Riya'", "Riya" in wtxt, f"snippet={wtxt[:120]!r}")
            rec("T3 has_upi is bool", isinstance(d.get("has_upi"), bool), f"has_upi type={type(d.get('has_upi')).__name__}")
    except Exception as e:
        rec("T3 exception", False, str(e))

    # ===== T4: POST invite-to-settle with phone =====
    try:
        body = {"target_name": "Riya", "target_phone": "9999999999", "amount": 100}
        r = requests.post(f"{BASE}/split/invite-to-settle", headers=H, json=body, timeout=20)
        rec("T4 status 200", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
        if r.status_code == 200:
            wa_url = r.json().get("whatsapp_url", "")
            rec("T4 whatsapp_url contains 'wa.me/9999999999'", "wa.me/9999999999" in wa_url, f"wa_url={wa_url[:100]}")
    except Exception as e:
        rec("T4 exception", False, str(e))

    # ===== T5: Validation =====
    try:
        r = requests.post(f"{BASE}/split/invite-to-settle", headers=H, json={"target_name": "X", "amount": 0}, timeout=20)
        rec("T5a amount=0 -> 400", r.status_code == 400, f"got {r.status_code}: {r.text[:150]}")
    except Exception as e:
        rec("T5a exception", False, str(e))
    try:
        r = requests.post(f"{BASE}/split/invite-to-settle", headers=H, json={"target_name": "X", "amount": -50}, timeout=20)
        rec("T5b amount=-50 -> 400", r.status_code == 400, f"got {r.status_code}: {r.text[:150]}")
    except Exception as e:
        rec("T5b exception", False, str(e))

    # ===== T6: Regression =====
    try:
        r = requests.get(f"{BASE}/home/snapshot", headers=H, timeout=30)
        rec("T6 /home/snapshot 200", r.status_code == 200, f"got {r.status_code}")
    except Exception as e:
        rec("T6 /home/snapshot exception", False, str(e))
    try:
        r = requests.get(f"{BASE}/ai/predict", headers=H, timeout=30)
        rec("T6 /ai/predict 200", r.status_code == 200, f"got {r.status_code}")
    except Exception as e:
        rec("T6 /ai/predict exception", False, str(e))
    try:
        r = requests.post(f"{BASE}/coins/award", headers=H, json={"action": "scan_sms"}, timeout=20)
        rec("T6 POST /coins/award scan_sms 200", r.status_code == 200, f"got {r.status_code}: {r.text[:150]}")
        if r.status_code == 200:
            awarded = r.json().get("awarded", -1)
            rec("T6 coins/award awarded >= 0", isinstance(awarded, (int, float)) and awarded >= 0, f"awarded={awarded}, reason={r.json().get('reason')}")
    except Exception as e:
        rec("T6 coins/award exception", False, str(e))
    try:
        r = requests.get(f"{BASE}/coins/status", headers=H, timeout=20)
        rec("T6 /coins/status 200", r.status_code == 200, f"got {r.status_code}")
    except Exception as e:
        rec("T6 /coins/status exception", False, str(e))

    # ===== Summary =====
    print()
    print("=" * 60)
    print(f"PASS: {results['pass']}  FAIL: {results['fail']}  TOTAL: {results['pass']+results['fail']}")
    print("=" * 60)
    if results["fail"]:
        print("FAILED:")
        for name, ok, detail in results["items"]:
            if not ok:
                print(f"  ❌ {name}: {detail}")
    return 0 if results["fail"] == 0 else 2

if __name__ == "__main__":
    sys.exit(main())
