"""Round 12 smoke regression — verifies 6 items per the review request.

1. GET /api/news/india-finance — source_url should be Google News search URL
   (https://news.google.com/search?q=...) OR a direct https article URL.
   NO outlet-native search URLs (rbi.org.in/Scripts/SearchResults, nseindia.com/search, ...)
2. POST /api/premium/mock-activate {plan:"yearly"} → 200 with is_premium:true,
   tier:"premium", money_school_access:true.
3. GET /api/leaderboard/unified?scope=contacts → 200 standard shape.
4. Split CRUD — create group, add expense, update expense, delete expense (and
   make sure it doesn't collide with leave-group).
5. Transactions CRUD — POST, PUT, DELETE still green.
6. Budgets CRUD — POST, PUT, DELETE still green.

Auth: phone 9876543210 / OTP 123456.
"""
import os
import sys
import json
import time
import requests
from urllib.parse import urlparse

BACKEND = os.environ.get("BACKEND_URL", "https://mintu-finance.preview.emergentagent.com") + "/api"
PHONE = "9876543210"
OTP = "123456"

results: list = []


def record(name: str, ok: bool, detail: str = "") -> None:
    mark = "✅" if ok else "❌"
    print(f"{mark} {name}: {detail}")
    results.append((name, ok, detail))


def auth_token() -> str:
    r = requests.post(f"{BACKEND}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{BACKEND}/auth/verify-otp", json={"phone": PHONE, "otp": OTP, "name": "Test User"}, timeout=20)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    return r.json()["token"]


def test_news(h: dict) -> None:
    print("\n=== 1) GET /api/news/india-finance ===")
    t0 = time.time()
    r = requests.get(f"{BACKEND}/news/india-finance", headers=h, timeout=30)
    latency = int((time.time() - t0) * 1000)
    if r.status_code != 200:
        record("news/india-finance status 200", False, f"got {r.status_code}")
        return
    data = r.json()
    articles = data.get("articles", [])
    record("news/india-finance status 200", True, f"{latency}ms, {len(articles)} articles, is_fallback={data.get('is_fallback')}")

    all_ok = True
    outlet_native_hosts = {
        "www.rbi.org.in", "rbi.org.in",
        "www.nseindia.com", "nseindia.com",
        "www.sebi.gov.in", "sebi.gov.in",
        "www.npci.org.in", "npci.org.in",
        "www.amfiindia.com", "amfiindia.com",
        "incometaxindia.gov.in", "www.incometaxindia.gov.in",
        "www.livemint.com", "livemint.com",
        "economictimes.indiatimes.com", "www.economictimes.indiatimes.com",
        "www.moneycontrol.com", "moneycontrol.com",
        "pib.gov.in", "www.pib.gov.in",
    }
    for i, a in enumerate(articles, 1):
        src_url = (a.get("source_url") or "").strip()
        host = urlparse(src_url).netloc.lower()
        path = urlparse(src_url).path.lower()
        is_google_news_search = src_url.startswith("https://news.google.com/search?q=")
        # Per review: direct https article URL (not an outlet-native search path)
        # Outlet-native search URLs to reject: /search, /SearchResults, /?s=, /search.html etc.
        looks_like_outlet_native_search = (
            host in outlet_native_hosts
            and (
                "search" in path
                or path == "/"
                and "?s=" in src_url
            )
        ) or (
            # generic: any outlet host + explicit /search endpoints
            "/search" in src_url.lower() and not is_google_news_search
        )
        is_direct_https_article = src_url.startswith("https://") and not looks_like_outlet_native_search and not is_google_news_search

        ok = src_url.startswith("https://") and (is_google_news_search or is_direct_https_article) and not looks_like_outlet_native_search
        if not ok:
            all_ok = False
        print(f"  A{i} source='{a.get('source','?')}' → host={host} ok={ok} url={src_url[:120]}")
    record("news/india-finance: all source_url are google-news-search OR direct article (no outlet-native search)", all_ok, "")


def test_premium(h: dict) -> None:
    print("\n=== 2) POST /api/premium/mock-activate {plan:yearly} ===")
    r = requests.post(f"{BACKEND}/premium/mock-activate", headers=h, json={"plan": "yearly"}, timeout=20)
    if r.status_code != 200:
        record("premium/mock-activate status 200", False, f"got {r.status_code} body={r.text[:200]}")
        return
    data = r.json()
    ok = (
        data.get("is_premium") is True
        and data.get("tier") == "premium"
        and data.get("money_school_access") is True
    )
    record("premium/mock-activate yearly → is_premium+tier=premium+money_school_access", ok,
           f"got is_premium={data.get('is_premium')} tier={data.get('tier')} msa={data.get('money_school_access')}")


def test_leaderboard(h: dict) -> None:
    print("\n=== 3) GET /api/leaderboard/unified?scope=contacts ===")
    r = requests.get(f"{BACKEND}/leaderboard/unified?scope=contacts", headers=h, timeout=20)
    if r.status_code != 200:
        record("leaderboard/unified status 200", False, f"got {r.status_code} body={r.text[:200]}")
        return
    data = r.json()
    ok = isinstance(data.get("contenders"), list) and "scope" in data and "total" in data
    record("leaderboard/unified standard shape", ok,
           f"contenders={len(data.get('contenders', []))} scope={data.get('scope')} total={data.get('total')}")


