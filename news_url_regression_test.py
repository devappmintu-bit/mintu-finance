"""Regression test for GET /api/news/india-finance source_url routing and
POST /api/premium/mock-activate yearly plan — Apr 2026."""
import os
import sys
import json
import time
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"


def log(msg: str) -> None:
    print(msg, flush=True)


def auth_token() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    log(f"send-otp → {r.status_code}")
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    log(f"verify-otp → {r.status_code}")
    assert r.status_code == 200, r.text
    return r.json()["token"]


EXPECTED_PATTERNS = {
    "livemint": "livemint.com/Search/Link/Keyword/",
    "mint": "livemint.com/Search/Link/Keyword/",
    "economic times": "economictimes.indiatimes.com/topic/",
    "et": "economictimes.indiatimes.com/topic/",
    "moneycontrol": "moneycontrol.com/news/tags/",
    "rbi": "rbi.org.in",
    "sebi": "sebi.gov.in",
    "business standard": "business-standard.com/search?q=",
    "financial express": "financialexpress.com",
    "nse": "nseindia.com",
    "bse": "bseindia.com",
    "cyber cell": "cybercrime.gov.in",
    "npci": "npci.org.in",
    "amfi": "amfiindia.com",
    "pib": "pib.gov.in",
}


def test_news(token: str) -> int:
    r = requests.get(f"{BASE}/news/india-finance", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    log(f"\nGET /api/news/india-finance → {r.status_code}")
    assert r.status_code == 200, r.text
    data = r.json()
    articles = data.get("articles", [])
    log(f"  date={data.get('date')} is_fallback={data.get('is_fallback')} updated_at={data.get('updated_at')}")
    log(f"  article count = {len(articles)}")
    assert len(articles) == 6, f"expected 6 articles, got {len(articles)}"

    failures = []
    for i, a in enumerate(articles, 1):
        src = (a.get("source") or "").strip()
        url = (a.get("source_url") or "").strip()
        title = a.get("title", "")
        log(f"\n  Article {i}: source='{src}'")
        log(f"    title = {title[:80]}")
        log(f"    url   = {url}")

        # Required: source_url present and https
        if not url.startswith("https://"):
            failures.append(f"Article {i} ({src}) — source_url not https: {url}")
            continue

        # Check known outlet routing
        matched_outlet = None
        for key, pattern in EXPECTED_PATTERNS.items():
            if key in src.lower():
                matched_outlet = (key, pattern)
                break

        if matched_outlet:
            key, pattern = matched_outlet
            if pattern in url:
                log(f"    ✅ Matched outlet '{key}' → contains '{pattern}' (outlet's own domain)")
            else:
                # Check at least that it is NOT google.com for known outlets
                if "google.com" in url:
                    failures.append(
                        f"Article {i} ({src}) — KNOWN outlet '{key}' but URL falls back to google.com: {url}"
                    )
                else:
                    failures.append(
                        f"Article {i} ({src}) — KNOWN outlet '{key}' but URL does not contain expected pattern '{pattern}': {url}"
                    )
        else:
            # Unknown source → google.com/search fallback acceptable
            if "google.com/search" in url:
                log(f"    ✅ Unknown source — google.com/search fallback (acceptable)")
            elif url.startswith("https://"):
                log(f"    ℹ️  Unknown source — non-google https URL (acceptable): {url}")
            else:
                failures.append(f"Article {i} ({src}) — invalid fallback URL: {url}")

    log("\n" + "=" * 70)
    if failures:
        log("❌ NEWS ENDPOINT FAILURES:")
        for f in failures:
            log(f"  • {f}")
        return 1
    log("✅ /api/news/india-finance — all 6 articles have correct source_url routing")
    return 0


def test_premium_mock_activate(token: str) -> int:
    r = requests.post(
        f"{BASE}/premium/mock-activate",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan": "yearly"},
        timeout=15,
    )
    log(f"\nPOST /api/premium/mock-activate {{plan:yearly}} → {r.status_code}")
    assert r.status_code == 200, r.text
    data = r.json()
    log(f"  response = {json.dumps(data, indent=2)[:400]}")
    failures = []
    if data.get("success") is not True:
        failures.append(f"success != true (got {data.get('success')})")
    if data.get("is_premium") is not True:
        failures.append(f"is_premium != true (got {data.get('is_premium')})")
    if data.get("money_school_access") is not True:
        failures.append(f"money_school_access != true (got {data.get('money_school_access')})")
    if failures:
        log("❌ PREMIUM mock-activate yearly failures:")
        for f in failures:
            log(f"  • {f}")
        return 1
    log("✅ /api/premium/mock-activate yearly — success=true, is_premium=true, money_school_access=true")
    return 0


def main() -> int:
    log("=" * 70)
    log(f"REGRESSION TEST — {BASE}")
    log("=" * 70)
    token = auth_token()
    rc1 = test_news(token)
    rc2 = test_premium_mock_activate(token)
    return rc1 | rc2


if __name__ == "__main__":
    sys.exit(main())
