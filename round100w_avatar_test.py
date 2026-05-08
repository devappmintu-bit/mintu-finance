"""R100W Avatar Resize Pipeline + R100R Coach /chat shape regression test.

Tests:
  1. POST /api/user/avatar with ~150KB PNG base64 → response avatar <15KB
  2. GET /api/user/avatar before AND after — same content, smaller payload
  3. POST /api/user/avatar with empty string → idempotent removal
  4. Edge case: malformed base64 → graceful fallback (stores original, no 500)
  5. POST /api/coach/chat → shape regression check
  6. Auth flow uses phone 9876543210 + OTP 123456 (mock_mode)
"""
import base64
import io
import os
import sys
import json
import requests
from PIL import Image

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []

def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}: {detail}")
    results.append((name, ok, detail))

def auth_token():
    r1 = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r1.status_code == 200, r1.text
    r2 = requests.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": PHONE, "otp": OTP, "device_id": "cli", "device_name": "CLI", "os": "web"},
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    js = r2.json()
    return js.get("access_token") or js.get("token")


def make_png_data_uri(target_kb=150):
    """Build a PNG that resembles a typical photo: smooth gradient + mild noise.
    Target: ~target_kb base64 bytes. Resize pipeline should yield <15KB output
    because the content is photo-like (compressible by JPEG).
    """
    import random
    random.seed(42)
    # Start big — typical phone photo would be 2000+ wide. Use gradient with
    # mild noise so PNG stays large while JPEG-quality-78 at 256px is small.
    size = 800
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            r = (x * 255) // size
            g = (y * 255) // size
            b = ((x + y) * 255) // (2 * size)
            # Mild noise so PNG isn't trivially compressed
            n = random.randint(-12, 12)
            px[x, y] = (
                max(0, min(255, r + n)),
                max(0, min(255, g + n)),
                max(0, min(255, b + n)),
            )
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return "data:image/png;base64," + b64, len(b64)


