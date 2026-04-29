"""Round 52e — Solo / Draft Expense endpoint integration tests.

Covers POST/GET/DELETE /api/split/expenses/draft* and the
attach-to-group flow. Each test creates and tears down its own draft
so runs are independent and idempotent.
"""
import os
import pytest
import httpx

pytestmark = pytest.mark.integration

BASE = os.environ.get("MINTU_TEST_BASE", "http://localhost:8001/api")
TEST_PHONE = "9876543210"
TEST_OTP = "123456"


@pytest.fixture
async def http():
    async with httpx.AsyncClient(base_url=BASE, timeout=10.0) as c:
        yield c


@pytest.fixture
async def auth_headers(http):
    await http.post("/auth/send-otp", json={"phone": TEST_PHONE})
    r = await http.post("/auth/verify-otp", json={"phone": TEST_PHONE, "otp": TEST_OTP})
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_draft(http, headers, **overrides):
    body = {"description": "Lunch", "amount": 450, **overrides}
    r = await http.post("/split/expenses/draft", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ── auth gating ──────────────────────────────────────────────────────
class TestDraftAuth:
    async def test_create_requires_auth(self, http):
        r = await http.post("/split/expenses/draft", json={"description": "x", "amount": 10})
        assert r.status_code == 401

    async def test_list_requires_auth(self, http):
        r = await http.get("/split/expenses/drafts")
        assert r.status_code == 401

    async def test_delete_requires_auth(self, http):
        r = await http.delete("/split/expenses/drafts/000000000000000000000000")
        assert r.status_code == 401

    async def test_attach_requires_auth(self, http):
        r = await http.post(
            "/split/expenses/000000000000000000000000/attach-to-group",
            json={"group_id": "x"},
        )
        assert r.status_code == 401


# ── happy path ───────────────────────────────────────────────────────
class TestDraftRoundTrip:
    async def test_create_then_list_returns_draft(self, http, auth_headers):
        draft_id = await _create_draft(http, auth_headers, description="r52e-roundtrip")
        r = await http.get("/split/expenses/drafts", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        ids = [d["id"] for d in body["drafts"]]
        assert draft_id in ids
        assert body["count"] >= 1
        # cleanup
        await http.delete(f"/split/expenses/drafts/{draft_id}", headers=auth_headers)

    async def test_delete_removes_the_draft(self, http, auth_headers):
        draft_id = await _create_draft(http, auth_headers, description="r52e-delete")
        r = await http.delete(f"/split/expenses/drafts/{draft_id}", headers=auth_headers)
        assert r.status_code in (200, 204)
        # second list shouldn't have it
        r2 = await http.get("/split/expenses/drafts", headers=auth_headers)
        ids = [d["id"] for d in r2.json()["drafts"]]
        assert draft_id not in ids


# ── validation ───────────────────────────────────────────────────────
class TestDraftValidation:
    @pytest.mark.parametrize("amount", [0, -1, -1000])
    async def test_create_rejects_non_positive_amount(self, http, auth_headers, amount):
        r = await http.post(
            "/split/expenses/draft",
            json={"description": "bad", "amount": amount},
            headers=auth_headers,
        )
        assert r.status_code in (400, 422), r.text

    async def test_create_rejects_empty_description(self, http, auth_headers):
        r = await http.post(
            "/split/expenses/draft",
            json={"description": "", "amount": 100},
            headers=auth_headers,
        )
        assert r.status_code in (400, 422)

    async def test_delete_invalid_object_id_is_400(self, http, auth_headers):
        r = await http.delete(
            "/split/expenses/drafts/not-an-objectid",
            headers=auth_headers,
        )
        assert r.status_code == 400

    async def test_delete_unknown_id_is_404(self, http, auth_headers):
        # Valid 24-char hex that won't match any draft.
        r = await http.delete(
            "/split/expenses/drafts/aaaaaaaaaaaaaaaaaaaaaaaa",
            headers=auth_headers,
        )
        assert r.status_code == 404

    async def test_attach_rejects_invalid_draft_id(self, http, auth_headers):
        r = await http.post(
            "/split/expenses/garbage/attach-to-group",
            json={"group_id": "aaaaaaaaaaaaaaaaaaaaaaaa"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    async def test_attach_rejects_unknown_group(self, http, auth_headers):
        draft_id = await _create_draft(http, auth_headers, description="r52e-attach-fail")
        r = await http.post(
            f"/split/expenses/{draft_id}/attach-to-group",
            json={"group_id": "aaaaaaaaaaaaaaaaaaaaaaaa"},
            headers=auth_headers,
        )
        assert r.status_code in (400, 404), r.text
        # cleanup the orphaned draft
        await http.delete(f"/split/expenses/drafts/{draft_id}", headers=auth_headers)
