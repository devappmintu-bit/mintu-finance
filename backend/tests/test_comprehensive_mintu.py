"""
MintU Comprehensive Backend API Tests
Tests ALL endpoints including new features:
- OTP Auth, Password Login
- Transactions (CRUD, SMS parse)
- Cash Tracking (quick-entry, recurring, apply-recurring)
- Voice transcribe
- Insights (daily, weekly)
- Budgets (CRUD)
- Stats overview
- Family Groups (create, add-member, my-groups, budget, budgets, summary)
- Privacy (policy, data-export)
- Security headers, Rate limiting
"""
import pytest
import requests
import os
import time
import io

# Get backend URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)

# Test credentials
USER1_PHONE = "9876543210"
USER1_PASSWORD = "test123"
USER1_NAME = "Test User"
USER2_PHONE = "9999888877"
MOCK_OTP = "123456"

# Global storage
user1_token = None
user2_token = None
test_transaction_id = None
test_budget_id = None
test_recurring_id = None
family_group_id = None


class TestSecurityHeaders:
    """Test security headers on all responses"""
    
    def test_01_security_headers_present(self):
        """Check that security headers are present"""
        response = requests.get(f"{BASE_URL}/api/privacy/policy")
        
        assert response.status_code == 200
        headers = response.headers
        
        # Check OWASP recommended headers
        assert "X-Frame-Options" in headers
        assert headers["X-Frame-Options"] == "DENY"
        assert "X-Content-Type-Options" in headers
        assert headers["X-Content-Type-Options"] == "nosniff"
        assert "X-XSS-Protection" in headers
        assert "Referrer-Policy" in headers
        assert "Cache-Control" in headers
        
        print(f"✓ Security headers present:")
        print(f"  X-Frame-Options: {headers.get('X-Frame-Options')}")
        print(f"  X-Content-Type-Options: {headers.get('X-Content-Type-Options')}")
        print(f"  X-XSS-Protection: {headers.get('X-XSS-Protection')}")
        print(f"  Referrer-Policy: {headers.get('Referrer-Policy')}")


class TestOTPAuth:
    """Test OTP authentication flow"""
    
    def test_02_send_otp_existing_user(self):
        """Send OTP to existing user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": USER1_PHONE}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "is_new_user" in data
        assert data["mock_mode"] == True
        print(f"✓ OTP sent to {USER1_PHONE}, is_new_user: {data['is_new_user']}")
    
    def test_03_verify_otp_existing_user(self):
        """Verify OTP for existing user"""
        global user1_token
        
        # Wait to avoid rate limit
        time.sleep(31)
        
        # Send OTP first
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": USER1_PHONE})
        time.sleep(1)
        
        # Verify OTP
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": USER1_PHONE, "otp": MOCK_OTP}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["is_new_user"] == False
        user1_token = data["token"]
        print(f"✓ OTP verified for {USER1_PHONE}, token obtained")
    
    def test_04_password_login_fallback(self):
        """Test password login fallback"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"phone": USER1_PHONE, "password": USER1_PASSWORD}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        print(f"✓ Password login fallback working")
    
    def test_05_send_otp_user2(self):
        """Send OTP to second user for family testing"""
        global user2_token
        
        time.sleep(31)
        
        # Send OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": USER2_PHONE})
        time.sleep(1)
        
        # Verify OTP
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": USER2_PHONE, "otp": MOCK_OTP, "name": "Rahul Sharma"}
        )
        
        if response.status_code == 200:
            user2_token = response.json()["token"]
            print(f"✓ User2 {USER2_PHONE} authenticated")
        else:
            # User already exists, try password login
            login_resp = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"phone": USER2_PHONE, "password": "test123"}
            )
            if login_resp.status_code == 200:
                user2_token = login_resp.json()["token"]
                print(f"✓ User2 {USER2_PHONE} logged in via password")


