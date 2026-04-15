"""
MintU OTP Authentication Tests
Tests OTP-based login flow: send-otp, verify-otp, resend-otp
Tests rate limiting, max attempts, expiry, new user flow
"""
import pytest
import requests
import os
import time

# Get backend URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)

# Test credentials from test_credentials.md
EXISTING_USER_PHONE = "9876543210"
NEW_USER_PHONE = "7777777777"  # Unregistered number
MOCK_OTP = "123456"
TEST_PASSWORD = "test123"

# Global storage
otp_token = None
new_user_token = None


class TestOTPSendFlow:
    """Test OTP sending for existing and new users"""

    def test_01_send_otp_existing_user(self):
        """Send OTP to existing user (9876543210)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": EXISTING_USER_PHONE}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "is_new_user" in data
        assert data["is_new_user"] == False  # Existing user
        assert "expires_in" in data
        assert data["expires_in"] == 300  # 5 minutes
        print(f"✓ OTP sent to existing user {EXISTING_USER_PHONE}")
        print(f"  is_new_user: {data['is_new_user']}, expires_in: {data['expires_in']}s")

    def test_02_send_otp_new_user(self):
        """Send OTP to new user (unregistered phone)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": NEW_USER_PHONE}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "is_new_user" in data
        assert data["is_new_user"] == True  # New user
        assert "mock_mode" in data
        assert data["mock_mode"] == True
        print(f"✓ OTP sent to new user {NEW_USER_PHONE}")
        print(f"  is_new_user: {data['is_new_user']}, mock_mode: {data['mock_mode']}")

    def test_03_send_otp_invalid_phone_short(self):
        """Send OTP with invalid phone (too short)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": "12345"}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "10 digits" in data["detail"].lower()
        print(f"✓ Invalid phone rejected: {data['detail']}")

    def test_04_send_otp_invalid_phone_letters(self):
        """Send OTP with invalid phone (contains letters)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": "98765abc10"}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"✓ Invalid phone with letters rejected: {data['detail']}")

    def test_05_send_otp_rate_limiting(self):
        """Test rate limiting (30 seconds between OTPs)"""
        # First OTP
        response1 = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": "8888888888"}
        )
        assert response1.status_code == 200
        print(f"✓ First OTP sent to 8888888888")
        
        # Immediate second OTP (should be rate limited)
        response2 = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": "8888888888"}
        )
        assert response2.status_code == 429
        data = response2.json()
        assert "detail" in data
        assert "30 seconds" in data["detail"]
        print(f"✓ Rate limiting working: {data['detail']}")


