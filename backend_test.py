#!/usr/bin/env python3
"""
MintU Backend API Testing Suite
Tests all backend APIs according to test_result.md priorities
"""

import asyncio
import aiohttp
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Test Configuration
BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "phone": "9876543210",
    "password": "test123",
    "name": "Test User"
}

class MintUAPITester:
    def __init__(self):
        self.session = None
        self.auth_token = None
        self.user_id = None
        self.test_results = {}
        
    async def setup(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession()
        
    async def cleanup(self):
        """Clean up HTTP session"""
        if self.session:
            await self.session.close()
    
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results[test_name] = {"success": success, "details": details}
    
    async def make_request(self, method: str, endpoint: str, data: Dict = None, 
                          headers: Dict = None, expect_status: int = 200) -> tuple[bool, Any]:
        """Make HTTP request and return (success, response_data)"""
        try:
            url = f"{BASE_URL}{endpoint}"
            request_headers = {"Content-Type": "application/json"}
            
            if headers:
                request_headers.update(headers)
            
            if self.auth_token and "Authorization" not in request_headers:
                request_headers["Authorization"] = f"Bearer {self.auth_token}"
            
            async with self.session.request(
                method, url, 
                json=data if data else None,
                headers=request_headers
            ) as response:
                response_text = await response.text()
                
                if response.status != expect_status:
                    return False, f"Status {response.status}: {response_text}"
                
                try:
                    response_data = json.loads(response_text) if response_text else {}
                    return True, response_data
                except json.JSONDecodeError:
                    return True, response_text
                    
        except Exception as e:
            return False, f"Request error: {str(e)}"
    
    async def test_user_registration(self):
        """Test user registration endpoint"""
        print("\n🔐 Testing User Registration...")
        
        # Test valid registration
        success, response = await self.make_request(
            "POST", "/auth/register",
            data=TEST_CREDENTIALS,
            expect_status=200
        )
        
        if success and isinstance(response, dict) and "token" in response:
            self.auth_token = response["token"]
            self.user_id = response["user"]["id"]
            self.log_test("User Registration", True, f"User ID: {self.user_id}")
        else:
            # User might already exist, try login instead
            await self.test_user_login()
            return
    
    async def test_user_login(self):
        """Test user login endpoint"""
        print("\n🔑 Testing User Login...")
        
        # Test valid login
        success, response = await self.make_request(
            "POST", "/auth/login",
            data={"phone": TEST_CREDENTIALS["phone"], "password": TEST_CREDENTIALS["password"]},
            expect_status=200
        )
        
        if success and isinstance(response, dict) and "token" in response:
            self.auth_token = response["token"]
            self.user_id = response["user"]["id"]
            self.log_test("User Login - Valid Credentials", True, f"Token received, User ID: {self.user_id}")
        else:
            self.log_test("User Login - Valid Credentials", False, str(response))
            return
        
        # Test invalid credentials
        success, response = await self.make_request(
            "POST", "/auth/login",
            data={"phone": "9999999999", "password": "wrongpass"},
            expect_status=401
        )
        
        if success:
            self.log_test("User Login - Invalid Credentials", True, "Correctly rejected invalid credentials")
        else:
            self.log_test("User Login - Invalid Credentials", False, str(response))
    
    async def test_user_profile(self):
        """Test user profile endpoint"""
        print("\n👤 Testing User Profile...")
        
        if not self.auth_token:
            self.log_test("User Profile", False, "No auth token available")
            return
        
        success, response = await self.make_request("GET", "/user/me")
        
        if success and isinstance(response, dict) and "id" in response:
            self.log_test("User Profile", True, f"Profile retrieved: {response['name']}")
        else:
            self.log_test("User Profile", False, str(response))
    
    async def test_transaction_management(self):
        """Test transaction CRUD operations"""
        print("\n💰 Testing Transaction Management...")
        
        if not self.auth_token:
            self.log_test("Transaction Management", False, "No auth token available")
            return
        
        # Test create debit transaction
        debit_transaction = {
            "amount": 250.0,
            "category": "Food",
            "description": "Lunch at restaurant",
            "type": "debit"
        }
        
        success, response = await self.make_request(
            "POST", "/transactions",
            data=debit_transaction
        )
        
        transaction_id = None
        if success and isinstance(response, dict) and "id" in response:
            transaction_id = response["id"]
            self.log_test("Create Debit Transaction", True, f"Transaction ID: {transaction_id}")
        else:
            self.log_test("Create Debit Transaction", False, str(response))
        
        # Test create credit transaction
        credit_transaction = {
            "amount": 5000.0,
            "category": "Investment",
            "description": "Salary credit",
            "type": "credit"
        }
        
        success, response = await self.make_request(
            "POST", "/transactions",
            data=credit_transaction
        )
        
        if success and isinstance(response, dict) and "id" in response:
            self.log_test("Create Credit Transaction", True, f"Transaction ID: {response['id']}")
        else:
            self.log_test("Create Credit Transaction", False, str(response))
        
        # Test get all transactions
        success, response = await self.make_request("GET", "/transactions")
        
        if success and isinstance(response, list):
            self.log_test("Get All Transactions", True, f"Retrieved {len(response)} transactions")
        else:
            self.log_test("Get All Transactions", False, str(response))
        
        # Test delete transaction
        if transaction_id:
            success, response = await self.make_request(
                "DELETE", f"/transactions/{transaction_id}"
            )
            
            if success:
                self.log_test("Delete Transaction", True, "Transaction deleted successfully")
            else:
                self.log_test("Delete Transaction", False, str(response))
    
    async def test_sms_parsing(self):
        """Test SMS parsing with AI"""
        print("\n📱 Testing SMS Parsing with AI...")
        
        if not self.auth_token:
            self.log_test("SMS Parsing", False, "No auth token available")
            return
        
        # Test Indian bank SMS
        bank_sms = "Your HDFC Bank Account XX1234 has been debited with Rs.250.00 on 15-Apr-26 at SWIGGY"
        
        success, response = await self.make_request(
            "POST", "/transactions/parse-sms",
            data={"sms_text": bank_sms}
        )
        
        if success and isinstance(response, dict) and "id" in response:
            self.log_test("SMS Parsing - Bank SMS", True, 
                         f"Parsed: ₹{response.get('amount', 0)} - {response.get('category', 'N/A')}")
        else:
            self.log_test("SMS Parsing - Bank SMS", False, str(response))
        
        # Test payment app SMS
        payment_sms = "You paid Rs.150 to Uber via Paytm"
        
        success, response = await self.make_request(
            "POST", "/transactions/parse-sms",
            data={"sms_text": payment_sms}
        )
        
        if success and isinstance(response, dict) and "id" in response:
            self.log_test("SMS Parsing - Payment App SMS", True,
                         f"Parsed: ₹{response.get('amount', 0)} - {response.get('category', 'N/A')}")
        else:
            self.log_test("SMS Parsing - Payment App SMS", False, str(response))
    
    async def test_daily_insights(self):
        """Test daily insights with AI"""
        print("\n🧠 Testing Daily Insights with AI...")
        
        if not self.auth_token:
            self.log_test("Daily Insights", False, "No auth token available")
            return
        
        success, response = await self.make_request("GET", "/insights/daily")
        
        if success and isinstance(response, dict):
            required_fields = ["money_score", "insight_text", "spending_summary", "recommendations"]
            missing_fields = [field for field in required_fields if field not in response]
            
            if not missing_fields:
                self.log_test("Daily Insights", True, 
                             f"Money Score: {response['money_score']}/100, Insights generated")
            else:
                self.log_test("Daily Insights", False, f"Missing fields: {missing_fields}")
        else:
            self.log_test("Daily Insights", False, str(response))
    
    async def test_budget_management(self):
        """Test budget CRUD operations"""
        print("\n📊 Testing Budget Management...")
        
        if not self.auth_token:
            self.log_test("Budget Management", False, "No auth token available")
            return
        
        # Test create budget
        budget_data = {
            "category": "Food",
            "amount": 3000.0,
            "period": "monthly"
        }
        
        success, response = await self.make_request(
            "POST", "/budgets",
            data=budget_data
        )
        
        budget_id = None
        if success and isinstance(response, dict) and "id" in response:
            budget_id = response["id"]
            self.log_test("Create Budget", True, f"Budget ID: {budget_id}")
        else:
            self.log_test("Create Budget", False, str(response))
        
        # Test get all budgets
        success, response = await self.make_request("GET", "/budgets")
        
        if success and isinstance(response, list):
            self.log_test("Get All Budgets", True, f"Retrieved {len(response)} budgets")
        else:
            self.log_test("Get All Budgets", False, str(response))
        
        # Test delete budget
        if budget_id:
            success, response = await self.make_request(
                "DELETE", f"/budgets/{budget_id}"
            )
            
            if success:
                self.log_test("Delete Budget", True, "Budget deleted successfully")
            else:
                self.log_test("Delete Budget", False, str(response))
    
    async def test_stats_overview(self):
        """Test stats overview endpoint"""
        print("\n📈 Testing Stats Overview...")
        
        if not self.auth_token:
            self.log_test("Stats Overview", False, "No auth token available")
            return
        
        success, response = await self.make_request("GET", "/stats/overview")
        
        if success and isinstance(response, dict):
            required_fields = ["total_income", "total_expense", "balance", "transaction_count", "category_breakdown"]
            missing_fields = [field for field in required_fields if field not in response]
            
            if not missing_fields:
                self.log_test("Stats Overview", True, 
                             f"Income: ₹{response['total_income']}, Expense: ₹{response['total_expense']}")
            else:
                self.log_test("Stats Overview", False, f"Missing fields: {missing_fields}")
        else:
            self.log_test("Stats Overview", False, str(response))
    
    async def run_all_tests(self):
        """Run all tests in priority order"""
        print("🚀 Starting MintU Backend API Tests...")
        print(f"🌐 Testing against: {BASE_URL}")
        
        await self.setup()
        
        try:
            # High Priority Tests
            await self.test_user_registration()
            await self.test_user_login()
            await self.test_user_profile()
            await self.test_transaction_management()
            await self.test_sms_parsing()
            await self.test_daily_insights()
            
            # Medium Priority Tests
            await self.test_budget_management()
            
            # Low Priority Tests
            await self.test_stats_overview()
            
        finally:
            await self.cleanup()
        
        # Print summary
        print("\n" + "="*60)
        print("📋 TEST SUMMARY")
        print("="*60)
        
        passed = sum(1 for result in self.test_results.values() if result["success"])
        total = len(self.test_results)
        
        for test_name, result in self.test_results.items():
            status = "✅" if result["success"] else "❌"
            print(f"{status} {test_name}")
            if not result["success"] and result["details"]:
                print(f"   Error: {result['details']}")
        
        print(f"\n📊 Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed!")
            return False

async def main():
    """Main test runner"""
    tester = MintUAPITester()
    success = await tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())