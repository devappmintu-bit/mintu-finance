"""
Targeted backend test per review request:
1. GET /api/referral/enhanced-status — verify 200 and required fields
2. POST /api/ai/agent-chat — verify new money_school agent routing
"""
import os
import requests

BASE = os.environ.get("BACKEND_URL", "https://mintu-finance.preview.emergentagent.com").rstrip("/") + "/api"
PHONE = "9876543210"
OTP = "123456"

results = []

def log(name, ok, detail=""):
    marker = "PASS" if ok else "FAIL"
    print(f"[{marker}] {name} — {detail}")
    results.append((name, ok, detail))


def get_token():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    if r.status_code != 200:
        raise Exception(f"send-otp failed: {r.status_code} {r.text[:200]}")
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    if r.status_code != 200:
        raise Exception(f"verify-otp failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if not token:
        raise Exception(f"No token in response: {data}")
    return token


def test_enhanced_status(token):
    r = requests.get(f"{BASE}/referral/enhanced-status",
                     headers={"Authorization": f"Bearer {token}"}, timeout=30)
    if r.status_code != 200:
        log("GET /referral/enhanced-status status 200", False,
            f"got {r.status_code}: {r.text[:200]}")
        return
    data = r.json()
    required = ["referral_code", "referral_count", "total_pro_days_earned", "reward_tiers",
                "next_milestone", "recent_referrals", "share_text", "whatsapp_text"]
    missing = [k for k in required if k not in data]
    if missing:
        log("enhanced-status required fields", False, f"missing: {missing}")
        return
    log("enhanced-status required fields", True, f"all {len(required)} present")

    tiers = data["reward_tiers"]
    if not isinstance(tiers, list) or len(tiers) != 4:
        log("reward_tiers length=4", False,
            f"got {len(tiers) if isinstance(tiers, list) else 'non-list'}")
        return
    tier_fields = ["friends", "reward", "pro_days", "icon", "unlocked"]
    for i, t in enumerate(tiers):
        missing_tier = [k for k in tier_fields if k not in t]
        if missing_tier:
            log(f"reward_tier[{i}] fields", False, f"missing: {missing_tier}")
            return
    log("reward_tiers (4 tiers, all required fields)", True,
        f"tiers at friends: {[t['friends'] for t in tiers]}")
    log("GET /referral/enhanced-status overall", True,
        f"code={data['referral_code']}, count={data['referral_count']}, "
        f"pro_days={data['total_pro_days_earned']}")


def test_agent_chat(token):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    cases = [
        ("Teach me about SIPs", True),
        ("What is CIBIL credit score?", True),
        ("Explain the 50/30/20 budget rule", True),
        ("How much did I spend on food?", False),  # should NOT route to money_school
    ]
    for msg, should_be_money_school in cases:
        try:
            r = requests.post(f"{BASE}/ai/agent-chat",
                              headers=headers,
                              json={"message": msg, "lang": "en"},
                              timeout=90)
        except Exception as e:
            log(f"agent-chat '{msg[:40]}'", False, f"request error: {e}")
            continue
        if r.status_code != 200:
            log(f"agent-chat '{msg[:40]}' 200", False,
                f"got {r.status_code}: {r.text[:200]}")
            continue
        data = r.json()
        reply = data.get("reply", "")
        agent = data.get("agent", {})
        if not reply or not isinstance(reply, str) or len(reply.strip()) < 5:
            log(f"agent-chat '{msg[:40]}' reply non-empty", False,
                f"reply='{str(reply)[:80]}'")
            continue
        if not isinstance(agent, dict):
            log(f"agent-chat '{msg[:40]}' agent object", False, f"agent={agent}")
            continue
        agent_id = agent.get("id", "")
        agent_name = agent.get("name", "")
        agent_emoji = agent.get("emoji", "")
        routed_money_school = (agent_id == "money_school")

        if should_be_money_school:
            if routed_money_school and agent_name == "Money School" and agent_emoji == "🎓":
                log(f"agent-chat '{msg[:40]}' -> Money School 🎓", True,
                    f"reply_chars={len(reply)}, agent_name='{agent_name}', emoji='{agent_emoji}'")
            else:
                log(f"agent-chat '{msg[:40]}' -> Money School 🎓", False,
                    f"got id='{agent_id}', name='{agent_name}', emoji='{agent_emoji}'")
        else:
            if not routed_money_school:
                log(f"agent-chat unrelated '{msg[:40]}' NOT money_school", True,
                    f"routed to '{agent_id}' ({agent_name})")
            else:
                log(f"agent-chat unrelated '{msg[:40]}' NOT money_school", False,
                    "incorrectly routed to money_school")


def main():
    print(f"Base URL: {BASE}")
    try:
        token = get_token()
        log("Auth (OTP)", True, "token obtained")
    except Exception as e:
        log("Auth (OTP)", False, str(e))
    else:
        test_enhanced_status(token)
        test_agent_chat(token)

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n=== SUMMARY ===")
    for n, ok, d in results:
        print(f"{'PASS' if ok else 'FAIL'}: {n} — {d}")
    print(f"\n{passed}/{total} passed")


if __name__ == "__main__":
    main()
