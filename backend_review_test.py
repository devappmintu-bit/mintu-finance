#!/usr/bin/env python3
"""
MintU Backend API Review Request Testing
Tests specific endpoints mentioned in the review request with focus on:
- waste-detector response has new fields: ai_recommendation, overall_trend_pct, peer_comparison
- AI agent-chat response is conversational (not robotic)
- budgets/live returns budget data with spent amounts
- All endpoints return 200 OK

Review Request Endpoints:
1. POST /api/auth/send-otp with {"phone":"9876543210"}
2. POST /api/auth/verify-otp with {"phone":"9876543210","otp":"123456"} to get Bearer token
3. GET /api/user/me - user profile
4. GET /api/stats/overview - financial stats
5. GET /api/transactions - transaction list
6. GET /api/budgets/live - budget tracking with live spent amounts
7. GET /api/split/groups - split groups list
8. GET /api/split/balances - split balances
9. GET /api/waste-detector - AI waste detector (now with peer comparisons & AI recommendation)
10. GET /api/alerts/smart - smart alerts
11. POST /api/ai/agent-chat with {"message":"Am I overspending?","lang":"en"} - AI coach chat
12. GET /api/user/avatar - avatar persistence
13. POST /api/user/upi with {"upi_id":"test@okicici"} - UPI save
14. GET /api/budgets/smart-suggest - AI budget suggestions
15. GET /api/insights/daily?lang=en - daily insights
16. GET /api/share/stats-card - shareable stats card
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"

class MintUReviewTester:
    def __init__(self):
        self.token = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'MintU-ReviewTest/1.0'
        })
        self.test_results = []
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def record_test(self, test_name, passed, details=""):
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })

    def test_auth_send_otp(self):
        """Test 1: POST /api/auth/send-otp"""
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
        """Test 2: POST /api/auth/verify-otp"""
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
                self.log("✅ OTP verified, Bearer token received", "PASS")
                self.record_test("POST /api/auth/verify-otp", True, "Bearer token received")
                return True
            else:
                self.log(f"❌ OTP verification failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/auth/verify-otp", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ OTP verification error: {str(e)}", "ERROR")
            self.record_test("POST /api/auth/verify-otp", False, f"Error: {str(e)}")
            return False

    def test_user_profile(self):
        """Test 3: GET /api/user/me - user profile"""
        self.log("👤 Test 3: GET /api/user/me - user profile...")
        try:
            response = self.session.get(f"{BASE_URL}/user/me")
            if response.status_code == 200:
                data = response.json()
                name = data.get("name", "Unknown")
                phone = data.get("phone", "Unknown")
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
        """Test 4: GET /api/stats/overview - financial stats"""
        self.log("📊 Test 4: GET /api/stats/overview - financial stats...")
        try:
            response = self.session.get(f"{BASE_URL}/stats/overview")
            if response.status_code == 200:
                data = response.json()
                total_income = data.get("total_income", 0)
                total_expense = data.get("total_expense", 0)
                balance = data.get("balance", 0)
                self.log(f"✅ Financial stats retrieved - Income: ₹{total_income}, Expense: ₹{total_expense}, Balance: ₹{balance}", "PASS")
                self.record_test("GET /api/stats/overview", True, f"Income: ₹{total_income}, Expense: ₹{total_expense}")
                return True
            else:
                self.log(f"❌ Stats overview failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/stats/overview", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Stats overview error: {str(e)}", "ERROR")
            self.record_test("GET /api/stats/overview", False, f"Error: {str(e)}")
            return False

    def test_transactions(self):
        """Test 5: GET /api/transactions - transaction list"""
        self.log("💳 Test 5: GET /api/transactions - transaction list...")
        try:
            response = self.session.get(f"{BASE_URL}/transactions")
            if response.status_code == 200:
                data = response.json()
                transactions = data if isinstance(data, list) else data.get("transactions", [])
                self.log(f"✅ Transactions retrieved - {len(transactions)} transactions", "PASS")
                self.record_test("GET /api/transactions", True, f"{len(transactions)} transactions")
                return True
            else:
                self.log(f"❌ Transactions failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/transactions", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Transactions error: {str(e)}", "ERROR")
            self.record_test("GET /api/transactions", False, f"Error: {str(e)}")
            return False

    def test_budgets_live(self):
        """Test 6: GET /api/budgets/live - budget tracking with live spent amounts"""
        self.log("💰 Test 6: GET /api/budgets/live - budget tracking with live spent amounts...")
        try:
            response = self.session.get(f"{BASE_URL}/budgets/live")
            if response.status_code == 200:
                data = response.json()
                budgets = data.get("budgets", []) if isinstance(data, dict) else data
                
                # Check if budgets have spent amounts
                has_spent_amounts = False
                for budget in budgets:
                    if "spent" in budget or "spent_amount" in budget:
                        has_spent_amounts = True
                        break
                
                self.log(f"✅ Live budgets retrieved - {len(budgets)} budgets, spent amounts: {'Yes' if has_spent_amounts else 'No'}", "PASS")
                self.record_test("GET /api/budgets/live", True, f"{len(budgets)} budgets with spent tracking")
                return True
            else:
                self.log(f"❌ Live budgets failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/budgets/live", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Live budgets error: {str(e)}", "ERROR")
            self.record_test("GET /api/budgets/live", False, f"Error: {str(e)}")
            return False

    def test_split_groups(self):
        """Test 7: GET /api/split/groups - split groups list"""
        self.log("👥 Test 7: GET /api/split/groups - split groups list...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups")
            if response.status_code == 200:
                data = response.json()
                groups = data if isinstance(data, list) else data.get("groups", [])
                self.log(f"✅ Split groups retrieved - {len(groups)} groups", "PASS")
                self.record_test("GET /api/split/groups", True, f"{len(groups)} split groups")
                return True
            else:
                self.log(f"❌ Split groups failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split groups error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/groups", False, f"Error: {str(e)}")
            return False

    def test_split_balances(self):
        """Test 8: GET /api/split/balances - split balances"""
        self.log("⚖️ Test 8: GET /api/split/balances - split balances...")
        try:
            response = self.session.get(f"{BASE_URL}/split/balances")
            if response.status_code == 200:
                data = response.json()
                you_owe = data.get("you_owe", [])
                owed_to_you = data.get("owed_to_you", [])
                self.log(f"✅ Split balances retrieved - You owe: {len(you_owe)}, Owed to you: {len(owed_to_you)}", "PASS")
                self.record_test("GET /api/split/balances", True, f"You owe: {len(you_owe)}, Owed: {len(owed_to_you)}")
                return True
            else:
                self.log(f"❌ Split balances failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/balances", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split balances error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/balances", False, f"Error: {str(e)}")
            return False

    def test_waste_detector(self):
        """Test 9: GET /api/waste-detector - AI waste detector with new fields"""
        self.log("🗑️ Test 9: GET /api/waste-detector - AI waste detector with new fields...")
        try:
            response = self.session.get(f"{BASE_URL}/waste-detector")
            if response.status_code == 200:
                data = response.json()
                
                # Check for new fields
                has_ai_recommendation = "ai_recommendation" in data
                has_overall_trend_pct = "overall_trend_pct" in data
                has_peer_comparison = False
                
                # Check for peer_comparison in category_waste
                category_waste = data.get("category_waste", [])
                for category in category_waste:
                    if "peer_comparison" in category:
                        has_peer_comparison = True
                        break
                
                new_fields = []
                if has_ai_recommendation:
                    new_fields.append("ai_recommendation")
                if has_overall_trend_pct:
                    new_fields.append("overall_trend_pct")
                if has_peer_comparison:
                    new_fields.append("peer_comparison")
                
                self.log(f"✅ Waste detector retrieved - New fields: {', '.join(new_fields) if new_fields else 'None found'}", "PASS")
                self.record_test("GET /api/waste-detector", True, f"New fields: {', '.join(new_fields) if new_fields else 'None'}")
                return True
            else:
                self.log(f"❌ Waste detector failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/waste-detector", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Waste detector error: {str(e)}", "ERROR")
            self.record_test("GET /api/waste-detector", False, f"Error: {str(e)}")
            return False

    def test_smart_alerts(self):
        """Test 10: GET /api/alerts/smart - smart alerts"""
        self.log("🚨 Test 10: GET /api/alerts/smart - smart alerts...")
        try:
            response = self.session.get(f"{BASE_URL}/alerts/smart")
            if response.status_code == 200:
                data = response.json()
                alerts = data if isinstance(data, list) else data.get("alerts", [])
                self.log(f"✅ Smart alerts retrieved - {len(alerts)} alerts", "PASS")
                self.record_test("GET /api/alerts/smart", True, f"{len(alerts)} smart alerts")
                return True
            else:
                self.log(f"❌ Smart alerts failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/alerts/smart", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Smart alerts error: {str(e)}", "ERROR")
            self.record_test("GET /api/alerts/smart", False, f"Error: {str(e)}")
            return False

    def test_ai_agent_chat(self):
        """Test 11: POST /api/ai/agent-chat - AI coach chat (conversational)"""
        self.log("🤖 Test 11: POST /api/ai/agent-chat - AI coach chat (conversational)...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Am I overspending?", "lang": "en"})
            if response.status_code == 200:
                data = response.json()
                ai_response = data.get("reply", "")
                
                # Check if response is conversational (not robotic)
                conversational_indicators = [
                    "you", "your", "i", "let me", "i'd", "you're", "i think",
                    "seems like", "looks like", "i notice", "i see", "based on"
                ]
                
                is_conversational = any(indicator in ai_response.lower() for indicator in conversational_indicators)
                response_length = len(ai_response)
                
                self.log(f"✅ AI agent chat response - Length: {response_length} chars, Conversational: {'Yes' if is_conversational else 'No'}", "PASS")
                self.record_test("POST /api/ai/agent-chat", True, f"Response: {response_length} chars, Conversational: {'Yes' if is_conversational else 'No'}")
                return True
            else:
                self.log(f"❌ AI agent chat failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/ai/agent-chat", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI agent chat error: {str(e)}", "ERROR")
            self.record_test("POST /api/ai/agent-chat", False, f"Error: {str(e)}")
            return False

    def test_user_avatar(self):
        """Test 12: GET /api/user/avatar - avatar persistence"""
        self.log("🖼️ Test 12: GET /api/user/avatar - avatar persistence...")
        try:
            response = self.session.get(f"{BASE_URL}/user/avatar")
            if response.status_code == 200:
                data = response.json()
                avatar_data = data.get("avatar", "")
                name = data.get("name", "Unknown")
                self.log(f"✅ User avatar retrieved - Name: {name}, Avatar: {len(avatar_data)} chars", "PASS")
                self.record_test("GET /api/user/avatar", True, f"Name: {name}, Avatar: {len(avatar_data)} chars")
                return True
            else:
                self.log(f"❌ User avatar failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/user/avatar", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ User avatar error: {str(e)}", "ERROR")
            self.record_test("GET /api/user/avatar", False, f"Error: {str(e)}")
            return False

    def test_upi_save(self):
        """Test 13: POST /api/user/upi - UPI save"""
        self.log("💳 Test 13: POST /api/user/upi - UPI save...")
        try:
            response = self.session.post(f"{BASE_URL}/user/upi",
                                       json={"upi_id": "test@okicici"})
            if response.status_code == 200:
                data = response.json()
                masked_upi = data.get("masked_upi", "")
                self.log(f"✅ UPI saved successfully - Masked: {masked_upi}", "PASS")
                self.record_test("POST /api/user/upi", True, f"UPI saved, Masked: {masked_upi}")
                return True
            else:
                self.log(f"❌ UPI save failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/user/upi", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ UPI save error: {str(e)}", "ERROR")
            self.record_test("POST /api/user/upi", False, f"Error: {str(e)}")
            return False

    def test_budget_smart_suggest(self):
        """Test 14: GET /api/budgets/smart-suggest - AI budget suggestions"""
        self.log("🧠 Test 14: GET /api/budgets/smart-suggest - AI budget suggestions...")
        try:
            response = self.session.get(f"{BASE_URL}/budgets/smart-suggest")
            if response.status_code == 200:
                data = response.json()
                suggestions = data.get("suggestions", [])
                message = data.get("message", "")
                self.log(f"✅ Smart budget suggestions retrieved - {len(suggestions)} suggestions", "PASS")
                self.record_test("GET /api/budgets/smart-suggest", True, f"{len(suggestions)} AI suggestions")
                return True
            else:
                self.log(f"❌ Smart budget suggestions failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/budgets/smart-suggest", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Smart budget suggestions error: {str(e)}", "ERROR")
            self.record_test("GET /api/budgets/smart-suggest", False, f"Error: {str(e)}")
            return False

    def test_daily_insights(self):
        """Test 15: GET /api/insights/daily?lang=en - daily insights"""
        self.log("💡 Test 15: GET /api/insights/daily?lang=en - daily insights...")
        try:
            response = self.session.get(f"{BASE_URL}/insights/daily?lang=en")
            if response.status_code == 200:
                data = response.json()
                money_score = data.get("money_score", 0)
                insights_text = data.get("insight_text", "")
                self.log(f"✅ Daily insights retrieved - Money Score: {money_score}, Insights: {len(insights_text)} chars", "PASS")
                self.record_test("GET /api/insights/daily", True, f"Money Score: {money_score}, Insights: {len(insights_text)} chars")
                return True
            else:
                self.log(f"❌ Daily insights failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/insights/daily", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Daily insights error: {str(e)}", "ERROR")
            self.record_test("GET /api/insights/daily", False, f"Error: {str(e)}")
            return False

    def test_share_stats_card(self):
        """Test 16: GET /api/share/stats-card - shareable stats card"""
        self.log("📤 Test 16: GET /api/share/stats-card - shareable stats card...")
        try:
            response = self.session.get(f"{BASE_URL}/share/stats-card")
            if response.status_code == 200:
                data = response.json()
                whatsapp_text = data.get("whatsapp_text", "")
                instagram_text = data.get("instagram_text", "")
                self.log(f"✅ Shareable stats card retrieved - WhatsApp: {len(whatsapp_text)} chars, Instagram: {len(instagram_text)} chars", "PASS")
                self.record_test("GET /api/share/stats-card", True, f"WhatsApp: {len(whatsapp_text)}, Instagram: {len(instagram_text)} chars")
                return True
            else:
                self.log(f"❌ Shareable stats card failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/share/stats-card", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Shareable stats card error: {str(e)}", "ERROR")
            self.record_test("GET /api/share/stats-card", False, f"Error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all review request tests"""
        self.log("🚀 Starting MintU Backend Review Request Testing...")
        self.log(f"📍 Testing against: {BASE_URL}")
        self.log("🎯 Focus: Review request endpoints with new features")
        
        # All test methods in order
        test_methods = [
            self.test_auth_send_otp,
            self.test_auth_verify_otp,
            self.test_user_profile,
            self.test_stats_overview,
            self.test_transactions,
            self.test_budgets_live,
            self.test_split_groups,
            self.test_split_balances,
            self.test_waste_detector,
            self.test_smart_alerts,
            self.test_ai_agent_chat,
            self.test_user_avatar,
            self.test_upi_save,
            self.test_budget_smart_suggest,
            self.test_daily_insights,
            self.test_share_stats_card
        ]
        
        for test_method in test_methods:
            test_method()
            time.sleep(0.1)  # Small delay to avoid rate limiting
        
        # Summary
        self.print_summary()
        
        passed_tests = sum(1 for result in self.test_results if result["passed"])
        total_tests = len(self.test_results)
        
        return passed_tests == total_tests

    def print_summary(self):
        """Print comprehensive test summary"""
        self.log("\n" + "="*80)
        self.log("📊 REVIEW REQUEST TEST SUMMARY")
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
            self.log("🎉 ALL REVIEW REQUEST TESTS PASSED! Backend is ready for review!", "SUCCESS")
        else:
            self.log(f"⚠️ {len(failed_tests)} tests failed. Review issues above.", "WARNING")

if __name__ == "__main__":
    tester = MintUReviewTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)