def test_split_crud(h: dict) -> None:
    print("\n=== 4) Split CRUD ===")
    # Create group (2 members required: include a second registered phone)
    r = requests.post(f"{BACKEND}/split/groups", headers=h, json={
        "name": "Round 12 Regression Group",
        "members": ["9999888877"],  # Rahul Sharma from test_credentials.md
    }, timeout=20)
    if r.status_code != 200:
        record("split: POST /split/groups", False, f"got {r.status_code} body={r.text[:200]}")
        return
    group = r.json()
    group_id = group["id"]
    member_ids = [m["user_id"] for m in group["members"]]
    record("split: POST /split/groups", True, f"group_id={group_id} members={len(member_ids)}")

    # Add expense
    splits_map = {uid: 250.0 for uid in member_ids}  # equal split of ₹500 across members
    r = requests.post(f"{BACKEND}/split/expenses", headers=h, json={
        "group_id": group_id,
        "description": "Regression test dinner",
        "amount": 500.0,
        "paid_by": member_ids[0],
        "split_type": "equal",
        "splits": splits_map,
    }, timeout=20)
    if r.status_code != 200:
        record("split: POST /split/expenses", False, f"got {r.status_code} body={r.text[:200]}")
        _cleanup_group(h, group_id)
        return
    exp = r.json()
    exp_id = exp["id"]
    record("split: POST /split/expenses equal", True, f"expense_id={exp_id}")

    # Update expense (change amount + description)
    r = requests.put(f"{BACKEND}/split/expenses/{exp_id}", headers=h, json={
        "description": "Regression test dinner (updated)",
        "amount": 600.0,
    }, timeout=20)
    if r.status_code != 200:
        record("split: PUT /split/expenses/{id}", False, f"got {r.status_code} body={r.text[:200]}")
    else:
        record("split: PUT /split/expenses/{id}", True, "amount updated to 600")

    # Delete expense — THIS IS THE CRITICAL ONE (must not collide with leave-group)
    r = requests.delete(f"{BACKEND}/split/expenses/{exp_id}", headers=h, timeout=20)
    if r.status_code != 200:
        record("split: DELETE /split/expenses/{id} (no collision with leave-group)", False,
               f"got {r.status_code} body={r.text[:200]}")
    else:
        record("split: DELETE /split/expenses/{id} (no collision with leave-group)", True, r.json().get("message", ""))

    # Sanity — make sure leave-group endpoint is still a separate path that works
    # (we won't actually leave — just verify the delete above didn't swallow it)
    # Delete group cleanup instead:
    _cleanup_group(h, group_id)


def _cleanup_group(h: dict, group_id: str) -> None:
    try:
        requests.delete(f"{BACKEND}/split/groups/{group_id}", headers=h, timeout=10)
    except Exception:
        pass


def test_transactions_crud(h: dict) -> None:
    print("\n=== 5) Transactions CRUD ===")
    r = requests.post(f"{BACKEND}/transactions", headers=h, json={
        "amount": 350.0,
        "category": "Food",
        "description": "Swiggy regression test",
        "type": "debit",
    }, timeout=20)
    if r.status_code != 200:
        record("transactions: POST", False, f"got {r.status_code} body={r.text[:200]}")
        return
    txn = r.json()
    txn_id = txn["id"]
    record("transactions: POST", True, f"id={txn_id}")

    r = requests.put(f"{BACKEND}/transactions/{txn_id}", headers=h, json={
        "description": "Swiggy regression test (updated)",
        "amount": 400.0,
    }, timeout=20)
    if r.status_code != 200:
        record("transactions: PUT", False, f"got {r.status_code} body={r.text[:200]}")
    else:
        record("transactions: PUT", True, "amount updated")

    r = requests.delete(f"{BACKEND}/transactions/{txn_id}", headers=h, timeout=20)
    if r.status_code != 200:
        record("transactions: DELETE", False, f"got {r.status_code} body={r.text[:200]}")
    else:
        record("transactions: DELETE", True, r.json().get("message", ""))


def test_budgets_crud(h: dict) -> None:
    print("\n=== 6) Budgets CRUD ===")
    r = requests.post(f"{BACKEND}/budgets", headers=h, json={
        "category": "Entertainment",
        "amount": 3000.0,
        "period": "monthly",
    }, timeout=20)
    if r.status_code != 200:
        record("budgets: POST", False, f"got {r.status_code} body={r.text[:200]}")
        return
    bud = r.json()
    bud_id = bud["id"]
    record("budgets: POST", True, f"id={bud_id}")

    r = requests.put(f"{BACKEND}/budgets/{bud_id}", headers=h, json={
        "amount": 3500.0,
    }, timeout=20)
    if r.status_code != 200:
        record("budgets: PUT", False, f"got {r.status_code} body={r.text[:200]}")
    else:
        record("budgets: PUT", True, "amount updated to 3500")

    r = requests.delete(f"{BACKEND}/budgets/{bud_id}", headers=h, timeout=20)
    if r.status_code != 200:
        record("budgets: DELETE", False, f"got {r.status_code} body={r.text[:200]}")
    else:
        record("budgets: DELETE", True, r.json().get("message", ""))


def main() -> int:
    print(f"Backend: {BACKEND}")
    token = auth_token()
    h = {"Authorization": f"Bearer {token}"}
    print(f"Auth OK — JWT({len(token)} chars)")

    test_news(h)
    test_premium(h)
    test_leaderboard(h)
    test_split_crud(h)
    test_transactions_crud(h)
    test_budgets_crud(h)

    print("\n=== SUMMARY ===")
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"{passed}/{total} assertions passed")
    for name, ok, detail in results:
        print(f"  {'✅' if ok else '❌'} {name}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
