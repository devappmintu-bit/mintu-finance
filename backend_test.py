"""
Round 8 Backend Regression Test — MintU
Covers:
  1. GET /api/leaderboard/unified?scope=contacts
  2. GET /api/leaderboard/unified?scope=global
  3. PUT /api/transactions/{id}
  4. DELETE /api/transactions/{id}
  5. POST /api/budgets + PUT + DELETE lifecycle
  6. POST /api/split/groups + POST /api/split/expenses + PUT + DELETE lifecycle
  7. POST /api/sms/parse-bulk AND /api/sms/bulk-parse (both paths)
"""
import os
import sys
import time
import json
import requests
from typing import Dict, Any

BASE = "https://mintu-finance.preview.emergentagent.com/api"

PHONE = "9876543210"
OTP = "123456"


class R8:
    def __init__(self) -> None:
        self.token: str = ""
        self.user_id: str = ""
        self.phone: str = PHONE
        self.results: list[tuple[str, bool, str]] = []

    def h(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def log(self, name: str, ok: bool, detail: str = "") -> None:
        marker = "✅" if ok else "❌"
        print(f"{marker} {name}: {detail}")
        self.results.append((name, ok, detail))

    def must(self, cond: bool, name: str, detail: str = "") -> bool:
        self.log(name, cond, detail)
        return cond

    def auth(self) -> bool:
        try:
            r = requests.post(f"{BASE}/auth/send-otp", json={"phone": self.phone}, timeout=20)
            if r.status_code != 200:
                self.log("AUTH send-otp", False, f"HTTP {r.status_code}: {r.text[:120]}")
            r = requests.post(
                f"{BASE}/auth/verify-otp",
                json={"phone": self.phone, "otp": OTP},
                timeout=20,
            )
            if r.status_code != 200:
                r = requests.post(
                    f"{BASE}/auth/login",
                    json={"phone": self.phone, "password": "test123"},
                    timeout=20,
                )
            if r.status_code != 200:
                self.log("AUTH verify-otp/login", False, f"HTTP {r.status_code}: {r.text[:120]}")
                return False
            data = r.json()
            self.token = data.get("access_token") or data.get("token") or ""
            self.user_id = (data.get("user") or {}).get("id") or data.get("user_id") or ""
            if not self.user_id and self.token:
                me = requests.get(f"{BASE}/user/me", headers=self.h(), timeout=20)
                if me.status_code == 200:
                    self.user_id = me.json().get("id") or me.json().get("user_id") or ""
            ok = bool(self.token and self.user_id)
            self.log("AUTH", ok, f"token_len={len(self.token)} user_id={self.user_id}")
            return ok
        except Exception as e:
            self.log("AUTH", False, str(e))
            return False

    def test_unified_contacts(self) -> None:
        r = requests.get(f"{BASE}/leaderboard/unified?scope=contacts", headers=self.h(), timeout=30)
        if not self.must(r.status_code == 200, "GET /leaderboard/unified?scope=contacts 200",
                          f"HTTP {r.status_code}: {r.text[:200]}"):
            return
        d = r.json()
        for k in ("scope", "total", "you", "leader", "headline", "contenders"):
            self.must(k in d, f"contacts.has_key[{k}]", f"keys={list(d.keys())}")
        self.must(d.get("scope") == "contacts", "contacts.scope==contacts", f"got={d.get('scope')}")
        self.must(isinstance(d.get("contenders"), list), "contacts.contenders is list",
                  f"type={type(d.get('contenders')).__name__}")
        cs = d.get("contenders") or []
        if cs:
            first = cs[0]
            required = {"rank", "id", "name", "score", "streak", "coins", "settlements", "is_me", "phone_masked"}
            self.must(required.issubset(first.keys()),
                      "contacts.contender_shape",
                      f"missing={required - first.keys()}")
        you = d.get("you")
        if you:
            self.must("percentile" in you, "contacts.you.percentile",
                      f"you_keys={list(you.keys())}")
        self.log("contacts.total", True,
                 f"total={d.get('total')} contenders_len={len(cs)} headline={d.get('headline')!r}")

    def test_unified_global(self) -> None:
        r = requests.get(f"{BASE}/leaderboard/unified?scope=global", headers=self.h(), timeout=30)
        if not self.must(r.status_code == 200, "GET /leaderboard/unified?scope=global 200",
                          f"HTTP {r.status_code}: {r.text[:200]}"):
            return
        d = r.json()
        for k in ("scope", "total", "you", "leader", "headline", "contenders"):
            self.must(k in d, f"global.has_key[{k}]", f"keys={list(d.keys())}")
        self.must(d.get("scope") == "global", "global.scope==global", f"got={d.get('scope')}")
        cs = d.get("contenders") or []
        self.must(len(cs) <= 50, "global.contenders<=50", f"len={len(cs)}")
        if cs:
            first = cs[0]
            required = {"rank", "id", "name", "score", "streak", "coins", "settlements", "is_me", "phone_masked"}
            self.must(required.issubset(first.keys()),
                      "global.contender_shape",
                      f"missing={required - first.keys()}")
        you = d.get("you")
        if you:
            self.must("percentile" in you, "global.you.percentile",
                      f"you_keys={list(you.keys())}")
        self.log("global.total", True,
                 f"total={d.get('total')} contenders_len={len(cs)} headline={d.get('headline')!r}")

    def test_transaction_crud(self) -> None:
        payload = {
            "amount": 450.0,
            "category": "Food",
            "description": "Swiggy dinner",
            "type": "debit",
        }
        r = requests.post(f"{BASE}/transactions", json=payload, headers=self.h(), timeout=20)
        if not self.must(r.status_code == 200, "POST /transactions 200",
                          f"HTTP {r.status_code}: {r.text[:200]}"):
            return
        txn_id = r.json().get("id")
        self.must(bool(txn_id), "txn.id present", f"id={txn_id}")

        r = requests.put(
            f"{BASE}/transactions/{txn_id}",
            json={"amount": 500.0, "description": "Swiggy dinner (edited)", "category": "Food & Dining"},
            headers=self.h(),
            timeout=20,
        )
        if self.must(r.status_code == 200, "PUT /transactions/{id} 200",
                     f"HTTP {r.status_code}: {r.text[:200]}"):
            row = r.json()
            self.must(row.get("amount") == 500.0, "txn.amount updated",
                      f"got={row.get('amount')}")
            self.must(row.get("category") == "Food & Dining", "txn.category updated",
                      f"got={row.get('category')}")

        r = requests.delete(f"{BASE}/transactions/{txn_id}", headers=self.h(), timeout=20)
        self.must(r.status_code == 200, "DELETE /transactions/{id} 200",
                  f"HTTP {r.status_code}: {r.text[:200]}")

        r2 = requests.delete(f"{BASE}/transactions/{txn_id}", headers=self.h(), timeout=20)
        self.must(r2.status_code == 404, "DELETE /transactions/{id} again -> 404",
                  f"HTTP {r2.status_code}")

    def test_budget_crud(self) -> None:
        r = requests.post(
            f"{BASE}/budgets",
            json={"category": "Entertainment_R8", "amount": 2000.0, "period": "monthly"},
            headers=self.h(),
            timeout=20,
        )
        if not self.must(r.status_code == 200, "POST /budgets 200",
                          f"HTTP {r.status_code}: {r.text[:200]}"):
            return
        bid = r.json().get("id")
        self.must(bool(bid), "budget.id present", f"id={bid}")

        r = requests.put(
            f"{BASE}/budgets/{bid}",
            json={"amount": 2500.0, "period": "weekly"},
            headers=self.h(),
            timeout=20,
        )
        if self.must(r.status_code == 200, "PUT /budgets/{id} 200",
                     f"HTTP {r.status_code}: {r.text[:200]}"):
            row = r.json()
            self.must(row.get("amount") == 2500.0, "budget.amount updated",
                      f"got={row.get('amount')}")
            self.must(row.get("period") == "weekly", "budget.period updated",
                      f"got={row.get('period')}")

        r = requests.delete(f"{BASE}/budgets/{bid}", headers=self.h(), timeout=20)
        self.must(r.status_code == 200, "DELETE /budgets/{id} 200",
                  f"HTTP {r.status_code}: {r.text[:200]}")

        r2 = requests.delete(f"{BASE}/budgets/{bid}", headers=self.h(), timeout=20)
        self.must(r2.status_code == 404, "DELETE /budgets/{id} again -> 404",
                  f"HTTP {r2.status_code}")

    def test_split_expense_crud(self) -> None:
        payload = {
            "name": "R8 Test Dinner",
            "members": ["9998887776"],
        }
        r = requests.post(f"{BASE}/split/groups", json=payload, headers=self.h(), timeout=20)
        if r.status_code != 200:
            self.log("POST /split/groups 200", False, f"HTTP {r.status_code}: {r.text[:200]}")
            return
        gid = r.json().get("id")
        self.must(bool(gid), "group.id present", f"id={gid}")

        exp_payload = {
            "group_id": gid,
            "description": "Pizza night",
            "amount": 800.0,
            "paid_by": self.user_id,
            "split_type": "equal",
        }
        r = requests.post(f"{BASE}/split/expenses", json=exp_payload, headers=self.h(), timeout=20)
        if not self.must(r.status_code == 200, "POST /split/expenses 200",
                          f"HTTP {r.status_code}: {r.text[:200]}"):
            requests.delete(f"{BASE}/split/groups/{gid}", headers=self.h(), timeout=20)
            return
        eid = r.json().get("id")
        self.must(bool(eid), "expense.id present", f"id={eid}")

        r = requests.put(
            f"{BASE}/split/expenses/{eid}",
            json={"amount": 1000.0, "description": "Pizza night (edited)"},
            headers=self.h(),
            timeout=20,
        )
        if self.must(r.status_code == 200, "PUT /split/expenses/{id} 200",
                     f"HTTP {r.status_code}: {r.text[:200]}"):
            row = r.json()
            self.log("split.expense PUT response", True, f"keys={list(row.keys()) if isinstance(row, dict) else type(row).__name__}")

        r = requests.delete(f"{BASE}/split/expenses/{eid}", headers=self.h(), timeout=20)
        self.must(r.status_code == 200, "DELETE /split/expenses/{id} 200 (no collision with leave)",
                  f"HTTP {r.status_code}: {r.text[:200]}")

        r = requests.delete(f"{BASE}/split/groups/{gid}", headers=self.h(), timeout=20)
        self.must(r.status_code == 200, "DELETE /split/groups/{id} (cleanup) 200",
                  f"HTTP {r.status_code}: {r.text[:200]}")

    def test_sms_aliases(self) -> None:
        sms = "HDFC: Rs 500 debited from A/c XX1234 at AMAZON on 19-04-26"
        for path in ("/sms/bulk-parse", "/sms/parse-bulk"):
            r = requests.post(
                f"{BASE}{path}",
                json={"messages": [sms]},
                headers=self.h(),
                timeout=90,
            )
            ok = r.status_code == 200
            detail = f"HTTP {r.status_code}"
            if ok:
                d = r.json()
                for k in ("parsed", "failed", "total"):
                    if k not in d:
                        ok = False
                        detail += f" missing_key={k}"
                detail += f" body={json.dumps(d)[:200]}"
            else:
                detail += f": {r.text[:200]}"
            self.log(f"POST {path}", ok, detail)
            time.sleep(0.3)

    def run(self) -> int:
        print(f"\n=== MintU Round 8 Backend Regression ===\nBASE={BASE}\n")
        if not self.auth():
            print("AUTH failed — aborting")
            return 1
        self.test_unified_contacts(); time.sleep(0.2)
        self.test_unified_global(); time.sleep(0.2)
        self.test_transaction_crud(); time.sleep(0.2)
        self.test_budget_crud(); time.sleep(0.2)
        self.test_split_expense_crud(); time.sleep(0.2)
        self.test_sms_aliases()

        total = len(self.results)
        passed = sum(1 for _, ok, _ in self.results if ok)
        print(f"\n=== RESULT: {passed}/{total} passed ===")
        failed = [(n, d) for n, ok, d in self.results if not ok]
        if failed:
            print("\nFAILED:")
            for n, d in failed:
                print(f"  - {n}: {d}")
        return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(R8().run())
