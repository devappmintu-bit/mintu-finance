"""Round 53e — Observability tests.

Verifies the PII scrubber correctly filters/hashes sensitive fields
without ever shipping raw values to Sentry. The transport layer
itself is exercised in no-op mode (no DSN) so these tests run
hermetically.
"""
from __future__ import annotations

import os
import pytest

from core.observability import (
    _before_send,
    _hash8,
    _scrub_mapping,
    init_sentry,
)

pytestmark = pytest.mark.unit


# ──────────────────────────────────────────────────────────────────────
#  _hash8
# ──────────────────────────────────────────────────────────────────────
def test_hash8_returns_8_hex_chars():
    h = _hash8("9876543210")
    assert len(h) == 8
    assert all(c in "0123456789abcdef" for c in h)


def test_hash8_is_deterministic():
    assert _hash8("foo") == _hash8("foo")
    assert _hash8("foo") != _hash8("bar")


def test_hash8_handles_none_and_non_string():
    assert _hash8(None) == _hash8("")
    assert _hash8(12345) == _hash8("12345")


# ──────────────────────────────────────────────────────────────────────
#  _scrub_mapping
# ──────────────────────────────────────────────────────────────────────
class TestScrubMapping:
    def test_phone_is_hashed(self):
        d = {"phone": "9876543210", "name": "alice"}
        _scrub_mapping(d)
        assert d["phone"].startswith("sha8:")
        assert d["phone"] != "9876543210"
        assert d["name"] == "alice"  # untouched

    def test_password_is_filtered_not_hashed(self):
        d = {"password": "hunter2", "user": "alice"}
        _scrub_mapping(d)
        assert d["password"] == "[FILTERED]"
        assert d["user"] == "alice"

    def test_otp_is_hashed(self):
        d = {"otp": "123456"}
        _scrub_mapping(d)
        assert d["otp"].startswith("sha8:")

    def test_pin_is_filtered(self):
        d = {"pin": "1234", "new_pin": "5678", "old_pin": "0000"}
        _scrub_mapping(d)
        assert d["pin"] == "[FILTERED]"
        assert d["new_pin"] == "[FILTERED]"
        assert d["old_pin"] == "[FILTERED]"

    def test_token_is_hashed(self):
        d = {"token": "eyJ0eXAi.foo.bar"}
        _scrub_mapping(d)
        assert d["token"].startswith("sha8:")

    def test_nested_dict_is_scrubbed(self):
        d = {"user": {"phone": "9876543210", "name": "alice"}}
        _scrub_mapping(d)
        assert d["user"]["phone"].startswith("sha8:")
        assert d["user"]["name"] == "alice"

    def test_list_of_dicts_is_scrubbed(self):
        d = {"members": [{"phone": "111"}, {"phone": "222"}]}
        _scrub_mapping(d)
        for m in d["members"]:
            assert m["phone"].startswith("sha8:")

    def test_safe_keys_unaffected(self):
        d = {"description": "Dinner", "amount": 100.0, "amount_paise": 10_000}
        _scrub_mapping(d)
        assert d == {"description": "Dinner", "amount": 100.0, "amount_paise": 10_000}

    def test_case_insensitive_key_match(self):
        d = {"Phone": "9876543210", "OTP": "123456"}
        _scrub_mapping(d)
        # Implementation lowercases the lookup key; behaviour:
        assert d["Phone"].startswith("sha8:")
        assert d["OTP"].startswith("sha8:")


# ──────────────────────────────────────────────────────────────────────
#  _before_send — full Sentry event scrubber
# ──────────────────────────────────────────────────────────────────────
class TestBeforeSend:
    def _evt(self, **req_overrides):
        return {
            "request": {
                "url": "https://api.example.com/api/auth/verify-otp",
                "headers": {
                    "Authorization": "Bearer eyJxxx",
                    "Cookie": "session=abc",
                    "X-Trace-Id": "1234",
                },
                "data": {"phone": "9876543210", "otp": "123456", "name": "alice"},
                "body": "raw body that should be dropped",
                **req_overrides,
            },
            "user": {"id": "u-123", "phone": "9876543210", "email": "a@b.com"},
            "tags": {"phone": "9876543210"},
            "extra": {"otp": "123456", "amount": 100},
        }

    def test_authorization_header_filtered(self):
        out = _before_send(self._evt(), {})
        assert out["request"]["headers"]["Authorization"] == "[FILTERED]"
        assert out["request"]["headers"]["Cookie"] == "[FILTERED]"
        # Non-sensitive headers untouched.
        assert out["request"]["headers"]["X-Trace-Id"] == "1234"

    def test_phone_in_data_is_hashed(self):
        out = _before_send(self._evt(), {})
        assert out["request"]["data"]["phone"].startswith("sha8:")
        assert out["request"]["data"]["phone"] != "9876543210"

    def test_otp_in_data_is_hashed(self):
        out = _before_send(self._evt(), {})
        assert out["request"]["data"]["otp"].startswith("sha8:")

    def test_raw_body_is_dropped(self):
        out = _before_send(self._evt(), {})
        assert "body" not in out["request"]

    def test_user_phone_email_filtered(self):
        out = _before_send(self._evt(), {})
        assert out["user"]["id"] == "u-123"  # kept
        assert out["user"]["phone"] == "[FILTERED]"
        assert out["user"]["email"] == "[FILTERED]"

    def test_tags_and_extras_scrubbed(self):
        out = _before_send(self._evt(), {})
        assert out["tags"]["phone"].startswith("sha8:")
        assert out["extra"]["otp"].startswith("sha8:")
        assert out["extra"]["amount"] == 100  # untouched


# ──────────────────────────────────────────────────────────────────────
#  init_sentry — no-op mode
# ──────────────────────────────────────────────────────────────────────
class TestInitNoop:
    def test_no_dsn_returns_false(self, monkeypatch):
        monkeypatch.delenv("SENTRY_DSN_BACKEND", raising=False)
        assert init_sentry() is False

    def test_empty_dsn_returns_false(self, monkeypatch):
        monkeypatch.setenv("SENTRY_DSN_BACKEND", "  ")
        assert init_sentry() is False
