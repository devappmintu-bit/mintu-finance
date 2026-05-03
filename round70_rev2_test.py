#!/usr/bin/env python3
"""
Round 70 rev 2 — Thread-isolated LLM cache worker test

Verifies:
  • Cold-miss latency <500 ms (deterministic fallback returned instantly)
  • Warm latency <200 ms (cached LLM-enriched data)
  • Shapes correct per spec
  • No 500s
  • Worker thread regens within ~30 s and subsequent call returns enriched data
"""
import asyncio
import os
import sys
import time
import httpx

from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "mintu_database"

ENDPOINTS = [
    # (name, path, verify_fn)
    ("split_insights",     "/split/insights"),
    ("money_school_daily", "/money-school/daily"),
    ("money_school_dyn",   "/money-school/dynamic"),
    ("money_school_pers",  "/money-school/personalized"),
    ("rewards_vouchers",   "/rewards/vouchers?category=food"),
    ("insights_daily",     "/insights/daily"),
    ("ai_expense_card",    "/reports/ai-expense-card"),
]

SHAPE_CHECKS = {
    "split_insights":     lambda j: "fun_fact" in j,
    "money_school_daily": lambda j: all(k in j for k in ("lesson","personal_tip","lesson_number")),
    "money_school_dyn":   lambda j: isinstance(j.get("cards"), list) and len(j["cards"]) >= 6,
    "money_school_pers":  lambda j: isinstance(j.get("cards"), list) and len(j["cards"]) >= 1,
    "rewards_vouchers":   lambda j: isinstance(j.get("vouchers", j.get("items")), list) and
                                     len(j.get("vouchers", j.get("items"))) == 8,
    "insights_daily":     lambda j: "insight_text" in j and "recommendations" in j,
    "ai_expense_card":    lambda j: isinstance(j.get("report"), dict) and "headline" in j["report"],
}


async def clear_cache():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    r = await db.llm_cache.delete_many({})
    client.close()
    print(f"🗑  Cleared {r.deleted_count} llm_cache entries")


async def get_token():
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE})
        assert r.status_code == 200, f"send-otp {r.status_code}: {r.text}"
        r = await c.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PHONE, "otp": OTP})
        assert r.status_code == 200, f"verify-otp {r.status_code}: {r.text}"
        return r.json()["token"]


async def timed_get(client, path, token):
    t0 = time.perf_counter()
    r = await client.get(f"{BASE_URL}{path}", headers={"Authorization": f"Bearer {token}"})
    ms = (time.perf_counter() - t0) * 1000
    return r, ms


async def main():
    print("=" * 72)
    print("Round 70 rev 2 — Thread-Isolated LLM Cache Worker Test")
    print("=" * 72)

    # 1. Clear cache
    await clear_cache()

    # 2. Authenticate
    token = await get_token()
    print(f"✅ Auth OK (token len {len(token)})")

    results = {}  # name -> dict

    async with httpx.AsyncClient(timeout=60.0) as client:
        # === COLD CALLS (cache empty) ===
        print("\n── COLD CALLS (cache empty) ─────────────────────────────")
        cold = {}
        for name, path in ENDPOINTS:
            try:
                r, ms = await timed_get(client, path, token)
                j = None
                try:
                    j = r.json()
                except Exception:
                    pass
                cold[name] = {"status": r.status_code, "ms": ms, "json": j}
                ok = (r.status_code == 200 and ms < 500)
                print(f"  {'✅' if ok else '❌'} {name:22s} {r.status_code}  {ms:8.1f} ms"
                      + ("" if ok else f"  (target <500ms)"))
            except Exception as e:
                cold[name] = {"status": "ERR", "ms": 0, "err": str(e)}
                print(f"  ❌ {name:22s} ERR  {e}")

        # === WAIT for worker regen ===
        print("\n⏳ Waiting 35 s for worker thread to regen LLM caches...")
        await asyncio.sleep(35)

        # === WARM CALLS ===
        print("\n── WARM CALLS (after worker regen) ──────────────────────")
        warm = {}
        for name, path in ENDPOINTS:
            try:
                r, ms = await timed_get(client, path, token)
                j = None
                try:
                    j = r.json()
                except Exception:
                    pass
                warm[name] = {"status": r.status_code, "ms": ms, "json": j}
                ok = (r.status_code == 200 and ms < 200)
                print(f"  {'✅' if ok else '❌'} {name:22s} {r.status_code}  {ms:8.1f} ms"
                      + ("" if ok else f"  (target <200ms)"))
            except Exception as e:
                warm[name] = {"status": "ERR", "ms": 0, "err": str(e)}
                print(f"  ❌ {name:22s} ERR  {e}")

    # === VERIFY SHAPES ===
    print("\n── SHAPE VERIFICATION (from warm call) ─────────────────────")
    shapes_ok = {}
    for name, _ in ENDPOINTS:
        j = warm.get(name, {}).get("json")
        try:
            ok = SHAPE_CHECKS[name](j or {})
        except Exception as e:
            ok = False
        shapes_ok[name] = ok
        hint = ""
        if not ok and j is not None:
            keys = list(j.keys())[:8]
            hint = f"  keys={keys}"
        print(f"  {'✅' if ok else '❌'} {name:22s} shape_ok={ok}{hint}")

    # === SUMMARY ===
    print("\n" + "=" * 72)
    print("SUMMARY")
    print("=" * 72)
    all_pass = True
    print(f"{'Endpoint':22s} {'Cold':>10s} {'Warm':>10s}  Shape  Verdict")
    for name, _ in ENDPOINTS:
        c_ms = cold.get(name, {}).get("ms", 0)
        w_ms = warm.get(name, {}).get("ms", 0)
        c_status = cold.get(name, {}).get("status")
        w_status = warm.get(name, {}).get("status")
        shape = shapes_ok.get(name, False)
        cold_ok = (c_status == 200 and c_ms < 500)
        warm_ok = (w_status == 200 and w_ms < 200)
        verdict = "PASS" if (cold_ok and warm_ok and shape) else "FAIL"
        if verdict == "FAIL":
            all_pass = False
        print(f"{name:22s} {c_ms:8.1f}ms {w_ms:8.1f}ms  {str(shape):5s}  {verdict}")

    # Sample warm data to confirm LLM enrichment for key endpoints
    print("\n── LLM ENRICHMENT SAMPLES ──────────────────────────────────")
    for name in ("insights_daily", "money_school_dyn", "money_school_daily"):
        j = warm.get(name, {}).get("json") or {}
        if name == "insights_daily":
            print(f"  insights_daily.insight_text: {str(j.get('insight_text'))[:150]}")
        elif name == "money_school_dyn":
            cards = j.get("cards", [])
            print(f"  money_school_dyn.cards count: {len(cards)}")
            if cards:
                print(f"    first card title: {cards[0].get('title','(none)')[:100]}")
        elif name == "money_school_daily":
            print(f"  money_school_daily.lesson: {str(j.get('lesson'))[:150]}")

    print("\n" + ("🎉 ALL PASS" if all_pass else "❌ SOME FAILURES"))
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
