"""Round 88 — Auth V2 backend tests.

Validates:
  • Legacy verify-otp (no device_id) still issues only `token` (legacy 30d JWT).
  • New verify-otp (with device_id/device_name/os) issues access_token + refresh_token + device_id + is_trusted_device.
  • /auth/refresh rotates refresh_token, returns new access_token.
  • Old refresh tokens (after rotation) are 401.
  • Reuse-defense → whole family revoked.
  • /auth/logout idempotent.
  • GET /auth/me returns user/sessions/devices.
  • /auth/logout-all invalidates all sessions.
  • Negative cases (422 for empty/short, 401 for bogus 64-char).
  • Regression — legacy JWT still authenticates.

Run: python /app/round88_auth_v2_test.py
"""
import asyncio
import json
import os
import secrets
import sys
import time
from typing import Any, Dict, Optional

import aiohttp
import jwt as pyjwt
from motor.motor_asyncio import AsyncIOMotorClient

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"
JWT_SECRET = "mintu_super_secret_key_2025_change_in_production"

# Track results: list of (scenario, status_emoji, msg)
results: list = []
DEBUG: list = []


def report(scenario: str, ok: bool, msg: str = ""):
    emoji = "✅" if ok else "❌"
    print(f"{emoji} [{scenario}] {msg}")
    results.append((scenario, ok, msg))


async def post(session: aiohttp.ClientSession, path: str, *, json_body=None, headers=None) -> tuple[int, Any]:
    url = BASE + path
    async with session.post(url, json=json_body, headers=headers or {}) as r:
        try:
            data = await r.json()
        except Exception:
            data = await r.text()
        return r.status, data


async def get(session: aiohttp.ClientSession, path: str, *, headers=None) -> tuple[int, Any]:
    url = BASE + path
    async with session.get(url, headers=headers or {}) as r:
        try:
            data = await r.json()
        except Exception:
            data = await r.text()
        return r.status, data


async def send_and_verify(session, *, with_device: bool = False, device_id: Optional[str] = None,
                          device_name: Optional[str] = None, os_name: Optional[str] = None) -> Dict:
    # Retry on 429 (rate-limit; 30s window between OTPs)
    for attempt in range(4):
        s, d = await post(session, "/auth/send-otp", json_body={"phone": PHONE})
        if s == 200:
            break
        if s == 429:
            print(f"   send-otp rate-limited; sleeping 32s (attempt {attempt + 1})")
            await asyncio.sleep(32)
            continue
        raise RuntimeError(f"send-otp failed: {s} {d}")
    else:
        raise RuntimeError(f"send-otp still failing after retries: {s} {d}")
    body = {"phone": PHONE, "otp": OTP}
    if with_device:
        body.update({
            "device_id": device_id or f"test-dev-{secrets.token_hex(4)}",
            "device_name": device_name or "PixelTest",
            "os": os_name or "android",
        })
    s, d = await post(session, "/auth/verify-otp", json_body=body)
    if s != 200:
        raise RuntimeError(f"verify-otp failed: {s} {d}")
    return d


async def scenario_1_legacy(session):
    """Legacy verify-otp (no device_id) → 200 with `token` ONLY."""
    # Retry on rate-limit
    for attempt in range(4):
        s, d = await post(session, "/auth/send-otp", json_body={"phone": PHONE})
        if s == 200:
            break
        if s == 429:
            print(f"   send-otp rate-limited; sleeping 32s")
            await asyncio.sleep(32)
            continue
        break
    report("S1.send_otp", s == 200, f"status={s}")
    s, d = await post(session, "/auth/verify-otp", json_body={"phone": PHONE, "otp": OTP})
    report("S1.verify_otp_status", s == 200, f"status={s}")
    has_token = "token" in d
    no_access = "access_token" not in d
    no_refresh = "refresh_token" not in d
    report("S1.legacy_token_only", has_token and no_access and no_refresh,
           f"token={'token' in d} access_token={'access_token' in d} refresh_token={'refresh_token' in d}")
    return d.get("token")


async def scenario_2_new_verify(session):
    """New verify-otp with device fields."""
    dev_id = "test-dev-jun03-A"
    d = await send_and_verify(session, with_device=True, device_id=dev_id,
                               device_name="PixelTest", os_name="android")
    keys_present = all(k in d for k in ("token", "access_token", "access_expires_in",
                                          "refresh_token", "device_id", "is_trusted_device"))
    report("S2.keys_present", keys_present, f"keys={list(d.keys())}")
    report("S2.is_trusted_device", d.get("is_trusted_device") is True,
           f"is_trusted_device={d.get('is_trusted_device')}")
    report("S2.device_id_match", d.get("device_id") == dev_id, f"device_id={d.get('device_id')}")

    # Decode access_token
    try:
        payload = pyjwt.decode(d["access_token"], JWT_SECRET, algorithms=["HS256"])
        sub = payload.get("sub")
        scope = payload.get("scope")
        exp = payload.get("exp", 0)
        now = int(time.time())
        delta = exp - now
        # ~15 minutes
        report("S2.jwt_decode_ok", True, f"sub={sub} scope={scope} exp_in={delta}s")
        report("S2.jwt_sub_user_id", sub == d["user"]["id"], f"sub={sub} user_id={d['user']['id']}")
        report("S2.jwt_exp_15min", 14 * 60 <= delta <= 16 * 60, f"exp_in={delta}s (expected ~900)")
        report("S2.jwt_scope_access", scope == "access", f"scope={scope}")
    except Exception as e:
        report("S2.jwt_decode_ok", False, f"error: {e}")

    return d


