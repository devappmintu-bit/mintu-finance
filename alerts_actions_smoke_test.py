"""Sanity test for /api/alerts/smart 'actions' array + /api/home/bundle alerts block."""
import requests, json, sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

ALLOWED_STYLES = {"primary", "secondary", "danger"}

fails = []
passes = []

def P(msg): passes.append(msg); print("PASS:", msg)
def F(msg): fails.append(msg); print("FAIL:", msg)

# Step 1. Auth
r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=90)
if r.status_code != 200:
    print("send-otp failed", r.status_code, r.text); sys.exit(1)
P("send-otp 200")

r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
if r.status_code != 200:
    print("verify-otp failed", r.status_code, r.text); sys.exit(1)
token = r.json().get("token") or r.json().get("access_token")
if not token:
    print("no token in verify-otp:", r.json()); sys.exit(1)
P(f"verify-otp 200, token len={len(token)}")

H = {"Authorization": f"Bearer {token}"}

def validate_action(a, ctx):
    if not isinstance(a, dict):
        F(f"{ctx}: action not dict"); return
    for k in ("label", "route", "style", "icon"):
        if k not in a:
            F(f"{ctx}: missing key '{k}'"); return
    if not isinstance(a["label"], str) or not a["label"]:
        F(f"{ctx}: label not non-empty string: {a['label']!r}"); return
    if not isinstance(a["route"], str) or not a["route"].startswith("/"):
        F(f"{ctx}: route must start with '/': {a['route']!r}"); return
    if a["style"] not in ALLOWED_STYLES:
        F(f"{ctx}: style {a['style']!r} not in {ALLOWED_STYLES}"); return
    if not isinstance(a["icon"], str) or not a["icon"]:
        F(f"{ctx}: icon not non-empty string: {a['icon']!r}"); return
    P(f"{ctx}: action OK label={a['label']!r} route={a['route']} style={a['style']} icon={a['icon']}")

def validate_alert(al, idx, source):
    ctx_a = f"{source}.alerts[{idx}]"
    if not isinstance(al, dict):
        F(f"{ctx_a}: not dict"); return
    for k in ("emoji", "severity", "title", "message", "actions"):
        if k not in al:
            F(f"{ctx_a}: missing '{k}'"); return
    if not isinstance(al["actions"], list):
        F(f"{ctx_a}: actions not list"); return
    if len(al["actions"]) == 0:
        F(f"{ctx_a}: actions is empty (spec requires CTAs for every alert)")
    P(f"{ctx_a}: type={al.get('type')} sev={al['severity']} actions_len={len(al['actions'])}")
    for j, a in enumerate(al["actions"]):
        validate_action(a, f"{ctx_a}.actions[{j}]")

# Step 2. /api/alerts/smart
r = requests.get(f"{BASE}/alerts/smart", headers=H, timeout=30)
if r.status_code != 200:
    F(f"/alerts/smart status {r.status_code}: {r.text[:300]}")
else:
    P("/alerts/smart 200")
    body = r.json()
    print("alerts/smart body keys:", list(body.keys()))
    if "alerts" not in body or "count" not in body:
        F(f"/alerts/smart missing 'alerts' or 'count': {body}")
    else:
        P(f"/alerts/smart shape OK count={body['count']} alerts_len={len(body['alerts'])}")
        if len(body["alerts"]) == 0:
            print("NOTE: alerts list is empty; cannot validate per-alert actions on this user.")
        for i, al in enumerate(body["alerts"]):
            validate_alert(al, i, "alerts/smart")

# Step 3. /api/home/bundle?lang=en
r = requests.get(f"{BASE}/home/bundle?lang=en", headers=H, timeout=60)
if r.status_code != 200:
    F(f"/home/bundle status {r.status_code}: {r.text[:300]}")
else:
    P("/home/bundle 200")
    body = r.json()
    print("home/bundle keys:", list(body.keys())[:20])
    alerts_block = body.get("alerts")
    if alerts_block is None:
        F("/home/bundle missing 'alerts' block")
    else:
        # alerts block should be the {alerts:[], count:N} object from smart_alerts
        if isinstance(alerts_block, dict) and "alerts" in alerts_block:
            P(f"/home/bundle.alerts object w/ count={alerts_block.get('count')} len={len(alerts_block['alerts'])}")
            for i, al in enumerate(alerts_block["alerts"]):
                validate_alert(al, i, "home/bundle.alerts")
        elif isinstance(alerts_block, list):
            P(f"/home/bundle.alerts is a list len={len(alerts_block)}")
            for i, al in enumerate(alerts_block):
                validate_alert(al, i, "home/bundle.alerts")
        else:
            F(f"/home/bundle.alerts unexpected shape: {type(alerts_block).__name__}")

print("\n==== SUMMARY ====")
print(f"PASS: {len(passes)}")
print(f"FAIL: {len(fails)}")
for f in fails: print("  -", f)
sys.exit(1 if fails else 0)