class TestOTPVerifyFlow:
    """Test OTP verification for existing and new users"""

    def test_06_verify_otp_existing_user_correct(self):
        """Verify correct OTP for existing user"""
        global otp_token
        
        # First send OTP
        send_response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": EXISTING_USER_PHONE}
        )
        assert send_response.status_code == 200
        time.sleep(1)  # Small delay
        
        # Verify OTP
        verify_response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": EXISTING_USER_PHONE, "otp": MOCK_OTP}
        )
        
        assert verify_response.status_code == 200
        data = verify_response.json()
        assert "token" in data
        assert "user" in data
        assert "is_new_user" in data
        assert data["is_new_user"] == False
        assert data["user"]["phone"] == EXISTING_USER_PHONE
        assert data["user"]["name"] == "Test User"
        otp_token = data["token"]
        print(f"✓ OTP verified for existing user")
        print(f"  User: {data['user']['name']}, Token: {otp_token[:20]}...")

    def test_07_verify_otp_wrong_code(self):
        """Verify wrong OTP code"""
        # Send OTP first
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": "9999888877"}
        )
        time.sleep(1)
        
        # Try wrong OTP
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": "9999888877", "otp": "000000"}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "Invalid OTP" in data["detail"]
        assert "attempts remaining" in data["detail"]
        print(f"✓ Wrong OTP rejected: {data['detail']}")

    def test_08_verify_otp_max_attempts(self):
        """Test max 3 attempts limit"""
        # Send OTP
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": "6666666666"}
        )
        time.sleep(1)
        
        # Try wrong OTP 3 times
        for i in range(3):
            response = requests.post(
                f"{BASE_URL}/api/auth/verify-otp",
                json={"phone": "6666666666", "otp": "000000"}
            )
            print(f"  Attempt {i+1}: {response.status_code} - {response.json()['detail']}")
        
        # 4th attempt should fail with "Too many attempts"
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": "6666666666", "otp": MOCK_OTP}
        )
        assert response.status_code == 400
        data = response.json()
        assert "Too many attempts" in data["detail"]
        print(f"✓ Max attempts limit working: {data['detail']}")

    def test_09_verify_otp_expired(self):
        """Test OTP expiry (not practical to wait 5 min, just check error message)"""
        # Try to verify OTP without sending (simulates expired)
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": "5555555555", "otp": MOCK_OTP}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "expired" in data["detail"].lower() or "not found" in data["detail"].lower()
        print(f"✓ Expired/not found OTP rejected: {data['detail']}")

    def test_10_verify_otp_new_user_without_name(self):
        """Verify OTP for new user without providing name (should fail)"""
        # Send OTP to new user
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": "4444444444"}
        )
        time.sleep(1)
        
        # Verify without name
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": "4444444444", "otp": MOCK_OTP}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "Name is required" in data["detail"]
        print(f"✓ New user without name rejected: {data['detail']}")

    def test_11_verify_otp_new_user_with_name(self):
        """Verify OTP for new user with name (should create account)"""
        global new_user_token
        
        # Send OTP to new user
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": NEW_USER_PHONE}
        )
        time.sleep(1)
        
        # Verify with name
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": NEW_USER_PHONE, "otp": MOCK_OTP, "name": "New Test User"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert "is_new_user" in data
        assert data["is_new_user"] == True
        assert data["user"]["phone"] == NEW_USER_PHONE
        assert data["user"]["name"] == "New Test User"
        assert data["user"]["money_score"] == 50  # Default score
        new_user_token = data["token"]
        print(f"✓ New user account created via OTP")
        print(f"  User: {data['user']['name']}, Phone: {data['user']['phone']}")


class TestOTPResend:
    """Test OTP resend functionality"""

    def test_12_resend_otp(self):
        """Test resend OTP endpoint"""
        # First OTP
        response1 = requests.post(
            f"{BASE_URL}/api/auth/resend-otp",
            json={"phone": "3333333333"}
        )
        assert response1.status_code == 200
        print(f"✓ First OTP sent via resend endpoint")
        
        # Immediate resend should be rate limited
        response2 = requests.post(
            f"{BASE_URL}/api/auth/resend-otp",
            json={"phone": "3333333333"}
        )
        assert response2.status_code == 429
        data = response2.json()
        assert "30 seconds" in data["detail"]
        print(f"✓ Resend rate limiting working: {data['detail']}")


class TestPasswordLoginFallback:
    """Test that password login still works as fallback"""

    def test_13_password_login_fallback(self):
        """Test password login still works"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"phone": EXISTING_USER_PHONE, "password": TEST_PASSWORD}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["phone"] == EXISTING_USER_PHONE
        print(f"✓ Password login fallback working")
        print(f"  User: {data['user']['name']}")

    def test_14_password_login_wrong_credentials(self):
        """Test password login with wrong credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"phone": EXISTING_USER_PHONE, "password": "wrongpassword"}
        )
        
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert "Invalid credentials" in data["detail"]
        print(f"✓ Wrong password rejected: {data['detail']}")


class TestOTPTokenValidity:
    """Test that OTP-generated tokens work for API calls"""

    def test_15_otp_token_api_access(self):
        """Test that OTP token can access protected endpoints"""
        if not otp_token:
            pytest.skip("No OTP token available")
        
        response = requests.get(
            f"{BASE_URL}/api/user/me",
            headers={"Authorization": f"Bearer {otp_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["phone"] == EXISTING_USER_PHONE
        print(f"✓ OTP token works for API access")
        print(f"  User: {data['name']}, Money Score: {data['money_score']}")

    def test_16_new_user_token_api_access(self):
        """Test that new user token works for API calls"""
        if not new_user_token:
            pytest.skip("No new user token available")
        
        response = requests.get(
            f"{BASE_URL}/api/user/me",
            headers={"Authorization": f"Bearer {new_user_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["phone"] == NEW_USER_PHONE
        assert data["name"] == "New Test User"
        print(f"✓ New user token works for API access")
        print(f"  User: {data['name']}, Money Score: {data['money_score']}")