class TestTransactions:
    """Test transaction CRUD and SMS parsing"""
    
    def test_06_create_debit_transaction(self):
        """Create a debit transaction"""
        global test_transaction_id
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "amount": 500.0,
                "category": "Food",
                "description": "TEST_Lunch",
                "type": "debit"
            },
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 500.0
        assert data["type"] == "debit"
        test_transaction_id = data["id"]
        print(f"✓ Transaction created: {test_transaction_id}")
    
    def test_07_get_transactions(self):
        """Get all transactions"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/transactions",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} transactions")
    
    def test_08_delete_transaction(self):
        """Delete a transaction"""
        if not user1_token or not test_transaction_id:
            pytest.skip("No auth token or transaction ID")
        
        response = requests.delete(
            f"{BASE_URL}/api/transactions/{test_transaction_id}",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        print(f"✓ Transaction deleted")
    
    def test_09_parse_sms(self):
        """Parse Indian bank SMS"""
        if not user1_token:
            pytest.skip("No auth token")
        
        sms_text = "Your a/c XX1234 debited by Rs.250.00 on 15-Jan-25 at SWIGGY BANGALORE. Avl bal: Rs.5000.00"
        
        response = requests.post(
            f"{BASE_URL}/api/transactions/parse-sms",
            json={"sms_text": sms_text},
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        # AI parsing - accept 200 or 400
        assert response.status_code in [200, 400]
        if response.status_code == 200:
            data = response.json()
            assert "amount" in data
            print(f"✓ SMS parsed: ₹{data['amount']}")
        else:
            print(f"⚠ SMS parsing failed (AI could not parse)")


class TestCashTracking:
    """Test cash tracking features"""
    
    def test_10_quick_cash_entry_auto(self):
        """Quick cash entry: '50 auto' should categorize as Transport"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/cash/quick-entry",
            json={"text": "50 auto"},
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 50.0
        assert data["category"] == "Transport"
        assert data["source"] == "cash"
        print(f"✓ Quick cash '50 auto' → Transport, ₹50")
    
    def test_11_quick_cash_entry_sabzi(self):
        """Quick cash entry: '200 sabzi' should categorize as Groceries"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/cash/quick-entry",
            json={"text": "200 sabzi"},
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 200.0
        assert data["category"] == "Groceries"
        print(f"✓ Quick cash '200 sabzi' → Groceries, ₹200")
    
    def test_12_create_recurring_expense(self):
        """Create recurring expense (maid 3000 monthly)"""
        global test_recurring_id
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/cash/recurring",
            json={
                "description": "maid",
                "amount": 3000.0,
                "category": "Bills",
                "frequency": "monthly"
            },
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 3000.0
        assert data["frequency"] == "monthly"
        test_recurring_id = data["id"]
        print(f"✓ Recurring expense created: maid ₹3000/month")
    
    def test_13_get_recurring_expenses(self):
        """Get all recurring expenses"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/cash/recurring",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} recurring expenses")
    
    def test_14_apply_recurring_expenses(self):
        """Apply due recurring expenses"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/cash/apply-recurring",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "applied" in data
        assert "total_recurring" in data
        print(f"✓ Applied {data['applied']} recurring expenses")


class TestVoiceInput:
    """Test voice transcription (Whisper)"""
    
    def test_15_voice_transcribe_endpoint_exists(self):
        """Check voice transcribe endpoint (without actual audio file)"""
        if not user1_token:
            pytest.skip("No auth token")
        
        # We can't test actual audio transcription without a real audio file
        # Just verify endpoint exists and returns proper error for missing file
        response = requests.post(
            f"{BASE_URL}/api/voice/transcribe",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        # Should return 422 (validation error) for missing file
        assert response.status_code == 422
        print(f"✓ Voice transcribe endpoint exists (422 for missing file)")


class TestInsights:
    """Test AI insights endpoints"""
    
    def test_16_get_daily_insights(self):
        """Get daily AI insights with money score, alerts, trends"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/insights/daily",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "money_score" in data
        assert "insight_text" in data
        assert "spending_summary" in data
        assert "recommendations" in data
        assert "alerts" in data
        assert "trends" in data
        assert isinstance(data["recommendations"], list)
        print(f"✓ Daily insights retrieved: Money Score {data['money_score']}")
        print(f"  Alerts: {len(data['alerts'])}, Recommendations: {len(data['recommendations'])}")
    
    def test_17_get_weekly_insights(self):
        """Get weekly comparison report"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/insights/weekly",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "money_score" in data
        assert "this_week" in data
        assert "last_week" in data
        assert "expense_change_pct" in data
        assert "category_comparison" in data
        print(f"✓ Weekly insights retrieved: {data['expense_change_pct']}% change")


class TestBudgets:
    """Test budget CRUD"""
    
    def test_18_create_budget(self):
        """Create a budget"""
        global test_budget_id
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/budgets",
            json={
                "category": "Food",
                "amount": 5000.0,
                "period": "monthly"
            },
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "Food"
        assert data["amount"] == 5000.0
        test_budget_id = data["id"]
        print(f"✓ Budget created: Food ₹5000/month")
    
    def test_19_get_budgets_with_spent(self):
        """Get budgets with spent calculation"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/budgets",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "spent" in data[0]
            assert "amount" in data[0]
            print(f"✓ Retrieved {len(data)} budgets with spent calculation")


