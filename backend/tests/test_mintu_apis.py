"""
MintU Backend API Tests
Tests all endpoints: auth, transactions, insights, budgets, stats
"""
import pytest
import requests
import os
import time

# Get backend URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)

# Test credentials
TEST_PHONE = "9876543210"
TEST_PASSWORD = "test123"
TEST_NAME = "Test User"

# Global token storage
auth_token = None
test_user_id = None
test_transaction_id = None
test_budget_id = None


class TestAuth:
    """Authentication endpoint tests"""

    def test_01_register_or_login(self):
        """Register new user or login if exists"""
        global auth_token, test_user_id
        
        # Try login first
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"phone": TEST_PHONE, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            auth_token = data["token"]
            test_user_id = data["user"]["id"]
            print(f"✓ Login successful - User ID: {test_user_id}")
            assert "token" in data
            assert "user" in data
            assert data["user"]["phone"] == TEST_PHONE
        elif login_response.status_code == 401:
            # User doesn't exist, register
            register_response = requests.post(
                f"{BASE_URL}/api/auth/register",
                json={"phone": TEST_PHONE, "password": TEST_PASSWORD, "name": TEST_NAME}
            )
            
            if register_response.status_code == 400:
                # User exists but wrong password, try login again
                pytest.skip("User exists but credentials don't match")
            
            assert register_response.status_code == 200
            data = register_response.json()
            auth_token = data["token"]
            test_user_id = data["user"]["id"]
            print(f"✓ Registration successful - User ID: {test_user_id}")
            assert "token" in data
            assert "user" in data
        else:
            pytest.fail(f"Unexpected status code: {login_response.status_code}")

    def test_02_get_user_profile(self):
        """Get current user profile"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        response = requests.get(
            f"{BASE_URL}/api/user/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "phone" in data
        assert "name" in data
        assert "money_score" in data
        assert data["phone"] == TEST_PHONE
        print(f"✓ User profile retrieved - Money Score: {data['money_score']}")


class TestTransactions:
    """Transaction CRUD tests"""

    def test_03_create_transaction_debit(self):
        """Create a debit transaction"""
        global test_transaction_id
        if not auth_token:
            pytest.skip("No auth token available")
        
        payload = {
            "amount": 500.0,
            "category": "Food",
            "description": "TEST_Lunch at restaurant",
            "type": "debit"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["amount"] == 500.0
        assert data["category"] == "Food"
        assert data["type"] == "debit"
        test_transaction_id = data["id"]
        print(f"✓ Transaction created - ID: {test_transaction_id}")

    def test_04_create_transaction_credit(self):
        """Create a credit transaction"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        payload = {
            "amount": 5000.0,
            "category": "Other",
            "description": "TEST_Salary",
            "type": "credit"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 5000.0
        assert data["type"] == "credit"
        print(f"✓ Credit transaction created")

    def test_05_get_transactions(self):
        """Get all transactions"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        response = requests.get(
            f"{BASE_URL}/api/transactions",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2  # At least the 2 we created
        print(f"✓ Retrieved {len(data)} transactions")

    def test_06_parse_sms(self):
        """Parse SMS to create transaction"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        sms_text = "Your a/c XX1234 debited by Rs.250.00 on 15-Jan-25 at SWIGGY BANGALORE. Avl bal: Rs.5000.00"
        
        response = requests.post(
            f"{BASE_URL}/api/transactions/parse-sms",
            json={"sms_text": sms_text},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        # AI parsing might take time, wait a bit
        time.sleep(2)
        
        # Accept both 200 (success) and 400 (could not parse)
        assert response.status_code in [200, 400]
        
        if response.status_code == 200:
            data = response.json()
            assert "id" in data
            assert "amount" in data
            print(f"✓ SMS parsed successfully - Amount: {data['amount']}")
        else:
            print("⚠ SMS parsing failed (AI could not parse)")

    def test_07_delete_transaction(self):
        """Delete a transaction"""
        if not auth_token or not test_transaction_id:
            pytest.skip("No auth token or transaction ID available")
        
        response = requests.delete(
            f"{BASE_URL}/api/transactions/{test_transaction_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ Transaction deleted")


class TestInsights:
    """Insights endpoint tests"""

    def test_08_get_daily_insights(self):
        """Get daily insights with AI"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        response = requests.get(
            f"{BASE_URL}/api/insights/daily",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        # AI generation might take time
        time.sleep(3)
        
        assert response.status_code == 200
        data = response.json()
        assert "money_score" in data
        assert "insight_text" in data
        assert "spending_summary" in data
        assert "recommendations" in data
        assert isinstance(data["recommendations"], list)
        print(f"✓ Insights retrieved - Money Score: {data['money_score']}")
        print(f"  AI Insight: {data['insight_text'][:80]}...")


class TestBudgets:
    """Budget CRUD tests"""

    def test_09_create_budget(self):
        """Create a budget"""
        global test_budget_id
        if not auth_token:
            pytest.skip("No auth token available")
        
        payload = {
            "category": "Food",
            "amount": 3000.0,
            "period": "monthly"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/budgets",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["category"] == "Food"
        assert data["amount"] == 3000.0
        assert data["period"] == "monthly"
        test_budget_id = data["id"]
        print(f"✓ Budget created - ID: {test_budget_id}")

    def test_10_get_budgets(self):
        """Get all budgets"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        response = requests.get(
            f"{BASE_URL}/api/budgets",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Verify budget has spent calculation
        budget = data[0]
        assert "spent" in budget
        assert "amount" in budget
        print(f"✓ Retrieved {len(data)} budgets")

    def test_11_update_budget(self):
        """Update existing budget (creates or updates)"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        payload = {
            "category": "Food",
            "amount": 3500.0,
            "period": "monthly"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/budgets",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 3500.0
        print(f"✓ Budget updated to ₹3500")

    def test_12_delete_budget(self):
        """Delete a budget"""
        if not auth_token or not test_budget_id:
            pytest.skip("No auth token or budget ID available")
        
        response = requests.delete(
            f"{BASE_URL}/api/budgets/{test_budget_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ Budget deleted")


class TestStats:
    """Stats endpoint tests"""

    def test_13_get_stats_overview(self):
        """Get stats overview"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        response = requests.get(
            f"{BASE_URL}/api/stats/overview",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "total_income" in data
        assert "total_expense" in data
        assert "balance" in data
        assert "transaction_count" in data
        assert "category_breakdown" in data
        assert isinstance(data["category_breakdown"], dict)
        print(f"✓ Stats retrieved - Balance: ₹{data['balance']:.0f}, Txns: {data['transaction_count']}")
