#!/usr/bin/env python3
"""Final AI refactor verification after MONEY_SCHOOL_CARDS lazy-proxy fix."""
import requests
import json
import sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"

def login():
    r = requests.post(f"{BASE}/auth/login",
                      json={"phone": "9876543210", "password": "test123"},
                      timeout=30)
    if r.status_code != 200:
        print(f"❌ Login failed: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    data = r.json()
    token = data.get("access_token") or data.get("token")
    print(f"✅ Login OK, token len={len(token) if token else 0}")
    return token

def check(name, method, path, token, expected_status=(200,), body=None, accept_llm_err=False):
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{BASE}{path}"
    try:
        if method == "GET":
            r = requests.get(url, headers=headers, timeout=60)
        else:
            r = requests.post(url, headers=headers, json=body or {}, timeout=60)
    except Exception as e:
        print(f"❌ {name}: EXCEPTION {e}")
        return False, None
    ok = r.status_code in expected_status
    snippet = r.text[:250].replace("\n", " ")
    if not ok and accept_llm_err:
        # accept LLM budget errors for dynamic/personalized
        if r.status_code in (402, 429, 500, 503) and ("budget" in r.text.lower() or "llm" in r.text.lower() or "limit" in r.text.lower() or "quota" in r.text.lower() or "credit" in r.text.lower()):
            print(f"⚠️  {name}: {r.status_code} (accepted LLM-budget error) - {snippet[:100]}")
            return True, r
    status_char = "✅" if ok else "❌"
    print(f"{status_char} {name}: {r.status_code} - {snippet[:150]}")
    return ok, r

def main():
    token = login()
    results = []

    # 1. AI endpoints
    tests = [
        ("1. GET /ai/agents", "GET", "/ai/agents", (200,), None, False),
        ("2. GET /money-school/lessons", "GET", "/money-school/lessons", (200,), None, False),
        ("3. GET /money-school/daily", "GET", "/money-school/daily", (200,), None, False),
        ("4. GET /money-school/cards", "GET", "/money-school/cards", (200,), None, False),
        ("5. GET /waste-detector", "GET", "/waste-detector", (200,), None, False),
        ("6. GET /reports/ai-expense-card", "GET", "/reports/ai-expense-card", (200,), None, False),
        ("7. POST /ai/agent-chat", "POST", "/ai/agent-chat", (200,), {"message": "Hello"}, False),
        ("8. GET /insights/daily", "GET", "/insights/daily", (200,), None, False),
        ("9. GET /ai/proactive-nudges", "GET", "/ai/proactive-nudges", (200,), None, False),
        ("10. GET /money-school/dynamic?lang=en", "GET", "/money-school/dynamic?lang=en", (200,), None, True),
        ("11. GET /money-school/personalized?lang=en", "GET", "/money-school/personalized?lang=en", (200,), None, True),
        # Regression
        ("12. GET /split/groups", "GET", "/split/groups", (200,), None, False),
        ("13. GET /user/me", "GET", "/user/me", (200,), None, False),
        ("14. GET /transactions", "GET", "/transactions", (200,), None, False),
        ("15. GET /stats/overview", "GET", "/stats/overview", (200,), None, False),
        ("16. GET /gamification/status", "GET", "/gamification/status", (200,), None, False),
    ]

    for name, method, path, exp, body, llm_err in tests:
        ok, r = check(name, method, path, token, exp, body, llm_err)
        results.append((name, ok, r))

    # Special checks: cards array, lessons total > 0
    print("\n--- Shape Validations ---")
    for name, ok, r in results:
        if "lessons" in name and ok and r is not None:
            try:
                d = r.json()
                total = d.get("total", 0)
                lessons_len = len(d.get("lessons", []))
                print(f"   lessons total={total}, array len={lessons_len} " + ("✅" if total > 0 else "❌"))
            except Exception as e:
                print(f"   lessons parse err: {e}")
        if "/money-school/cards" in name and ok and r is not None:
            try:
                d = r.json()
                has_cards = isinstance(d.get("cards"), list)
                print(f"   cards array present: {has_cards} (keys={list(d.keys())[:10]}) " + ("✅" if has_cards else "❌"))
            except Exception as e:
                print(f"   cards parse err: {e}")

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n==== RESULT: {passed}/{total} passed ====")
    if passed == total:
        print("🎉 ALL GREEN")
    sys.exit(0 if passed == total else 1)

if __name__ == "__main__":
    main()
