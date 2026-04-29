"""Round 53h — Unit tests for the modules extracted out of server.py.

Pure-Python tests with no DB / network dependency. Verifies the
extracted helpers behave identically to their previous server.py
implementations.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.unit


# ──────────────────────────────────────────────────────────────────────
#  core.sanitize
# ──────────────────────────────────────────────────────────────────────
class TestSanitizeString:
    def test_strips_html_tags(self):
        from core.sanitize import sanitize_string
        # The inner ``alert(1)`` text isn't HTML — it survives. We strip
        # only the angle-bracketed tags.
        assert sanitize_string("<script>alert(1)</script>hi") == "alert(1)hi"

    def test_strips_null_bytes(self):
        from core.sanitize import sanitize_string
        assert sanitize_string("hello\x00world") == "helloworld"

    def test_caps_length(self):
        from core.sanitize import sanitize_string
        long = "x" * 1000
        assert len(sanitize_string(long, max_length=200)) == 200

    def test_default_length_is_500(self):
        from core.sanitize import sanitize_string
        long = "y" * 700
        assert len(sanitize_string(long)) == 500

    def test_passes_empty_through(self):
        from core.sanitize import sanitize_string
        assert sanitize_string("") == ""
        assert sanitize_string(None) is None  # type: ignore[arg-type]

    def test_strips_surrounding_whitespace(self):
        from core.sanitize import sanitize_string
        assert sanitize_string("   hello   ") == "hello"


class TestSanitizePhone:
    @pytest.mark.parametrize("raw,expected", [
        ("9876543210", "9876543210"),
        ("+91 98765 43210", "9876543210"),
        ("(987) 654-3210", "9876543210"),
        ("0987654321098765", "4321098765"),  # 16 digits → trailing 10
        ("abc1234567890", "1234567890"),
        ("", ""),
    ])
    def test_reduces_to_trailing_10(self, raw, expected):
        from core.sanitize import sanitize_phone
        assert sanitize_phone(raw) == expected

    def test_handles_none_safely(self):
        from core.sanitize import sanitize_phone
        # Empty fallback behaviour — never raises.
        assert sanitize_phone(None) == ""  # type: ignore[arg-type]


# ──────────────────────────────────────────────────────────────────────
#  core.auth_helpers
# ──────────────────────────────────────────────────────────────────────
class TestAuthHelpers:
    def test_hash_then_verify_round_trip(self):
        from core.auth_helpers import hash_password, verify_password
        h = hash_password("hunter2")
        assert h != "hunter2"  # actually hashed
        assert verify_password("hunter2", h) is True
        assert verify_password("wrong", h) is False

    def test_hash_uses_per_call_salt(self):
        from core.auth_helpers import hash_password
        a = hash_password("same-password")
        b = hash_password("same-password")
        assert a != b, "bcrypt salt was reused — security regression"

    def test_create_token_round_trip(self):
        import jwt as _jwt
        from core.auth_helpers import create_token, JWT_SECRET, JWT_ALGORITHM
        token = create_token("user-123")
        assert token.count(".") == 2  # JWT shape
        decoded = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        assert decoded["user_id"] == "user-123"
        assert "exp" in decoded


# ──────────────────────────────────────────────────────────────────────
#  Back-compat: legacy `from server import ...` paths still resolve.
# ──────────────────────────────────────────────────────────────────────
class TestBackCompat:
    """The router code base does ``from server import hash_password`` /
    ``sanitize_phone`` / ``razorpay_client`` etc. — those imports must
    keep working post-refactor."""

    def test_server_re_exports_auth_helpers(self):
        from server import hash_password, verify_password, create_token
        h = hash_password("x")
        assert verify_password("x", h) and create_token("u").count(".") == 2

    def test_server_re_exports_sanitize(self):
        from server import sanitize_string, sanitize_phone
        assert sanitize_phone("+91 98765 43210") == "9876543210"
        assert sanitize_string("<b>hi</b>") == "hi"

    def test_server_re_exports_razorpay_client(self):
        from server import razorpay_client
        # We don't make a real call (no creds); just verify the symbol
        # is importable and is a Razorpay client instance.
        assert razorpay_client is not None
        assert hasattr(razorpay_client, "order")
