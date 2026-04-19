"""Test legacy POST /api/ai/chat refactor - structured format mirroring /ai/agent-chat."""
import os
import json
import sys
import requests

FRONTEND_ENV = "/app/frontend/.env"


def _read_backend_url():
    with open(FRONTEND_ENV) as f:
        for line in f:
            if line.startswith(("REACT_APP_BACKEND_URL=", "EXPO_PUBLIC_BACKEND_URL=")):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("BACKEND URL not found")


BASE = _read_backend_url().rstrip("/") + "/api"
print(f"[INFO] BASE={BASE}")


def _auth():
    r = requests.post(
        f"{BASE}/auth/login",
        json={"phone": "9876543210", "password": "test123"},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in response: {r.json()}"
    print(f"[AUTH] OK token len={len(token)}")
    return {"Authorization": f"Bearer {token}"}


results = []


def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}: {detail}")
    results.append((name, ok, detail))


def main():
    headers = _auth()

    # T1: HAPPY PATH
    print("\n=== T1: HAPPY PATH — POST /api/ai/chat 'Am I overspending?' ===")
    r = requests.post(
        f"{BASE}/ai/chat",
        json={"message": "Am I overspending?", "lang": "en"},
        headers=headers,
        timeout=90,
    )
    record("T1 status 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        print(r.text[:1000])
        return
    body = r.json()
    print("[DEBUG] Response keys:", list(body.keys()))
    print("[DEBUG] reply (first 400 chars):", (body.get("reply") or "")[:400])
    print("[DEBUG] mode:", body.get("mode"))
    print("[DEBUG] issues:", body.get("issues"))
    print("[DEBUG] ctas:", body.get("ctas"))
    print("[DEBUG] context_used:", body.get("context_used"))

    required = ["reply", "mode", "issues", "ctas", "context_used"]
    for k in required:
        record(f"T1 has key '{k}'", k in body, f"present={k in body}")
    record(
        "T1 mode ∈ {no_data,partial,full}",
        body.get("mode") in {"no_data", "partial", "full"},
        f"mode={body.get('mode')}",
    )
    record("T1 issues is list", isinstance(body.get("issues"), list), f"type={type(body.get('issues')).__name__}")
    ctas = body.get("ctas")
    record("T1 ctas is list", isinstance(ctas, list), f"len={len(ctas) if isinstance(ctas, list) else 'n/a'}")
    if isinstance(ctas, list):
        record("T1 ctas ≤ 3", len(ctas) <= 3, f"len={len(ctas)}")
        for i, c in enumerate(ctas):
            record(
                f"T1 cta[{i}] has id/label/icon/action",
                isinstance(c, dict) and all(k in c for k in ("id", "label", "icon", "action")),
                f"keys={list(c.keys()) if isinstance(c, dict) else c}",
            )
    reply = body.get("reply", "")
    record("T1 reply is non-empty string", isinstance(reply, str) and len(reply) > 0, f"len={len(reply)}")
    ctx = body.get("context_used") or {}
    for k in ("money_score", "monthly_expense", "monthly_income", "savings_rate", "transaction_count", "top_category"):
        record(f"T1 context_used has '{k}'", k in ctx, f"present={k in ctx}")

    # T2: Structured 4-block
    print("\n=== T2: Structured format check ===")
    has_snapshot = "Your Snapshot" in reply
    has_next = "Next Step" in reply
    record("T2 reply contains 'Your Snapshot'", has_snapshot, f"found={has_snapshot}")
    record("T2 reply contains 'Next Step'", has_next, f"found={has_next}")
    low = reply.lower()
    for slang in ("yaar", "bro", "yaan"):
        record(f"T2 no slang '{slang}'", slang not in low, f"present={slang in low}")
    lines = reply.split("\n")
    record("T2 lines ≤ 15", len(lines) <= 15, f"line_count={len(lines)}")

    # T3: Intent→CTA
    print("\n=== T3: POST /api/ai/chat 'Who owes me money?' ===")
    r = requests.post(
        f"{BASE}/ai/chat",
        json={"message": "Who owes me money?", "lang": "en"},
        headers=headers,
        timeout=90,
    )
    record("T3 status 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        body3 = r.json()
        ctas3 = body3.get("ctas") or []
        print("[DEBUG] T3 ctas:", ctas3)
        open_split = [c for c in ctas3 if isinstance(c, dict) and c.get("id") == "open_split"]
        record(
            "T3 has cta id=open_split",
            len(open_split) >= 1,
            f"open_split ctas found={len(open_split)}",
        )
        if open_split:
            record(
                "T3 open_split action=navigate:/split",
                open_split[0].get("action", "").startswith("navigate:/split"),
                f"action={open_split[0].get('action')}",
            )

    # T4: Error handling
    print("\n=== T4: POST /api/ai/chat {message:''} ===")
    r = requests.post(
        f"{BASE}/ai/chat",
        json={"message": "", "lang": "en"},
        headers=headers,
        timeout=90,
    )
    print(f"[DEBUG] T4 status={r.status_code}, body={r.text[:500]}")
    record("T4 graceful (not 500)", r.status_code != 500, f"got {r.status_code}")
    # Acceptable: 400 OR 200-with-empty-reply
    if r.status_code == 200:
        try:
            b4 = r.json()
            record("T4 200 path: reply present (may be empty or fallback)", "reply" in b4, f"reply_key_present={'reply' in b4}")
        except Exception as e:
            record("T4 200 json parse", False, str(e))
    elif r.status_code == 400:
        record("T4 400 path", True, "returned 400")

    # T5: Regression
    print("\n=== T5: Regression smoke ===")
    # 5a: agent-chat
    r = requests.post(
        f"{BASE}/ai/agent-chat",
        json={"message": "Hi", "lang": "en"},
        headers=headers,
        timeout=90,
    )
    ok = r.status_code == 200
    record("T5a /ai/agent-chat 200", ok, f"got {r.status_code}")
    if ok:
        b5a = r.json()
        for k in ("mode", "issues", "ctas"):
            record(f"T5a agent-chat has '{k}'", k in b5a, f"present={k in b5a}")

    # 5b: agents
    r = requests.get(f"{BASE}/ai/agents", headers=headers, timeout=30)
    record("T5b /ai/agents 200", r.status_code == 200, f"got {r.status_code}")

    # 5c: insights/daily
    r = requests.get(f"{BASE}/insights/daily", headers=headers, timeout=90)
    record("T5c /insights/daily 200", r.status_code == 200, f"got {r.status_code}")

    # 5d: analytics/summary
    r = requests.get(f"{BASE}/analytics/summary", headers=headers, timeout=30)
    record("T5d /analytics/summary 200", r.status_code == 200, f"got {r.status_code}")

    # Summary
    print("\n================ SUMMARY ================")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"PASSED: {passed}")
    print(f"FAILED: {failed}")
    if failed:
        print("\nFAILURES:")
        for name, ok, detail in results:
            if not ok:
                print(f"  - {name}: {detail}")
    print(f"\nTOTAL: {passed}/{len(results)}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
