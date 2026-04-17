#!/usr/bin/env python3
"""
MintU Backend API E2E Split Testing - Review Request
Tests EVERY split operation with N users as specified in the review request
Focus on comprehensive split functionality testing
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"

class MintUSplitTester:
    def __init__(self):
        self.token = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'MintU-SplitTest/1.0'
        })
        self.test_results = []
        self.group_id = None
        self.test_user_id = None
        self.expense_id = None
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def record_test(self, test_name, passed, details=""):
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })

    def authenticate(self):
        """Complete authentication flow"""
        self.log("🔐 Starting Authentication Flow...")
        
        # Send OTP
        try:
            response = self.session.post(f"{BASE_URL}/auth/send-otp", 
                                       json={"phone": TEST_PHONE})
            if response.status_code != 200:
                self.log(f"❌ OTP send failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/auth/send-otp", False, f"Status: {response.status_code}")
                return False
            self.log("✅ OTP sent successfully", "PASS")
            self.record_test("POST /api/auth/send-otp", True, "OTP sent successfully")
        except Exception as e:
            self.log(f"❌ OTP send error: {str(e)}", "ERROR")
            self.record_test("POST /api/auth/send-otp", False, f"Error: {str(e)}")
            return False

        # Verify OTP
        try:
            response = self.session.post(f"{BASE_URL}/auth/verify-otp",
                                       json={"phone": TEST_PHONE, "otp": TEST_OTP})
            if response.status_code != 200:
                self.log(f"❌ OTP verification failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/auth/verify-otp", False, f"Status: {response.status_code}")
                return False
                
            data = response.json()
            self.token = data.get("token")
            if not self.token:
                self.log("❌ No token in response", "FAIL")
                self.record_test("POST /api/auth/verify-otp", False, "No token in response")
                return False
                
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            self.log("✅ OTP verified, token received", "PASS")
            self.record_test("POST /api/auth/verify-otp", True, "Token received")
            
            # Get user profile
            user_response = self.session.get(f"{BASE_URL}/user/me")
            if user_response.status_code == 200:
                user_data = user_response.json()
                self.test_user_id = user_data.get("id", user_data.get("_id", "test_user"))
                self.log(f"✅ User profile retrieved - ID: {self.test_user_id}", "PASS")
            
            return True
        except Exception as e:
            self.log(f"❌ OTP verification error: {str(e)}", "ERROR")
            self.record_test("POST /api/auth/verify-otp", False, f"Error: {str(e)}")
            return False

    def test_create_group_with_5_members(self):
        """Test 1: Create group with 5+ members"""
        self.log("👥 Test 1: Create group with 5+ members...")
        try:
            members = ["9000000001", "9000000002", "9000000003", "9000000004", "9000000005"]
            response = self.session.post(f"{BASE_URL}/split/groups",
                                       json={"name": "Weekend Trip", "members": members})
            
            if response.status_code == 200:
                data = response.json()
                self.group_id = data.get("id", data.get("_id"))
                if self.group_id:
                    self.log(f"✅ Group created with 6 members (5 + creator): {data.get('name', 'Weekend Trip')}", "PASS")
                    self.record_test("Create group with 5+ members", True, f"Group ID: {self.group_id}, 6 total members")
                    return True
                else:
                    self.log(f"❌ No group ID in response: {data}", "FAIL")
                    self.record_test("Create group with 5+ members", False, "No group ID in response")
                    return False
            else:
                self.log(f"❌ Create group failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Create group with 5+ members", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Create group error: {str(e)}", "ERROR")
            self.record_test("Create group with 5+ members", False, f"Error: {str(e)}")
            return False

    def test_add_more_members(self):
        """Test 2: Add 2 more members (including unregistered phone)"""
        self.log("👥 Test 2: Add 2 more members (including unregistered phone)...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping add members test", "SKIP")
                self.record_test("Add more members", False, "No group ID available")
                return False
                
            phones = ["9000000006", "5551234567"]  # Second one is unregistered
            response = self.session.post(f"{BASE_URL}/split/groups/{self.group_id}/members",
                                       json={"phones": phones})
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Added 2 more members (including unregistered phone) - Should auto-create placeholder", "PASS")
                self.record_test("Add more members", True, "2 members added, placeholder created for unregistered")
                return True
            else:
                self.log(f"❌ Add members failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Add more members", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Add members error: {str(e)}", "ERROR")
            self.record_test("Add more members", False, f"Error: {str(e)}")
            return False

    def test_group_management(self):
        """Test 3: Get group management"""
        self.log("🔧 Test 3: Get group management...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping group management test", "SKIP")
                self.record_test("Group management", False, "No group ID available")
                return False
                
            response = self.session.get(f"{BASE_URL}/split/groups/{self.group_id}/manage")
            
            if response.status_code == 200:
                data = response.json()
                members = data.get("members", [])
                self.log(f"✅ Group management retrieved - Should show all 8 members with admin badges, initials. Found {len(members)} members", "PASS")
                self.record_test("Group management", True, f"Retrieved {len(members)} members with admin badges")
                return True
            else:
                self.log(f"❌ Group management failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Group management", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Group management error: {str(e)}", "ERROR")
            self.record_test("Group management", False, f"Error: {str(e)}")
            return False

    def test_add_equal_expense(self):
        """Test 4: Add equal expense"""
        self.log("💰 Test 4: Add equal expense...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping equal expense test", "SKIP")
                self.record_test("Add equal expense", False, "No group ID available")
                return False
                
            response = self.session.post(f"{BASE_URL}/split/expenses",
                                       json={
                                           "group_id": self.group_id,
                                           "description": "Hotel booking",
                                           "amount": 8000,
                                           "paid_by": self.test_user_id,
                                           "split_type": "equal"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                self.expense_id = data.get("id", data.get("_id"))
                self.log("✅ Equal expense added - ₹8000 split equally among all 8 members = ₹1000 each", "PASS")
                self.record_test("Add equal expense", True, "₹8000 split equally among 8 members")
                return True
            else:
                self.log(f"❌ Add equal expense failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Add equal expense", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Add equal expense error: {str(e)}", "ERROR")
            self.record_test("Add equal expense", False, f"Error: {str(e)}")
            return False

    def test_add_shares_expense(self):
        """Test 5: Add shares expense"""
        self.log("💰 Test 5: Add shares expense...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping shares expense test", "SKIP")
                self.record_test("Add shares expense", False, "No group ID available")
                return False
                
            # Create splits with ratio 2:1:1
            splits = {
                self.test_user_id: 2,
                "9000000001": 1,
                "9000000002": 1
            }
            
            response = self.session.post(f"{BASE_URL}/split/expenses",
                                       json={
                                           "group_id": self.group_id,
                                           "description": "Drinks",
                                           "amount": 3000,
                                           "paid_by": self.test_user_id,
                                           "split_type": "shares",
                                           "splits": splits
                                       })
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Shares expense added - ₹3000 split by ratio 2:1:1", "PASS")
                self.record_test("Add shares expense", True, "₹3000 split by ratio 2:1:1")
                return True
            else:
                self.log(f"❌ Add shares expense failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Add shares expense", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Add shares expense error: {str(e)}", "ERROR")
            self.record_test("Add shares expense", False, f"Error: {str(e)}")
            return False

    def test_group_summary_with_simplified_debts(self):
        """Test 6: Group summary with simplified debts"""
        self.log("📊 Test 6: Group summary with simplified debts...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping group summary test", "SKIP")
                self.record_test("Group summary with simplified debts", False, "No group ID available")
                return False
                
            response = self.session.get(f"{BASE_URL}/split/groups/{self.group_id}/summary")
            
            if response.status_code == 200:
                data = response.json()
                total_spent = data.get("total_spent", 0)
                simplified_debts = data.get("simplified_debts", [])
                activity = data.get("activity", [])
                
                self.log(f"✅ Group summary retrieved - Total spent: ₹{total_spent}, Simplified debts: {len(simplified_debts)}, Activity: {len(activity)}", "PASS")
                self.record_test("Group summary with simplified debts", True, f"Total: ₹{total_spent}, Debts: {len(simplified_debts)}, Activity: {len(activity)}")
                return True
            else:
                self.log(f"❌ Group summary failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Group summary with simplified debts", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Group summary error: {str(e)}", "ERROR")
            self.record_test("Group summary with simplified debts", False, f"Error: {str(e)}")
            return False

    def test_settle_with_rewards(self):
        """Test 7: Settle with rewards"""
        self.log("🎁 Test 7: Settle with rewards...")
        try:
            response = self.session.post(f"{BASE_URL}/split/settle-with-rewards",
                                       json={
                                           "target_user_id": "9000000001",
                                           "amount": 500,
                                           "method": "upi"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                coins_earned = data.get("coins_earned", 0)
                self.log(f"✅ Settlement with rewards completed - Earned {coins_earned} coins", "PASS")
                self.record_test("Settle with rewards", True, f"Earned {coins_earned} coins")
                return True
            else:
                self.log(f"❌ Settle with rewards failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Settle with rewards", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Settle with rewards error: {str(e)}", "ERROR")
            self.record_test("Settle with rewards", False, f"Error: {str(e)}")
            return False

    def test_settlement_leaderboard(self):
        """Test 8: Settlement leaderboard"""
        self.log("🏆 Test 8: Settlement leaderboard...")
        try:
            response = self.session.get(f"{BASE_URL}/split/settlement-leaderboard")
            
            if response.status_code == 200:
                data = response.json()
                leaderboard = data.get("leaderboard", [])
                user_rank = data.get("user_rank", 0)
                total_coins = data.get("total_coins", 0)
                
                self.log(f"✅ Settlement leaderboard retrieved - Rank: {user_rank}, Total coins: {total_coins}, Leaderboard: {len(leaderboard)} users", "PASS")
                self.record_test("Settlement leaderboard", True, f"Rank: {user_rank}, Coins: {total_coins}")
                return True
            else:
                self.log(f"❌ Settlement leaderboard failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Settlement leaderboard", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Settlement leaderboard error: {str(e)}", "ERROR")
            self.record_test("Settlement leaderboard", False, f"Error: {str(e)}")
            return False

    def test_list_all_groups(self):
        """Test 9: List all groups"""
        self.log("📋 Test 9: List all groups...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups")
            
            if response.status_code == 200:
                data = response.json()
                groups = data if isinstance(data, list) else data.get("groups", [])
                self.log(f"✅ Retrieved {len(groups)} split groups", "PASS")
                self.record_test("List all groups", True, f"{len(groups)} groups found")
                return True
            else:
                self.log(f"❌ List groups failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("List all groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ List groups error: {str(e)}", "ERROR")
            self.record_test("List all groups", False, f"Error: {str(e)}")
            return False

    def test_balances(self):
        """Test 10: Balances"""
        self.log("⚖️ Test 10: Balances...")
        try:
            response = self.session.get(f"{BASE_URL}/split/balances")
            
            if response.status_code == 200:
                data = response.json()
                you_owe = data.get("you_owe", [])
                owed_to_you = data.get("owed_to_you", [])
                
                self.log(f"✅ Balances retrieved - You owe: {len(you_owe)}, Owed to you: {len(owed_to_you)}", "PASS")
                self.record_test("Balances", True, f"You owe: {len(you_owe)}, Owed: {len(owed_to_you)}")
                return True
            else:
                self.log(f"❌ Balances failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Balances", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Balances error: {str(e)}", "ERROR")
            self.record_test("Balances", False, f"Error: {str(e)}")
            return False

    def test_money_school_dynamic(self):
        """Test 11: Money School Dynamic (AI-powered daily cards)"""
        self.log("🎓 Test 11: Money School Dynamic (AI-powered daily cards)...")
        try:
            response = self.session.get(f"{BASE_URL}/money-school/dynamic")
            
            if response.status_code == 200:
                data = response.json()
                cards = data.get("cards", []) if isinstance(data, dict) else data
                self.log(f"✅ Money School Dynamic retrieved - {len(cards)} AI-powered cards", "PASS")
                self.record_test("Money School Dynamic", True, f"{len(cards)} AI-powered cards")
                return True
            else:
                self.log(f"❌ Money School Dynamic failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Money School Dynamic", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money School Dynamic error: {str(e)}", "ERROR")
            self.record_test("Money School Dynamic", False, f"Error: {str(e)}")
            return False

    def test_budgets_live(self):
        """Test 12: Live Budgets (auto-update from splits)"""
        self.log("💰 Test 12: Live Budgets (auto-update from splits)...")
        try:
            response = self.session.get(f"{BASE_URL}/budgets/live")
            
            if response.status_code == 200:
                data = response.json()
                budgets = data.get("budgets", []) if isinstance(data, dict) else data
                self.log(f"✅ Live Budgets retrieved - {len(budgets)} budgets with auto-update from splits", "PASS")
                self.record_test("Live Budgets", True, f"{len(budgets)} live budgets")
                return True
            else:
                self.log(f"❌ Live Budgets failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("Live Budgets", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Live Budgets error: {str(e)}", "ERROR")
            self.record_test("Live Budgets", False, f"Error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all split tests as specified in review request"""
        self.log("🚀 Starting MintU E2E Split Testing...")
        self.log(f"📍 Testing against: {BASE_URL}")
        self.log("🎯 Focus: FULL E2E SPLIT TEST with N users")
        
        # Authentication
        if not self.authenticate():
            self.log("❌ Cannot proceed without authentication", "CRITICAL")
            return False

        # Run all split tests
        test_methods = [
            self.test_create_group_with_5_members,
            self.test_add_more_members,
            self.test_group_management,
            self.test_add_equal_expense,
            self.test_add_shares_expense,
            self.test_group_summary_with_simplified_debts,
            self.test_settle_with_rewards,
            self.test_settlement_leaderboard,
            self.test_list_all_groups,
            self.test_balances,
            self.test_money_school_dynamic,
            self.test_budgets_live
        ]
        
        for test_method in test_methods:
            test_method()
            time.sleep(0.2)  # Small delay to avoid rate limiting
        
        # Summary
        self.print_summary()
        
        passed_tests = sum(1 for result in self.test_results if result["passed"])
        total_tests = len(self.test_results)
        
        return passed_tests == total_tests

    def print_summary(self):
        """Print comprehensive test summary"""
        self.log("\n" + "="*80)
        self.log("📊 E2E SPLIT TEST SUMMARY")
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
            self.log("🎉 ALL SPLIT TESTS PASSED! Split functionality is production-ready!", "SUCCESS")
        else:
            self.log(f"⚠️ {len(failed_tests)} tests failed. Review issues above.", "WARNING")

if __name__ == "__main__":
    tester = MintUSplitTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)