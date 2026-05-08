"""R109 — Power-user data export endpoints test.

Tests:
1. AUTH GUARD on all 3 endpoints.
2. /api/export/transactions.csv shape, header, date filter, error on bad date.
3. /api/export/budgets.csv shape, header, math (remaining/status).
4. /api/export/all.json shape, metadata, counts, no _id leak, ISO datetimes.
5. SECURITY — only authenticated user's data returned.
"""
import csv
import io
import json
import sys
import time

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PRIMARY_PHONE = "9876543210"
SECONDARY_PHONE = "9111122221"  # for cross-leak check
OTP = "123456"

results = []


def check(label: str, cond: bool, detail: str = "") -> bool:
    icon = "✅" if cond else "❌"
    line = f"{icon} {label}"
    if detail:
        line += f" — {detail}"
    print(line)
    results.append((label, cond, detail))
    return cond


def login(phone: str) -> str:
    r = requests.post(
        f"{BASE}/auth/send-otp",
        json={"phone": phone},
        timeout=15,
    )
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={
            "phone": phone,
            "otp": OTP,
            "device_id": "r109-test",
            "device_name": "r109-test",
            "os": "test",
        },
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def main() -> int:
    print("\n=== R109 Export Endpoints Test ===")
    print(f"BASE: {BASE}\n")

    # --- 1. AUTH GUARD ---------------------------------------------------
    print("[T1] AUTH GUARD — no Authorization header")
    for path in ("/export/transactions.csv", "/export/budgets.csv", "/export/all.json"):
        r = requests.get(f"{BASE}{path}", timeout=10)
        check(
            f"GET {path} without auth → 401",
            r.status_code == 401,
            f"got {r.status_code}",
        )

    # --- LOGIN -----------------------------------------------------------
    print("\n[Login] primary user")
    token = login(PRIMARY_PHONE)
    check("Primary user JWT issued", bool(token) and len(token) > 50, f"len={len(token)}")
    H = {"Authorization": f"Bearer {token}"}

    # Pull current transactions count + sample for cross-checks
    r = requests.get(f"{BASE}/transactions?limit=10000", headers=H, timeout=20)
    if r.status_code == 200:
        try:
            j = r.json()
            txns = j if isinstance(j, list) else j.get("transactions", j.get("data", []))
            primary_user_id = None
            if isinstance(j, dict):
                primary_user_id = j.get("user_id")
        except Exception:
            txns = []
            primary_user_id = None
    else:
        txns = []
        primary_user_id = None
    primary_txn_count = len(txns) if isinstance(txns, list) else 0
    print(f"   primary user has {primary_txn_count} txns via GET /transactions")

    # Try /user/me to get user_id authoritatively
    r = requests.get(f"{BASE}/user/me", headers=H, timeout=10)
    if r.status_code == 200:
        try:
            primary_user_id = r.json().get("id") or r.json().get("user_id") or primary_user_id
        except Exception:
            pass
    print(f"   primary user_id: {primary_user_id}")

    # --- 2. transactions.csv ---------------------------------------------
    print("\n[T2] /api/export/transactions.csv")
    r = requests.get(f"{BASE}/export/transactions.csv", headers=H, timeout=30)
    check("status 200", r.status_code == 200, f"got {r.status_code}")
    ctype = r.headers.get("Content-Type", "")
    check(
        "Content-Type is text/csv",
        ctype.startswith("text/csv"),
        f"got {ctype!r}",
    )
    body = r.text
    rows = list(csv.reader(io.StringIO(body)))
    expected_header = [
        "date", "type", "amount", "category", "merchant",
        "description", "confidence", "source", "last4",
        "pending_review", "raw_hash",
    ]
    if rows:
        check(
            "first row is exact header",
            rows[0] == expected_header,
            f"got {rows[0]}",
        )
    else:
        check("first row is exact header", False, "empty body")

    data_rows = rows[1:] if rows else []
    # Compare to GET /transactions count if we have it
    if primary_txn_count > 0:
        check(
            "row count == header(1) + txn count",
            len(rows) == primary_txn_count + 1,
            f"got {len(rows)} rows for {primary_txn_count} txns",
        )
    else:
        # Just verify we got at least header + something or just header
        check(
            "CSV well-formed (header present)",
            len(rows) >= 1 and rows[0] == expected_header,
            f"rows={len(rows)}",
        )

    # 2b — date window
    print("\n[T2b] date filter ?from=2026-04-01&to=2026-04-30")
    r = requests.get(
        f"{BASE}/export/transactions.csv?from=2026-04-01&to=2026-04-30",
        headers=H,
        timeout=30,
    )
    check("filtered status 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        frows = list(csv.reader(io.StringIO(r.text)))
        check(
            "filtered first row is exact header",
            frows and frows[0] == expected_header,
        )
        # all data rows must have date inside [2026-04-01, 2026-04-30]
        in_window = True
        bad_date = None
        for row in frows[1:]:
            if not row or not row[0]:
                continue
            d = row[0]
            # ISO strings — substring 2026-04 means in window
            if not (d >= "2026-04-01" and d <= "2026-04-30T23:59:59.999999"):
                in_window = False
                bad_date = d
                break
        check(
            "all filtered rows are within April 2026",
            in_window,
            f"offending date: {bad_date}" if not in_window else f"{len(frows)-1} data rows in window",
        )

    # 2c — invalid date
    print("\n[T2c] invalid ?from=garbage")
    r = requests.get(f"{BASE}/export/transactions.csv?from=garbage", headers=H, timeout=15)
    check("invalid date status 400", r.status_code == 400, f"got {r.status_code}")
    try:
        body_j = r.json()
        msg = (body_j.get("detail") if isinstance(body_j, dict) else str(body_j)) or ""
    except Exception:
        msg = r.text
    check(
        "error message contains 'Invalid date'",
        "Invalid date" in str(msg),
        f"detail={msg!r}",
    )

    # --- 3. budgets.csv --------------------------------------------------
    print("\n[T3] /api/export/budgets.csv")
    r = requests.get(f"{BASE}/export/budgets.csv", headers=H, timeout=20)
    check("status 200", r.status_code == 200, f"got {r.status_code}")
    ctype = r.headers.get("Content-Type", "")
    check(
        "Content-Type is text/csv",
        ctype.startswith("text/csv"),
        f"got {ctype!r}",
    )
    brows = list(csv.reader(io.StringIO(r.text)))
    expected_b_header = ["category", "period", "limit", "spent", "remaining", "status"]
    if brows:
        check(
            "first row is exact budgets header",
            brows[0] == expected_b_header,
            f"got {brows[0]}",
        )
    # Verify math for each data row
    math_ok = True
    status_ok = True
    bad_row = None
    for row in brows[1:]:
        if len(row) != 6:
            continue
        try:
            limit = float(row[2])
            spent = float(row[3])
            remaining = float(row[4])
            status = row[5]
        except Exception:
            math_ok = False
            bad_row = row
            break
        # remaining = limit - spent (allow small float tolerance)
        if abs((limit - spent) - remaining) > 0.001:
            math_ok = False
            bad_row = row
            break
        # status check: over if remaining<0; near if remaining<limit*0.15; ok otherwise
        if remaining < 0:
            expected_status = "over"
        elif remaining < limit * 0.15:
            expected_status = "near"
        else:
            expected_status = "ok"
        if status != expected_status:
            status_ok = False
            bad_row = row
            break
    check(
        "remaining == limit - spent for every row",
        math_ok,
        f"bad row: {bad_row}" if not math_ok else f"{max(0,len(brows)-1)} rows checked",
    )
    check(
        "status field matches ok/near/over math",
        status_ok,
        f"bad row: {bad_row}" if not status_ok else "all statuses correct",
    )

    # --- 4. all.json -----------------------------------------------------
    print("\n[T4] /api/export/all.json")
    r = requests.get(f"{BASE}/export/all.json", headers=H, timeout=30)
    check("status 200", r.status_code == 200, f"got {r.status_code}")
    ctype = r.headers.get("Content-Type", "")
    check(
        "Content-Type is application/json",
        ctype.startswith("application/json"),
        f"got {ctype!r}",
    )
    try:
        bundle = r.json()
    except Exception as e:
        check("body is valid JSON", False, str(e))
        bundle = {}

    if bundle:
        keys = set(bundle.keys())
        check(
            "top-level keys: metadata, transactions, budgets, goals",
            {"metadata", "transactions", "budgets", "goals"} <= keys,
            f"got {sorted(keys)}",
        )
        meta = bundle.get("metadata", {})
        check(
            "metadata.exported_at present (ISO)",
            isinstance(meta.get("exported_at"), str) and "T" in meta.get("exported_at", ""),
            f"got {meta.get('exported_at')!r}",
        )
        check(
            "metadata.user_id present",
            bool(meta.get("user_id")),
            f"got {meta.get('user_id')!r}",
        )
        counts = meta.get("counts", {})
        check(
            "metadata.counts has transactions/budgets/goals",
            {"transactions", "budgets", "goals"} <= set(counts.keys() if isinstance(counts, dict) else []),
            f"got counts={counts}",
        )
        check(
            "metadata.format_version == 1",
            meta.get("format_version") == 1,
            f"got {meta.get('format_version')!r}",
        )
        # counts match array lengths
        for key in ("transactions", "budgets", "goals"):
            arr = bundle.get(key, [])
            cnt = counts.get(key) if isinstance(counts, dict) else None
            check(
                f"counts.{key} == len({key})",
                isinstance(arr, list) and cnt == len(arr),
                f"counts.{key}={cnt}, actual={len(arr) if isinstance(arr, list) else 'n/a'}",
            )

        # Each record has string id, no _id leak, datetimes are ISO strings
        all_records = (
            bundle.get("transactions", [])
            + bundle.get("budgets", [])
            + bundle.get("goals", [])
        )
        ids_ok = True
        no_id_leak = True
        iso_ok = True
        bad = None
        for rec in all_records:
            if not isinstance(rec, dict):
                ids_ok = False
                bad = rec
                break
            if "_id" in rec:
                no_id_leak = False
                bad = rec
                break
            if not isinstance(rec.get("id"), str):
                ids_ok = False
                bad = rec
                break
            # check known datetime-ish fields are strings
            for fld in ("date", "created_at", "updated_at"):
                v = rec.get(fld)
                if v is not None and not isinstance(v, str):
                    iso_ok = False
                    bad = rec
                    break
        check(
            "every record has string `id`",
            ids_ok,
            f"bad rec: {bad}" if not ids_ok else f"{len(all_records)} records",
        )
        check(
            "no `_id` Mongo field leaked",
            no_id_leak,
            f"bad rec: {bad}" if not no_id_leak else "ok",
        )
        check(
            "datetime fields are strings (ISO)",
            iso_ok,
            f"bad rec: {bad}" if not iso_ok else "ok",
        )

        # All transactions belong to the authenticated user
        meta_uid = meta.get("user_id")
        all_belong = True
        first_bad = None
        for t in bundle.get("transactions", []):
            if t.get("user_id") and meta_uid and t.get("user_id") != meta_uid:
                all_belong = False
                first_bad = t
                break
        check(
            "all transactions belong to authenticated user",
            all_belong,
            f"leak: {first_bad}" if not all_belong else f"all {len(bundle.get('transactions',[]))} belong to user",
        )

        # Save primary IDs for cross-leak check
        primary_meta_uid = meta_uid
        primary_txn_ids = {t.get("id") for t in bundle.get("transactions", [])}
    else:
        primary_meta_uid = None
        primary_txn_ids = set()

    # --- 5. SECURITY: cross-user leakage check --------------------------
    print("\n[T5] SECURITY — login as 2nd user; confirm no cross leakage")
    try:
        token2 = login(SECONDARY_PHONE)
        H2 = {"Authorization": f"Bearer {token2}"}
        r = requests.get(f"{BASE}/export/all.json", headers=H2, timeout=30)
        if r.status_code == 200:
            b2 = r.json()
            uid2 = b2.get("metadata", {}).get("user_id")
            check(
                "user B has different user_id",
                uid2 and uid2 != primary_meta_uid,
                f"A={primary_meta_uid} B={uid2}",
            )
            # No transaction in B's export should belong to A
            leaked = []
            for t in b2.get("transactions", []):
                if t.get("user_id") == primary_meta_uid:
                    leaked.append(t.get("id"))
                if primary_txn_ids and t.get("id") in primary_txn_ids:
                    leaked.append(t.get("id"))
            check(
                "user B export contains zero records belonging to user A",
                not leaked,
                f"LEAKED IDs: {leaked[:5]}" if leaked else f"clean ({len(b2.get('transactions',[]))} txns)",
            )
            # All B txns belong to B
            all_b = all(
                (not t.get("user_id")) or t.get("user_id") == uid2
                for t in b2.get("transactions", [])
            )
            check(
                "all of user B's txns belong to user B",
                all_b,
                "ok" if all_b else "MISMATCH",
            )
        else:
            check(
                "user B /export/all.json reachable",
                False,
                f"status {r.status_code}: {r.text[:200]}",
            )
    except Exception as e:
        check("cross-user check executed", False, f"login B failed: {e}")

    # --- summary ---------------------------------------------------------
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n=== SUMMARY: {passed}/{total} assertions passed ===")
    for label, ok, detail in results:
        if not ok:
            print(f"  ❌ {label} — {detail}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
