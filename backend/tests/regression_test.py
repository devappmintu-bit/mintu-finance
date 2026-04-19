#!/usr/bin/env python3
"""
MintU Backend Comprehensive Regression Test - Review Request
Tests ALL critical CRUD flows with peak load simulation (300ms delays)

SPECIFIC REVIEW REQUEST ENDPOINTS:
Auth: POST /api/auth/send-otp, POST /api/auth/verify-otp
Split CRUD: POST /api/split/groups, GET /api/split/groups/{id}/manage, GET /api/split/groups/{id}/summary, DELETE /api/split/groups/{id}, GET /api/split/groups
Budget CRUD: POST /api/budgets, GET /api/budgets/live, DELETE /api/budgets/{id}
Transaction: POST /api/transactions, GET /api/transactions?limit=5
AI & Insights: POST /api/ai/agent-chat, GET /api/waste-detector, GET /api/insights/daily?lang=en
Profile: GET /api/user/me, GET /api/stats/overview

Peak load simulation with 300ms delays between requests.
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"
DELAY_MS = 300  # 300ms delay for peak load simulation

class MintURegressionTester:
    def __init__(self):
        self.token = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'MintU-RegressionTest/1.0'
        })
        self.test_results = []
        self.group_id = None
        self.budget_id = None
        self.transaction_id = None
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def record_test(self, test_name, passed, details=""):
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })

    def delay(self):
        """Add 300ms delay for peak load simulation"""
        time.sleep(DELAY_MS / 1000.0)

    # AUTH FLOW
    def test_auth_send_otp(self):
        """1. POST /api/auth/send-otp"""
        self.log("🔐 Test 1: POST /api/auth/send-otp...")
        try:
            response = self.session.post(f"{BASE_URL}/auth/send-otp", 
                                       json={"phone": TEST_PHONE})
            if response.status_code == 200:
                self.log("✅ OTP sent successfully", "PASS")
                self.record_test("POST /api/auth/send-otp", True, "OTP sent successfully")
                return True
            else:
                self.log(f"❌ OTP send failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/auth/send-otp", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ OTP send error: {str(e)}", "ERROR")
            self.record_test("POST /api/auth/send-otp", False, f"Error: {str(e)}")
            return False

    def test_auth_verify_otp(self):
        """2. POST /api/auth/verify-otp"""
        self.log("🔐 Test 2: POST /api/auth/verify-otp...")
        try:
            response = self.session.post(f"{BASE_URL}/auth/verify-otp",
                                       json={"phone": TEST_PHONE, "otp": TEST_OTP})
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("token")
                if not self.token:
                    self.log("❌ No token in response", "FAIL")
                    self.record_test("POST /api/auth/verify-otp", False, "No token in response")
                    return False
                    
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                self.log("✅ OTP verified, token received", "PASS")
                self.record_test("POST /api/auth/verify-otp", True, "Token received")
                return True
            else:
                self.log(f"❌ OTP verification failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/auth/verify-otp", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ OTP verification error: {str(e)}", "ERROR")
            self.record_test("POST /api/auth/verify-otp", False, f"Error: {str(e)}")
            return False

    # SPLIT CRUD (Priority - verify delete/leave work)
    def test_create_split_group(self):
        """3. POST /api/split/groups - create group"""
        self.log("👥 Test 3: POST /api/split/groups - create group...")
        try:
            response = self.session.post(f"{BASE_URL}/split/groups",
                                       json={
                                           "name": "Regression Test",
                                           "members": ["9111222333"]
                                       })
            
            if response.status_code == 200:
                data = response.json()
                self.group_id = data.get("id", data.get("_id"))
                if self.group_id:
                    self.log(f"✅ Group created: Regression Test", "PASS")
                    self.record_test("POST /api/split/groups", True, f"Group ID: {self.group_id}")
                    return True
                else:
                    self.log(f"❌ No group ID in response: {data}", "FAIL")
                    self.record_test("POST /api/split/groups", False, "No group ID in response")
                    return False
            else:
                self.log(f"❌ Create group failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/split/groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Create group error: {str(e)}", "ERROR")
            self.record_test("POST /api/split/groups", False, f"Error: {str(e)}")
            return False

    def test_get_group_manage(self):
        """4. GET /api/split/groups/{id}/manage - get manage data"""
        self.log("🔧 Test 4: GET /api/split/groups/{id}/manage - get manage data...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping group manage test", "SKIP")
                self.record_test("GET /api/split/groups/{id}/manage", False, "No group ID available")
                return False
                
            response = self.session.get(f"{BASE_URL}/split/groups/{self.group_id}/manage")
            
            if response.status_code == 200:
                data = response.json()
                members = data.get("members", [])
                self.log(f"✅ Group management retrieved - {len(members)} members", "PASS")
                self.record_test("GET /api/split/groups/{id}/manage", True, f"Retrieved {len(members)} members")
                return True
            else:
                self.log(f"❌ Group management failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/groups/{id}/manage", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Group management error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/groups/{id}/manage", False, f"Error: {str(e)}")
            return False

    def test_get_group_summary(self):
        """5. GET /api/split/groups/{id}/summary - get summary"""
        self.log("📊 Test 5: GET /api/split/groups/{id}/summary - get summary...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping group summary test", "SKIP")
                self.record_test("GET /api/split/groups/{id}/summary", False, "No group ID available")
                return False
                
            response = self.session.get(f"{BASE_URL}/split/groups/{self.group_id}/summary")
            
            if response.status_code == 200:
                data = response.json()
                total_spent = data.get("total_spent", 0)
                simplified_debts = data.get("simplified_debts", [])
                self.log(f"✅ Group summary retrieved - Total: ₹{total_spent}, Debts: {len(simplified_debts)}", "PASS")
                self.record_test("GET /api/split/groups/{id}/summary", True, f"Total: ₹{total_spent}, Debts: {len(simplified_debts)}")
                return True
            else:
                self.log(f"❌ Group summary failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/groups/{id}/summary", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Group summary error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/groups/{id}/summary", False, f"Error: {str(e)}")
            return False

    def test_delete_group(self):
        """6. DELETE /api/split/groups/{id} - DELETE group (MUST return 200)"""
        self.log("🗑️ Test 6: DELETE /api/split/groups/{id} - DELETE group...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping delete group test", "SKIP")
                self.record_test("DELETE /api/split/groups/{id}", False, "No group ID available")
                return False
                
            response = self.session.delete(f"{BASE_URL}/split/groups/{self.group_id}")
            
            if response.status_code == 200:
                self.log(f"✅ Group deleted: {self.group_id}", "PASS")
                self.record_test("DELETE /api/split/groups/{id}", True, f"Group {self.group_id} deleted")
                return True
            else:
                self.log(f"❌ Delete group failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("DELETE /api/split/groups/{id}", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Delete group error: {str(e)}", "ERROR")
            self.record_test("DELETE /api/split/groups/{id}", False, f"Error: {str(e)}")
            return False

    def test_get_all_groups(self):
        """7. GET /api/split/groups - verify deleted group is gone"""
        self.log("📋 Test 7: GET /api/split/groups - verify deleted group is gone...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups")
            
            if response.status_code == 200:
                data = response.json()
                groups = data if isinstance(data, list) else data.get("groups", [])
                self.log(f"✅ Retrieved {len(groups)} split groups", "PASS")
                self.record_test("GET /api/split/groups", True, f"{len(groups)} groups found")
                return True
            else:
                self.log(f"❌ Read groups failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Read groups error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/groups", False, f"Error: {str(e)}")
            return False

    # BUDGET CRUD
    def test_create_budget(self):
        """8. POST /api/budgets - create budget"""
        self.log("💰 Test 8: POST /api/budgets - create budget...")
        try:
            response = self.session.post(f"{BASE_URL}/budgets",
                                       json={
                                           "category": "Entertainment",
                                           "amount": 3000,
                                           "period": "monthly"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                self.budget_id = data.get("id", data.get("_id"))
                self.log("✅ Budget created: Entertainment ₹3000/month", "PASS")
                self.record_test("POST /api/budgets", True, f"Budget ID: {self.budget_id}")
                return True
            else:
                self.log(f"❌ Create budget failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/budgets", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Create budget error: {str(e)}", "ERROR")
            self.record_test("POST /api/budgets", False, f"Error: {str(e)}")
            return False

    def test_get_budgets_live(self):
        """9. GET /api/budgets/live - verify budget exists"""
        self.log("📊 Test 9: GET /api/budgets/live - verify budget exists...")
        try:
            response = self.session.get(f"{BASE_URL}/budgets/live")
            
            if response.status_code == 200:
                data = response.json()
                budgets = data.get("budgets", []) if isinstance(data, dict) else data
                self.log(f"✅ Live Budgets retrieved - {len(budgets)} budgets", "PASS")
                self.record_test("GET /api/budgets/live", True, f"{len(budgets)} live budgets")
                return True
            else:
                self.log(f"❌ Live Budgets failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/budgets/live", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Live Budgets error: {str(e)}", "ERROR")
            self.record_test("GET /api/budgets/live", False, f"Error: {str(e)}")
            return False

    def test_delete_budget(self):
        """10. DELETE /api/budgets/{id} - delete budget"""
        self.log("🗑️ Test 10: DELETE /api/budgets/{id} - delete budget...")
        try:
            if not self.budget_id:
                self.log("⚠️ No budget ID available, skipping delete budget test", "SKIP")
                self.record_test("DELETE /api/budgets/{id}", False, "No budget ID available")
                return False
                
            response = self.session.delete(f"{BASE_URL}/budgets/{self.budget_id}")
            
            if response.status_code == 200:
                self.log(f"✅ Budget deleted: {self.budget_id}", "PASS")
                self.record_test("DELETE /api/budgets/{id}", True, f"Budget {self.budget_id} deleted")
                return True
            else:
                self.log(f"❌ Delete budget failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("DELETE /api/budgets/{id}", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Delete budget error: {str(e)}", "ERROR")
            self.record_test("DELETE /api/budgets/{id}", False, f"Error: {str(e)}")
            return False

    # TRANSACTION
    def test_create_transaction(self):
        """11. POST /api/transactions - create transaction"""
        self.log("💳 Test 11: POST /api/transactions - create transaction...")
        try:
            response = self.session.post(f"{BASE_URL}/transactions",
                                       json={
                                           "amount": 500,
                                           "description": "Regression test",
                                           "category": "Food",
                                           "type": "expense"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                self.transaction_id = data.get("id", data.get("_id"))
                self.log("✅ Transaction created: Food ₹500", "PASS")
                self.record_test("POST /api/transactions", True, f"Transaction ID: {self.transaction_id}")
                return True
            else:
                self.log(f"❌ Create transaction failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/transactions", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Create transaction error: {str(e)}", "ERROR")
            self.record_test("POST /api/transactions", False, f"Error: {str(e)}")
            return False

    def test_get_transactions(self):
        """12. GET /api/transactions?limit=5 - verify transaction exists"""
        self.log("📋 Test 12: GET /api/transactions?limit=5 - verify transaction exists...")
        try:
            response = self.session.get(f"{BASE_URL}/transactions?limit=5")
            
            if response.status_code == 200:
                data = response.json()
                transactions = data.get("transactions", []) if isinstance(data, dict) else data
                self.log(f"✅ Retrieved {len(transactions)} transactions", "PASS")
                self.record_test("GET /api/transactions?limit=5", True, f"{len(transactions)} transactions found")
                return True
            else:
                self.log(f"❌ Get transactions failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/transactions?limit=5", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Get transactions error: {str(e)}", "ERROR")
            self.record_test("GET /api/transactions?limit=5", False, f"Error: {str(e)}")
            return False

    # AI & INSIGHTS
    def test_ai_agent_chat(self):
        """13. POST /api/ai/agent-chat - AI chat"""
        self.log("🤖 Test 13: POST /api/ai/agent-chat - AI chat...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={
                                           "message": "How much did I spend on food this month?",
                                           "lang": "en"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                response_text = data.get("response", "")
                agent_type = data.get("agent_type", "")
                self.log(f"✅ AI chat response received - Agent: {agent_type}, Length: {len(response_text)} chars", "PASS")
                self.record_test("POST /api/ai/agent-chat", True, f"Agent: {agent_type}, Response: {len(response_text)} chars")
                return True
            else:
                self.log(f"❌ AI chat failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/ai/agent-chat", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI chat error: {str(e)}", "ERROR")
            self.record_test("POST /api/ai/agent-chat", False, f"Error: {str(e)}")
            return False

    def test_waste_detector(self):
        """14. GET /api/waste-detector - waste detector"""
        self.log("🗑️ Test 14: GET /api/waste-detector - waste detector...")
        try:
            response = self.session.get(f"{BASE_URL}/waste-detector")
            
            if response.status_code == 200:
                data = response.json()
                categories = data.get("categories", [])
                overall_trend = data.get("overall_trend_pct", 0)
                self.log(f"✅ Waste detector retrieved - {len(categories)} categories, Trend: {overall_trend}%", "PASS")
                self.record_test("GET /api/waste-detector", True, f"{len(categories)} categories, Trend: {overall_trend}%")
                return True
            else:
                self.log(f"❌ Waste detector failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/waste-detector", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Waste detector error: {str(e)}", "ERROR")
            self.record_test("GET /api/waste-detector", False, f"Error: {str(e)}")
            return False

    def test_daily_insights(self):
        """15. GET /api/insights/daily?lang=en - insights"""
        self.log("💡 Test 15: GET /api/insights/daily?lang=en - insights...")
        try:
            response = self.session.get(f"{BASE_URL}/insights/daily?lang=en")
            
            if response.status_code == 200:
                data = response.json()
                money_score = data.get("money_score", 0)
                insights_text = data.get("insights_text", "")
                self.log(f"✅ Daily insights retrieved - Money Score: {money_score}, Insights: {len(insights_text)} chars", "PASS")
                self.record_test("GET /api/insights/daily?lang=en", True, f"Money Score: {money_score}, Insights: {len(insights_text)} chars")
                return True
            else:
                self.log(f"❌ Daily insights failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/insights/daily?lang=en", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Daily insights error: {str(e)}", "ERROR")
            self.record_test("GET /api/insights/daily?lang=en", False, f"Error: {str(e)}")
            return False

    # PROFILE
    def test_user_profile(self):
        """16. GET /api/user/me - profile data"""
        self.log("👤 Test 16: GET /api/user/me - profile data...")
        try:
            response = self.session.get(f"{BASE_URL}/user/me")
            
            if response.status_code == 200:
                data = response.json()
                name = data.get("name", "")
                phone = data.get("phone", "")
                self.log(f"✅ User profile retrieved - Name: {name}, Phone: {phone}", "PASS")
                self.record_test("GET /api/user/me", True, f"Name: {name}, Phone: {phone}")
                return True
            else:
                self.log(f"❌ User profile failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/user/me", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ User profile error: {str(e)}", "ERROR")
            self.record_test("GET /api/user/me", False, f"Error: {str(e)}")
            return False

    def test_stats_overview(self):
        """17. GET /api/stats/overview - full stats"""
        self.log("📊 Test 17: GET /api/stats/overview - full stats...")
        try:
            response = self.session.get(f"{BASE_URL}/stats/overview")
            
            if response.status_code == 200:
                data = response.json()
                total_income = data.get("total_income", 0)
                total_expense = data.get("total_expense", 0)
                balance = data.get("balance", 0)
                self.log(f"✅ Stats overview retrieved - Income: ₹{total_income}, Expense: ₹{total_expense}, Balance: ₹{balance}", "PASS")
                self.record_test("GET /api/stats/overview", True, f"Income: ₹{total_income}, Expense: ₹{total_expense}, Balance: ₹{balance}")
                return True
            else:
                self.log(f"❌ Stats overview failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/stats/overview", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Stats overview error: {str(e)}", "ERROR")
            self.record_test("GET /api/stats/overview", False, f"Error: {str(e)}")
            return False

    def run_regression_test(self):
        """Run comprehensive regression test with peak load simulation"""
        self.log("🚀 Starting MintU Comprehensive Regression Test...")
        self.log(f"📍 Testing against: {BASE_URL}")
        self.log(f"⏱️ Peak load simulation: {DELAY_MS}ms delays between requests")
        self.log("🎯 Focus: ALL critical CRUD flows as per review request")
        
        # All test methods in order as specified in review request
        test_methods = [
            # Auth
            self.test_auth_send_otp,
            self.test_auth_verify_otp,
            # Split CRUD (Priority - verify delete/leave work)
            self.test_create_split_group,
            self.test_get_group_manage,
            self.test_get_group_summary,
            self.test_delete_group,
            self.test_get_all_groups,
            # Budget CRUD
            self.test_create_budget,
            self.test_get_budgets_live,
            self.test_delete_budget,
            # Transaction
            self.test_create_transaction,
            self.test_get_transactions,
            # AI & Insights
            self.test_ai_agent_chat,
            self.test_waste_detector,
            self.test_daily_insights,
            # Profile
            self.test_user_profile,
            self.test_stats_overview
        ]
        
        for i, test_method in enumerate(test_methods):
            test_method()
            if i < len(test_methods) - 1:  # Don't delay after last test
                self.delay()
        
        # Summary
        self.print_summary()
        
        passed_tests = sum(1 for result in self.test_results if result["passed"])
        total_tests = len(self.test_results)
        
        return passed_tests == total_tests

    def print_summary(self):
        """Print comprehensive test summary"""
        self.log("\n" + "="*80)
        self.log("📊 COMPREHENSIVE REGRESSION TEST SUMMARY")
        self.log("="*80)
        
        passed_tests = [r for r in self.test_results if r["passed"]]
        failed_tests = [r for r in self.test_results if not r["passed"]]
        
        # Failed tests (if any)
        if failed_tests:
            self.log(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                self.log(f"   ❌ {test['test']} - {test['details']}")
        
        # Passed tests summary
        self.log(f"\n✅ PASSED TESTS ({len(passed_tests)}):")
        for test in passed_tests:
            self.log(f"   ✅ {test['test']} - {test['details']}")
        
        # Overall summary
        total_tests = len(self.test_results)
        success_rate = (len(passed_tests) / total_tests) * 100
        
        self.log(f"\n🎯 OVERALL RESULTS:")
        self.log(f"   Total Tests: {total_tests}")
        self.log(f"   Passed: {len(passed_tests)}")
        self.log(f"   Failed: {len(failed_tests)}")
        self.log(f"   Success Rate: {success_rate:.1f}%")
        
        if len(failed_tests) == 0:
            self.log("🎉 ALL REGRESSION TESTS PASSED! MintU backend is production-ready!", "SUCCESS")
        else:
            self.log(f"⚠️ {len(failed_tests)} tests failed. Review issues above.", "WARNING")

if __name__ == "__main__":
    tester = MintURegressionTester()
    success = tester.run_regression_test()
    exit(0 if success else 1)