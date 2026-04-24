"""Phase 4 (core/responses.py) + Phase 5 (routers/split_reminders.py) smoke test.

Seven checks per review request. Runs against the public backend URL.
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import time
from typing import Any

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"
TARGET_PHONE = "9999888877"  # Rahul Sharma

results: list[tuple[str, bool, str]] = []


def log(name: str, ok: bool, detail: str = "") -> None:
    mark = "✅" if ok else "❌"
    print(f"{mark} {name}: {detail[:240]}")
    results.append((name, ok, detail))


def api(method: str, path: str, token: str | None = None, **kw) -> requests.Response:
    h = kw.pop("headers", {}) or {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.request(method, BASE + path, headers=h, timeout=30, **kw)


def auth(phone: str) -> tuple[str, str]:
    """Returns (token, user_id)."""
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code in (200, 429), f"send-otp failed: {r.status_code} {r.text}"
    time.sleep(0.5)
    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": phone, "otp": OTP, "name": "Test User"},
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    user = data.get("user", {})
    uid = user.get("id") or user.get("_id") or data.get("user_id") or ""
    # If not in verify payload, fetch /user/me
    if not uid:
        me = api("GET", "/user/me", token).json()
        uid = me.get("id") or me.get("_id")
    return token, uid


def main() -> int:
    print("=" * 72)
    print("Phase 4 + Phase 5 Refactor Smoke Test")
    print(f"Backend: {BASE}")
    print("=" * 72)

    # --- Authenticate both users ---
    try:
        tokenA, user_a_id = auth(PHONE)
        tokenB, user_b_id = auth(TARGET_PHONE)
    except Exception as e:
        log("auth", False, f"Auth setup failed: {e}")
        return summarize()
    print(f"User A: {user_a_id[:8]}... | User B: {user_b_id[:8]}...")

    # --- CHECK 1: POST /api/split/remind ---
    # Anti-spam limit: 1/hour per (sender, recipient, group). Use group_id=None-ish,
    # but since throttle matches on exact group_id, use a fresh group per run to avoid 429.
    # Strategy: include a fresh group_id via creating/skipping; or just attempt and if 429,
    # we'll consider it a pre-existing reminder record in DB (accept).
    ts = int(time.time())
    remind_body = {
        "target_user_id": user_b_id,
        "amount": 250.50,
        "note": f"Test reminder {ts}",
    }
    r = api("POST", "/split/remind", tokenA, json=remind_body)
    reminder_id: str | None = None
    if r.status_code == 200:
        data = r.json()
        required = {"id", "message", "whatsapp_link", "whatsapp_text", "recipient_name", "amount"}
        missing = required - set(data.keys())
        if missing:
            log("CHECK 1 /split/remind", False, f"missing keys {missing}: {data}")
        else:
            reminder_id = data["id"]
            log(
                "CHECK 1 /split/remind",
                True,
                f"200; id={reminder_id[:8]} amount={data['amount']} recipient={data['recipient_name']}",
            )
    elif r.status_code == 429:
        # Throttled (existing reminder in last hour) — fetch recent reminder and continue
        log(
            "CHECK 1 /split/remind",
            True,
            f"429 anti-spam (expected if recent reminder exists). Body: {r.text[:120]}",
        )
        # Get reminder_id from sent list for check 3
        rr = api("GET", "/split/reminders", tokenA)
        if rr.status_code == 200:
            sent = rr.json().get("sent", [])
            if sent:
                reminder_id = sent[0].get("id")
    else:
        log("CHECK 1 /split/remind", False, f"status={r.status_code} body={r.text[:240]}")

    # --- CHECK 2: GET /api/split/reminders ---
    r = api("GET", "/split/reminders", tokenA)
    if r.status_code == 200:
        data = r.json()
        required = {"received", "sent", "received_count"}
        missing = required - set(data.keys())
        if missing:
            log("CHECK 2 /split/reminders", False, f"missing {missing}: {list(data.keys())}")
        else:
            ok_types = (
                isinstance(data["received"], list)
                and isinstance(data["sent"], list)
                and isinstance(data["received_count"], int)
            )
            log(
                "CHECK 2 /split/reminders",
                ok_types,
                f"200; received={len(data['received'])} sent={len(data['sent'])} count={data['received_count']}",
            )
    else:
        log("CHECK 2 /split/reminders", False, f"status={r.status_code} body={r.text[:240]}")

    # --- CHECK 3: POST /api/split/reminders/{id}/dismiss ---
    # Dismissal requires the reminder's recipient to be the caller. So call it as user B.
    # Find a reminder in user B's received list.
    rb = api("GET", "/split/reminders", tokenB)
    dismiss_id = None
    if rb.status_code == 200:
        recv = rb.json().get("received", [])
        # Pick the newest reminder that we just created (matches our amount)
        for item in recv:
            if item.get("amount") == 250.50 or item.get("sender_id") == user_a_id:
                dismiss_id = item.get("id")
                break
        if dismiss_id is None and recv:
            dismiss_id = recv[0].get("id")

    if dismiss_id:
        r = api("POST", f"/split/reminders/{dismiss_id}/dismiss", tokenB)
        if r.status_code == 200:
            body = r.json()
            ok = body.get("message") == "Dismissed"
            log(
                "CHECK 3 /split/reminders/{id}/dismiss",
                ok,
                f"200; body={body}",
            )
        else:
            log(
                "CHECK 3 /split/reminders/{id}/dismiss",
                False,
                f"status={r.status_code} body={r.text[:200]}",
            )
    else:
        log(
            "CHECK 3 /split/reminders/{id}/dismiss",
            False,
            "No reminder found in recipient's received list to dismiss",
        )

    # --- CHECK 4: POST /api/split/invite-to-settle ---
    invite_body = {
        "target_user_id": user_b_id,
        "target_name": "Rahul",
        "target_phone": TARGET_PHONE,
        "amount": 500,
        "group_name": "Goa Trip",
    }
    r = api("POST", "/split/invite-to-settle", tokenA, json=invite_body)
    if r.status_code == 200:
        data = r.json()
        required = {"upi_link", "whatsapp_url", "whatsapp_text", "share_text", "payee_upi", "has_upi"}
        missing = required - set(data.keys())
        if missing:
            log("CHECK 4 /split/invite-to-settle", False, f"missing {missing}: {list(data.keys())}")
        else:
            upi_ok = data["upi_link"].startswith("upi://pay")
            wa_ok = "wa.me" in (data["whatsapp_url"] or "")
            log(
                "CHECK 4 /split/invite-to-settle",
                upi_ok and wa_ok,
                f"200; upi_link_ok={upi_ok} wa_ok={wa_ok} has_upi={data['has_upi']}",
            )
    else:
        log("CHECK 4 /split/invite-to-settle", False, f"status={r.status_code} body={r.text[:240]}")

    # --- CHECK 5: Validation handler (NaN/non-finite → 422 not 500) ---
    # POST /api/budgets with NaN value. Use raw JSON with "NaN" literal (non-standard JSON
    # but python's json module emits it by default with allow_nan=True).
    nan_payload = json.dumps({"category": "Food", "amount": float("nan"), "period": "monthly"})
    r = requests.post(
        f"{BASE}/budgets",
        data=nan_payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {tokenA}",
        },
        timeout=15,
    )
    if r.status_code == 422:
        try:
            body = r.json()
            has_detail = "detail" in body
            log(
                "CHECK 5 validation handler (NaN)",
                has_detail,
                f"422 with detail field (body keys: {list(body.keys())})",
            )
        except Exception as e:
            log("CHECK 5 validation handler (NaN)", False, f"422 but body not JSON: {e}")
    else:
        log(
            "CHECK 5 validation handler (NaN)",
            False,
            f"status={r.status_code} (expected 422) body={r.text[:240]}",
        )

    # --- CHECK 6: Invalid ObjectId handler → 400 (not 500) ---
    r = api("GET", "/split/groups/bad-id/summary", tokenA)
    if r.status_code == 400:
        try:
            body = r.json()
            has_detail = "detail" in body
            log(
                "CHECK 6 invalid ObjectId handler",
                has_detail,
                f"400 with detail='{body.get('detail')}'",
            )
        except Exception as e:
            log("CHECK 6 invalid ObjectId handler", False, f"400 but body not JSON: {e}")
    else:
        log(
            "CHECK 6 invalid ObjectId handler",
            False,
            f"status={r.status_code} (expected 400) body={r.text[:240]}",
        )

    # --- CHECK 7: Adversarial pytest ---
    print("\n[running adversarial pytest...]")
    try:
        proc = subprocess.run(
            ["python", "-m", "pytest", "tests/test_adversarial.py", "-q"],
            cwd="/app/backend",
            capture_output=True,
            text=True,
            timeout=180,
        )
        out = (proc.stdout or "") + (proc.stderr or "")
        # Print tail
        print(out[-2500:])
        # Parse 'X passed' from output
        passed = 0
        failed = 0
        import re

        m = re.search(r"(\d+)\s+passed", out)
        if m:
            passed = int(m.group(1))
        m = re.search(r"(\d+)\s+failed", out)
        if m:
            failed = int(m.group(1))

        ok = proc.returncode == 0 and passed >= 24 and failed == 0
        log(
            "CHECK 7 adversarial pytest",
            ok,
            f"returncode={proc.returncode}, passed={passed}, failed={failed}",
        )
    except subprocess.TimeoutExpired:
        log("CHECK 7 adversarial pytest", False, "pytest timed out (>180s)")
    except Exception as e:
        log("CHECK 7 adversarial pytest", False, f"exception: {e}")

    return summarize()


def summarize() -> int:
    print("\n" + "=" * 72)
    print("SUMMARY")
    print("=" * 72)
    for name, ok, detail in results:
        mark = "✅" if ok else "❌"
        print(f"{mark} {name}")
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{passed}/{total} checks passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
