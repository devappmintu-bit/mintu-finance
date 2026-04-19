"""Retest for news source_url outlet routing after substring-match fix."""
import os
import sys
import requests
from urllib.parse import urlparse

BASE = "https://mintu-finance.preview.emergentagent.com/api"

# Source keyword -> expected outlet domain substring in source_url hostname
EXPECTED = [
    (("rbi", "reserve bank"),                 "rbi.org.in"),
    (("nse", "national stock exchange"),      "nseindia.com"),
    (("sebi", "securities and exchange"),     "sebi.gov.in"),
    (("npci", "national payments"),            "npci.org.in"),
    (("amfi", "mutual funds in india"),        "amfiindia.com"),
    (("pib", "press information bureau"),      "pib.gov.in"),
    (("income tax",),                           "incometaxindia.gov.in"),
    (("livemint", "mint"),                      "livemint.com"),
    (("economic times", "et"),                  "economictimes.indiatimes.com"),
    (("moneycontrol",),                         "moneycontrol.com"),
]


def auth() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": "9876543210"}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": "9876543210", "otp": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def check_expected(source: str) -> str | None:
    s = source.lower()
    for keys, domain in EXPECTED:
        for k in keys:
            if k in s:
                return domain
    return None


def main() -> int:
    tok = auth()
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.get(f"{BASE}/news/india-finance", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    print(f"date={data.get('date')} is_fallback={data.get('is_fallback')} updated_at={data.get('updated_at')}")
    articles = data.get("articles", [])
    print(f"got {len(articles)} articles\n")

    failures: list[str] = []
    matched = 0
    for i, a in enumerate(articles, 1):
        src = a.get("source", "")
        url = a.get("source_url", "")
        host = urlparse(url).netloc.lower()
        expected = check_expected(src)
        status = "—"
        if expected:
            if expected in host:
                status = "✅"
                matched += 1
            else:
                # Specifically flag google.com failure
                if "google.com" in host:
                    status = "❌ GOOGLE FALLBACK"
                    failures.append(f"A{i} source='{src}' url={url} — expected {expected}")
                else:
                    status = f"❌ (expected {expected})"
                    failures.append(f"A{i} source='{src}' url={url} — expected {expected}, got host={host}")
        else:
            status = "(not in known-outlet list, acceptable)"
        print(f"A{i} source={src!r}")
        print(f"    url={url}")
        print(f"    host={host}  {status}\n")

    print("=" * 70)
    print(f"Matched known outlets correctly: {matched}")
    print(f"Failures: {len(failures)}")
    for f in failures:
        print(f"  - {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
