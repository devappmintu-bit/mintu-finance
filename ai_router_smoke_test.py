"""
AI Router Refactor Smoke Test (Phase 8) — Re-test after ImportError fix.
Verifies all AI endpoints plus key regression endpoints from the review request.
"""
import os
import time
import json
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"
PWD = "test123"

results = []


def log(name, ok, detail=""):
    status = "✅ PASS" if ok else "❌ FAIL"
    results.append((name, ok, detail))
    print(f"{status} | {name} | {detail}")


def auth():
    # Try OTP flow first; fall back to password login on rate-limit
    try:
        r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
        if r.status_code == 200:
            r2 = requests.post(
                f"{BASE}/auth/verify-otp",
                json={"phone": PHONE, "otp": OTP, "name": "Test User"},
                timeout=15,
            )
            if r2.status_code == 200 and r2.json().get("token"):
                return r2.json()["token"]
    except Exception as e:
        print("OTP path error:", e)
    # Fallback password
    r = requests.post(
        f"{BASE}/auth/login", json={"phone": PHONE, "password": PWD}, timeout=15
    )
    r.raise_for_status()
    return r.json()["token"]


def check(name, method, path, token, body=None, expect=200, accept=None):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        if method == "GET":
            r = requests.get(f"{BASE}{path}", headers=headers, timeout=60)
        else:
            r = requests.post(
                f"{BASE}{path}", headers=headers, json=body or {}, timeout=60
            )
    except Exception as e:
        log(name, False, f"exception: {e}")
        return None
    ok_codes = accept or [expect]
    body_snip = r.text[:220].replace("\n", " ")
    ok = r.status_code in ok_codes
    # Check for Python import/name/attribute errors leaking into the response
    low = r.text.lower()
    leaked = any(
        s in low for s in ["importerror", "nameerror", "attributeerror", "modulenotfound"]
    )
    if leaked:
        ok = False
        body_snip = "PYTHON ERROR LEAK: " + body_snip
    log(name, ok, f"HTTP {r.status_code} | {body_snip}")
    try:
        return r.json() if r.status_code < 500 else None
    except Exception:
        return None


def main():
    token = auth()
    print(f"\n>>> Auth OK, token len={len(token)}\n")

    # 1. GET /api/ai/agents
    d = check("1. GET /api/ai/agents", "GET", "/ai/agents", token)
    if d is not None and isinstance(d, dict):
        agents = d.get("agents") if "agents" in d else d
        log("1a. agents dict present", bool(agents), f"keys={list(agents.keys()) if isinstance(agents, dict) else type(agents).__name__}")

    # 2. GET /api/money-school/lessons
    d = check("2. GET /api/money-school/lessons", "GET", "/money-school/lessons", token)
    if isinstance(d, dict):
        lessons = d.get("lessons") or d.get("items") or []
        total = d.get("total") or len(lessons)
        log("2a. lessons non-empty", len(lessons) > 0, f"total={total}, lessons_len={len(lessons)}")

    # 3. GET /api/money-school/daily
    check("3. GET /api/money-school/daily", "GET", "/money-school/daily", token)

    # 4. GET /api/money-school/cards
    check("4. GET /api/money-school/cards", "GET", "/money-school/cards", token)

    # 5. GET /api/waste-detector
    check("5. GET /api/waste-detector", "GET", "/waste-detector", token)

    # 6. GET /api/reports/ai-expense-card
    check("6. GET /api/reports/ai-expense-card", "GET", "/reports/ai-expense-card", token)

    # 7. POST /api/ai/agent-chat — external LLM budget error is OK but no ImportError
    # Accept 200 (success) or 402/429/500 IF body is LLM budget/quota related.
    headers = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.post(
            f"{BASE}/ai/agent-chat",
            headers=headers,
            json={"message": "Hello"},
            timeout=90,
        )
        low = r.text.lower()
        leaked = any(s in low for s in ["importerror", "nameerror", "attributeerror", "modulenotfound"])
        llm_budget = any(
            s in low
            for s in [
                "budget",
                "quota",
                "rate limit",
                "credit",
                "insufficient",
                "emergent",
                "llm",
                "api key",
            ]
        )
        if leaked:
            log("7. POST /api/ai/agent-chat", False, f"HTTP {r.status_code} PYTHON ERROR LEAK: {r.text[:220]}")
        elif r.status_code == 200:
            log("7. POST /api/ai/agent-chat", True, f"HTTP 200 | {r.text[:160]}")
        elif r.status_code in (402, 429, 500, 503) and llm_budget:
            log("7. POST /api/ai/agent-chat", True, f"HTTP {r.status_code} LLM budget/quota (OK per review): {r.text[:160]}")
        else:
            log("7. POST /api/ai/agent-chat", False, f"HTTP {r.status_code} | {r.text[:220]}")
    except Exception as e:
        log("7. POST /api/ai/agent-chat", False, f"exception: {e}")

    # 8. GET /api/insights/daily
    check("8. GET /api/insights/daily", "GET", "/insights/daily", token)

    # 9. GET /api/ai/proactive-nudges
    check("9. GET /api/ai/proactive-nudges", "GET", "/ai/proactive-nudges", token)

    # Regression
    check("10. GET /api/split/groups", "GET", "/split/groups", token)
    check("11. GET /api/user/me", "GET", "/user/me", token)
    check("12. GET /api/transactions", "GET", "/transactions", token)
    check("13. GET /api/gamification/status", "GET", "/gamification/status", token)
    check("14. GET /api/stats/overview", "GET", "/stats/overview", token)

    # Summary
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n========== SUMMARY ==========")
    print(f"PASS: {passed}/{total}")
    failures = [(n, d) for n, ok, d in results if not ok]
    if failures:
        print("FAILURES:")
        for n, d in failures:
            print(f"  ❌ {n} :: {d}")
    return passed, total, failures


if __name__ == "__main__":
    main()
