"""Backend tests for MintU: Profile Identity Hub + Goals CRUD.

Covers:
  1. GET  /api/profile/identity
  2. GET  /api/profile/score-boosts
  3. GET/POST/PATCH/DELETE /api/goals
  4. Auth guard (no-auth → 401/422)

Run: python /app/backend_test.py
"""
from __future__ import annotations

import sys
import uuid
from typing import Any, List, Optional, Tuple

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"
TIMEOUT = 30

GREEN = "\033[92m"
RED = "\033[91m"
YEL = "\033[93m"
RST = "\033[0m"


results: List[Tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> bool:
    results.append((name, ok, detail))
    mark = f"{GREEN}PASS{RST}" if ok else f"{RED}FAIL{RST}"
    print(f"  [{mark}] {name}" + (f"  — {detail}" if detail else ""))
    return ok


def _req(method: str, path: str, *, token: Optional[str] = None, json_body: Any = None) -> Tuple[int, Any]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"{BASE}{path}"
    try:
        resp = requests.request(method, url, headers=headers, json=json_body, timeout=TIMEOUT)
    except Exception as e:
        return 0, {"error": str(e)}
    try:
        body = resp.json()
    except Exception:
        body = {"_raw": resp.text[:400]}
    return resp.status_code, body


def login() -> Optional[str]:
    print(f"\n{YEL}── AUTH ───────────────────────────────────────────────{RST}")
    sc, body = _req("POST", "/auth/send-otp", json_body={"phone": PHONE})
    record("send-otp → 200", sc == 200, f"status={sc}")
    sc, body = _req("POST", "/auth/verify-otp", json_body={"phone": PHONE, "otp": OTP})
    token = None
    if isinstance(body, dict):
        token = (body.get("token")
                 or body.get("access_token")
                 or (body.get("data") or {}).get("token")
                 or (body.get("data") or {}).get("access_token"))
    record("verify-otp → 200 + token", sc == 200 and bool(token),
           f"status={sc}, keys={list(body.keys()) if isinstance(body, dict) else 'n/a'}")
    return token


def test_profile_identity(token: str) -> None:
    print(f"\n{YEL}── GET /api/profile/identity ──────────────────────────{RST}")
    sc, body = _req("GET", "/profile/identity", token=token)
    record("identity → 200", sc == 200, f"status={sc}")
    if sc != 200 or not isinstance(body, dict):
        record("identity body missing", False, f"body={body}")
        return

    required_fields = {
        "user_id": str,
        "name": str,
        "phone": str,
        "money_score": int,
        "monthly_score_delta": int,
        "top_percent": int,
        "coins_balance": int,
        "streak": int,
        "badges_earned": int,
        "badges_total": int,
        "tier_label": str,
        "tier_emoji": str,
        "is_premium": bool,
    }
    for k, typ in required_fields.items():
        present = k in body
        type_ok = present and isinstance(body[k], typ)
        record(f"identity.{k} present + type {typ.__name__}", present and type_ok,
               f"value={body.get(k)!r}")
    avatar_ok = body.get("avatar") is None or isinstance(body.get("avatar"), str)
    record("identity.avatar None|str", avatar_ok,
           f"value_type={type(body.get('avatar')).__name__}")

    ms = body.get("money_score", -1)
    record("identity.money_score in 0..100", 0 <= ms <= 100, f"money_score={ms}")
    tp = body.get("top_percent", 0)
    record("identity.top_percent in sensible range", 1 <= tp <= 100, f"top_percent={tp}")
    record("identity.badges_total > 0", body.get("badges_total", 0) > 0,
           f"badges_total={body.get('badges_total')}")


def test_score_boosts(token: str) -> None:
    print(f"\n{YEL}── GET /api/profile/score-boosts ──────────────────────{RST}")
    sc, body = _req("GET", "/profile/score-boosts", token=token)
    record("score-boosts → 200", sc == 200, f"status={sc}")
    if sc != 200 or not isinstance(body, dict):
        return
    boosts = body.get("boosts")
    record("boosts is list", isinstance(boosts, list), f"type={type(boosts).__name__}")
    if isinstance(boosts, list):
        record("boosts length == 3", len(boosts) == 3, f"len={len(boosts)}")
        required = {"id", "emoji", "title", "sub", "points", "route", "cta"}
        for i, b in enumerate(boosts):
            missing = required - set((b or {}).keys())
            record(f"boost[{i}] has all required keys", not missing,
                   f"missing={missing}, id={(b or {}).get('id')}")
            if isinstance(b, dict):
                record(f"boost[{i}].points is int", isinstance(b.get("points"), int),
                       f"points={b.get('points')!r}")
    record("score-boosts.current_score is int",
           isinstance(body.get("current_score"), int),
           f"current_score={body.get('current_score')!r}")
    record("score-boosts.max_potential is int",
           isinstance(body.get("max_potential"), int),
           f"max_potential={body.get('max_potential')!r}")


def test_goals_crud(token: str) -> None:
    print(f"\n{YEL}── GOALS CRUD ────────────────────────────────────────{RST}")

    sc, body = _req("GET", "/goals", token=token)
    record("GET /goals → 200", sc == 200, f"status={sc}")
    baseline_goals = (body or {}).get("goals", []) if sc == 200 else []
    record("GET /goals returns list", isinstance(baseline_goals, list),
           f"count_before={len(baseline_goals)}")

    unique_name = f"Goa Trip {uuid.uuid4().hex[:6]}"
    payload = {
        "name": unique_name,
        "target_amount": 50000.0,
        "saved_amount": 12000.0,
        "emoji": "🏖️",
        "color": "#4CAF50",
    }
    sc, body = _req("POST", "/goals", token=token, json_body=payload)
    record("POST /goals → 200", sc == 200, f"status={sc}")
    goal_id = None
    if sc == 200 and isinstance(body, dict):
        goal = body.get("goal") or {}
        goal_id = goal.get("id")
        record("POST /goals returns goal.id", bool(goal_id), f"id={goal_id}")
        record("POST persists name", goal.get("name") == unique_name,
               f"name={goal.get('name')}")
        record("POST persists target_amount",
               abs(float(goal.get("target_amount", 0)) - 50000.0) < 0.01,
               f"target={goal.get('target_amount')}")
        record("POST persists saved_amount",
               abs(float(goal.get("saved_amount", 0)) - 12000.0) < 0.01,
               f"saved={goal.get('saved_amount')}")
        record("POST persists emoji/color",
               goal.get("emoji") == "🏖️" and goal.get("color") == "#4CAF50",
               f"emoji={goal.get('emoji')}, color={goal.get('color')}")

    if not goal_id:
        record("CRUD blocked: goal_id missing", False, "cannot proceed")
        return

    sc, body = _req("GET", "/goals", token=token)
    found = False
    if sc == 200 and isinstance(body, dict):
        found = any(g.get("id") == goal_id for g in body.get("goals", []))
    record("GET /goals includes new goal after create", found, f"goal_id={goal_id}")

    patch_payload = {"saved_amount": 20000.0, "name": unique_name + " Updated"}
    sc, body = _req("PATCH", f"/goals/{goal_id}", token=token, json_body=patch_payload)
    record("PATCH /goals/{id} → 200", sc == 200, f"status={sc}")
    if sc == 200 and isinstance(body, dict):
        g = body.get("goal") or {}
        record("PATCH persists updated saved_amount",
               abs(float(g.get("saved_amount", 0)) - 20000.0) < 0.01,
               f"saved={g.get('saved_amount')}")
        record("PATCH persists updated name",
               g.get("name") == unique_name + " Updated",
               f"name={g.get('name')}")

    sc, body = _req("DELETE", f"/goals/{goal_id}", token=token)
    record("DELETE /goals/{id} → 200", sc == 200, f"status={sc}")

    sc, body = _req("GET", "/goals", token=token)
    still_there = False
    if sc == 200 and isinstance(body, dict):
        still_there = any(g.get("id") == goal_id for g in body.get("goals", []))
    record("GET /goals excludes deleted goal", not still_there,
           f"still_there={still_there}")

    sc, body = _req("DELETE", f"/goals/{goal_id}", token=token)
    record("DELETE already-deleted → 404", sc == 404, f"status={sc}")

    sc, body = _req("DELETE", "/goals/not-a-valid-id", token=token)
    record("DELETE bad id → 404", sc == 404, f"status={sc}")


def test_auth_guards() -> None:
    print(f"\n{YEL}── AUTH GUARDS (no token) ────────────────────────────{RST}")
    for path, method in [
        ("/profile/identity", "GET"),
        ("/profile/score-boosts", "GET"),
        ("/goals", "GET"),
        ("/goals", "POST"),
    ]:
        sc, body = _req(method, path, json_body={} if method == "POST" else None)
        record(f"{method} {path} no-auth → 401/422", sc in (401, 422), f"status={sc}")

    sc, body = _req("GET", "/profile/identity", token="definitely.not.a.valid.token")
    record("GET /profile/identity bad-token → 401", sc == 401, f"status={sc}")


def main():
    print(f"{YEL}MintU Profile Hub + Goals CRUD Tests{RST}")
    print(f"Base: {BASE}\n")
    token = login()
    if not token:
        print(f"{RED}Cannot proceed without token{RST}")
        _summary()
        sys.exit(1)
    test_profile_identity(token)
    test_score_boosts(token)
    test_goals_crud(token)
    test_auth_guards()
    _summary()


def _summary():
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{YEL}════════════════════════════════════════════════════════{RST}")
    print(f"  TOTAL: {passed}/{total} PASS")
    fails = [(n, d) for n, ok, d in results if not ok]
    if fails:
        print(f"\n{RED}Failures:{RST}")
        for n, d in fails:
            print(f"  - {n}  — {d}")
    print(f"{YEL}════════════════════════════════════════════════════════{RST}")


if __name__ == "__main__":
    main()
