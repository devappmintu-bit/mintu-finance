#!/usr/bin/env python3
"""
Sanity check for /api/coach/chat after R102 prompt tightening.

Test cases:
1. Auth via phone 9111122221 / OTP 123456.
2. POST /api/coach/chat {message:"help me", lang:"en"} — assert shape +
   no banned phrases + reasonable line count.
3. POST /api/coach/chat {message:"where am I overspending?"} — same.
4. POST /api/coach/chat {message:"hi"} — must NOT begin with Hey/Hi.
5. GET  /api/coach/suggestions — returns >=1 chip.
"""
import json
import os
import re
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"

BANNED = [
    "i don't have enough",
    "i dont have enough",
    "general estimate",
    "starter cap",
    "temporary guardrails",
    "baseline",
]

results = []  # (label, passed, detail)

def record(label, passed, detail=""):
    results.append((label, passed, detail))
    flag = "PASS" if passed else "FAIL"
    print(f"  [{flag}] {label}" + (f" — {detail}" if detail else ""))


def auth() -> str:
    # Send OTP first (mock mode auto-accepts 123456)
    r = requests.post(
        f"{BASE}/auth/send-otp",
        json={"phone": "9111122221"},
        timeout=10,
    )
    if r.status_code not in (200, 201):
        print(f"send-otp non-200 status={r.status_code} body={r.text[:300]}")
    r2 = requests.post(
        f"{BASE}/auth/verify-otp",
        json={
            "phone": "9111122221",
            "otp": "123456",
            "device_id": "sanity-cli",
            "device_name": "SanityCLI",
            "os": "web",
        },
        timeout=15,
    )
    if r2.status_code != 200:
        print(f"verify-otp FAIL status={r2.status_code} body={r2.text[:500]}")
        sys.exit(1)
    body = r2.json()
    token = body.get("access_token") or body.get("token")
    if not token:
        print(f"No access_token in verify-otp body: {body}")
        sys.exit(1)
    return token


def check_reply(reply: str, label: str, max_lines: int = 6):
    # non-empty
    record(f"{label} :: reply non-empty", bool(reply and reply.strip()), f"len={len(reply or '')}")

    low = (reply or "").lower()
    for phrase in BANNED:
        present = phrase in low
        record(f"{label} :: no banned '{phrase}'", not present,
               f"contained='{phrase}'" if present else "")

    lines = [ln for ln in (reply or "").splitlines() if ln.strip()]
    record(f"{label} :: line count <= {max_lines}", len(lines) <= max_lines,
           f"actual_lines={len(lines)}")


def main():
    print("=== R102 Coach Chat Sanity Test ===")
    print(f"BASE={BASE}\n")

    print("[1] Auth flow")
    token = auth()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    record("auth :: token issued", bool(token), f"token_len={len(token)}")

    # Test 2 — "help me"
    print("\n[2] POST /coach/chat 'help me'")
    r = requests.post(f"{BASE}/coach/chat", json={"message": "help me", "lang": "en"},
                      headers=headers, timeout=30)
    record("T2 :: status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        # shape
        record("T2 :: 'reply' is string",
               isinstance(body.get("reply"), str), f"type={type(body.get('reply')).__name__}")
        record("T2 :: 'actions' is list",
               isinstance(body.get("actions"), list))
        record("T2 :: 'confidence_label' present",
               "confidence_label" in body)
        record("T2 :: 'source' present", "source" in body)
        reply = body.get("reply", "")
        print(f"    actual reply (240 chars): {reply[:240]!r}")
        check_reply(reply, "T2")

    # Test 3 — overspending
    print("\n[3] POST /coach/chat 'where am I overspending?'")
    r = requests.post(f"{BASE}/coach/chat", json={"message": "where am I overspending?"},
                      headers=headers, timeout=30)
    record("T3 :: status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        reply = body.get("reply", "")
        print(f"    actual reply (240 chars): {reply[:240]!r}")
        check_reply(reply, "T3")

    # Test 4 — "hi" must not start with greeting
    print("\n[4] POST /coach/chat 'hi'")
    r = requests.post(f"{BASE}/coach/chat", json={"message": "hi"}, headers=headers, timeout=30)
    record("T4 :: status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        reply = body.get("reply", "")
        print(f"    actual reply (240 chars): {reply[:240]!r}")
        first_line = (reply.strip().splitlines()[0] if reply.strip() else "").strip()
        first_word = first_line.split()[0].rstrip(",.!:;") if first_line else ""
        bad_greeting = first_word.lower() in {"hey", "hi", "hello", "namaste"}
        record("T4 :: no 'Hey'/'Hi' greeting at start",
               not bad_greeting, f"first_word={first_word!r}")
        check_reply(reply, "T4")

    # Test 5 — suggestions
    print("\n[5] GET /coach/suggestions")
    r = requests.get(f"{BASE}/coach/suggestions", headers=headers, timeout=20)
    record("T5 :: status 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        sug = body.get("suggestions")
        record("T5 :: 'suggestions' is list", isinstance(sug, list))
        record("T5 :: at least 1 chip", isinstance(sug, list) and len(sug) >= 1,
               f"count={len(sug) if isinstance(sug, list) else 'N/A'}")
        if isinstance(sug, list):
            for i, s in enumerate(sug):
                print(f"    chip[{i}]: {s!r}")

    # Summary
    passed = sum(1 for _, p, _ in results if p)
    total = len(results)
    print("\n" + "=" * 50)
    print(f"SUMMARY: {passed}/{total} assertions passed")
    failed = [(l, d) for (l, p, d) in results if not p]
    if failed:
        print("\nFAILED:")
        for l, d in failed:
            print(f"  ✗ {l}  ({d})")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
