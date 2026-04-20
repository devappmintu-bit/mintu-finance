#!/usr/bin/env python3
"""Round 26 FINAL regression test — AI router split across 6 files."""
import os, requests, json, sys, time

BASE = os.environ.get("BASE_URL", "https://mintu-finance.preview.emergentagent.com/api")
PHONE = "9876543210"
OTP = "123456"

passed = 0
failed = 0
errors = []

def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        errors.append(f"{name}: {detail}")
        print(f"  ❌ {name}: {detail}")

def auth():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=10)
    if r.status_code not in (200, 201):
        print(f"send-otp failed: {r.status_code} {r.text}"); sys.exit(1)
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=10)
    if r.status_code not in (200, 201):
        print(f"verify-otp failed: {r.status_code} {r.text}"); sys.exit(1)
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    if not tok:
        print(f"no token: {data}"); sys.exit(1)
    return tok

def req(method, path, headers=None, **kw):
    url = f"{BASE}{path}"
    try:
        r = requests.request(method, url, headers=headers, timeout=kw.pop("timeout", 15), **kw)
        return r
    except Exception as e:
        return type("R", (), {"status_code": 0, "text": str(e), "json": lambda self: {}})()

def main():
    print("=" * 70)
    print("ROUND 26 FINAL REGRESSION — AI router split")
    print("=" * 70)

    tok = auth()
    H = {"Authorization": f"Bearer {tok}"}
    print(f"\nAuth OK — token len={len(tok)}\n")

    # ai_insights.py (trimmed)
    print("— ai_insights.py (trimmed) —")
    r = req("GET", "/insights/daily", H)
    check("GET /insights/daily", r.status_code == 200, f"{r.status_code}")
    r = req("GET", "/reports/ai-expense-card", H, timeout=60)
    check("GET /reports/ai-expense-card", r.status_code == 200, f"{r.status_code}")
    r = req("GET", "/ai/proactive-nudges", H)
    check("GET /ai/proactive-nudges", r.status_code == 200, f"{r.status_code}")

    # ai_money_school.py (NEW)
    print("\n— ai_money_school.py (NEW) —")
    r = req("GET", "/money-school/lessons", H)
    check("GET /money-school/lessons", r.status_code == 200, f"{r.status_code}")
    r = req("GET", "/money-school/daily", H)
    check("GET /money-school/daily", r.status_code == 200, f"{r.status_code}")
    r = req("GET", "/money-school/dynamic?lang=en", H, timeout=30)
    check("GET /money-school/dynamic?lang=en", r.status_code == 200, f"{r.status_code}")
    r = req("GET", "/money-school/cards", H)
    check("GET /money-school/cards (random bug fix)", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    r = req("GET", "/money-school/personalized", H, timeout=30)
    check("GET /money-school/personalized", r.status_code == 200, f"{r.status_code}")
    r = req("POST", "/money-school/complete", H, json={"lesson_id": "1"})
    check("POST /money-school/complete", r.status_code == 200, f"{r.status_code}")

    # ai_waste.py (NEW)
    print("\n— ai_waste.py (NEW) —")
    r = req("GET", "/waste-detector", H)
    check("GET /waste-detector", r.status_code == 200, f"{r.status_code}")
    r = req("GET", "/insights/waste", H)
    check("GET /insights/waste", r.status_code == 200, f"{r.status_code}")

    # ai_coach.py (trimmed)
    print("\n— ai_coach.py (trimmed) —")
    r = req("GET", "/ai/agents", H)
    check("GET /ai/agents", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    r = req("POST", "/ai/memory", H, json={"action": "get"})
    check("POST /ai/memory", r.status_code == 200, f"{r.status_code}")
    r = req("POST", "/ai/chat", H, json={"message": "Hi"}, timeout=45)
    check("POST /ai/chat", r.status_code == 200, f"{r.status_code}")

    # ai_voice.py (NEW)
    print("\n— ai_voice.py (NEW) —")
    r = req("POST", "/voice/transcribe", H)
    check("POST /voice/transcribe (no body → 422)", r.status_code == 422, f"{r.status_code} (route reachable)")

    # ai_agent.py (NEW)
    print("\n— ai_agent.py (NEW) —")
    r = req("POST", "/ai/agent-chat", H, json={})
    check("POST /ai/agent-chat empty → 400/422", r.status_code in (400, 422), f"{r.status_code}")

    # Regression
    print("\n— Regression —")
    r = req("GET", "/home/bundle?lang=en", H)
    check("GET /home/bundle?lang=en", r.status_code == 200, f"{r.status_code}")
    r = req("GET", "/split/groups", H)
    check("GET /split/groups", r.status_code == 200, f"{r.status_code}")
    r = req("GET", "/split/pay-intent/bogus?amount=100", H)
    check("GET /split/pay-intent/bogus?amount=100 → 400", r.status_code == 400, f"{r.status_code}")
    r = req("GET", "/budgets/achievements", H)
    check("GET /budgets/achievements", r.status_code == 200, f"{r.status_code}")
    r = req("GET", "/transactions", H)
    check("GET /transactions", r.status_code == 200, f"{r.status_code}")

    print("\n" + "=" * 70)
    print(f"RESULT: {passed} passed, {failed} failed")
    if errors:
        print("\nFAILURES:")
        for e in errors:
            print(f"  • {e}")
    print("=" * 70)
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
