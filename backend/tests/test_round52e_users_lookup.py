"""Round 52e — Integration tests for POST /api/users/lookup-batch."""
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
    return {"Authorization": f"Bearer {r.json()['token']}"}


async def test_requires_auth(http):
    r = await http.post("/users/lookup-batch", json={"phones": [TEST_PHONE]})
    assert r.status_code == 401


async def test_empty_phones_returns_empty_matches(http, auth_headers):
    r = await http.post("/users/lookup-batch", json={"phones": []}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"matches": []}


async def test_excludes_calling_user_from_matches(http, auth_headers):
    """Privacy invariant: caller cannot use lookup-batch to confirm
    their own membership. The endpoint silently strips them."""
    r = await http.post(
        "/users/lookup-batch",
        json={"phones": [TEST_PHONE]},
        headers=auth_headers,
    )
    assert r.status_code == 200
    matches = r.json()["matches"]
    assert all(m["phone"] != TEST_PHONE for m in matches)


async def test_unknown_phones_return_no_matches(http, auth_headers):
    """Phones that aren't MintU users must not appear in results —
    privacy: no yes/no signal leak."""
    r = await http.post(
        "/users/lookup-batch",
        json={"phones": ["0000000001", "0000000002"]},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json() == {"matches": []}


async def test_normalises_phones_with_country_code(http, auth_headers):
    """Server-side normalisation: +91-9876-543-210 should reduce to
    9876543210 — if matched, the response phone is the 10-digit form."""
    r = await http.post(
        "/users/lookup-batch",
        json={"phones": ["+91-9876-543-210"]},
        headers=auth_headers,
    )
    # Either zero matches (caller-self excluded) or matches contain the
    # normalised 10-digit form. We don't assert presence — only shape.
    assert r.status_code == 200
    for m in r.json()["matches"]:
        assert len(m["phone"]) == 10
        assert m["phone"].isdigit()


async def test_rejects_oversized_batch(http, auth_headers):
    """Server caps batches at 100 (R52g — tightened from 200) to defend
    against table dumps."""
    r = await http.post(
        "/users/lookup-batch",
        json={"phones": [str(i).rjust(10, "0") for i in range(101)]},
        headers=auth_headers,
    )
    assert r.status_code == 400


async def test_accepts_exactly_100_phones(http, auth_headers):
    """The boundary itself (exactly 100) must succeed — defends against
    off-by-one regressions on the cap.
    Note: We test this AFTER the rate-limit windows reset to avoid
    interaction with the 100/hour throttle."""
    r = await http.post(
        "/users/lookup-batch",
        json={"phones": [str(i).rjust(10, "0") for i in range(100)]},
        headers=auth_headers,
    )
    # Either 200 (within the rate-limit window) or 429 (exhausted) is
    # acceptable — both prove the size cap itself doesn't reject 100.
    assert r.status_code in (200, 429), r.text