class TestStats:
    """Test stats overview"""
    
    def test_20_get_stats_overview(self):
        """Get stats with income/expense/balance"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/stats/overview",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "total_income" in data
        assert "total_expense" in data
        assert "balance" in data
        assert "transaction_count" in data
        assert "category_breakdown" in data
        print(f"✓ Stats: Income ₹{data['total_income']:.0f}, Expense ₹{data['total_expense']:.0f}, Balance ₹{data['balance']:.0f}")


class TestFamilyGroups:
    """Test family groups feature"""
    
    def test_21_create_family_group(self):
        """Create a family group"""
        global family_group_id
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/family/create",
            json={"name": "Test Family Group"},
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["name"] == "Test Family Group"
        assert "members" in data
        assert len(data["members"]) == 1  # Owner
        family_group_id = data["id"]
        print(f"✓ Family group created: {family_group_id}")
    
    def test_22_add_family_member(self):
        """Add member to family group by phone"""
        if not user1_token or not family_group_id or not user2_token:
            pytest.skip("Missing prerequisites")
        
        response = requests.post(
            f"{BASE_URL}/api/family/{family_group_id}/add-member",
            json={"phone": USER2_PHONE},
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "member" in data
        print(f"✓ Member added: {USER2_PHONE}")
    
    def test_23_get_my_family_groups(self):
        """Get user's family groups"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/family/my-groups",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ User belongs to {len(data)} family groups")
    
    def test_24_create_family_budget(self):
        """Create shared family budget"""
        if not user1_token or not family_group_id:
            pytest.skip("Missing prerequisites")
        
        response = requests.post(
            f"{BASE_URL}/api/family/{family_group_id}/budget",
            json={
                "category": "Groceries",
                "amount": 10000.0,
                "period": "monthly"
            },
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "Groceries"
        assert data["amount"] == 10000.0
        print(f"✓ Family budget created: Groceries ₹10000/month")
    
    def test_25_get_family_budgets(self):
        """Get family budgets with combined spending"""
        if not user1_token or not family_group_id:
            pytest.skip("Missing prerequisites")
        
        response = requests.get(
            f"{BASE_URL}/api/family/{family_group_id}/budgets",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "group_name" in data
        assert "members" in data
        assert "budgets" in data
        print(f"✓ Family budgets retrieved: {len(data['budgets'])} budgets")
    
    def test_26_get_family_summary(self):
        """Get family spending summary"""
        if not user1_token or not family_group_id:
            pytest.skip("Missing prerequisites")
        
        response = requests.get(
            f"{BASE_URL}/api/family/{family_group_id}/summary",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "group_name" in data
        assert "total_income" in data
        assert "total_expense" in data
        assert "balance" in data
        assert "member_stats" in data
        print(f"✓ Family summary: {len(data['member_stats'])} members, Balance ₹{data['balance']:.0f}")


class TestPrivacy:
    """Test privacy and data protection endpoints"""
    
    def test_27_get_privacy_policy(self):
        """Get privacy policy"""
        response = requests.get(f"{BASE_URL}/api/privacy/policy")
        
        assert response.status_code == 200
        data = response.json()
        assert "app" in data
        assert "legal_frameworks" in data
        assert "data_collected" in data
        assert "user_rights" in data
        assert "security_measures" in data
        print(f"✓ Privacy policy retrieved: {len(data['legal_frameworks'])} legal frameworks")
    
    def test_28_get_data_export(self):
        """Get user data export"""
        if not user1_token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/privacy/data-export",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "export_info" in data
        assert "user_profile" in data
        assert "transactions" in data
        assert "budgets" in data
        assert "data_summary" in data
        print(f"✓ Data export: {data['data_summary']['total_transactions']} transactions, {data['data_summary']['total_budgets']} budgets")


class TestRateLimiting:
    """Test rate limiting on auth endpoints"""
    
    def test_29_rate_limiting_works(self):
        """Test rate limiting on send-otp"""
        # First request
        response1 = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": "1234567890"}
        )
        assert response1.status_code == 200
        
        # Immediate second request (should be rate limited)
        response2 = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": "1234567890"}
        )
        assert response2.status_code == 429
        data = response2.json()
        assert "Rate limit" in data["detail"] or "30 seconds" in data["detail"]
        print(f"✓ Rate limiting working: {data['detail']}")
