"""R100R — Verify new `source` field on POST /api/coach/chat."""
import asyncio
import json
import httpx
import time

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE_WITH_DATA = "9876543210"  # has seeded transactions this month
OTP = "123456"


async def _login(client, phone, skip_send=False):
    if not skip_send:
        r = await client.post(f"{BASE}/auth/send-otp", json={"phone": phone})
        print(f"  send-otp({phone}) → {r.status_code}")
        # Accept 429 (rate-limit) — static mock OTP 123456 works anyway.
        if r.status_code not in (200, 429):
            assert False, r.text
    r = await client.post(
        f"{BASE}/auth/verify-otp",
        json={
            "phone": phone,
            "otp": OTP,
            "name": "Test R100R User",
            "device_id": "cli-r100r",
            "device_name": "CLI R100R",
            "os": "web",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token: {data}"
    return tok


async def _chat(client, token, msg):
    r = await client.post(
        f"{BASE}/coach/chat",
        json={"message": msg},
        headers={"Authorization": f"Bearer {token}"},
        timeout=60.0,
    )
    return r


async def main():
    results = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        # ── Scenario 1: user WITH transactions ──
        print("\n=== Scenario 1: user with transactions ===")
        tok_data = await _login(client, PHONE_WITH_DATA)

        # Ensure the user has ≥1 transaction this month (DB may be cleared).
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        seed_txns = [
            {"amount": 450, "category": "food", "type": "debit", "description": "Swiggy order", "date": now_iso},
            {"amount": 1200, "category": "shopping", "type": "debit", "description": "Myntra", "date": now_iso},
            {"amount": 85000, "category": "salary", "type": "credit", "description": "Monthly salary", "date": now_iso},
        ]
        for tx in seed_txns:
            rs = await client.post(
                f"{BASE}/transactions",
                json=tx,
                headers={"Authorization": f"Bearer {tok_data}"},
            )
            print(f"  seed txn {tx['category']}/{tx['amount']} → {rs.status_code}")

        r = await _chat(client, tok_data, "Where am I overspending?")
        print(f"  status={r.status_code}")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        print(f"  keys={list(body.keys())}")
        print(f"  reply[:100]={body.get('reply','')[:100]}")
        print(f"  confidence={body.get('confidence')}")
        print(f"  confidence_label={body.get('confidence_label')!r}")
        print(f"  source={body.get('source')!r}")
        print(f"  actions_len={len(body.get('actions', []))}")
        print(f"  suggestions_len={len(body.get('suggestions', []))}")

        # Required field checks
        for k in ("reply", "confidence", "confidence_label", "source", "actions", "suggestions"):
            assert k in body, f"Missing field: {k}"
            results.append((f"S1.has_{k}", True))
        assert isinstance(body["reply"], str), "reply must be str"
        assert isinstance(body["confidence"], (int, float)), "confidence must be numeric"
        assert 0.0 <= body["confidence"] <= 1.0, f"confidence out of range: {body['confidence']}"
        assert isinstance(body["confidence_label"], str)
        assert isinstance(body["source"], str), "source must be str"
        assert isinstance(body["actions"], list)
        assert isinstance(body["suggestions"], list)
        results.append(("S1.shape_ok", True))

        src = body["source"]
        if src == "":
            print("  ⚠️ source is empty — does user actually have txns this month?")
            results.append(("S1.source_nonempty", False))
        else:
            results.append(("S1.source_nonempty", True))
            has_txn_kw = "transaction" in src.lower()
            results.append(("S1.source_contains_transaction", has_txn_kw))
            print(f"  ✅ source contains 'transaction': {has_txn_kw}")

        # ── Scenario 2: fresh user with NO transactions ──
        print("\n=== Scenario 2: fresh user with no transactions ===")
        fresh_phone = f"9{int(time.time()) % 1_000_000_000:09d}"
        # Ensure 10 digits starting with 9
        fresh_phone = "9" + fresh_phone[-9:]
        print(f"  fresh_phone={fresh_phone}")
        try:
            tok_fresh = await _login(client, fresh_phone)
            r2 = await _chat(client, tok_fresh, "Where am I overspending?")
            print(f"  status={r2.status_code}")
            assert r2.status_code == 200, f"Expected 200, got {r2.status_code}: {r2.text}"
            body2 = r2.json()
            print(f"  source={body2.get('source')!r}")
            print(f"  confidence={body2.get('confidence')}")
            print(f"  confidence_label={body2.get('confidence_label')!r}")
            for k in ("reply", "confidence", "confidence_label", "source", "actions", "suggestions"):
                assert k in body2, f"Missing: {k}"
            results.append(("S2.shape_ok", True))
            if body2["source"] == "":
                results.append(("S2.source_empty_for_no_data", True))
                print("  ✅ source is empty string for no-data user")
            else:
                results.append(("S2.source_empty_for_no_data", False))
                print(f"  ❌ expected empty source for no-data, got: {body2['source']!r}")
        except Exception as e:
            print(f"  ⚠️ fresh user scenario error: {e}")
            results.append(("S2.exception", False))

        # ── Scenario 3: No 500s on varied messages for the data user ──
        print("\n=== Scenario 3: no 500s on multiple messages ===")
        msgs = [
            "Am I saving enough?",
            "Help me set a food budget",
            "hi",
            "What's my biggest spend?",
        ]
        for m in msgs:
            r3 = await _chat(client, tok_data, m)
            ok = r3.status_code == 200
            results.append((f"S3.nonfatal[{m[:20]}]", ok))
            print(f"  msg={m[:30]!r} → {r3.status_code}")
            if ok:
                b3 = r3.json()
                assert "source" in b3, "source missing"
                print(f"    source={b3.get('source')!r}")

    print("\n━━━━━━━━━━━━━━━━ SUMMARY ━━━━━━━━━━━━━━━━")
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    for name, ok in results:
        print(f"  {'✅' if ok else '❌'} {name}")
    print(f"\n  {passed}/{total} assertions passed")
    return passed == total


if __name__ == "__main__":
    ok = asyncio.run(main())
    exit(0 if ok else 1)
