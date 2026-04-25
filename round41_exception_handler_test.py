"""Round 41 — Global Exception Handler Validation
Verifies:
1. Unhandled exceptions return generic 500 detail with no leaked internals.
2. dev mode (ENV=development) includes a `debug` field; prod does not.
3. Existing 4xx handlers (422 validation, 400 InvalidId) still work.
4. Normal endpoints still return 200.

Two-part suite:
  Part A: Public preview URL (https://mintu-finance.preview.emergentagent.com/api)
          - Validates 200s on the 6 listed endpoints.
          - Validates 422 / 400 behaviour.
  Part B: In-process FastAPI TestClient with a temporary `/api/_test/boom` route
          that raises real exceptions, to confirm the catch-all handler shape.
"""
from __future__ import annotations
import os
import sys
import json
import time
import requests

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []  # list[(name, ok, msg)]

def rec(name, ok, msg=""):
    results.append((name, ok, msg))
    flag = "✅" if ok else "❌"
    print(f"{flag} {name}: {msg}")

# -----------------------------------------------------------------------------
# PART A — public preview URL
# -----------------------------------------------------------------------------
def part_a():
    print("\n=== PART A — Live preview URL (prod-like) ===")
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    # Auth (with retry on 429 rate-limit)
    for attempt in range(6):
        r = s.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE}, timeout=20)
        if r.status_code == 200:
            break
        if r.status_code == 429:
            time.sleep(12)
            continue
        break
    rec("A1 send-otp", r.status_code == 200, f"status={r.status_code}")

    r = s.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
    if r.status_code != 200:
        rec("A2 verify-otp", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    token = r.json().get("token") or r.json().get("access_token")
    rec("A2 verify-otp", bool(token), f"token={'yes' if token else 'no'}")
    if not token:
        return None

    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 200 endpoints
    endpoints_200 = [
        ("GET", "/coins/ledger", None),
        ("GET", "/notifications", None),
        ("GET", "/search?q=test", None),
        ("GET", "/home/bundle", None),
    ]
    for method, path, body in endpoints_200:
        r = s.request(method, f"{BASE_URL}{path}", headers=h, json=body, timeout=20)
        rec(f"A3 {method} {path}", r.status_code == 200, f"status={r.status_code}")

    # POST /auth/send-otp 200 (already covered)
    # POST /auth/verify-otp 200 (already covered)

    # ------- 422 validation handler still works -------
    r = s.post(f"{BASE_URL}/auth/verify-otp", json={"phone": "BAD"},
               headers={"Content-Type": "application/json"}, timeout=10)
    # Missing otp → 422
    has_detail = False
    try:
        b = r.json()
        has_detail = "detail" in b
    except Exception:
        pass
    rec("A4 422 validator handler intact",
        r.status_code in (400, 422) and has_detail,
        f"status={r.status_code} hasDetail={has_detail}")

    # ------- 400 InvalidId handler still works -------
    # POST /notifications/mark-read with bad id → 400 "Invalid id"
    r = s.post(f"{BASE_URL}/notifications/mark-read",
               json={"notification_id": "not-an-objectid"},
               headers=h, timeout=10)
    body_ok = False
    try:
        body_ok = r.status_code == 400 and "Invalid" in (r.json().get("detail", "") or "")
    except Exception:
        pass
    rec("A5 400 InvalidId handler intact",
        body_ok,
        f"status={r.status_code} body={r.text[:120]}")

    # ------- Try to elicit a 500. Best-effort: send malformed payloads to
    # routes that may have unguarded code paths. We then assert that IF any
    # 500 surfaces, the body is the generic message and contains no leaked
    # internals.
    leak_markers = ["Traceback", "/app/backend/", "AttributeError",
                    "KeyError", "TypeError", ".py", "File \"", "line "]
    suspect_calls = [
        ("POST", "/transactions",
         {"amount": "not-a-number", "description": "x", "category": "Food",
          "type": "debit"}),  # may 422 (good) or 500 (bad)
        ("GET", "/split/pay-intent/zzzzzz?amount=abc", None),
        ("POST", "/coins/award", {"reason": None, "amount": None}),
    ]
    leaked = []
    for method, path, body in suspect_calls:
        try:
            r = s.request(method, f"{BASE_URL}{path}", headers=h, json=body, timeout=15)
        except Exception as e:
            rec(f"A6 attempt {method} {path}", False, f"connection error {e}")
            continue
        if r.status_code == 500:
            txt = r.text or ""
            leaks = [m for m in leak_markers if m in txt]
            if leaks:
                leaked.append((path, leaks, txt[:200]))
            else:
                # Check shape
                try:
                    j = r.json()
                    is_generic = j.get("detail", "").startswith("An internal error occurred")
                    rec(f"A6 500 shape on {path}", is_generic,
                        f"detail={j.get('detail', '')[:80]} debug={'debug' in j}")
                except Exception:
                    rec(f"A6 500 not json on {path}", False, f"body={txt[:100]}")
        else:
            rec(f"A6 {method} {path} (no 500)", True,
                f"status={r.status_code} (handled cleanly)")
    if leaked:
        for p, l, b in leaked:
            rec(f"A6 LEAK on {p}", False, f"markers={l} body={b}")

    return token


# -----------------------------------------------------------------------------
# PART B — in-process TestClient w/ injected raising route
# -----------------------------------------------------------------------------
def part_b_prod():
    print("\n=== PART B-prod — In-process handler shape (no ENV set) ===")
    # Make sure we DON'T set ENV/DEBUG so handler runs in prod mode
    for k in ("ENV", "DEBUG"):
        os.environ.pop(k, None)

    sys.path.insert(0, "/app/backend")
    # Import fresh app. Since the module sets _is_dev at registration time,
    # we want to import after env is cleared. server.py likely already imported
    # by some test infra — let's check.
    if "server" in sys.modules:
        # Reset since handler captured _is_dev at import time
        del sys.modules["server"]
    if "core.responses" in sys.modules:
        del sys.modules["core.responses"]

    import server  # noqa: E402
    from fastapi.testclient import TestClient
    app = server.app

    # Inject a raising route only for this test
    @app.get("/api/_test/boom_attr")
    async def _boom_attr():
        x = None
        return x.this_will_raise  # AttributeError

    @app.get("/api/_test/boom_key")
    async def _boom_key():
        d = {}
        return d["missing_key"]   # KeyError

    @app.get("/api/_test/boom_zero")
    async def _boom_zero():
        return 1 / 0              # ZeroDivisionError

    client = TestClient(app, raise_server_exceptions=False)

    leak_markers = ["Traceback", "/app/backend/", "AttributeError",
                    "KeyError", "ZeroDivisionError", "File \"", "line "]

    for path, label in [("/api/_test/boom_attr", "AttributeError"),
                        ("/api/_test/boom_key", "KeyError"),
                        ("/api/_test/boom_zero", "ZeroDivisionError")]:
        r = client.get(path)
        ok_status = r.status_code == 500
        try:
            j = r.json()
        except Exception:
            j = None
        ok_shape = (
            j is not None
            and j.get("detail") == "An internal error occurred. Please try again."
            and "debug" not in j
        )
        body = r.text or ""
        leaks = [m for m in leak_markers if m in body]
        ok_no_leak = len(leaks) == 0
        rec(f"B-prod {label} status=500", ok_status, f"got {r.status_code}")
        rec(f"B-prod {label} generic detail+no debug", ok_shape, f"body={body[:200]}")
        rec(f"B-prod {label} no leaks", ok_no_leak, f"leaks={leaks}")


def part_b_dev():
    print("\n=== PART B-dev — In-process handler shape (ENV=development) ===")
    os.environ["ENV"] = "development"

    # Drop and re-import so handler picks up new env
    for m in list(sys.modules.keys()):
        if m.startswith("server") or m.startswith("core.responses"):
            del sys.modules[m]

    sys.path.insert(0, "/app/backend")
    import server  # noqa: E402
    from fastapi.testclient import TestClient
    app = server.app

    @app.get("/api/_test/boom_dev_attr")
    async def _boom_attr():
        x = None
        return x.something  # AttributeError

    client = TestClient(app, raise_server_exceptions=False)
    r = client.get("/api/_test/boom_dev_attr")
    try:
        j = r.json()
    except Exception:
        j = None

    rec("B-dev status=500", r.status_code == 500, f"got {r.status_code}")
    rec("B-dev generic detail",
        bool(j) and j.get("detail") == "An internal error occurred. Please try again.",
        f"detail={j and j.get('detail')}")
    has_debug = bool(j) and "debug" in j
    rec("B-dev debug field present", has_debug,
        f"debug={j and j.get('debug')}")
    if has_debug:
        # Format must be "<ExceptionClass>: <message>" per the handler code
        dbg = j["debug"]
        # Must contain at least an Error class name and a colon-separator
        has_class = (":" in dbg) and any(
            cls in dbg for cls in (
                "Error", "Exception", "AttributeError", "RuntimeError",
                "KeyError", "TypeError", "ValueError"
            )
        )
        rec("B-dev debug shape <Class>: <msg>",
            has_class, f"debug={dbg[:160]}")
        rec("B-dev debug truncated <=550",
            len(dbg) <= 550, f"len={len(dbg)}")
    # IMPORTANT: response body must NOT contain raw traceback or file paths
    body = r.text or ""
    leak_markers = ["Traceback (", "/app/backend/", "File \"", "line "]
    leaks = [m for m in leak_markers if m in body]
    rec("B-dev no traceback leak (even in dev)",
        len(leaks) == 0, f"leaks={leaks}")

    # Cleanup env
    os.environ.pop("ENV", None)


def main():
    part_a()
    try:
        part_b_prod()
    except Exception as e:
        rec("B-prod harness", False, f"setup error {e}")
    try:
        part_b_dev()
    except Exception as e:
        rec("B-dev harness", False, f"setup error {e}")

    print("\n" + "=" * 60)
    fails = [(n, m) for n, ok, m in results if not ok]
    print(f"PASSED {len(results) - len(fails)}/{len(results)}")
    if fails:
        print("FAILURES:")
        for n, m in fails:
            print(f"  ❌ {n}: {m}")
        sys.exit(1)
    else:
        print("ALL GREEN")


if __name__ == "__main__":
    main()
