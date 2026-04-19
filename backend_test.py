"""Round 9 backend validation — in-app mocked payment activation + news source_url + pricing shape + regression."""
import os
import sys
import re
import json
import time
import uuid
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

PASS = []
FAIL = []


def log_pass(label, extra=""):
    PASS.append(label)
    print(f"✅ {label}  {extra}")


def log_fail(label, reason):
    FAIL.append((label, reason))
    print(f"❌ {label}  — {reason}")


def auth_token() -> str:
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    return r.json()["token"]


def assert_status(endpoint_label, headers, expected_tier):
    r = requests.get(f"{BASE_URL}/premium/status", headers=headers, timeout=15)
    if r.status_code != 200:
        log_fail(f"premium/status after {endpoint_label}", f"{r.status_code} {r.text[:200]}")
        return
    body = r.json()
    if body.get("is_premium") is True and body.get("tier") == expected_tier:
        log_pass(f"premium/status reflects {endpoint_label}", f"tier={body.get('tier')} is_premium={body.get('is_premium')}")
    else:
        log_fail(f"premium/status after {endpoint_label}", f"got is_premium={body.get('is_premium')}, tier={body.get('tier')} (expected tier={expected_tier})")


def test_mock_activate(headers):
    print("\n════════════════════ [1] POST /premium/mock-activate ════════════════════")

    # a) yearly
    r = requests.post(f"{BASE_URL}/premium/mock-activate", json={"plan": "yearly"}, headers=headers, timeout=15)
    if r.status_code == 200:
        body = r.json()
        now = datetime.utcnow()
        try:
            pu = datetime.fromisoformat(body["premium_until"].replace("Z", ""))
        except Exception:
            pu = None
        ok = (
            body.get("success") is True
            and body.get("is_premium") is True
            and body.get("tier") == "premium"
            and body.get("plan") == "yearly"
            and body.get("money_school_access") is True
            and pu is not None
            and 360 <= (pu - now).days <= 370
        )
        if ok:
            log_pass("1a yearly plan activation", f"tier=premium, plan=yearly, ms_access=true, premium_until={body['premium_until']}")
        else:
            log_fail("1a yearly plan activation", f"body={json.dumps(body)[:400]} days_delta={(pu - now).days if pu else 'N/A'}")
        assert_status("yearly", headers, "premium")
    else:
        log_fail("1a yearly plan activation", f"{r.status_code} {r.text[:300]}")

    # b) monthly
    r = requests.post(f"{BASE_URL}/premium/mock-activate", json={"plan": "monthly"}, headers=headers, timeout=15)
    if r.status_code == 200:
        body = r.json()
        if body.get("success") and body.get("is_premium") and body.get("tier") == "premium" and body.get("plan") == "monthly" and body.get("money_school_access") is False:
            log_pass("1b monthly plan activation", f"money_school_access=false (correct — monthly excludes it)")
        else:
            log_fail("1b monthly plan activation", f"body={json.dumps(body)[:400]}")
        assert_status("monthly", headers, "premium")
    else:
        log_fail("1b monthly plan activation", f"{r.status_code} {r.text[:300]}")

    # c) lifetime
    r = requests.post(f"{BASE_URL}/premium/mock-activate", json={"plan": "lifetime"}, headers=headers, timeout=15)
    if r.status_code == 200:
        body = r.json()
        now = datetime.utcnow()
        try:
            pu = datetime.fromisoformat(body["premium_until"].replace("Z", ""))
        except Exception:
            pu = None
        ok = (
            body.get("success") is True
            and body.get("tier") == "legend"
            and body.get("plan") == "lifetime"
            and body.get("money_school_access") is True
            and pu is not None
            and (pu - now).days > 365 * 10  # far future
        )
        if ok:
            log_pass("1c lifetime plan activation", f"tier=legend, ms_access=true, premium_until~{(pu - now).days} days out")
        else:
            log_fail("1c lifetime plan activation", f"body={json.dumps(body)[:400]}")
        assert_status("lifetime", headers, "legend")
    else:
        log_fail("1c lifetime plan activation", f"{r.status_code} {r.text[:300]}")

    # d) invalid plan
    r = requests.post(f"{BASE_URL}/premium/mock-activate", json={"plan": "nonsense"}, headers=headers, timeout=15)
    if r.status_code == 400:
        log_pass("1d invalid plan rejected with 400", f"detail={r.json().get('detail')}")
    else:
        log_fail("1d invalid plan rejected with 400", f"got {r.status_code} {r.text[:300]}")