async def scenario_3_refresh_happy(session, ctx):
    """/auth/refresh — new tokens; old refresh fails."""
    old_refresh = ctx["refresh_token"]
    s, d = await post(session, "/auth/refresh", json_body={"refresh_token": old_refresh})
    report("S3.refresh_status_200", s == 200, f"status={s} body={str(d)[:200]}")
    if s != 200:
        return None
    new_refresh = d.get("refresh_token")
    new_access = d.get("access_token")
    report("S3.has_new_refresh", bool(new_refresh) and new_refresh != old_refresh,
           f"different={new_refresh != old_refresh}")
    report("S3.has_new_access", bool(new_access), f"access_token_len={len(new_access) if new_access else 0}")

    # Re-present OLD refresh → 401 (and triggers reuse-defense which revokes family)
    s2, d2 = await post(session, "/auth/refresh", json_body={"refresh_token": old_refresh})
    report("S3.old_refresh_now_401", s2 == 401, f"status={s2}")

    # IMPORTANT: re-presenting old refresh just triggered REUSE detection,
    # so the new_refresh is ALSO now revoked (entire family). For Scenario 3
    # alone we just need to verify the rotation worked.
    return {"new_refresh": new_refresh, "new_access": new_access, "user_id": ctx["user"]["id"]}


async def scenario_4_reuse_defense(session):
    """Mint NEW session → rotate once → re-present old (revoked) → 401 → AND new (rotated) refresh from family also revoked."""
    d = await send_and_verify(session, with_device=True, device_id="test-dev-jun03-B",
                               device_name="PixelTest-B", os_name="android")
    rt0 = d["refresh_token"]
    # First refresh — success
    s, d1 = await post(session, "/auth/refresh", json_body={"refresh_token": rt0})
    report("S4.first_refresh_200", s == 200, f"status={s}")
    if s != 200:
        return
    rt1 = d1["refresh_token"]
    # Second refresh with OLD rt0 → 401, triggers family revoke
    s, d2 = await post(session, "/auth/refresh", json_body={"refresh_token": rt0})
    report("S4.reused_old_401", s == 401, f"status={s}")
    # Now the NEW refresh rt1 should ALSO be 401 (family revoked)
    s, d3 = await post(session, "/auth/refresh", json_body={"refresh_token": rt1})
    report("S4.family_revoked_new_401", s == 401, f"status={s} body={str(d3)[:120]}")


async def scenario_5_logout_idempotent(session):
    """Mint fresh session → logout → logout again → /auth/refresh → 401."""
    d = await send_and_verify(session, with_device=True, device_id="test-dev-jun03-C",
                               device_name="PixelTest-C", os_name="android")
    rt = d["refresh_token"]
    s, d1 = await post(session, "/auth/logout", json_body={"refresh_token": rt})
    report("S5.logout_first_200", s == 200, f"status={s} body={d1}")
    report("S5.logout_revoked_true", d1.get("revoked") is True, f"revoked={d1.get('revoked')}")

    s, d2 = await post(session, "/auth/logout", json_body={"refresh_token": rt})
    report("S5.logout_second_200", s == 200, f"status={s} body={d2}")
    report("S5.logout_revoked_false", d2.get("revoked") is False, f"revoked={d2.get('revoked')}")

    s, d3 = await post(session, "/auth/refresh", json_body={"refresh_token": rt})
    report("S5.refresh_after_logout_401", s == 401, f"status={s}")


async def scenario_6_me(session, ctx):
    """GET /auth/me with access_token from #2."""
    headers = {"Authorization": f"Bearer {ctx['access_token']}"}
    s, d = await get(session, "/auth/me", headers=headers)
    report("S6.me_status_200", s == 200, f"status={s} body={str(d)[:200]}")
    if s != 200:
        return
    user = d.get("user", {})
    fields_ok = all(k in user for k in ("id", "phone", "name", "money_score", "created_at"))
    report("S6.user_fields", fields_ok, f"user_keys={list(user.keys())}")
    sessions = d.get("sessions", [])
    devices = d.get("devices", [])
    report("S6.sessions_list", isinstance(sessions, list) and len(sessions) >= 1,
           f"sessions_count={len(sessions)}")
    dev_match = any(dev.get("device_id") == "test-dev-jun03-A" and dev.get("is_trusted") is True for dev in devices)
    report("S6.device_trusted", dev_match,
           f"devices={[(d.get('device_id'), d.get('is_trusted')) for d in devices][:5]}")
    report("S6.access_token_ttl_900", d.get("access_token_ttl_seconds") == 900,
           f"ttl={d.get('access_token_ttl_seconds')}")


