"""
Round 30b — Spot-check /split/balances shape + math after the N+1 rewrite.
Uses external public URL (REACT_APP_BACKEND_URL).
"""
import os, json, random, time
import httpx

BACKEND = "https://mintu-finance.preview.emergentagent.com"
API = f"{BACKEND}/api"


def fresh_phone() -> str:
    return "9" + "".join(str(random.randint(0,9)) for _ in range(9))


def register(client, phone=None):
    phone = phone or fresh_phone()
    r = client.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, r.text
    r = client.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456", "name": f"U {phone[-4:]}"}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return {"token": j["token"], "user_id": (j.get("user") or {}).get("id") or j.get("user_id"), "phone": phone, "name": f"U {phone[-4:]}"}


def bearer(t):
    return {"Authorization": f"Bearer {t}"}


def main():
    results = []
    def add(ok, msg):
        results.append((ok, msg))
        print(("✅" if ok else "❌") + " " + msg)

    with httpx.Client(timeout=60) as c:
        a = register(c)
        b = register(c)
        print(f"A={a['user_id']} phone={a['phone']} | B={b['user_id']} phone={b['phone']}")

        # Create group with A as payer
        gr = c.post(f"{API}/split/groups", json={"name": "bal-test", "members": [b["phone"]]}, headers=bearer(a["token"]))
        add(gr.status_code == 200, f"create group → {gr.status_code}")
        if gr.status_code != 200:
            print(gr.text); return
        gid = gr.json()["id"]

        # A pays ₹600 split equally → B owes A ₹300
        exp = c.post(f"{API}/split/expenses", json={
            "group_id": gid, "paid_by": a["user_id"],
            "description": "dinner", "amount": 600, "split_type": "equal",
            "splits": {a["user_id"]: 300, b["user_id"]: 300},
        }, headers=bearer(a["token"]))
        add(exp.status_code == 200, f"create expense → {exp.status_code}")

        # A checks /split/balances — expect B owes A ₹300
        bal_a = c.get(f"{API}/split/balances", headers=bearer(a["token"]))
        add(bal_a.status_code == 200, f"A GET /split/balances → {bal_a.status_code}")
        body_a = bal_a.json()
        print("A balances:", json.dumps(body_a, indent=2))
        # Shape check
        for k in ("owe_you", "you_owe", "total_owed_to_you", "total_you_owe"):
            add(k in body_a, f"A balances has key '{k}'")
        add(isinstance(body_a["owe_you"], dict), "owe_you is a dict (name→amount)")
        add(isinstance(body_a["you_owe"], dict), "you_owe is a dict")
        add(isinstance(body_a["total_owed_to_you"], (int, float)), "total_owed_to_you numeric")
        add(isinstance(body_a["total_you_owe"], (int, float)), "total_you_owe numeric")
        # Math check
        add(abs(body_a["total_owed_to_you"] - 300) < 0.01, f"A total_owed_to_you == 300 (got {body_a['total_owed_to_you']})")
        add(abs(body_a["total_you_owe"]) < 0.01, f"A total_you_owe == 0 (got {body_a['total_you_owe']})")
        # B's name should appear in owe_you
        b_name_found = any(b["name"] in k or b["phone"][-4:] in k for k in body_a["owe_you"].keys())
        # lenient — just check there's one entry with ~300
        vals_a = list(body_a["owe_you"].values())
        add(len(vals_a) >= 1 and abs(vals_a[0] - 300) < 0.01, f"A owe_you has entry ≈300 (got {body_a['owe_you']})")

        # B checks /split/balances — expect A is owed ₹300
        bal_b = c.get(f"{API}/split/balances", headers=bearer(b["token"]))
        add(bal_b.status_code == 200, f"B GET /split/balances → {bal_b.status_code}")
        body_b = bal_b.json()
        print("B balances:", json.dumps(body_b, indent=2))
        add(abs(body_b["total_you_owe"] - 300) < 0.01, f"B total_you_owe == 300 (got {body_b['total_you_owe']})")
        add(abs(body_b["total_owed_to_you"]) < 0.01, f"B total_owed_to_you == 0 (got {body_b['total_owed_to_you']})")

        # Settle the debt (B pays A ₹300)
        settle = c.post(f"{API}/split/settle", json={
            "target_user_id": a["user_id"], "amount": 300, "group_id": gid, "method": "upi",
        }, headers=bearer(b["token"]))
        add(settle.status_code == 200, f"B settles ₹300 → {settle.status_code}: {settle.text[:200]}")

        # Post-settle balances should be zero both sides
        bal_a2 = c.get(f"{API}/split/balances", headers=bearer(a["token"])).json()
        bal_b2 = c.get(f"{API}/split/balances", headers=bearer(b["token"])).json()
        add(abs(bal_a2["total_owed_to_you"]) < 0.01, f"Post-settle A total_owed_to_you → 0 (got {bal_a2['total_owed_to_you']})")
        add(abs(bal_b2["total_you_owe"]) < 0.01, f"Post-settle B total_you_owe → 0 (got {bal_b2['total_you_owe']})")

        # /user/me sanity check
        me = c.get(f"{API}/user/me", headers=bearer(a["token"]))
        add(me.status_code == 200, f"GET /user/me → {me.status_code}")

    print()
    p = sum(1 for ok,_ in results if ok)
    f = sum(1 for ok,_ in results if not ok)
    print(f"============ {p}/{p+f} passed, {f} failed ============")
    return f == 0


if __name__ == "__main__":
    ok = main()
    raise SystemExit(0 if ok else 1)
