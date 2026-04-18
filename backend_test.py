"""
Smoke test for MintU backend optimizations (Apr 2026)
Focus: caching on waste-detector (5 min) and ai-expense-card (10 min),
cache invalidation on new transaction, Money School agent routing.
"""
import time
import requests

BACKEND_URL = "https://mintu-finance.preview.emergentagent.com"
API = f"{BACKEND_URL}/api"

PHONE = "9876543210"
OTP = "123456"

results = []


def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    line = f"[{status}] {name} :: {detail}"
    print(line)
    results.append((ok, name, detail))


def main():
    session = requests.Session()

    # 1) Send OTP
    t0 = time.time()
    r = session.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    ok = r.status_code == 200
    record("POST /api/auth/send-otp", ok, f"status={r.status_code} ms={int((time.time()-t0)*1000)} body={r.text[:120]}")
    if not ok:
        return

    # 2) Verify OTP
    t0 = time.time()
    r = session.post(f"{API}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    token = body.get("access_token") or body.get("token")
    record("POST /api/auth/verify-otp", ok and bool(token), f"status={r.status_code} ms={int((time.time()-t0)*1000)} has_token={bool(token)}")
    if not token:
        return
    headers = {"Authorization": f"Bearer {token}"}

    # 3) GET /api/user/me
    t0 = time.time()
    r = session.get(f"{API}/user/me", headers=headers, timeout=30)
    record("GET /api/user/me", r.status_code == 200, f"status={r.status_code} ms={int((time.time()-t0)*1000)}")

    # 4a) GET /api/waste-detector (1st call)
    t0 = time.time()
    r1 = session.get(f"{API}/waste-detector", headers=headers, timeout=60)
    t_wd1 = int((time.time()-t0)*1000)
    record("GET /api/waste-detector (1st)", r1.status_code == 200, f"status={r1.status_code} ms={t_wd1}")

    # 4b) GET /api/waste-detector (2nd call - should be cache hit)
    t0 = time.time()
    r2 = session.get(f"{API}/waste-detector", headers=headers, timeout=60)
    t_wd2 = int((time.time()-t0)*1000)
    record("GET /api/waste-detector (2nd - cache hit)", r2.status_code == 200, f"status={r2.status_code} ms={t_wd2}")
    cache_improved = t_wd2 < t_wd1
    record("waste-detector cache speedup (2nd < 1st)", cache_improved, f"1st={t_wd1}ms 2nd={t_wd2}ms delta={t_wd1 - t_wd2}ms")

    # 5) GET /api/reports/ai-expense-card
    t0 = time.time()
    r = session.get(f"{API}/reports/ai-expense-card", headers=headers, timeout=60)
    t_aec1 = int((time.time()-t0)*1000)
    record("GET /api/reports/ai-expense-card (1st)", r.status_code == 200, f"status={r.status_code} ms={t_aec1}")
    # Second call - should hit 10-min cache
    t0 = time.time()
    r = session.get(f"{API}/reports/ai-expense-card", headers=headers, timeout=60)
    t_aec2 = int((time.time()-t0)*1000)
    record("GET /api/reports/ai-expense-card (2nd - cache hit)", r.status_code == 200, f"status={r.status_code} ms={t_aec2} (1st={t_aec1}ms)")

    # 6) POST /api/transactions (Food ₹100) -- should clear cache
    txn_payload = {
        "type": "debit",
        "amount": 100,
        "category": "Food",
        "description": "Smoke test lunch",
        "merchant": "Swiggy"
    }
    t0 = time.time()
    r = session.post(f"{API}/transactions", headers=headers, json=txn_payload, timeout=30)
    ok = r.status_code in (200, 201)
    txn_id = None
    try:
        j = r.json()
        txn_id = j.get("id") or j.get("transaction", {}).get("id") or j.get("_id")
    except Exception:
        pass
    record("POST /api/transactions (Food ₹100)", ok, f"status={r.status_code} ms={int((time.time()-t0)*1000)} id={txn_id}")

    # 7) GET /api/waste-detector again - should be a MISS (cache invalidated)
    t0 = time.time()
    r = session.get(f"{API}/waste-detector", headers=headers, timeout=60)
    t_wd3 = int((time.time()-t0)*1000)
    record("GET /api/waste-detector (after txn - cache cleared)", r.status_code == 200, f"status={r.status_code} ms={t_wd3} (cached 2nd was {t_wd2}ms)")
    cache_cleared = t_wd3 > (t_wd2 + 100) or t_wd3 > 500
    record("waste-detector cache cleared heuristic (3rd slower than 2nd)", cache_cleared, f"2nd(cached)={t_wd2}ms 3rd(after-txn)={t_wd3}ms")

    # 8) GET /api/referral/enhanced-status
    t0 = time.time()
    r = session.get(f"{API}/referral/enhanced-status", headers=headers, timeout=30)
    ok = r.status_code == 200
    detail = f"status={r.status_code} ms={int((time.time()-t0)*1000)}"
    if ok:
        body = r.json()
        keys = list(body.keys())
        detail += f" keys={keys[:8]} code={body.get('referral_code')}"
    record("GET /api/referral/enhanced-status", ok, detail)

    # 9) POST /api/ai/agent-chat -- Money School routing
    t0 = time.time()
    r = session.post(
        f"{API}/ai/agent-chat",
        headers=headers,
        json={"message": "Teach me about SIPs"},
        timeout=120,
    )
    ok = r.status_code == 200
    agent_name = ""
    agent_emoji = ""
    reply_len = 0
    if ok:
        body = r.json()
        agent = body.get("agent") or {}
        agent_name = agent.get("name", "")
        agent_emoji = agent.get("emoji", "")
        reply_len = len((body.get("reply") or body.get("message") or ""))
    money_school_ok = ok and agent_name == "Money School"
    record(
        "POST /api/ai/agent-chat 'Teach me about SIPs' -> Money School",
        money_school_ok,
        f"status={r.status_code} ms={int((time.time()-t0)*1000)} agent='{agent_name}' emoji='{agent_emoji}' reply_len={reply_len}",
    )

    # Cleanup
    if txn_id:
        try:
            session.delete(f"{API}/transactions/{txn_id}", headers=headers, timeout=15)
        except Exception:
            pass

    # Summary
    print("\n" + "="*70)
    print("SMOKE TEST SUMMARY")
    print("="*70)
    passed = sum(1 for r in results if r[0])
    total = len(results)
    print(f"PASSED: {passed}/{total}")
    for ok, name, detail in results:
        print(f"  {'PASS' if ok else 'FAIL'} {name}  -- {detail}")
    print("\nCACHE PERFORMANCE:")
    print(f"  waste-detector 1st call:              {t_wd1} ms")
    print(f"  waste-detector 2nd call (cached):     {t_wd2} ms  (speedup: {t_wd1-t_wd2} ms)")
    print(f"  waste-detector after txn (cleared):   {t_wd3} ms")
    print(f"  ai-expense-card 1st call:             {t_aec1} ms")
    print(f"  ai-expense-card 2nd call (cached):    {t_aec2} ms  (speedup: {t_aec1-t_aec2} ms)")


if __name__ == "__main__":
    main()