def test_news(headers):
    print("\n════════════════════ [2] GET /news/india-finance ════════════════════")
    r = requests.get(f"{BASE_URL}/news/india-finance", headers=headers, timeout=30)
    if r.status_code != 200:
        log_fail("2 news endpoint 200", f"{r.status_code} {r.text[:300]}")
        return
    body = r.json()
    articles = body.get("articles", [])
    if not articles:
        log_fail("2 news returns articles", "empty articles array")
        return
    log_pass("2 news endpoint 200", f"articles={len(articles)} is_fallback={body.get('is_fallback')}")

    missing_url = 0
    invalid_url = 0
    missing_existing = 0
    for a in articles:
        if not a.get("source_url"):
            missing_url += 1
        elif not isinstance(a["source_url"], str) or not a["source_url"].startswith("https://"):
            invalid_url += 1
        for f in ("title", "summary", "category", "emoji", "source"):
            if f not in a or not a.get(f):
                missing_existing += 1
                break

    if missing_url == 0 and invalid_url == 0:
        sample = articles[0]
        log_pass(
            "2 each article has valid source_url (https://)",
            f"e.g. title='{sample.get('title','')[:45]}...' source_url='{sample.get('source_url','')[:80]}...'"
        )
    else:
        log_fail("2 source_url on every article", f"missing={missing_url} invalid_https={invalid_url}")

    if missing_existing == 0:
        log_pass("2 existing fields preserved", "title/summary/category/emoji/source all present")
    else:
        log_fail("2 existing fields preserved", f"{missing_existing} article(s) missing required fields")


def test_pricing_shape(headers):
    print("\n════════════════════ [3] GET /premium/status pricing shape ════════════════════")
    r = requests.get(f"{BASE_URL}/premium/status", headers=headers, timeout=15)
    if r.status_code != 200:
        log_fail("3 premium/status 200", f"{r.status_code} {r.text[:300]}")
        return
    body = r.json()
    pricing = body.get("pricing")
    if not isinstance(pricing, dict):
        log_fail("3 pricing dict present", f"got {type(pricing).__name__}")
        return

    errs = []
    for plan in ("monthly", "yearly", "lifetime", "intro"):
        p = pricing.get(plan)
        if not p:
            errs.append(f"missing plan={plan}")
            continue
        for k in ("price", "label", "period"):
            if k not in p:
                errs.append(f"{plan} missing '{k}'")

    if "includes_money_school" not in (pricing.get("yearly") or {}) or pricing["yearly"].get("includes_money_school") is not True:
        errs.append("yearly missing includes_money_school:true")
    if not pricing.get("yearly", {}).get("best_seller"):
        errs.append("yearly missing best_seller:true")
    if not pricing.get("lifetime", {}).get("includes_money_school"):
        errs.append("lifetime missing includes_money_school:true")

    if not errs:
        log_pass(
            "3 pricing shape valid",
            f"monthly=₹{pricing['monthly']['price']}, yearly=₹{pricing['yearly']['price']} (best_seller+MS), "
            f"lifetime=₹{pricing['lifetime']['price']} (MS), intro=₹{pricing['intro']['price']}"
        )
    else:
        log_fail("3 pricing shape valid", "; ".join(errs))


