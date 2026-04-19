"""Focused test for refactored /api/news/india-finance endpoint.

Validates:
  1. Happy path returns HTTP 200 within ~500ms (non-blocking)
  2. Refresh variant returns 200 in < 2s
  3. Auth enforcement (401 without Bearer token)
  4. Non-blocking behaviour (no 10s+ waits for LLM)

Also prints sample response for reviewer visibility.
"""
import json
import os
import time
import sys
import requests

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"
PASSWORD = "test123"

results = []


def log(name: str, ok: bool, detail: str = "") -> None:
    mark = "✅" if ok else "❌"
    line = f"{mark} {name}" + (f" — {detail}" if detail else "")
    print(line)
    results.append((name, ok, detail))


def get_token() -> str:
    """Try OTP first, fall back to password. Handles rate-limit."""
    # Password fallback is more reliable when rate-limited
    for attempt in range(3):
        try:
            r = requests.post(
                f"{BASE_URL}/auth/login",
                json={"phone": PHONE, "password": PASSWORD},
                timeout=15,
            )
            if r.status_code == 200:
                tok = r.json().get("token") or r.json().get("access_token")
                if tok:
                    print(f"Auth via password → JWT len={len(tok)}")
                    return tok
            elif r.status_code == 429:
                print(f"[auth] 429 rate-limited, sleeping 60s (attempt {attempt+1}/3)")
                time.sleep(62)
                continue
            print(f"[auth] password login returned {r.status_code}: {r.text[:200]}")
        except Exception as e:
            print(f"[auth] password login error: {e}")
        # Try OTP path
        try:
            rs = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE}, timeout=15)
            print(f"[auth] send-otp → {rs.status_code}: {rs.text[:120]}")
            if rs.status_code == 429:
                time.sleep(62)
                continue
            rv = requests.post(
                f"{BASE_URL}/auth/verify-otp",
                json={"phone": PHONE, "otp": OTP},
                timeout=15,
            )
            if rv.status_code == 200:
                tok = rv.json().get("token") or rv.json().get("access_token")
                if tok:
                    print(f"Auth via OTP → JWT len={len(tok)}")
                    return tok
            elif rv.status_code == 429:
                time.sleep(62)
                continue
            print(f"[auth] verify-otp → {rv.status_code}: {rv.text[:200]}")
        except Exception as e:
            print(f"[auth] otp error: {e}")
    raise SystemExit("Unable to authenticate after 3 attempts")


def test_no_auth() -> None:
    """3. Auth enforcement — 401 without Bearer token."""
    r = requests.get(f"{BASE_URL}/news/india-finance", timeout=10)
    log(
        "T3 No-auth → 401/403",
        r.status_code in (401, 403),
        f"status={r.status_code}",
    )


def test_happy_path(token: str) -> dict:
    """1. Happy path — 200 quickly with expected shape."""
    headers = {"Authorization": f"Bearer {token}"}
    t0 = time.time()
    r = requests.get(f"{BASE_URL}/news/india-finance", headers=headers, timeout=15)
    elapsed_ms = (time.time() - t0) * 1000
    log("T1.1 GET /news/india-finance → 200", r.status_code == 200, f"status={r.status_code}, {elapsed_ms:.0f} ms")
    if r.status_code != 200:
        print("Body:", r.text[:400])
        return {}
    data = r.json()
    print(f"  Response keys: {sorted(data.keys())}")
    print(f"  is_fallback={data.get('is_fallback')}, updated_at={data.get('updated_at')}, articles={len(data.get('articles', []))}")
    # Structure assertions
    log("T1.2 Response has 'articles' list", isinstance(data.get("articles"), list))
    log("T1.3 articles len >= 3", len(data.get("articles") or []) >= 3, f"len={len(data.get('articles') or [])}")
    log("T1.4 Response has 'date' field", isinstance(data.get("date"), str) and len(data["date"]) > 0)
    log("T1.5 Response has 'updated_at' key (may be null)", "updated_at" in data)
    log("T1.6 Response has 'is_fallback' bool", isinstance(data.get("is_fallback"), bool))
    # Non-blocking latency
    log("T1.7 Latency < 2000 ms (target ~500 ms)", elapsed_ms < 2000, f"{elapsed_ms:.0f} ms")
    log("T1.8 Latency < 10000 ms (definitely non-blocking)", elapsed_ms < 10000, f"{elapsed_ms:.0f} ms")
    # Article shape check
    if data.get("articles"):
        first = data["articles"][0]
        required = {"title", "summary", "category", "emoji", "source"}
        missing = required - set(first.keys())
        log("T1.9 Article has required fields {title,summary,category,emoji,source}", not missing, f"missing={missing}")
        print(f"  Sample article: {json.dumps(first, ensure_ascii=False)[:200]}")
    return data


def test_refresh_variant(token: str) -> None:
    """2. ?refresh=1 returns 200 in < 2s (LLM runs in background)."""
    headers = {"Authorization": f"Bearer {token}"}
    t0 = time.time()
    r = requests.get(f"{BASE_URL}/news/india-finance?refresh=1", headers=headers, timeout=15)
    elapsed_ms = (time.time() - t0) * 1000
    log("T2.1 GET /news/india-finance?refresh=1 → 200", r.status_code == 200, f"status={r.status_code}, {elapsed_ms:.0f} ms")
    if r.status_code == 200:
        data = r.json()
        log("T2.2 refresh: articles present", bool(data.get("articles")))
        log("T2.3 refresh: is_fallback present (bool)", isinstance(data.get("is_fallback"), bool))
        log("T2.4 refresh latency < 2000 ms", elapsed_ms < 2000, f"{elapsed_ms:.0f} ms")
        log("T2.5 refresh latency < 10000 ms (non-blocking)", elapsed_ms < 10000, f"{elapsed_ms:.0f} ms")


def test_repeat_calls_fast(token: str) -> None:
    """4. Call endpoint 3x in a row — all should be quick (no synchronous LLM)."""
    headers = {"Authorization": f"Bearer {token}"}
    timings = []
    for i in range(3):
        t0 = time.time()
        r = requests.get(f"{BASE_URL}/news/india-finance", headers=headers, timeout=15)
        ms = (time.time() - t0) * 1000
        timings.append(ms)
        if r.status_code != 200:
            log(f"T4.{i+1} repeat call → 200", False, f"status={r.status_code}")
            return
    print(f"  Timings: {[f'{t:.0f}ms' for t in timings]}")
    log("T4.1 All 3 repeat calls < 2000 ms each", all(t < 2000 for t in timings), f"timings={[f'{t:.0f}' for t in timings]}")
    log("T4.2 Max timing < 10000 ms (no LLM blocking)", max(timings) < 10000, f"max={max(timings):.0f} ms")


def main() -> None:
    print(f"Backend: {BASE_URL}")
    print("=" * 60)
    # Auth-free check first (no rate-limit risk)
    test_no_auth()
    token = get_token()
    print("=" * 60)
    test_happy_path(token)
    print("=" * 60)
    test_refresh_variant(token)
    print("=" * 60)
    test_repeat_calls_fast(token)
    print("=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\nRESULT: {passed}/{total} assertions passed")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
