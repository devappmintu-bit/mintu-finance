"""R102B — Smart Follow-up chips + Prompt Evolution Stage tests.

Verifies that POST /api/coach/chat returns:
- follow_ups: 4 strings, non-empty, matching per-stage canonical lists
- stage: int in 0..3, consistent across calls for same user
- reply: ≤6 lines, no banned phrases (regression check)
"""
import json
import os
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9111122221"
OTP = "123456"

CANONICAL = {
    0: ["Why this number?", "Change category", "Show examples", "Skip for now"],
    1: ["Why this category?", "Show me the math", "Try a smaller cut", "Different category"],
    2: ["Show last week vs this", "What's leaking?", "Make this weekly"],  # plus dynamic "Cut {top_cat} by 10%"
    3: ["Predict month-end", "Compare to last month", "Connect to my goal", "What changed this week?"],
}

BANNED = [
    "i don't have enough",
    "general estimate",
    "starter cap",
    "temporary guardrails",
    "baseline",
]


def jprint(label, obj):
    print(f"\n──────── {label} ────────")
    print(json.dumps(obj, indent=2, ensure_ascii=False)[:2000])


def main():
    results = []

    # T1 Auth
    print("=== T1 — Auth ===")
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    print(f"send-otp → {r.status_code}")
    assert r.status_code == 200, f"send-otp failed: {r.text}"

    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={
            "phone": PHONE,
            "otp": OTP,
            "device_id": "r102b-cli",
            "device_name": "R102B Test",
            "os": "linux",
        },
        timeout=15,
    )
    print(f"verify-otp → {r.status_code}")
    assert r.status_code == 200, f"verify-otp failed: {r.text}"
    token = r.json().get("access_token")
    assert token, "no access_token"
    print(f"token len={len(token)} ✅")
    results.append(("T1 auth", True, ""))

    H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # T2 — POST /coach/chat with "help me"
    print("\n=== T2 — POST /coach/chat 'help me' ===")
    r = requests.post(
        f"{BASE}/coach/chat",
        headers=H,
        json={"message": "help me", "lang": "en"},
        timeout=30,
    )
    print(f"status={r.status_code}")
    assert r.status_code == 200, f"coach/chat failed: {r.text}"
    body1 = r.json()
    jprint("T2 response", body1)

    follow_ups_1 = body1.get("follow_ups")
    stage_1 = body1.get("stage")
    reply_1 = body1.get("reply", "")

    # Assertions T2
    a_t2 = []
    a_t2.append(("follow_ups is list", isinstance(follow_ups_1, list)))
    a_t2.append(("follow_ups len == 4", isinstance(follow_ups_1, list) and len(follow_ups_1) == 4))
    a_t2.append(("follow_ups all strings", isinstance(follow_ups_1, list) and all(isinstance(x, str) and x.strip() for x in follow_ups_1)))
    a_t2.append(("stage is int", isinstance(stage_1, int)))
    a_t2.append(("stage in 0..3", isinstance(stage_1, int) and 0 <= stage_1 <= 3))

    # Reply checks (regression)
    lines = [ln for ln in reply_1.split("\n") if ln.strip()]
    a_t2.append((f"reply ≤6 lines (got {len(lines)})", len(lines) <= 6))
    low = reply_1.lower()
    for phrase in BANNED:
        a_t2.append((f"reply free of '{phrase}'", phrase not in low))

    for label, ok in a_t2:
        print(f"  {'✅' if ok else '❌'} {label}")
        results.append((f"T2 {label}", ok, ""))

    print(f"\nactual stage = {stage_1}")
    print(f"actual follow_ups = {follow_ups_1}")

    # T3 — POST /coach/chat with "where am I overspending?"
    print("\n=== T3 — POST /coach/chat 'where am I overspending?' ===")
    r = requests.post(
        f"{BASE}/coach/chat",
        headers=H,
        json={"message": "where am I overspending?", "lang": "en"},
        timeout=30,
    )
    print(f"status={r.status_code}")
    assert r.status_code == 200, f"coach/chat T3 failed: {r.text}"
    body2 = r.json()
    jprint("T3 response", body2)

    follow_ups_2 = body2.get("follow_ups")
    stage_2 = body2.get("stage")
    reply_2 = body2.get("reply", "")

    a_t3 = []
    a_t3.append(("follow_ups is list of 4", isinstance(follow_ups_2, list) and len(follow_ups_2) == 4))
    a_t3.append(("follow_ups all non-empty strings", isinstance(follow_ups_2, list) and all(isinstance(x, str) and x.strip() for x in follow_ups_2)))
    a_t3.append((f"stage matches T2 ({stage_1} == {stage_2})", stage_1 == stage_2))
    a_t3.append((f"reply ≤6 lines (got {len([ln for ln in reply_2.split(chr(10)) if ln.strip()])})", len([ln for ln in reply_2.split('\n') if ln.strip()]) <= 6))

    for label, ok in a_t3:
        print(f"  {'✅' if ok else '❌'} {label}")
        results.append((f"T3 {label}", ok, ""))

    print(f"\nactual stage = {stage_2}")
    print(f"actual follow_ups = {follow_ups_2}")

    # T4 — Sanity: at least one follow_up matches the canonical list for the user's stage
    print(f"\n=== T4 — Canonical match check (stage={stage_1}) ===")
    canonical_list = CANONICAL.get(stage_1, [])
    print(f"canonical for stage {stage_1}: {canonical_list}")
    
    matched_in_t2 = [c for c in canonical_list if c in follow_ups_1]
    matched_in_t3 = [c for c in canonical_list if c in follow_ups_2]
    
    print(f"T2 matched: {matched_in_t2}")
    print(f"T3 matched: {matched_in_t3}")

    # For stage 2, "Cut {top_cat} by 10%" is dynamic — also check by prefix
    if stage_1 == 2:
        has_cut_prefix_t2 = any(x.startswith("Cut ") and x.endswith(" by 10%") for x in follow_ups_1)
        has_cut_prefix_t3 = any(x.startswith("Cut ") and x.endswith(" by 10%") for x in follow_ups_2)
        if has_cut_prefix_t2:
            matched_in_t2.append("Cut <top_cat> by 10% (dynamic)")
        if has_cut_prefix_t3:
            matched_in_t3.append("Cut <top_cat> by 10% (dynamic)")

    a_t4_t2 = len(matched_in_t2) >= 1
    a_t4_t3 = len(matched_in_t3) >= 1
    print(f"  {'✅' if a_t4_t2 else '❌'} T2 has ≥1 canonical follow_up")
    print(f"  {'✅' if a_t4_t3 else '❌'} T3 has ≥1 canonical follow_up")
    results.append(("T4 T2 ≥1 canonical match", a_t4_t2, ""))
    results.append(("T4 T3 ≥1 canonical match", a_t4_t3, ""))

    # T5 — Compare follow_ups across calls (should be identical for same stage, same top_cat)
    print(f"\n=== T5 — follow_ups identical across calls (same stage/top_cat) ===")
    same = follow_ups_1 == follow_ups_2
    print(f"  {'✅' if same else '⚠️ '} follow_ups identical: {same}")
    print(f"    T2: {follow_ups_1}")
    print(f"    T3: {follow_ups_2}")
    # not a hard failure — top_cat could shift if data changed mid-test
    results.append(("T5 follow_ups consistent", same, "informational only" if not same else ""))

    # SUMMARY
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    for label, ok, note in results:
        sym = "✅" if ok else "❌"
        print(f"  {sym} {label}{(' — ' + note) if note else ''}")
    print(f"\n{passed}/{total} assertions PASSED")
    print(f"\nFINAL stage = {stage_1}")
    print(f"FINAL T2 follow_ups = {follow_ups_1}")
    print(f"FINAL T3 follow_ups = {follow_ups_2}")
    print(f"FINAL T2 reply = {reply_1!r}")
    print(f"FINAL T3 reply = {reply_2!r}")

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
