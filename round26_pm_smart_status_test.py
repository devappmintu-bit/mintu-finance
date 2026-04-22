"""Round 26 — Payment Methods Smart Status test suite.

Exercises:
  T1 GET /user/payment-methods  — baseline shape + health schema
  T2 POST /user/payment-methods (fresh UPI) — health.unused / verify
  T3 POST /user/payment-methods/{id}/verify — happy path
  T4 GET — healthy/success after verify
  T5 POST .../nonexistent/verify → 404
  T6 legacy_upi promotion (auto-skip if user already has methods)
  T7 regression on existing endpoints
  T8 cleanup — delete the T2 method

Run: python /app/round26_pm_smart_status_test.py
"""

import json
import os
import sys
import time

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

PASS = []
FAIL = []


def _rec(name: str, ok: bool, detail: str = "") -> None:
    tag = "✅" if ok else "❌"
    line = f"{tag} {name}" + (f" — {detail}" if detail else "")
    print(line)
    (PASS if ok else FAIL).append(line)


def _assert(name: str, cond: bool, detail: str = "") -> None:
    _rec(name, bool(cond), detail)


def auth_token() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in verify-otp response: {data}"
    return tok


def hdrs(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def validate_health(h: dict, context: str) -> None:
    _assert(f"{context}: health present", isinstance(h, dict), str(type(h)))
    _assert(f"{context}: health.status valid",
            h.get("status") in ("healthy", "stale", "unused", "error"),
            f"got={h.get('status')}")
    _assert(f"{context}: health.tone valid",
            h.get("tone") in ("success", "warning", "danger", "neutral"),
            f"got={h.get('tone')}")
    _assert(f"{context}: health.label non-empty",
            isinstance(h.get("label"), str) and len(h.get("label") or "") > 0,
            f"got={h.get('label')!r}")
    _assert(f"{context}: health.action is verify|retry|null",
            h.get("action") in (None, "verify", "retry"),
            f"got={h.get('action')}")
    _assert(f"{context}: health.action_label is str|null",
            h.get("action_label") is None or isinstance(h.get("action_label"), str),
            f"got={type(h.get('action_label')).__name__}")


def find_method(methods: list, pm_id: str) -> dict | None:
    for m in methods:
        if m.get("id") == pm_id:
            return m
    return None


def main() -> int:
    tok = auth_token()
    print(f"[auth] token acquired, len={len(tok)}")

    # ─────────────────────────────────────────────────────────────────
    # T1 baseline
    # ─────────────────────────────────────────────────────────────────
    print("\n── T1: GET /user/payment-methods baseline ──")
    r = requests.get(f"{BASE}/user/payment-methods", headers=hdrs(tok), timeout=20)
    _assert("T1.status==200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return 1
    data = r.json()
    _assert("T1.methods is list", isinstance(data.get("methods"), list))
    _assert("T1.count is int", isinstance(data.get("count"), int))
    _assert("T1.default is object or null",
            data.get("default") is None or isinstance(data.get("default"), dict))
    for idx, m in enumerate(data["methods"]):
        validate_health(m.get("health") or {}, f"T1.methods[{idx}]")

    initial_methods = data["methods"]
    initial_count = data["count"]
    print(f"[T1] initial count={initial_count} default_id={(data.get('default') or {}).get('id')}")

    # Detect whether this user has only a legacy virtual entry
    has_only_virtual = (initial_count == 1 and initial_methods[0].get("id") == "legacy_upi")
    has_zero = initial_count == 0
    user_has_real_methods = not (has_only_virtual or has_zero)

    # ─────────────────────────────────────────────────────────────────
    # T2 fresh UPI  (always create a fresh one so T3/T4 are deterministic)
    # ─────────────────────────────────────────────────────────────────
    print("\n── T2: create fresh UPI ──")
    r = requests.post(
        f"{BASE}/user/payment-methods",
        headers=hdrs(tok),
        json={"type": "upi", "upi_id": "testverify@okhdfcbank"},
        timeout=20,
    )
    _assert("T2.POST status==200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return 1
    body = r.json()
    _assert("T2.POST ok==true", body.get("ok") is True)
    method_obj = body.get("method") or {}
    pm_id = method_obj.get("id")
    _assert("T2.POST method.id present", bool(pm_id), f"method={method_obj}")
    if not pm_id:
        return 1

    # GET again + find new method
    r = requests.get(f"{BASE}/user/payment-methods", headers=hdrs(tok), timeout=20)
    _assert("T2.GET status==200", r.status_code == 200)
    data2 = r.json()
    m_new = find_method(data2.get("methods") or [], pm_id)
    _assert("T2.GET newly-created method found", m_new is not None, f"pm_id={pm_id}")
    if m_new is None:
        return 1
    h = m_new.get("health") or {}
    _assert("T2.health.status == 'unused'", h.get("status") == "unused", f"got={h.get('status')}")
    _assert("T2.health.tone == 'neutral'", h.get("tone") == "neutral", f"got={h.get('tone')}")
    _assert("T2.health.action == 'verify'", h.get("action") == "verify", f"got={h.get('action')}")
    _assert("T2.health.action_label == 'Verify now'",
            h.get("action_label") == "Verify now", f"got={h.get('action_label')!r}")
    _assert("T2.health.last_used_at is null/absent",
            h.get("last_used_at") in (None, ""), f"got={h.get('last_used_at')!r}")

    # ─────────────────────────────────────────────────────────────────
    # T3 verify happy path
    # ─────────────────────────────────────────────────────────────────
    print("\n── T3: verify happy path ──")
    r = requests.post(
        f"{BASE}/user/payment-methods/{pm_id}/verify",
        headers=hdrs(tok),
        timeout=20,
    )
    _assert("T3.status==200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        vbody = r.json()
        _assert("T3.ok==true", vbody.get("ok") is True)
        _assert("T3.status=='healthy'", vbody.get("status") == "healthy",
                f"got={vbody.get('status')!r}")
        _assert("T3.method_id==pm_id", vbody.get("method_id") == pm_id,
                f"got={vbody.get('method_id')!r}")
        va = vbody.get("verified_at")
        _assert("T3.verified_at is ISO string",
                isinstance(va, str) and "T" in va and len(va) >= 10, f"got={va!r}")

    # ─────────────────────────────────────────────────────────────────
    # T4 health now healthy
    # ─────────────────────────────────────────────────────────────────
    print("\n── T4: health healthy after verify ──")
    r = requests.get(f"{BASE}/user/payment-methods", headers=hdrs(tok), timeout=20)
    _assert("T4.GET status==200", r.status_code == 200)
    data4 = r.json()
    m4 = find_method(data4.get("methods") or [], pm_id)
    _assert("T4.method found", m4 is not None)
    if m4 is not None:
        h4 = m4.get("health") or {}
        _assert("T4.health.status == 'healthy'", h4.get("status") == "healthy",
                f"got={h4.get('status')}")
        _assert("T4.health.tone == 'success'", h4.get("tone") == "success",
                f"got={h4.get('tone')}")
        _assert("T4.health.action is null", h4.get("action") is None,
                f"got={h4.get('action')!r}")
        lu = h4.get("last_used_at")
        _assert("T4.health.last_used_at is non-null ISO",
                isinstance(lu, str) and "T" in lu, f"got={lu!r}")
        label = h4.get("label") or ""
        _assert("T4.health.label starts with 'Active'",
                label.startswith("Active"), f"got={label!r}")

    # ─────────────────────────────────────────────────────────────────
    # T5 verify nonexistent → 404
    # ─────────────────────────────────────────────────────────────────
    print("\n── T5: verify nonexistent → 404 ──")
    r = requests.post(
        f"{BASE}/user/payment-methods/nonexistent_fake_id_xyz/verify",
        headers=hdrs(tok),
        timeout=20,
    )
    _assert("T5.status==404", r.status_code == 404, f"{r.status_code} {r.text[:200]}")
    if r.status_code == 404:
        try:
            detail = r.json().get("detail")
        except Exception:
            detail = None
        _assert("T5.detail == 'Method not found'", detail == "Method not found",
                f"got={detail!r}")

    # ─────────────────────────────────────────────────────────────────
    # T6 legacy_upi promotion — SKIP if user already had real methods
    # ─────────────────────────────────────────────────────────────────
    print("\n── T6: legacy_upi promotion ──")
    if user_has_real_methods:
        print("SKIPPED T6 — user has existing methods")
    elif has_only_virtual:
        r = requests.post(
            f"{BASE}/user/payment-methods/legacy_upi/verify",
            headers=hdrs(tok),
            timeout=20,
        )
        _assert("T6.status==200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
        if r.status_code == 200:
            vb = r.json()
            new_mid = vb.get("method_id")
            _assert("T6.method_id != 'legacy_upi'", new_mid and new_mid != "legacy_upi",
                    f"got={new_mid!r}")
            # Subsequent GET shows real persisted method healthy
            r = requests.get(f"{BASE}/user/payment-methods", headers=hdrs(tok), timeout=20)
            if r.status_code == 200:
                mL = find_method(r.json().get("methods") or [], new_mid or "")
                _assert("T6.promoted method present", mL is not None)
                if mL is not None:
                    _assert("T6.promoted method health.status=='healthy'",
                            (mL.get("health") or {}).get("status") == "healthy",
                            f"got={(mL.get('health') or {}).get('status')}")
    else:
        print("SKIPPED T6 — user has existing methods (no legacy_upi present)")

    # ─────────────────────────────────────────────────────────────────
    # T7 regression — existing endpoints
    # ─────────────────────────────────────────────────────────────────
    print("\n── T7: regression ──")
    r = requests.get(f"{BASE}/user/payment-methods", headers=hdrs(tok), timeout=20)
    _assert("T7.GET /user/payment-methods == 200", r.status_code == 200)

    r = requests.post(
        f"{BASE}/user/payment-methods",
        headers=hdrs(tok),
        json={"type": "card", "card_last4": "1234", "card_brand": "visa"},
        timeout=20,
    )
    _assert("T7.POST card == 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    card_id = None
    if r.status_code == 200:
        card_id = (r.json().get("method") or {}).get("id")
        _assert("T7.POST card returned id", bool(card_id))

    if card_id:
        r = requests.put(
            f"{BASE}/user/payment-methods/{card_id}/default",
            headers=hdrs(tok),
            timeout=20,
        )
        _assert("T7.PUT card/default == 200", r.status_code == 200,
                f"{r.status_code} {r.text[:200]}")

        r = requests.delete(
            f"{BASE}/user/payment-methods/{card_id}",
            headers=hdrs(tok),
            timeout=20,
        )
        _assert("T7.DELETE card == 200", r.status_code == 200,
                f"{r.status_code} {r.text[:200]}")

    r = requests.get(f"{BASE}/user/me", headers=hdrs(tok), timeout=20)
    _assert("T7.GET /user/me == 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")

    # ─────────────────────────────────────────────────────────────────
    # T8 cleanup
    # ─────────────────────────────────────────────────────────────────
    print("\n── T8: cleanup T2 UPI ──")
    r = requests.delete(
        f"{BASE}/user/payment-methods/{pm_id}",
        headers=hdrs(tok),
        timeout=20,
    )
    # best-effort; allow 404
    _assert("T8.DELETE returns 200 or 404",
            r.status_code in (200, 404), f"{r.status_code} {r.text[:200]}")

    print("\n" + "=" * 60)
    print(f"PASS: {len(PASS)}")
    print(f"FAIL: {len(FAIL)}")
    if FAIL:
        print("\nFAILURES:")
        for f in FAIL:
            print(" ", f)
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