async def scenario_7_logout_all(session):
    """Mint fresh session → /auth/logout-all → /auth/refresh on prior token → 401."""
    d = await send_and_verify(session, with_device=True, device_id="test-dev-jun03-D",
                               device_name="PixelTest-D", os_name="android")
    access = d["access_token"]
    rt = d["refresh_token"]
    headers = {"Authorization": f"Bearer {access}"}
    s, body = await post(session, "/auth/logout-all", headers=headers)
    report("S7.logout_all_200", s == 200, f"status={s} body={body}")
    n = body.get("revoked", 0) if isinstance(body, dict) else 0
    report("S7.logout_all_revoked_n", isinstance(n, int) and n >= 1, f"revoked={n}")

    s2, body2 = await post(session, "/auth/refresh", json_body={"refresh_token": rt})
    report("S7.refresh_after_logoutall_401", s2 == 401, f"status={s2}")


async def scenario_8_negative(session):
    """Negative cases."""
    # Empty refresh_token → 422
    s, d = await post(session, "/auth/refresh", json_body={"refresh_token": ""})
    report("S8.empty_refresh_422", s == 422, f"status={s}")
    # 64-char garbage → 401
    garbage = secrets.token_hex(32)  # 64 hex chars
    s, d = await post(session, "/auth/refresh", json_body={"refresh_token": garbage})
    report("S8.garbage_64char_401", s == 401, f"status={s}")
    # Empty body → 422
    s, d = await post(session, "/auth/refresh", json_body={})
    report("S8.empty_body_422", s == 422, f"status={s}")


async def scenario_9_regression(session):
    """Legacy verify-otp issues 30d JWT → still authenticates against /auth/me + /transactions."""
    d = await send_and_verify(session, with_device=False)
    legacy_token = d.get("token")
    report("S9.legacy_jwt_present", bool(legacy_token), f"token_len={len(legacy_token) if legacy_token else 0}")
    headers = {"Authorization": f"Bearer {legacy_token}"}
    s, body = await get(session, "/auth/me", headers=headers)
    report("S9.legacy_jwt_auth_me_200", s == 200, f"status={s}")
    s, body = await get(session, "/transactions", headers=headers)
    report("S9.legacy_jwt_txns_200", s == 200, f"status={s} body_type={type(body).__name__}")


async def db_verify():
    mongo_url = "mongodb://localhost:27017"
    client = AsyncIOMotorClient(mongo_url)
    db = client["mintu_database"]
    n_active = await db.sessions.count_documents({"revoked_at": None})
    n_revoked = await db.sessions.count_documents({"revoked_at": {"$ne": None}})
    n_trusted_devices = await db.devices.count_documents({"is_trusted": True})
    print(f"\nDB: sessions active={n_active}, revoked={n_revoked}; devices trusted={n_trusted_devices}")
    return n_active, n_revoked, n_trusted_devices


async def main():
    async with aiohttp.ClientSession() as session:
        print("\n=== Scenario 1: Legacy verify-otp ===")
        await scenario_1_legacy(session)

        print("\n=== Scenario 2: New verify-otp (with device fields) ===")
        ctx = await scenario_2_new_verify(session)

        print("\n=== Scenario 6: GET /auth/me (run early to capture fresh session) ===")
        await scenario_6_me(session, ctx)

        print("\n=== Scenario 3: /auth/refresh happy path ===")
        await scenario_3_refresh_happy(session, ctx)

        print("\n=== Scenario 4: Refresh-reuse defense ===")
        await scenario_4_reuse_defense(session)

        print("\n=== Scenario 5: Logout idempotency ===")
        await scenario_5_logout_idempotent(session)

        print("\n=== Scenario 7: /auth/logout-all ===")
        await scenario_7_logout_all(session)

        print("\n=== Scenario 8: Negative cases ===")
        await scenario_8_negative(session)

        print("\n=== Scenario 9: Regression (legacy JWT) ===")
        await scenario_9_regression(session)

    await db_verify()

    # Final summary
    print("\n" + "=" * 70)
    print("ROUND 88 AUTH V2 — FINAL SUMMARY")
    print("=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"Total: {len(results)}  Passed: {passed}  Failed: {failed}")
    if failed:
        print("\nFAILED:")
        for s, ok, msg in results:
            if not ok:
                print(f"  ❌ {s} :: {msg}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
