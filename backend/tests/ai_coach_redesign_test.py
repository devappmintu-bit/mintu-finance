"""AI Coach Redesign Test — product-native agent-chat endpoint.

Tests POST /api/ai/agent-chat after redesign:
1. Happy path with "Am I overspending?" — full structured response
2. Structured format markers in reply (Your Snapshot / Next Step)
3. Intent-based CTA (split query → open_split CTA)
4. Empty message → 400
5. Regression smoke on 5 endpoints
"""
import os
import sys
import json
import requests

BASE = os.environ.get("BACKEND_URL", "https://mintu-finance.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

PHONE = "9876543210"
PASSWORD = "test123"

PASS = []
FAIL = []


def record(name, ok, detail=""):
    (PASS if ok else FAIL).append((name, detail))
    print(f"{'PASS' if ok else 'FAIL'} | {name}" + (f"  :: {detail}" if detail else ""))


def login():
    r = requests.post(f"{API}/auth/login", json={"phone": PHONE, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    body = r.json()
    token = body.get("access_token") or body.get("token")
    assert token, f"no token in body: {body}"
    return token


def test_happy_path(token):
    h = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{API}/ai/agent-chat", json={"message": "Am I overspending?", "lang": "en"}, headers=h, timeout=60)
    record("T1.status_200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return None
    b = r.json()
    # required top-level keys
    for k in ["reply", "agent", "mode", "issues", "ctas", "context"]:
        record(f"T1.has_key.{k}", k in b, f"keys={list(b.keys())}")
    # reply non-empty
    reply = b.get("reply", "")
    record("T1.reply_non_empty", isinstance(reply, str) and len(reply.strip()) > 0, f"reply_len={len(reply) if isinstance(reply,str) else 'NA'}")
    # mode enum
    mode = b.get("mode")
    record("T1.mode_enum", mode in ["no_data", "partial", "full"], f"mode={mode}")
    # issues is list
    issues = b.get("issues")
    record("T1.issues_is_list", isinstance(issues, list), f"type={type(issues).__name__}")
    # ctas shape
    ctas = b.get("ctas")
    record("T1.ctas_is_list", isinstance(ctas, list), f"type={type(ctas).__name__}")
    if isinstance(ctas, list):
        record("T1.ctas_max_3", len(ctas) <= 3, f"len={len(ctas)}")
        for i, c in enumerate(ctas):
            ok_shape = isinstance(c, dict) and all(k in c for k in ["id", "label", "icon", "action"])
            record(f"T1.cta[{i}].shape", ok_shape, f"cta={c}")
    # agent shape
    agent = b.get("agent")
    ok_agent = isinstance(agent, dict) and all(k in agent for k in ["id", "name", "emoji"])
    record("T1.agent.shape", ok_agent, f"agent={agent}")
    # context shape
    ctx = b.get("context")
    ctx_keys = ["money_score", "monthly_expense", "monthly_income", "savings_rate", "transaction_count"]
    if isinstance(ctx, dict):
        missing = [k for k in ctx_keys if k not in ctx]
        record("T1.context.keys", not missing, f"missing={missing} got={list(ctx.keys())}")
    else:
        record("T1.context.keys", False, f"ctx type={type(ctx).__name__}")
    return b


def test_structured_format(body):
    if not body:
        record("T2.skipped", False, "no body from T1")
        return
    reply = body.get("reply", "")
    ctx = body.get("context", {})
    txn_count = ctx.get("transaction_count", 0) if isinstance(ctx, dict) else 0

    # 4-block markers
    has_snapshot = "Your Snapshot" in reply
    has_next_step = "Next Step" in reply
    record("T2.has_snapshot_or_next_step", has_snapshot or has_next_step,
           f"snapshot={has_snapshot} next_step={has_next_step} mode={body.get('mode')} txn_count={txn_count}")

    # slang check
    lr = reply.lower()
    has_yaar = "yaar" in lr
    has_bro = "bro" in lr and "brother" not in lr  # defensive
    record("T2.no_slang", not has_yaar and not has_bro, f"yaar={has_yaar} bro={has_bro}")

    # line count
    lines = [ln for ln in reply.splitlines() if ln.strip()]
    record("T2.max_15_lines", len(lines) <= 15, f"lines={len(lines)}")


def test_intent_cta(token):
    h = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{API}/ai/agent-chat", json={"message": "Who owes me?", "lang": "en"}, headers=h, timeout=60)
    record("T3.status_200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        return
    b = r.json()
    ctas = b.get("ctas", [])
    # find cta with action starting with navigate:/split and id open_split
    match = [c for c in ctas if isinstance(c, dict) and c.get("id") == "open_split" and str(c.get("action", "")).startswith("navigate:/split")]
    record("T3.open_split_cta_present", len(match) >= 1, f"ctas={ctas}")


def test_empty_message(token):
    h = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{API}/ai/agent-chat", json={"message": ""}, headers=h, timeout=30)
    record("T4.empty_message_400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")


def test_regression(token):
    h = {"Authorization": f"Bearer {token}"}
    endpoints = [
        ("/ai/agents", "GET"),
        ("/ai/proactive-nudges", "GET"),
        ("/insights/daily", "GET"),
        ("/analytics/summary", "GET"),
        ("/split/groups", "GET"),
    ]
    for path, method in endpoints:
        try:
            r = requests.request(method, f"{API}{path}", headers=h, timeout=60)
            ok = r.status_code == 200
            detail = f"status={r.status_code}"
            if ok:
                try:
                    body = r.json()
                    if isinstance(body, dict):
                        detail += f" keys={list(body.keys())[:6]}"
                    elif isinstance(body, list):
                        detail += f" list_len={len(body)}"
                except Exception:
                    detail += " (non-json)"
            else:
                detail += f" body={r.text[:200]}"
            record(f"T5.regression{path}", ok, detail)
        except Exception as e:
            record(f"T5.regression{path}", False, f"exception={e}")


def main():
    print(f"Testing against: {API}")
    token = login()
    print(f"Got JWT token (len={len(token)})")
    body = test_happy_path(token)
    test_structured_format(body)
    test_intent_cta(token)
    test_empty_message(token)
    test_regression(token)
    print("\n" + "=" * 60)
    print(f"RESULTS: {len(PASS)} PASS / {len(FAIL)} FAIL")
    if FAIL:
        print("\nFAILED:")
        for n, d in FAIL:
            print(f"  - {n}  :: {d}")
    sys.exit(0 if not FAIL else 1)


if __name__ == "__main__":
    main()
