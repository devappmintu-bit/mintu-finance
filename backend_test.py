#!/usr/bin/env python3
"""
MintU Backend API Testing Suite
Tests all backend APIs according to test_result.md priorities
Focus on OTP authentication and new split functionality
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
    "otp": "123456",  # Mock OTP mode
    "name": "Test User"
}
ADDITIONAL_USER_PHONE = "9999888877"  # For split group testing

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
    
    async def test_otp_authentication(self):
        """Test OTP-based authentication flow"""
        print("\n🔐 Testing OTP Authentication Flow...")
        
        # Step 1: Send OTP
        success, response = await self.make_request(
            "POST", "/auth/send-otp",
            data={"phone": TEST_CREDENTIALS["phone"]},
            expect_status=200
        )
        
        if success and isinstance(response, dict):
            self.log_test("Send OTP", True, f"OTP sent to {TEST_CREDENTIALS['phone']}")
        else:
            self.log_test("Send OTP", False, str(response))
            return
        
        # Step 2: Verify OTP
        success, response = await self.make_request(
            "POST", "/auth/verify-otp",
            data={
                "phone": TEST_CREDENTIALS["phone"], 
                "otp": TEST_CREDENTIALS["otp"],
                "name": TEST_CREDENTIALS["name"]  # For new users
            },
            expect_status=200
        )
        
        if success and isinstance(response, dict) and "token" in response:
            self.auth_token = response["token"]
            self.user_id = response["user"]["id"]
            self.log_test("Verify OTP", True, f"Token received, User ID: {self.user_id}")
        else:
            self.log_test("Verify OTP", False, str(response))
            return
        
        # Test invalid OTP
        success, response = await self.make_request(
            "POST", "/auth/verify-otp",
            data={"phone": "9999999999", "otp": "000000"},
            expect_status=400
        )
        
        if success:
            self.log_test("Invalid OTP Rejection", True, "Correctly rejected invalid OTP")
        else:
            self.log_test("Invalid OTP Rejection", False, str(response))
    
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
            "type": "debit"  # Changed from "expense" to "debit"
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
    
    async def test_split_groups_and_expenses(self):
        """Test split groups and expenses functionality"""
        print("\n👥 Testing Split Groups & Expenses...")
        
        if not self.auth_token:
            self.log_test("Split Groups & Expenses", False, "No auth token available")
            return
        
        # Test create split group
        group_data = {
            "name": "Test Group",
            "members": [ADDITIONAL_USER_PHONE]  # Add another user
        }
        
        success, response = await self.make_request(
            "POST", "/split/groups",
            data=group_data
        )
        
        group_id = None
        if success and isinstance(response, dict) and "id" in response:
            group_id = response["id"]
            self.log_test("Create Split Group", True, f"Group ID: {group_id}")
        else:
            self.log_test("Create Split Group", False, str(response))
        
        # Test get all split groups
        success, response = await self.make_request("GET", "/split/groups")
        
        if success and isinstance(response, list):
            self.log_test("Get Split Groups", True, f"Retrieved {len(response)} groups")
        else:
            self.log_test("Get Split Groups", False, str(response))
        
        # Test add split expense
        if group_id and self.user_id:
            expense_data = {
                "group_id": group_id,
                "description": "Dinner at restaurant",
                "amount": 1000.0,
                "paid_by": self.user_id,
                "split_type": "equal"
            }
            
            success, response = await self.make_request(
                "POST", "/split/expenses",
                data=expense_data
            )
            
            if success and isinstance(response, dict) and "id" in response:
                self.log_test("Add Split Expense", True, f"Expense ID: {response['id']}")
            else:
                self.log_test("Add Split Expense", False, str(response))
            
            # Test get group expenses
            success, response = await self.make_request(
                "GET", f"/split/groups/{group_id}/expenses"
            )
            
            if success and isinstance(response, dict) and "expenses" in response:
                self.log_test("Get Group Expenses", True, f"Retrieved {len(response['expenses'])} expenses")
            else:
                self.log_test("Get Group Expenses", False, str(response))
        
        # Test get split balances
        success, response = await self.make_request("GET", "/split/balances")
        
        if success and isinstance(response, dict):
            required_fields = ["total_owed_to_you", "total_you_owe", "owe_you", "you_owe"]
            missing_fields = [field for field in required_fields if field not in response]
            
            if not missing_fields:
                self.log_test("Get Split Balances", True, 
                             f"Owed to you: ₹{response['total_owed_to_you']}, You owe: ₹{response['total_you_owe']}")
            else:
                self.log_test("Get Split Balances", False, f"Missing fields: {missing_fields}")
        else:
            self.log_test("Get Split Balances", False, str(response))
    
    async def test_sms_bulk_parse(self):
        """Test SMS bulk parsing functionality"""
        print("\n📱 Testing SMS Bulk Parse...")
        
        if not self.auth_token:
            self.log_test("SMS Bulk Parse", False, "No auth token available")
            return
        
        # Test bulk SMS parsing
        sms_messages = [
            "HDFC Bank: Rs 500.00 debited from A/c XX1234 to VPA test@upi on 01-06-25",
            "You paid Rs.250 to Swiggy via PhonePe",
            "ICICI Bank: Rs 1000.00 credited to A/c XX5678 on 01-06-25"
        ]
        
        success, response = await self.make_request(
            "POST", "/sms/bulk-parse",
            data={"messages": sms_messages}
        )
        
        if success and isinstance(response, dict):
            required_fields = ["parsed", "failed", "total"]
            missing_fields = [field for field in required_fields if field not in response]
            
            if not missing_fields:
                self.log_test("SMS Bulk Parse", True, 
                             f"Parsed: {response['parsed']}, Failed: {response['failed']}, Total: {response['total']}")
            else:
                self.log_test("SMS Bulk Parse", False, f"Missing fields: {missing_fields}")
        else:
            self.log_test("SMS Bulk Parse", False, str(response))
    
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
        print(f"📱 Using OTP authentication with phone: {TEST_CREDENTIALS['phone']}")
        
        await self.setup()
        
        try:
            # High Priority Tests - Authentication Flow
            await self.test_otp_authentication()
            await self.test_user_profile()
            
            # High Priority Tests - Split Groups & Expenses (recently added)
            await self.test_split_groups_and_expenses()
            
            # High Priority Tests - SMS Bulk Parse (recently added)
            await self.test_sms_bulk_parse()
            
            # Medium Priority Tests - Transaction Management
            await self.test_transaction_management()
            
            # Medium Priority Tests - Budget Management
            await self.test_budget_management()
            
            # High Priority Tests - Daily Insights with AI
            await self.test_daily_insights()
            
            # Low Priority Tests - Stats Overview
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