def main():
    print("=" * 72)
    print("R100W Avatar Resize Pipeline Test")
    print("=" * 72)

    token = auth_token()
    record("auth_login", bool(token), f"token len={len(token) if token else 0}")
    H = {"Authorization": f"Bearer {token}"}

    # Build a ~150KB base64 PNG (random noise so PNG can't compress)
    data_uri, raw_len = make_png_data_uri(target_kb=150)
    record("build_test_png_~150KB", raw_len >= 100_000, f"base64_len={raw_len} bytes ({raw_len // 1024}KB)")

    # ---- Scenario 1: POST avatar with PNG ~150KB → response avatar < 15KB ----
    r = requests.post(f"{BASE}/user/avatar", json={"avatar": data_uri}, headers=H, timeout=30)
    record("S1_post_status_200", r.status_code == 200, f"status={r.status_code} body_head={r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    returned = body.get("avatar", "")
    record(
        "S1_response_avatar_lt_15KB",
        0 < len(returned) < 15_000,
        f"resized_len={len(returned)} bytes (~{len(returned)//1024}KB)",
    )
    record(
        "S1_response_is_jpeg",
        returned.startswith("data:image/jpeg;base64,"),
        f"prefix={returned[:32]!r}",
    )

    # ---- Scenario 2: GET avatar — small payload ----
    r2 = requests.get(f"{BASE}/user/avatar", headers=H, timeout=15)
    record("S2_get_status_200", r2.status_code == 200, f"status={r2.status_code}")
    g_body = r2.json() if r2.status_code == 200 else {}
    g_avatar = g_body.get("avatar", "")
    record("S2_get_avatar_lt_15KB", 0 < len(g_avatar) < 15_000, f"get_len={len(g_avatar)}")
    record("S2_get_matches_post_response", g_avatar == returned, f"identical={g_avatar == returned}")

    # Second GET should be the same (cache check) and still small
    r2b = requests.get(f"{BASE}/user/avatar", headers=H, timeout=15)
    g2 = r2b.json().get("avatar", "")
    record("S2b_second_get_consistent", g2 == g_avatar and len(g2) < 15_000, f"len={len(g2)}")

    # ---- Scenario 3: POST avatar with empty string → idempotent removal ----
    r3 = requests.post(f"{BASE}/user/avatar", json={"avatar": ""}, headers=H, timeout=15)
    record("S3_post_empty_status_200", r3.status_code == 200, f"status={r3.status_code} body={r3.text[:200]}")
    record(
        "S3_post_empty_avatar_field_empty",
        r3.json().get("avatar", None) == "",
        f"body_avatar={r3.json().get('avatar')!r}",
    )
    # GET after delete
    r3g = requests.get(f"{BASE}/user/avatar", headers=H, timeout=15)
    record(
        "S3_get_after_delete_empty",
        r3g.status_code == 200 and r3g.json().get("avatar", "x") in ("", None),
        f"status={r3g.status_code} body={r3g.text[:200]}",
    )
    # Idempotent — second POST empty
    r3b = requests.post(f"{BASE}/user/avatar", json={"avatar": ""}, headers=H, timeout=15)
    record("S3_post_empty_idempotent", r3b.status_code == 200, f"status={r3b.status_code}")

    # ---- Scenario 4: malformed base64 → graceful fallback ----
    # Send an arbitrary non-base64 string; backend should NOT 500.
    bad = "data:image/png;base64,@@@not-real-base64-$$$"
    r4 = requests.post(f"{BASE}/user/avatar", json={"avatar": bad}, headers=H, timeout=15)
    record(
        "S4_malformed_no_500",
        r4.status_code in (200, 400),
        f"status={r4.status_code} body={r4.text[:200]}",
    )
    # Spec says "stores original, doesn't 500" — so 200 with avatar==bad is the documented outcome
    if r4.status_code == 200:
        record(
            "S4_malformed_stores_original",
            r4.json().get("avatar") == bad,
            f"stored_avatar_eq_input={r4.json().get('avatar') == bad}",
        )

    # Cleanup malformed avatar so we leave the user clean
    requests.post(f"{BASE}/user/avatar", json={"avatar": ""}, headers=H, timeout=15)

    # ---- Scenario 5: POST /api/coach/chat shape regression ----
    rc = requests.post(
        f"{BASE}/coach/chat",
        json={"message": "Where am I overspending?"},
        headers=H,
        timeout=30,
    )
    record("S5_coach_chat_status_200", rc.status_code == 200, f"status={rc.status_code} body_head={rc.text[:200]}")
    if rc.status_code == 200:
        cb = rc.json()
        expected = {"reply", "confidence", "confidence_label", "source", "actions", "suggestions"}
        present = set(cb.keys())
        missing = expected - present
        record(
            "S5_coach_chat_all_keys_present",
            not missing,
            f"missing={missing} extras={present - expected}",
        )
        record("S5_reply_is_str", isinstance(cb.get("reply"), str), f"type={type(cb.get('reply')).__name__}")
        record(
            "S5_confidence_is_float_in_0_1",
            isinstance(cb.get("confidence"), (int, float)) and 0 <= cb.get("confidence") <= 1,
            f"confidence={cb.get('confidence')}",
        )
        record(
            "S5_confidence_label_is_str",
            isinstance(cb.get("confidence_label"), str),
            f"value={cb.get('confidence_label')!r}",
        )
        record("S5_source_is_str", isinstance(cb.get("source"), str), f"value={cb.get('source')!r}")
        record("S5_actions_is_list", isinstance(cb.get("actions"), list), f"len={len(cb.get('actions') or [])}")
        record(
            "S5_suggestions_is_list",
            isinstance(cb.get("suggestions"), list),
            f"len={len(cb.get('suggestions') or [])}",
        )

    # ---- SUMMARY ----
    print()
    print("=" * 72)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"RESULT: {passed}/{total} assertions PASS")
    print("=" * 72)
    for name, ok, detail in results:
        if not ok:
            print(f"  FAIL: {name} — {detail}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
