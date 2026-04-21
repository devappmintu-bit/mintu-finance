"""
Auth Relocation Regression Test — Apr 21 2026
Verifies that routers/auth.py extraction from server.py preserved 100% behavioural equivalence.

Focus areas (per review request):
  1. send-otp validation + happy path + rate limit
  2. verify-otp correct / wrong / expired / too many attempts
  3. resend-otp behaviour
  4. register duplicate / new
  5. login wrong creds
  6. JWT chain → 5 protected endpoints across different routers
  7. Invalid Authorization headers → 401 (not 500)
  8. Spot-check unrelated endpoints for collateral breakage (IDOR/NaN/SQLi/rate-limit)
"""
import asyncio
import json
import os
import time
import aiohttp

BASE = os.environ.get("BASE_URL", "https://mintu-finance.preview.emergentagent.com/api")
PHONE_A = "9876543210"
PHONE_B = "9988776655"
OTP = "123456"

results = []  # (name, pass_bool, detail)


def rec(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    tag = "✅" if ok else "❌"
    print(f"{tag} {name}  {detail}")


async def _post(session, path, body=None, headers=None, timeout=30):
    try:
        async with session.post(f"{BASE}{path}", json=body, headers=headers or {}, timeout=aiohttp.ClientTimeout(total=timeout)) as r:
            txt = await r.text()
            try:
                j = json.loads(txt)
            except Exception:
                j = {"_raw": txt}
            return r.status, j
    except Exception as e:
        return 0, {"_exc": str(e)}


async def _get(session, path, headers=None, timeout=30):
    try:
        async with session.get(f"{BASE}{path}", headers=headers or {}, timeout=aiohttp.ClientTimeout(total=timeout)) as r:
            txt = await r.text()
            try:
                j = json.loads(txt)
            except Exception:
                j = {"_raw": txt}
            return r.status, j
    except Exception as e:
        return 0, {"_exc": str(e)}


async def wait_rate_limit(seconds=31):
    """Wait out the 30s send-otp rate limit."""
    print(f"⏳ Waiting {seconds}s for OTP rate-limit window to clear...")
    await asyncio.sleep(seconds)


async def main():
    async with aiohttp.ClientSession() as s:
        # ═══════════════════════════════════════════════════════════════
        # 1. send-otp VALIDATION CORNER CASES
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 1. send-otp validation corner cases ━━━")
        corner_cases = [
            ("0000000000",                    "all zeros (Round3 regression)"),
            ("٩٨٧٦٥٤٣٢١٠",                   "Arabic-Indic digits"),
            ("5876543210",                    "<6 prefix (5)"),
            ("98765",                         "wrong length (too short)"),
            ("98765432109876",                "wrong length (too long)"),
            ("98765🚀3210",                   "emoji embedded"),
            ("' OR 1=1 --",                   "SQL injection attempt"),
            ("<script>alert(1)</script>",     "XSS attempt"),
        ]
        for phone, label in corner_cases:
            code, body = await _post(s, "/auth/send-otp", {"phone": phone})
            ok = code == 400
            rec(f"send-otp REJECTS [{label}]", ok, f"got {code} {str(body)[:80]}")

        # ═══════════════════════════════════════════════════════════════
        # 2. send-otp HAPPY PATH (phoneA) + RATE LIMIT
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 2. send-otp happy path + rate limit ━━━")
        # Wait a bit in case recent test activity
        await asyncio.sleep(2)
        code, body = await _post(s, "/auth/send-otp", {"phone": PHONE_A})
        if code == 429:
            # If rate-limited from prior run, wait and retry
            await wait_rate_limit(31)
            code, body = await _post(s, "/auth/send-otp", {"phone": PHONE_A})
        rec("send-otp happy path phoneA → 200", code == 200, f"got {code}")

        # Immediate 2nd call → 429 (rate limit)
        code, body = await _post(s, "/auth/send-otp", {"phone": PHONE_A})
        rec("send-otp rate limit (30s window) → 429", code == 429, f"got {code}")

        # ═══════════════════════════════════════════════════════════════
        # 3. verify-otp — WRONG OTP, CORRECT OTP, RESEND
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 3. verify-otp wrong → correct → resend ━━━")
        # (a) wrong OTP — should return 400 with "attempts remaining"
        code, body = await _post(s, "/auth/verify-otp", {"phone": PHONE_A, "otp": "999999"})
        msg = body.get("detail", "")
        ok = code == 400 and "remain" in msg.lower()
        rec("verify-otp wrong OTP → 400 w/ attempts remaining msg", ok, f"got {code} | detail='{msg}'")

        # (b) correct OTP — should return 200 with token (phoneA exists)
        code, body = await _post(s, "/auth/verify-otp", {"phone": PHONE_A, "otp": OTP})
        token_a = body.get("token")
        ok = code == 200 and isinstance(token_a, str) and len(token_a) > 20
        rec("verify-otp correct OTP → 200 with JWT token", ok, f"got {code} | has_token={bool(token_a)}")

        # (c) resend-otp — must behave identically. Wait out rate-limit first.
        await wait_rate_limit(31)
        code, body = await _post(s, "/auth/resend-otp", {"phone": PHONE_A})
        rec("resend-otp happy path phoneA → 200", code == 200, f"got {code}")

        # (d) resend-otp rejects invalid phones
        code, body = await _post(s, "/auth/resend-otp", {"phone": "0000000000"})
        rec("resend-otp rejects invalid phone → 400", code == 400, f"got {code}")

        # ═══════════════════════════════════════════════════════════════
        # 4. verify-otp: 3 failed attempts → "Too many"
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 4. verify-otp too many attempts ━━━")
        # Currently phoneA has an active OTP record from (c). Burn 3 wrong attempts.
        too_many_hit = False
        last_code, last_msg = None, None
        for i in range(4):
            code, body = await _post(s, "/auth/verify-otp", {"phone": PHONE_A, "otp": "111111"})
            msg = body.get("detail", "")
            last_code, last_msg = code, msg
            if "too many" in msg.lower() or "request a new" in msg.lower():
                too_many_hit = True
                break
        rec("verify-otp after ≥3 failed → 400 'Too many'", too_many_hit and last_code == 400,
            f"final={last_code} | '{last_msg}'")

        # ═══════════════════════════════════════════════════════════════
        # 5. verify-otp expired / not-found
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 5. verify-otp expired / not-found ━━━")
        # After the too-many branch deletes the record, next verify → "expired/not found"
        code, body = await _post(s, "/auth/verify-otp", {"phone": PHONE_A, "otp": OTP})
        msg = body.get("detail", "")
        ok = code == 400 and ("expired" in msg.lower() or "not found" in msg.lower())
        rec("verify-otp with no active record → 400 'expired/not found'", ok, f"got {code} | '{msg}'")

        # ═══════════════════════════════════════════════════════════════
        # 6. REGISTER duplicate / new-phone path
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 6. register duplicate + new phone ━━━")
        # (a) register duplicate phone (phoneA exists) → 400
        code, body = await _post(s, "/auth/register", {
            "phone": PHONE_A, "name": "Duplicate Test", "password": "somepw123",
        })
        rec("register duplicate phone → 400", code == 400, f"got {code} | {body.get('detail','')}")

        # (b) register brand-new phone → 200 with token
        import random
        new_phone = "7" + "".join([str(random.randint(0, 9)) for _ in range(9)])
        code, body = await _post(s, "/auth/register", {
            "phone": new_phone, "name": "Fresh Regression User", "password": "freshpw123",
        })
        token_fresh = body.get("token")
        ok = code == 200 and isinstance(token_fresh, str) and len(token_fresh) > 20
        rec("register new phone → 200 + token", ok, f"got {code} | has_token={bool(token_fresh)}")

        # ═══════════════════════════════════════════════════════════════
        # 7. LOGIN wrong creds
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 7. login wrong creds ━━━")
        code, body = await _post(s, "/auth/login", {
            "phone": PHONE_A, "password": "definitely_wrong_password_xyz"
        })
        rec("login wrong creds → 401", code == 401, f"got {code}")

        # ═══════════════════════════════════════════════════════════════
        # 8. JWT CHAIN — 5 protected endpoints across different routers
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 8. JWT chain across 5 routers ━━━")
        if not token_a:
            rec("JWT chain skipped — no token from verify-otp", False, "token_a is None")
        else:
            auth_h = {"Authorization": f"Bearer {token_a}"}
            protected = [
                ("GET", "/user/me"),
                ("GET", "/transactions"),
                ("GET", "/budgets"),
                ("GET", "/split/groups"),
                ("POST", "/ai/chat", {"message": "Give me a short 2-line tip"}),
            ]
            for entry in protected:
                method = entry[0]
                path = entry[1]
                if method == "GET":
                    code, body = await _get(s, path, headers=auth_h, timeout=60)
                else:
                    payload = entry[2] if len(entry) > 2 else {}
                    code, body = await _post(s, path, payload, headers=auth_h, timeout=120)
                rec(f"JWT chain {method} {path} → 200", code == 200, f"got {code}")

        # ═══════════════════════════════════════════════════════════════
        # 9. INVALID Authorization headers → 401 (not 500)
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 9. Invalid Authorization headers ━━━")
        invalid_headers = [
            {"Authorization": "InvalidStuff"},
            {"Authorization": "Bearer "},
            {"Authorization": "Bearer not.a.real.jwt"},
            # JWT with missing user_id (sub) — crafted valid-looking but sub=None
            {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTl9.invalid_sig"},
        ]
        for hdr in invalid_headers:
            code, body = await _get(s, "/user/me", headers=hdr)
            label = hdr["Authorization"][:40]
            ok = code == 401
            rec(f"Invalid Auth [{label}] → 401 (not 500)", ok, f"got {code}")

        # ═══════════════════════════════════════════════════════════════
        # 10. COLLATERAL SPOT-CHECK on unrelated routers
        # ═══════════════════════════════════════════════════════════════
        print("\n━━━ 10. Collateral spot-checks (IDOR / NaN / SQLi / malformed) ━━━")
        if token_a:
            auth_h = {"Authorization": f"Bearer {token_a}"}

            # 10a. NaN budget amount → 422 (Round3 hardening)
            code, body = await _post(s, "/budgets", {
                "category": "Food", "amount": float("nan") if False else "NaN", "period": "monthly"
            }, headers=auth_h)
            # Note: JSON.dumps can't serialize NaN; send as invalid payload via raw
            rec("budgets NaN amount → 4xx (not 500)", 400 <= code < 500, f"got {code}")

            # 10b. SQL injection in transaction description → safely stored as string (200)
            code, body = await _post(s, "/transactions", {
                "amount": 100.0,
                "category": "Other",
                "type": "debit",
                "description": "'; DROP TABLE users; --",
                "date": "2026-04-21"
            }, headers=auth_h)
            rec("transactions SQLi in description → 200 (stored safe)", code == 200, f"got {code}")

            # 10c. Bad ObjectId on DELETE /transactions/{id} → 400 (Round3 hardening)
            code, body = await _get(s, "/transactions", headers=auth_h)
            # Use an obviously invalid hex
            import aiohttp as _ah
            async with _ah.ClientSession() as s2:
                async with s2.delete(f"{BASE}/transactions/not-a-hex-id", headers=auth_h) as r:
                    del_code = r.status
            rec("DELETE /transactions/bad-id → 400 (not 500)", del_code == 400, f"got {del_code}")

            # 10d. IDOR: try to read B's (non-existent) group by fake ObjectId → 404 (not 500)
            code, body = await _get(s, "/split/groups/507f1f77bcf86cd799439011/manage", headers=auth_h)
            ok = code in (403, 404)
            rec("IDOR /split/groups/{fake_oid}/manage → 403/404 (not 500)", ok, f"got {code}")

            # 10e. Rate-limit spot-check on an unrelated endpoint — 5× rapid /user/me
            codes = []
            for _ in range(5):
                c, _ = await _get(s, "/user/me", headers=auth_h)
                codes.append(c)
            all_ok = all(c == 200 for c in codes)
            rec("5× rapid /user/me → all 200 (no collateral rate-limit breakage)", all_ok, f"got {codes}")
        else:
            rec("Collateral spot-checks skipped — no auth token", False, "token_a is None")

    # ═══════════════════════════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════════════════════════
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = total - passed
    print("\n" + "═" * 72)
    print(f"TOTAL: {total} | PASS: {passed} | FAIL: {failed}")
    print("═" * 72)
    if failed:
        print("\nFAILED ASSERTIONS:")
        for n, ok, d in results:
            if not ok:
                print(f"  ❌ {n}  —  {d}")
    return passed, failed, total


if __name__ == "__main__":
    p, f, t = asyncio.run(main())
    exit(0 if f == 0 else 1)
