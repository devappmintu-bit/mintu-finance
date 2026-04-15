#!/usr/bin/env python3
"""
MintU Comprehensive Backend API Testing - Production Level
Tests ALL MintU endpoints as specified in the review request
"""

import asyncio
import aiohttp
import json
import sys
from datetime import datetime, timedelta

# Backend URL from frontend .env
BACKEND_URL = "https://mintu-finance.preview.emergentagent.com/api"

# Test credentials from test_credentials.md
TEST_PHONE = "9876543210"
TEST_OTP = "123456"
TEST_NAME = "Test User"
MEMBER_PHONE = "9999888877"

class MintUComprehensiveTester:
    def __init__(self):
        self.session = None
        self.auth_token = None
        self.user_id = None
        self.test_group_id = None
        self.test_transaction_id = None
        self.test_budget_id = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def get_headers(self):
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        return headers
    
    async def make_request(self, method, endpoint, data=None, expect_status=200):
        """Make HTTP request with error handling"""
        url = f"{BACKEND_URL}{endpoint}"
        headers = self.get_headers()
        
        try:
            async with self.session.request(method, url, json=data, headers=headers) as response:
                response_text = await response.text()
                
                print(f"\n{method} {endpoint}")
                print(f"Status: {response.status}")
                if len(response_text) > 500:
                    print(f"Response: {response_text[:500]}...")
                else:
                    print(f"Response: {response_text}")
                
                if response.status != expect_status:
                    print(f"❌ Expected {expect_status}, got {response.status}")
                    return None
                
                try:
                    return json.loads(response_text) if response_text else {}
                except:
                    return {"raw_response": response_text}
                    
        except Exception as e:
            print(f"❌ Request failed: {str(e)}")
            return None
    
    async def test_auth_flow(self):
        """Test complete OTP authentication flow"""
        print("\n🔐 TESTING AUTH FLOW")
        
        # Step 1: Send OTP
        print("\n1. POST /api/auth/send-otp")
        otp_response = await self.make_request("POST", "/auth/send-otp", {
            "phone": TEST_PHONE
        })
        
        if not otp_response:
            print("❌ Failed to send OTP")
            return False
        
        print(f"✅ OTP sent: {otp_response.get('message', '')}")
        
        # Step 2: Verify OTP
        print("\n2. POST /api/auth/verify-otp")
        verify_response = await self.make_request("POST", "/auth/verify-otp", {
            "phone": TEST_PHONE,
            "otp": TEST_OTP,
            "name": TEST_NAME
        })
        
        if not verify_response or "token" not in verify_response:
            print("❌ Failed to verify OTP")
            return False
        
        self.auth_token = verify_response["token"]
        self.user_id = verify_response["user"]["id"]
        print(f"✅ Authentication successful! Token received, User ID: {self.user_id}")
        
        return True
    
    async def test_core_auth_user(self):
        """Test core auth and user endpoints"""
        print("\n👤 TESTING CORE AUTH & USER")
        
        # Test register endpoint
        print("\n1. POST /api/auth/register")
        register_response = await self.make_request("POST", "/auth/register", {
            "phone": "9876543211",
            "password": "test123",
            "name": "Test User 2"
        })
        
        if register_response:
            print("✅ Register endpoint working")
        else:
            print("❌ Register endpoint failed")
            return False
        
        # Test login endpoint
        print("\n2. POST /api/auth/login")
        login_response = await self.make_request("POST", "/auth/login", {
            "phone": TEST_PHONE,
            "password": "test123"
        })
        
        if login_response:
            print("✅ Login endpoint working")
        else:
            print("❌ Login endpoint failed")
            return False
        
        # Test user profile
        print("\n3. GET /api/user/me")
        profile_response = await self.make_request("GET", "/user/me")
        
        if profile_response and "id" in profile_response:
            print(f"✅ User profile retrieved: {profile_response.get('name', '')}")
            return True
        else:
            print("❌ User profile failed")
            return False
    
    async def test_transactions(self):
        """Test transaction CRUD operations"""
        print("\n💰 TESTING TRANSACTIONS")
        
        # Create transaction
        print("\n1. POST /api/transactions")
        create_response = await self.make_request("POST", "/transactions", {
            "amount": 1500,
            "category": "Food",
            "description": "Dinner at restaurant",
            "type": "debit"
        })
        
        if not create_response or "id" not in create_response:
            print("❌ Failed to create transaction")
            return False
        
        self.test_transaction_id = create_response["id"]
        print(f"✅ Transaction created: {create_response['description']} - ₹{create_response['amount']}")
        
        # Get transactions
        print("\n2. GET /api/transactions")
        list_response = await self.make_request("GET", "/transactions")
        
        if not list_response or not isinstance(list_response, list):
            print("❌ Failed to get transactions")
            return False
        
        print(f"✅ Retrieved {len(list_response)} transactions")
        
        # Parse SMS
        print("\n3. POST /api/transactions/parse-sms")
        sms_response = await self.make_request("POST", "/transactions/parse-sms", {
            "sms_text": "HDFC Bank: Rs 2,500 debited from A/c **1234 on 15-Dec-24 at SWIGGY BANGALORE. Avl Bal: Rs 45,678.90"
        })
        
        if sms_response:
            print(f"✅ SMS parsed successfully")
        else:
            print("❌ SMS parsing failed")
            return False
        
        # Delete transaction
        print(f"\n4. DELETE /api/transactions/{self.test_transaction_id}")
        delete_response = await self.make_request("DELETE", f"/transactions/{self.test_transaction_id}")
        
        if delete_response:
            print("✅ Transaction deleted successfully")
            return True
        else:
            print("❌ Transaction deletion failed")
            return False
    
    async def test_budgets(self):
        """Test budget CRUD operations"""
        print("\n🎯 TESTING BUDGETS")
        
        # Create budget
        print("\n1. POST /api/budgets")
        create_response = await self.make_request("POST", "/budgets", {
            "category": "Entertainment",
            "amount": 5000,
            "period": "monthly"
        })
        
        if not create_response or "id" not in create_response:
            print("❌ Failed to create budget")
            return False
        
        self.test_budget_id = create_response["id"]
        print(f"✅ Budget created: {create_response['category']} - ₹{create_response['amount']}/{create_response['period']}")
        
        # Get budgets
        print("\n2. GET /api/budgets")
        list_response = await self.make_request("GET", "/budgets")
        
        if not list_response or not isinstance(list_response, list):
            print("❌ Failed to get budgets")
            return False
        
        print(f"✅ Retrieved {len(list_response)} budgets")
        
        # Delete budget
        print(f"\n3. DELETE /api/budgets/{self.test_budget_id}")
        delete_response = await self.make_request("DELETE", f"/budgets/{self.test_budget_id}")
        
        if delete_response:
            print("✅ Budget deleted successfully")
            return True
        else:
            print("❌ Budget deletion failed")
            return False
    
    async def test_insights(self):
        """Test insights endpoints with language support"""
        print("\n📊 TESTING INSIGHTS")
        
        # Daily insights in Hindi
        print("\n1. GET /api/insights/daily?lang=hi")
        hindi_response = await self.make_request("GET", "/insights/daily?lang=hi")
        
        if not hindi_response:
            print("❌ Failed to get Hindi insights")
            return False
        
        print(f"✅ Hindi insights: Money score {hindi_response.get('money_score', 0)}/100")
        
        # Daily insights in English
        print("\n2. GET /api/insights/daily?lang=en")
        english_response = await self.make_request("GET", "/insights/daily?lang=en")
        
        if not english_response:
            print("❌ Failed to get English insights")
            return False
        
        print(f"✅ English insights: Money score {english_response.get('money_score', 0)}/100")
        
        # Weekly insights
        print("\n3. GET /api/insights/weekly")
        weekly_response = await self.make_request("GET", "/insights/weekly")
        
        if weekly_response:
            print("✅ Weekly insights retrieved")
            return True
        else:
            print("❌ Weekly insights failed")
            return False
    
    async def test_money_school(self):
        """Test money school endpoints with language support"""
        print("\n🎓 TESTING MONEY SCHOOL")
        
        # Daily tip in Hindi
        print("\n1. GET /api/money-school/daily?lang=hi")
        hindi_response = await self.make_request("GET", "/money-school/daily?lang=hi")
        
        if not hindi_response:
            print("❌ Failed to get Hindi money school tip")
            return False
        
        print(f"✅ Hindi tip: {hindi_response.get('tip', '')[:100]}...")
        
        # Daily tip in English
        print("\n2. GET /api/money-school/daily?lang=en")
        english_response = await self.make_request("GET", "/money-school/daily?lang=en")
        
        if english_response:
            print(f"✅ English tip: {english_response.get('tip', '')[:100]}...")
            return True
        else:
            print("❌ English money school tip failed")
            return False
    
    async def test_ai_coach(self):
        """Test AI coach with language support"""
        print("\n🤖 TESTING AI COACH")
        
        # Hindi chat
        print("\n1. POST /api/ai/chat (Hindi)")
        hindi_response = await self.make_request("POST", "/ai/chat", {
            "message": "How save more?",
            "lang": "hi"
        })
        
        if not hindi_response or "reply" not in hindi_response:
            print("❌ Failed to get Hindi AI response")
            return False
        
        print(f"✅ Hindi AI response: {hindi_response['reply'][:100]}...")
        
        # English chat
        print("\n2. POST /api/ai/chat (English)")
        english_response = await self.make_request("POST", "/ai/chat", {
            "message": "Am I overspending?",
            "lang": "en"
        })
        
        if english_response and "reply" in english_response:
            print(f"✅ English AI response: {english_response['reply'][:100]}...")
            return True
        else:
            print("❌ English AI response failed")
            return False
    
    async def test_split_functionality(self):
        """Test all split functionality including different split types"""
        print("\n👥 TESTING SPLIT FUNCTIONALITY")
        
        # Create group
        print("\n1. POST /api/split/groups")
        group_response = await self.make_request("POST", "/split/groups", {
            "name": "Test Group",
            "members": [MEMBER_PHONE]
        })
        
        if not group_response or "id" not in group_response:
            print("❌ Failed to create split group")
            return False
        
        self.test_group_id = group_response["id"]
        print(f"✅ Split group created: {group_response['name']}")
        
        # Get groups
        print("\n2. GET /api/split/groups")
        groups_response = await self.make_request("GET", "/split/groups")
        
        if not groups_response or not isinstance(groups_response, list):
            print("❌ Failed to get split groups")
            return False
        
        print(f"✅ Retrieved {len(groups_response)} split groups")
        
        # Add member to group
        print(f"\n3. POST /api/split/groups/{self.test_group_id}/members")
        member_response = await self.make_request("POST", f"/split/groups/{self.test_group_id}/members", {
            "phones": [MEMBER_PHONE]
        })
        
        if not member_response:
            print("❌ Failed to add member to group")
            return False
        
        print(f"✅ Added member {MEMBER_PHONE} to group")
        
        # Test equal split
        print("\n4. POST /api/split/expenses (equal split)")
        equal_response = await self.make_request("POST", "/split/expenses", {
            "group_id": self.test_group_id,
            "description": "Dinner bill",
            "amount": 1000,
            "split_type": "equal"
        })
        
        if not equal_response:
            print("❌ Failed to create equal split expense")
            return False
        
        print("✅ Equal split expense created")
        
        # Test shares split
        print("\n5. POST /api/split/expenses (shares split)")
        shares_response = await self.make_request("POST", "/split/expenses", {
            "group_id": self.test_group_id,
            "description": "Movie tickets",
            "amount": 600,
            "split_type": "shares",
            "splits": {
                self.user_id: 2,
                "member_user_id": 1
            }
        })
        
        if not shares_response:
            print("❌ Failed to create shares split expense")
            return False
        
        print("✅ Shares split expense created")
        
        # Test custom split
        print("\n6. POST /api/split/expenses (custom split)")
        custom_response = await self.make_request("POST", "/split/expenses", {
            "group_id": self.test_group_id,
            "description": "Shopping",
            "amount": 1000,
            "split_type": "custom",
            "splits": {
                self.user_id: 600,
                "member_user_id": 400
            }
        })
        
        if not custom_response:
            print("❌ Failed to create custom split expense")
            return False
        
        print("✅ Custom split expense created")
        
        # Get group expenses
        print(f"\n7. GET /api/split/groups/{self.test_group_id}/expenses")
        expenses_response = await self.make_request("GET", f"/split/groups/{self.test_group_id}/expenses")
        
        if not expenses_response or not isinstance(expenses_response, list):
            print("❌ Failed to get group expenses")
            return False
        
        print(f"✅ Retrieved {len(expenses_response)} group expenses")
        
        # Get balances
        print("\n8. GET /api/split/balances")
        balances_response = await self.make_request("GET", "/split/balances")
        
        if balances_response:
            print("✅ Split balances retrieved")
            return True
        else:
            print("❌ Split balances failed")
            return False
    
    async def test_retention_engine(self):
        """Test retention engine endpoints"""
        print("\n🔄 TESTING RETENTION ENGINE")
        
        # Waste detector
        print("\n1. GET /api/waste-detector")
        waste_response = await self.make_request("GET", "/waste-detector")
        
        if not waste_response:
            print("❌ Waste detector failed")
            return False
        
        print("✅ Waste detector working")
        
        # Weekly report
        print("\n2. GET /api/reports/weekly")
        report_response = await self.make_request("GET", "/reports/weekly")
        
        if not report_response:
            print("❌ Weekly report failed")
            return False
        
        print("✅ Weekly report working")
        
        # Smart alerts
        print("\n3. GET /api/alerts/smart")
        alerts_response = await self.make_request("GET", "/alerts/smart")
        
        if not alerts_response:
            print("❌ Smart alerts failed")
            return False
        
        print("✅ Smart alerts working")
        
        # Smart budget suggestions
        print("\n4. GET /api/budgets/smart-suggest")
        suggest_response = await self.make_request("GET", "/budgets/smart-suggest")
        
        if not suggest_response:
            print("❌ Smart budget suggestions failed")
            return False
        
        print("✅ Smart budget suggestions working")
        
        # Auto apply budgets
        print("\n5. POST /api/budgets/auto-apply")
        auto_response = await self.make_request("POST", "/budgets/auto-apply")
        
        if not auto_response:
            print("❌ Auto apply budgets failed")
            return False
        
        print("✅ Auto apply budgets working")
        
        # Shareable stats card
        print("\n6. GET /api/share/stats-card")
        stats_response = await self.make_request("GET", "/share/stats-card")
        
        if stats_response:
            print("✅ Shareable stats card working")
            return True
        else:
            print("❌ Shareable stats card failed")
            return False
    
    async def test_leaderboard_referral(self):
        """Test leaderboard and referral endpoints"""
        print("\n🏆 TESTING LEADERBOARD & REFERRAL")
        
        # Savings leaderboard
        print("\n1. GET /api/leaderboard/savings")
        savings_response = await self.make_request("GET", "/leaderboard/savings")
        
        if not savings_response:
            print("❌ Savings leaderboard failed")
            return False
        
        print("✅ Savings leaderboard working")
        
        # Friends leaderboard
        print("\n2. GET /api/leaderboard/friends")
        friends_response = await self.make_request("GET", "/leaderboard/friends")
        
        if not friends_response:
            print("❌ Friends leaderboard failed")
            return False
        
        print("✅ Friends leaderboard working")
        
        # Enhanced referral status
        print("\n3. GET /api/referral/enhanced-status")
        enhanced_response = await self.make_request("GET", "/referral/enhanced-status")
        
        if not enhanced_response:
            print("❌ Enhanced referral status failed")
            return False
        
        print("✅ Enhanced referral status working")
        
        # My referral code
        print("\n4. GET /api/referral/my-code")
        code_response = await self.make_request("GET", "/referral/my-code")
        
        if not code_response:
            print("❌ My referral code failed")
            return False
        
        print("✅ My referral code working")
        
        # Gamification status
        print("\n5. GET /api/gamification/status")
        gamification_response = await self.make_request("GET", "/gamification/status")
        
        if gamification_response:
            print("✅ Gamification status working")
            return True
        else:
            print("❌ Gamification status failed")
            return False
    
    async def test_other_endpoints(self):
        """Test other miscellaneous endpoints"""
        print("\n📈 TESTING OTHER ENDPOINTS")
        
        # Stats overview
        print("\n1. GET /api/stats/overview")
        stats_response = await self.make_request("GET", "/stats/overview")
        
        if not stats_response:
            print("❌ Stats overview failed")
            return False
        
        print("✅ Stats overview working")
        
        # Bulk SMS parse
        print("\n2. POST /api/sms/bulk-parse")
        bulk_response = await self.make_request("POST", "/sms/bulk-parse", {
            "messages": [
                "HDFC Bank: Rs 2,500 debited from A/c **1234 on 15-Dec-24 at SWIGGY BANGALORE. Avl Bal: Rs 45,678.90",
                "PhonePe: You paid Rs 150 to UBER INDIA. UPI Ref: 123456789. Balance: Rs 5,000",
                "ICICI Bank: Rs 3,200 credited to A/c **5678 on 14-Dec-24. Salary credit. Avl Bal: Rs 48,878.90"
            ]
        })
        
        if bulk_response:
            print("✅ Bulk SMS parse working")
            return True
        else:
            print("❌ Bulk SMS parse failed")
            return False
    
    async def run_comprehensive_tests(self):
        """Run all comprehensive tests"""
        print("🚀 STARTING COMPREHENSIVE MINTU BACKEND TESTS")
        print(f"🌐 Backend URL: {BACKEND_URL}")
        print(f"📱 Test Phone: {TEST_PHONE}")
        
        results = {}
        
        # Authentication is required first
        results["auth_flow"] = await self.test_auth_flow()
        if not results["auth_flow"]:
            print("❌ Authentication failed - cannot proceed with other tests")
            return results
        
        # Test all endpoint categories
        results["core_auth_user"] = await self.test_core_auth_user()
        results["transactions"] = await self.test_transactions()
        results["budgets"] = await self.test_budgets()
        results["insights"] = await self.test_insights()
        results["money_school"] = await self.test_money_school()
        results["ai_coach"] = await self.test_ai_coach()
        results["split_functionality"] = await self.test_split_functionality()
        results["retention_engine"] = await self.test_retention_engine()
        results["leaderboard_referral"] = await self.test_leaderboard_referral()
        results["other_endpoints"] = await self.test_other_endpoints()
        
        # Print comprehensive summary
        print("\n" + "="*80)
        print("📋 COMPREHENSIVE TEST SUMMARY")
        print("="*80)
        
        passed = 0
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status} {test_name.replace('_', ' ').title()}")
            if result:
                passed += 1
        
        print(f"\n🎯 OVERALL: {passed}/{total} test categories passed ({passed/total*100:.1f}%)")
        
        if passed == total:
            print("🎉 ALL MINTU ENDPOINTS WORKING - PRODUCTION READY!")
        else:
            print("⚠️  Some endpoints need attention")
        
        return results

async def main():
    """Main test runner"""
    async with MintUComprehensiveTester() as tester:
        results = await tester.run_comprehensive_tests()
        
        # Exit with appropriate code
        all_passed = all(results.values())
        sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    asyncio.run(main())