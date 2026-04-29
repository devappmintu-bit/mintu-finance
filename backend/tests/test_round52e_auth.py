"""Round 52e — Auth integration tests against live backend at :8001.

Covers the mock-OTP login flow used by every other test, plus negative
validation (bad phone, wrong OTP, missing fields).
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


async def test_send_otp_returns_200_with_mock_mode(http):
    r = await http.post("/auth/send-otp", json={"phone": TEST_PHONE})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("message")
    # Mock OTP mode is the live default in this preview env.
    assert body.get("mock_mode") in (True, False)


async def test_verify_otp_round_trip_returns_jwt(http):
    await http.post("/auth/send-otp", json={"phone": TEST_PHONE})
    r = await http.post("/auth/verify-otp", json={"phone": TEST_PHONE, "otp": TEST_OTP})
    assert r.status_code == 200, r.text
    body = r.json()
    token = body.get("token")
    assert isinstance(token, str)
    # JWTs are three base64url segments separated by dots; minimum sanity.
    assert token.count(".") == 2
    assert len(token) > 50
    # User info must come back too.
    assert body.get("user")


async def test_verify_otp_with_wrong_code_is_rejected(http):
    await http.post("/auth/send-otp", json={"phone": TEST_PHONE})
    r = await http.post("/auth/verify-otp", json={"phone": TEST_PHONE, "otp": "000000"})
    assert r.status_code in (400, 401)


async def test_send_otp_rejects_invalid_phone_shape(http):
    # Too short / non-numeric — expect 422 from pydantic OR 400 from handler.
    r = await http.post("/auth/send-otp", json={"phone": "123"})
    assert r.status_code in (400, 422), r.text


async def test_verify_otp_rejects_missing_fields(http):
    r = await http.post("/auth/verify-otp", json={"phone": TEST_PHONE})
    assert r.status_code in (400, 422)


async def test_jwt_grants_access_to_protected_route(http):
    """End-to-end: token returned by verify-otp is accepted by a
    protected endpoint. We use /split/expenses/drafts as a cheap
    auth-gated GET that returns 200 even for users with no drafts."""
    await http.post("/auth/send-otp", json={"phone": TEST_PHONE})
    auth_r = await http.post("/auth/verify-otp", json={"phone": TEST_PHONE, "otp": TEST_OTP})
    token = auth_r.json()["token"]
    r = await http.get("/split/expenses/drafts", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert "drafts" in r.json() or "count" in r.json()


async def test_protected_route_rejects_missing_auth(http):
    r = await http.get("/split/expenses/drafts")
    assert r.status_code == 401


async def test_protected_route_rejects_garbage_bearer(http):
    r = await http.get(
        "/split/expenses/drafts",
        headers={"Authorization": "Bearer not.a.real.jwt"},
    )
    assert r.status_code == 401
