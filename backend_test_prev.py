"""
Round 90 Surface 1B — Coach Triggers Cron + Dispatcher Test Suite.

Tests:
  A) Regression: POST /api/coach/triggers/check still returns {fired: [...]}
  B) Cooldown logic for salary_credited (24h)
  C) Overspend cooldown logic (12h for overspend family)
  D) Push delivery (mocked): delivered flag true/false based on push_token
  E) Worker startup log present in backend.out.log
  F) Family mapping: _trigger_family('overspend_groceries') -> 'overspend'
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone

import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Add backend to path so we can import service module (Test F).
sys.path.insert(0, "/app/backend")

BACKEND_URL = "https://mintu-finance.preview.emergentagent.com"
API = f"{BACKEND_URL}/api"
PHONE = "9876543210"
OTP = "123456"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "mintu_database"

PASSED: list[str] = []
FAILED: list[tuple[str, str]] = []


def _check(name: str, cond: bool, detail: str = "") -> bool:
    if cond:
        PASSED.append(name)
        print(f"  ✅ {name}")
        return True
    FAILED.append((name, detail))
    print(f"  ❌ {name} — {detail}")
    return False


# ─────────────────────────────────────────────────────────────────────
#  AUTH
# ─────────────────────────────────────────────────────────────────────
def login() -> tuple[str, str]:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"phone": PHONE, "otp": OTP, "name": "Rahul Sharma"},
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]["id"]


# ─────────────────────────────────────────────────────────────────────
#  MAIN TEST RUNNER
# ─────────────────────────────────────────────────────────────────────
async def run():
    token, user_id = login()
    print(f"\n🔑 Auth OK — user_id={user_id}")
    headers = {"Authorization": f"Bearer {token}"}

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Cleanup any leftover test data from previous runs
    await db.coach_trigger_history.delete_many({"user_id": user_id})
    await db.transactions.delete_many({"user_id": user_id, "_test_marker": True})
    await db.budgets.delete_many({"user_id": user_id, "_test_marker": True})

    # ═════════════════════════════════════════════════════════════════
    # TEST E — Worker startup log
    # ═════════════════════════════════════════════════════════════════
    print("\n── E) Worker startup log ──")
    log_path = "/var/log/supervisor/backend.out.log"
    worker_started = False
    last_line = None
    try:
        with open(log_path, "r") as f:
            for line in f:
                if "Coach triggers worker started" in line:
                    worker_started = True
                    last_line = line.strip()
    except Exception as e:
        _check("E.log_accessible", False, f"log read error: {e}")
    _check("E.worker_log_present", worker_started,
           f"No '🧠 Coach triggers worker started' line in {log_path}")
    if last_line:
        print(f"     last occurrence: {last_line[:160]}")

    # ═════════════════════════════════════════════════════════════════
    # TEST F — Family mapping (direct import)
    # ═════════════════════════════════════════════════════════════════
    print("\n── F) Family mapping (direct import) ──")
    from services import coach_triggers as ct
    _check("F.overspend_groceries_family",
           ct._trigger_family("overspend_groceries") == "overspend",
           f"got {ct._trigger_family('overspend_groceries')!r}")
    _check("F.overspend_food_family",
           ct._trigger_family("overspend_food") == "overspend",
           f"got {ct._trigger_family('overspend_food')!r}")
    _check("F.salary_family_passthrough",
           ct._trigger_family("salary_credited") == "salary_credited",
           f"got {ct._trigger_family('salary_credited')!r}")
    _check("F.overspend_family_12h_cooldown",
           ct.COOLDOWN["overspend"] == timedelta(hours=12),
           f"got {ct.COOLDOWN.get('overspend')!r}")
    _check("F.salary_family_24h_cooldown",
           ct.COOLDOWN["salary_credited"] == timedelta(hours=24),
           f"got {ct.COOLDOWN.get('salary_credited')!r}")

    # ═════════════════════════════════════════════════════════════════
    # Setup: Insert salary credit txn
    # ═════════════════════════════════════════════════════════════════
    print("\n── Setup: inserting salary credit txn ──")
    now = datetime.now(timezone.utc)
    salary_txn = {
        "user_id": user_id,
        "amount": 85000,
        "type": "credit",
        "category": "salary",
        "description": "Monthly salary",
        "date": now,
        "created_at": now,
        "_test_marker": True,
    }
    salary_id = (await db.transactions.insert_one(salary_txn)).inserted_id
    print(f"     salary txn id={salary_id}")

    # ═════════════════════════════════════════════════════════════════
    # TEST A — Regression /api/coach/triggers/check
    # ═════════════════════════════════════════════════════════════════
    print("\n── A) Regression POST /api/coach/triggers/check ──")
    r = requests.post(f"{API}/coach/triggers/check", headers=headers, timeout=30)
    _check("A.status_200", r.status_code == 200,
           f"got {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        _check("A.fired_key_present", "fired" in body,
               f"body keys: {list(body.keys())}")
        fired = body.get("fired", [])
        _check("A.fired_is_list", isinstance(fired, list), f"type={type(fired)}")
        fired_ids = [f.get("id") for f in fired if isinstance(f, dict)]
        _check("A.salary_credited_in_fired", "salary_credited" in fired_ids,
               f"fired ids: {fired_ids}")
        if fired:
            sc = next((f for f in fired if f.get("id") == "salary_credited"), None)
            if sc:
                need = {"id", "title", "body", "deep_link", "severity"}
                _check("A.salary_fire_shape", need.issubset(sc.keys()),
                       f"missing keys: {need - set(sc.keys())}")

    # ═════════════════════════════════════════════════════════════════
    # TEST B — Cooldown for salary_credited
    # ═════════════════════════════════════════════════════════════════
    print("\n── B) Cooldown (direct dispatch_for_user_with_cooldown) ──")

    await db.coach_trigger_history.delete_many({"user_id": user_id})

    # B.1 — First call
    result1 = await ct.dispatch_for_user_with_cooldown(user_id, None)
    print(f"     B.1 result: {result1}")
    hist_doc = await db.coach_trigger_history.find_one(
        {"user_id": user_id, "trigger_id": "salary_credited"}
    )
    _check("B.1.history_doc_created", hist_doc is not None,
           "coach_trigger_history missing salary_credited row")
    if hist_doc:
        _check("B.1.history_delivered_false_no_token",
               hist_doc.get("delivered") is False,
               f"delivered={hist_doc.get('delivered')!r}")
        fa = hist_doc.get("fired_at")
        if fa and fa.tzinfo is None:
            fa = fa.replace(tzinfo=timezone.utc)
        _check("B.1.history_fired_at_recent",
               fa is not None and (datetime.now(timezone.utc) - fa).total_seconds() < 120,
               f"fired_at={fa}")
        _check("B.1.history_user_id_matches", hist_doc.get("user_id") == user_id,
               f"got {hist_doc.get('user_id')!r}")

    # Review-spec return contract
    review_contract_met_1 = "salary_credited" in (result1 or [])
    _check("B.1.return_contains_salary_credited_REVIEW_SPEC",
           review_contract_met_1,
           f"Review says first call should return ['salary_credited'] when push_token=None; "
           f"actual return={result1}. (Code returns only pushed ids, not fired ids.)")

    # B.2 — Immediate second call
    hist_before_2 = await db.coach_trigger_history.find_one(
        {"user_id": user_id, "trigger_id": "salary_credited"}
    )
    result2 = await ct.dispatch_for_user_with_cooldown(user_id, None)
    print(f"     B.2 result: {result2}")
    _check("B.2.second_call_empty", result2 == [],
           f"expected [] (cooldown), got {result2}")
    hist_after_2 = await db.coach_trigger_history.find_one(
        {"user_id": user_id, "trigger_id": "salary_credited"}
    )
    _check("B.2.history_unchanged",
           bool(hist_before_2 and hist_after_2 and
                hist_before_2.get("fired_at") == hist_after_2.get("fired_at")),
           f"fired_at changed: before={hist_before_2.get('fired_at') if hist_before_2 else None} "
           f"after={hist_after_2.get('fired_at') if hist_after_2 else None}")

    # B.3 — Backdate fired_at → fires again
    backdate = datetime.now(timezone.utc) - timedelta(hours=25)
    await db.coach_trigger_history.update_one(
        {"user_id": user_id, "trigger_id": "salary_credited"},
        {"$set": {"fired_at": backdate}},
    )
    result3 = await ct.dispatch_for_user_with_cooldown(user_id, None)
    print(f"     B.3 result: {result3}")
    hist_after_3 = await db.coach_trigger_history.find_one(
        {"user_id": user_id, "trigger_id": "salary_credited"}
    )
    fa3 = hist_after_3.get("fired_at") if hist_after_3 else None
    if fa3 and fa3.tzinfo is None:
        fa3 = fa3.replace(tzinfo=timezone.utc)
    refired = fa3 is not None and (datetime.now(timezone.utc) - fa3).total_seconds() < 120
    _check("B.3.refired_after_backdate", refired,
           f"fired_at after backdate+recall: {fa3} (should be ~now)")

    # ═════════════════════════════════════════════════════════════════
    # TEST C — Overspend cooldown
    # ═════════════════════════════════════════════════════════════════
    print("\n── C) Overspend cooldown (food budget ₹1000, spent ₹1500) ──")

    await db.coach_trigger_history.delete_many({"user_id": user_id})
    await db.transactions.delete_one({"_id": salary_id})

    now2 = datetime.now(timezone.utc)
    budget_id = (await db.budgets.insert_one({
        "user_id": user_id,
        "category": "food",
        "amount": 1000,
        "period": "monthly",
        "created_at": now2,
        "_test_marker": True,
    })).inserted_id
    exp_id = (await db.transactions.insert_one({
        "user_id": user_id,
        "amount": 1500,
        "type": "debit",
        "category": "food",
        "description": "Zomato overspend test",
        "date": now2,
        "created_at": now2,
        "_test_marker": True,
    })).inserted_id

    import calendar as _cal
    days_in_month = _cal.monthrange(now2.year, now2.month)[1]
    days_left = days_in_month - now2.day
    print(f"     days_left_in_month = {days_left}")

    if days_left < 5:
        print("     ⚠️  month-end (days_left<5) — trigger is gated OFF by design.")
        _check("C.skipped_month_end", True,
               "overspend trigger requires >=5 days left in month")
    else:
        result_c1 = await ct.dispatch_for_user_with_cooldown(user_id, None)
        print(f"     C.1 result: {result_c1}")
        hist_c1 = await db.coach_trigger_history.find_one(
            {"user_id": user_id, "trigger_id": "overspend_food"}
        )
        _check("C.1.overspend_food_history_created", hist_c1 is not None,
               "overspend_food history row missing")
        if hist_c1:
            _check("C.1.overspend_delivered_false_no_token",
                   hist_c1.get("delivered") is False,
                   f"delivered={hist_c1.get('delivered')!r}")

        result_c2 = await ct.dispatch_for_user_with_cooldown(user_id, None)
        _check("C.2.second_call_empty_overspend", result_c2 == [],
               f"expected [] (12h cooldown), got {result_c2}")

        backdate_c = datetime.now(timezone.utc) - timedelta(hours=13)
        await db.coach_trigger_history.update_one(
            {"user_id": user_id, "trigger_id": "overspend_food"},
            {"$set": {"fired_at": backdate_c}},
        )
        result_c3 = await ct.dispatch_for_user_with_cooldown(user_id, None)
        print(f"     C.3 result: {result_c3}")
        hist_c3 = await db.coach_trigger_history.find_one(
            {"user_id": user_id, "trigger_id": "overspend_food"}
        )
        fa_c3 = hist_c3.get("fired_at") if hist_c3 else None
        if fa_c3 and fa_c3.tzinfo is None:
            fa_c3 = fa_c3.replace(tzinfo=timezone.utc)
        refired_c = fa_c3 is not None and (datetime.now(timezone.utc) - fa_c3).total_seconds() < 120
        _check("C.3.overspend_refired_after_13h_backdate", bool(refired_c),
               f"fired_at after backdate+recall: {fa_c3}")

    # ═════════════════════════════════════════════════════════════════
    # TEST D — Push delivery (mocked)
    # ═════════════════════════════════════════════════════════════════
    print("\n── D) Push delivery (monkeypatch send_expo_push) ──")

    await db.coach_trigger_history.delete_many({"user_id": user_id})
    await db.transactions.delete_many({"user_id": user_id, "_test_marker": True})
    await db.budgets.delete_many({"user_id": user_id, "_test_marker": True})

    now3 = datetime.now(timezone.utc)
    await db.transactions.insert_one({
        "user_id": user_id,
        "amount": 85000,
        "type": "credit",
        "category": "salary",
        "description": "Monthly salary",
        "date": now3,
        "created_at": now3,
        "_test_marker": True,
    })

    import server as _server_mod
    original = _server_mod.send_expo_push

    async def _mock_push(*args, **kwargs):
        return True

    _server_mod.send_expo_push = _mock_push
    try:
        result_d1 = await ct.dispatch_for_user_with_cooldown(
            user_id, "ExponentPushToken[xxxxxxxxx]"
        )
        print(f"     D.1 result: {result_d1}")
        hist_d1 = await db.coach_trigger_history.find_one(
            {"user_id": user_id, "trigger_id": "salary_credited"}
        )
        _check("D.1.history_created_with_token", hist_d1 is not None,
               "history row missing after push attempt")
        if hist_d1:
            _check("D.1.delivered_true_with_mocked_success",
                   hist_d1.get("delivered") is True,
                   f"delivered={hist_d1.get('delivered')!r}")
        _check("D.1.return_contains_salary_credited",
               "salary_credited" in (result_d1 or []),
               f"expected salary_credited in return, got {result_d1}")
    finally:
        _server_mod.send_expo_push = original

    await db.coach_trigger_history.delete_many({"user_id": user_id})
    result_d2 = await ct.dispatch_for_user_with_cooldown(user_id, None)
    print(f"     D.2 result: {result_d2}")
    hist_d2 = await db.coach_trigger_history.find_one(
        {"user_id": user_id, "trigger_id": "salary_credited"}
    )
    _check("D.2.history_created_no_token", hist_d2 is not None,
           "history row missing when push_token=None")
    if hist_d2:
        _check("D.2.delivered_false_no_token",
               hist_d2.get("delivered") is False,
               f"delivered={hist_d2.get('delivered')!r}")

    result_d3 = await ct.dispatch_for_user_with_cooldown(user_id, None)
    _check("D.3.cooldown_applies_without_token", result_d3 == [],
           f"expected [] (cooldown applies even without delivery), got {result_d3}")

    # ═════════════════════════════════════════════════════════════════
    # CLEANUP
    # ═════════════════════════════════════════════════════════════════
    print("\n── Cleanup ──")
    d1 = await db.transactions.delete_many({"user_id": user_id, "_test_marker": True})
    d2 = await db.budgets.delete_many({"user_id": user_id, "_test_marker": True})
    d3 = await db.coach_trigger_history.delete_many({"user_id": user_id})
    print(f"     transactions deleted: {d1.deleted_count}")
    print(f"     budgets deleted:      {d2.deleted_count}")
    print(f"     history deleted:      {d3.deleted_count}")

    client.close()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception as e:
        import traceback
        traceback.print_exc()
        FAILED.append(("HARNESS_CRASH", str(e)))

    print("\n" + "=" * 70)
    print(f"TOTAL: {len(PASSED) + len(FAILED)}  ·  PASSED: {len(PASSED)}  ·  FAILED: {len(FAILED)}")
    print("=" * 70)
    if FAILED:
        print("\n❌ FAILED ASSERTIONS:")
        for name, detail in FAILED:
            print(f"  • {name}")
            if detail:
                print(f"      {detail}")
        sys.exit(1)
    else:
        print("\n✅ ALL ASSERTIONS PASS")
        sys.exit(0)
