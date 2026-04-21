"""Retest Payment Methods CRUD after 500 bug fix in /app/backend/routers/user.py."""
import os
import sys
import requests

BASE = os.environ.get("BASE_URL", "https://mintu-finance.preview.emergentagent.com").rstrip("/") + "/api"
PHONE = "9876543210"
OTP = "123456"


def auth_token() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    print(f"send-otp: {r.status_code}")
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    print(f"verify-otp: {r.status_code}")
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in: {data}"
    return tok


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def clear_existing_methods(tok):
    """Wipe existing methods so we test fresh."""
    r = requests.get(f"{BASE}/user/payment-methods", headers=hdr(tok), timeout=30)
    if r.status_code != 200:
        return
    methods = r.json().get("methods", [])
    for m in methods:
        mid = m.get("id")
        if not mid or mid == "legacy_upi":
            continue
        dr = requests.delete(f"{BASE}/user/payment-methods/{mid}", headers=hdr(tok), timeout=30)
        print(f"  cleanup DELETE {mid} -> {dr.status_code}")


def main():
    results = []
    tok = auth_token()

    clear_existing_methods(tok)

    # Step 1: GET (fresh list)
    r = requests.get(f"{BASE}/user/payment-methods", headers=hdr(tok), timeout=30)
    ok = r.status_code == 200
    print(f"[1] GET /user/payment-methods -> {r.status_code} | body={r.text[:200]}")
    results.append(("1. GET initial", ok, r.status_code, r.text[:150]))

    # Step 2: POST UPI (is_default=true)
    payload = {"type": "upi", "upi_id": "firsttest@okicici", "is_default": True}
    r = requests.post(f"{BASE}/user/payment-methods", headers=hdr(tok), json=payload, timeout=30)
    print(f"[2] POST UPI -> {r.status_code} | body={r.text[:300]}")
    ok2 = r.status_code == 200
    upi_id = None
    upi_is_default = None
    if ok2:
        j = r.json()
        method = j.get("method", {})
        upi_id = method.get("id")
        upi_is_default = method.get("is_default")
        ok2 = bool(upi_id) and upi_is_default is True
    results.append(("2. POST UPI is_default=true", ok2, r.status_code, f"id={upi_id} is_default={upi_is_default}"))

    # Step 3: POST card (no is_default specified -> should still insert)
    payload = {"type": "card", "card_last4": "9999", "card_brand": "visa"}
    r = requests.post(f"{BASE}/user/payment-methods", headers=hdr(tok), json=payload, timeout=30)
    print(f"[3] POST card -> {r.status_code} | body={r.text[:300]}")
    ok3 = r.status_code == 200
    card_id = None
    if ok3:
        method = r.json().get("method", {})
        card_id = method.get("id")
        ok3 = bool(card_id)
    results.append(("3. POST card", ok3, r.status_code, f"id={card_id}"))

    if not card_id:
        print("Aborting remaining steps — no card_id")
        summarize(results)
        return

    # Step 4: PUT card as default
    r = requests.put(f"{BASE}/user/payment-methods/{card_id}/default", headers=hdr(tok), timeout=30)
    print(f"[4] PUT {card_id}/default -> {r.status_code} | body={r.text[:200]}")
    ok4 = r.status_code == 200
    results.append(("4. PUT card/default", ok4, r.status_code, r.text[:150]))

    # Step 5: GET -> card should be default
    r = requests.get(f"{BASE}/user/payment-methods", headers=hdr(tok), timeout=30)
    print(f"[5] GET list -> {r.status_code} | body={r.text[:500]}")
    ok5 = r.status_code == 200
    default_id = None
    if ok5:
        j = r.json()
        methods = j.get("methods", [])
        default = next((m for m in methods if m.get("is_default")), None)
        default_id = default.get("id") if default else None
        ok5 = default_id == card_id
    results.append(("5. GET card is default", ok5, r.status_code, f"default_id={default_id} (expected {card_id})"))

    # Step 6: DELETE card
    r = requests.delete(f"{BASE}/user/payment-methods/{card_id}", headers=hdr(tok), timeout=30)
    print(f"[6] DELETE card -> {r.status_code} | body={r.text[:200]}")
    ok6 = r.status_code == 200
    results.append(("6. DELETE card", ok6, r.status_code, r.text[:150]))

    # Step 7: GET -> card gone, upi still there
    r = requests.get(f"{BASE}/user/payment-methods", headers=hdr(tok), timeout=30)
    print(f"[7] GET after delete -> {r.status_code} | body={r.text[:500]}")
    ok7 = r.status_code == 200
    has_card = has_upi = False
    if ok7:
        methods = r.json().get("methods", [])
        ids = [m.get("id") for m in methods]
        has_card = card_id in ids
        has_upi = upi_id in ids
        ok7 = (not has_card) and has_upi
    results.append(("7. card gone, upi stays", ok7, r.status_code, f"card_present={has_card} upi_present={has_upi}"))

    summarize(results)


def summarize(results):
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    passed = sum(1 for _, ok, *_ in results if ok)
    for name, ok, code, detail in results:
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name:40s} http={code} {detail}")
    print(f"\n{passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