def test_regressions(headers):
    print("\n════════════════════ [4] Regression checks ════════════════════")

    # GET /leaderboard/unified?scope=contacts
    r = requests.get(f"{BASE_URL}/leaderboard/unified", params={"scope": "contacts"}, headers=headers, timeout=20)
    if r.status_code == 200:
        log_pass("4a leaderboard/unified?scope=contacts 200", f"keys={list(r.json().keys())[:6]}")
    else:
        log_fail("4a leaderboard/unified?scope=contacts 200", f"{r.status_code} {r.text[:300]}")

    # POST /sms/bulk-parse
    r = requests.post(
        f"{BASE_URL}/sms/bulk-parse",
        headers=headers,
        json={"messages": [
            "HDFC Bank: Rs 500 debited from A/c xxxx1234 at SWIGGY on 20-Apr-26",
            "SBI: Your A/c credited Rs 25000 as SALARY from ACME CORP",
        ]},
        timeout=60,
    )
    if r.status_code == 200:
        b = r.json()
        if "parsed" in b and "total" in b:
            log_pass("4b sms/bulk-parse 200", f"parsed={b.get('parsed')}/{b.get('total')} failed={b.get('failed')}")
        else:
            log_fail("4b sms/bulk-parse shape", json.dumps(b)[:300])
    else:
        log_fail("4b sms/bulk-parse 200", f"{r.status_code} {r.text[:300]}")

    # PUT /budgets/{id} + DELETE /transactions/{id}
    bud = requests.post(f"{BASE_URL}/budgets", headers=headers, json={"category": "Food", "amount": 5000, "period": "monthly"}, timeout=15)
    if bud.status_code == 200 and bud.json().get("id"):
        bid = bud.json()["id"]
        upd = requests.put(f"{BASE_URL}/budgets/{bid}", headers=headers, json={"category": "Food", "amount": 6500, "period": "monthly"}, timeout=15)
        if upd.status_code == 200:
            log_pass("4c PUT /budgets/{id} 200", f"updated amount 5000→6500 for id={bid[:10]}...")
        else:
            log_fail("4c PUT /budgets/{id} 200", f"{upd.status_code} {upd.text[:200]}")
    else:
        log_fail("4c PUT /budgets/{id} — precursor POST failed", f"{bud.status_code} {bud.text[:200]}")

    tx = requests.post(
        f"{BASE_URL}/transactions",
        headers=headers,
        json={"amount": 99.0, "category": "Food", "description": "regression test", "type": "debit"},
        timeout=15,
    )
    if tx.status_code == 200 and tx.json().get("id"):
        tid = tx.json()["id"]
        dele = requests.delete(f"{BASE_URL}/transactions/{tid}", headers=headers, timeout=15)
        if dele.status_code == 200:
            log_pass("4d DELETE /transactions/{id} 200", f"removed id={tid[:10]}...")
        else:
            log_fail("4d DELETE /transactions/{id} 200", f"{dele.status_code} {dele.text[:200]}")
    else:
        log_fail("4d DELETE /transactions — precursor POST failed", f"{tx.status_code} {tx.text[:200]}")


def main():
    print(f"\nMintU Round 9 Backend Tests → {BASE_URL}")
    print(f"Auth: phone={PHONE}, otp={OTP}\n")
    tok = auth_token()
    headers = {"Authorization": f"Bearer {tok}"}
    log_pass("auth bootstrap", f"token length={len(tok)}")

    test_mock_activate(headers)
    test_news(headers)
    test_pricing_shape(headers)
    test_regressions(headers)

    print("\n════════════════════ SUMMARY ════════════════════")
    print(f"PASS: {len(PASS)}")
    print(f"FAIL: {len(FAIL)}")
    for label, reason in FAIL:
        print(f"  ❌ {label}  — {reason}")
    sys.exit(0 if not FAIL else 1)


if __name__ == "__main__":
    main()
