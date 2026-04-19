"""MintU backend test — validate 3 fixes + regression endpoints (Apr 2026)."""
import json
import time
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"
PASSWORD = "test123"

results = []
def log(name, ok, detail=""):
    tag = "✅" if ok else "❌"
    results.append((ok, name, detail))
    print(f"{tag} {name} — {detail}")

# ── AUTH ──────────────────────────────────────────────────────────────
def login():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    log("POST /auth/send-otp", r.status_code == 200, f"{r.status_code} {r.text[:100]}")
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    ok = r.status_code == 200 and "token" in r.json()
    log("POST /auth/verify-otp", ok, f"{r.status_code} token_len={len(r.json().get('token','')) if ok else 0}")
    return r.json()["token"] if ok else None

token = login()
assert token, "Auth failed — cannot continue"
HEAD = {"Authorization": f"Bearer {token}"}

# ── FIX 1: SMS Bulk Parse ─────────────────────────────────────────────
print("\n════ FIX 1: SMS /bulk-parse ════")
payload = {"messages": [
    "HDFC Bank: Rs 500.00 debited from A/c XX1234 at SWIGGY on 20-APR-26. Avl Bal: Rs 45,320.00",
    "SBI: Rs 120 UPI paid to Amazon via UPI Ref 123456. Avl Bal Rs 12,000",
]}
r = requests.post(f"{BASE}/sms/bulk-parse", json=payload, headers=HEAD, timeout=90)
ok = r.status_code == 200
detail = f"{r.status_code}"
if ok:
    body = r.json()
    detail += f" parsed={body.get('parsed')} failed={body.get('failed')} total={body.get('total')}"
    ok = ("parsed" in body and "failed" in body and "total" in body)
else:
    detail += f" body={r.text[:200]}"
log("POST /sms/bulk-parse (2 valid SMS)", ok, detail)

r2 = requests.post(f"{BASE}/sms/parse-bulk", json=payload, headers=HEAD, timeout=15)
log("POST /sms/parse-bulk (old wrong path)", r2.status_code == 404, f"{r2.status_code} (expected 404)")

r3 = requests.post(f"{BASE}/sms/bulk-parse", json={"messages": []}, headers=HEAD, timeout=15)
log("POST /sms/bulk-parse (empty)", r3.status_code == 400, f"{r3.status_code} {r3.text[:100]}")

r4 = requests.post(f"{BASE}/sms/bulk-parse", json=payload, timeout=15)
log("POST /sms/bulk-parse (no auth)", r4.status_code in (401, 422, 403), f"{r4.status_code}")

# ── FIX 2: India Finance News ─────────────────────────────────────────
print("\n════ FIX 2: News /india-finance ════")
r = requests.get(f"{BASE}/news/india-finance", headers=HEAD, timeout=30)
ok = r.status_code == 200
detail = f"{r.status_code}"
body = {}
if ok:
    body = r.json()
    articles = body.get("articles", [])
    detail += f" articles={len(articles)} is_fallback={body.get('is_fallback')} updated_at={body.get('updated_at')}"
    ok = len(articles) == 6
log("GET /news/india-finance (1st call)", ok, detail)

if body.get("articles"):
    a = body["articles"][0]
    fields_ok = all(k in a for k in ("title", "summary", "category", "emoji", "source"))
    log("  article fields (title/summary/category/emoji/source)", fields_ok, f"keys={list(a.keys())}")
    not_polluted = all("Seeded test news" not in art.get("title", "") for art in body["articles"])
    log("  not polluted with 'Seeded test news'", not_polluted, "clean" if not_polluted else "STILL POLLUTED")

print("  … waiting 40s for background LLM regen …")
time.sleep(40)
r2 = requests.get(f"{BASE}/news/india-finance", headers=HEAD, timeout=30)
if r2.status_code == 200:
    b2 = r2.json()
    fresh_ok = (b2.get("is_fallback") is False) and bool(b2.get("updated_at"))
    log("GET /news/india-finance (post-regen)", fresh_ok,
        f"is_fallback={b2.get('is_fallback')} updated_at={b2.get('updated_at')} articles={len(b2.get('articles',[]))}")
    if b2.get("articles"):
        first_title = b2["articles"][0].get("title", "")
        log("  fresh LLM article title (sample)", True, first_title[:80])
else:
    log("GET /news/india-finance (post-regen)", False, f"{r2.status_code}")

# ── FIX 3: Money School lessons ─────
print("\n════ FIX 3: Money School /lessons (backend still open) ════")
r = requests.get(f"{BASE}/money-school/lessons", headers=HEAD, timeout=15)
ok = r.status_code == 200
if ok:
    body = r.json()
    lessons = body if isinstance(body, list) else body.get("lessons", [])
    ok = isinstance(lessons, list) and len(lessons) > 0
    log("GET /money-school/lessons", ok, f"{r.status_code} count={len(lessons)}")
else:
    log("GET /money-school/lessons", False, f"{r.status_code} {r.text[:200]}")

# ── REGRESSION ────────────────────────────────────────────────────────
print("\n════ REGRESSION ════")

def check(method, path, status_expected=200, **kw):
    try:
        r = requests.request(method, f"{BASE}{path}", headers=HEAD, timeout=30, **kw)
        ok = r.status_code == status_expected
        log(f"{method} {path}", ok, f"{r.status_code}")
        return r
    except Exception as e:
        log(f"{method} {path}", False, f"EXCEPTION {e}")
        return None

check("GET", "/transactions")
check("GET", "/analytics/summary")
check("GET", "/premium/status")
check("POST", "/premium/tax-calculator", json={"annual_income": 1000000})
check("POST", "/premium/investment-suggest", json={"monthly_income": 50000, "monthly_expenses": 30000})
check("GET", "/money-school/daily")
check("GET", "/money-school/dynamic")
check("POST", "/notifications/register-token", json={"push_token": "ExponentPushToken[testtokenDoNotDeliver]"})
check("POST", "/notifications/send-test")

# ── SUMMARY ──────────────────────────────────────────────────────────
fail = [(n, d) for ok, n, d in results if not ok]
print(f"\n════ SUMMARY ════ {len(results)-len(fail)}/{len(results)} passed")
for n, d in fail:
    print(f"  FAIL: {n} — {d}")
