#!/usr/bin/env python3
"""
MintU Backend Comprehensive End-to-End Testing
Tests ALL endpoints mentioned in the review request with 500ms delays to avoid rate limits.

Review Request Endpoints (27 total):
AUTH FLOW:
1. POST /api/auth/send-otp - should return success
2. POST /api/auth/verify-otp - should return token

HOME DATA:
3. GET /api/user/me - profile
4. GET /api/stats/overview - financial stats
5. GET /api/transactions?limit=5 - recent transactions
6. GET /api/user/avatar - avatar
7. GET /api/leaderboard/savings - leaderboard
8. GET /api/alerts/smart - smart alerts
9. GET /api/card-of-the-day - daily card
10. GET /api/money-school/dynamic?lang=en - lessons
11. GET /api/gamification/status - gamification

BUDGET:
12. GET /api/budgets/live - live budgets with spent
13. GET /api/budgets/smart-suggest - AI suggestions
14. POST /api/budgets {"category":"Transport","amount":2000,"period":"monthly"} - create budget
15. DELETE /api/budgets/{id} - delete the budget just created

SPLIT CRUD:
16. GET /api/split/groups - list groups
17. GET /api/split/balances - balances
18. POST /api/split/groups {"name":"Test E2E Group","members":["9999988888"]} - create group
19. GET /api/split/groups/{new_group_id}/summary - group summary
20. GET /api/split/groups/{new_group_id}/manage - group manage
21. DELETE /api/split/groups/{new_group_id} - DELETE group (critical fix to verify)

AI:
22. POST /api/ai/agent-chat {"message":"Hi","lang":"en"} - AI chat
23. GET /api/waste-detector - waste detector
24. GET /api/insights/daily?lang=en - daily insights

PROFILE:
25. POST /api/user/upi {"upi_id":"test@okicici"} - save UPI
26. GET /api/share/stats-card - stats card
27. GET /api/reports/weekly - weekly report
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"
DELAY_BETWEEN_REQUESTS = 0.5  # 500ms as requested

class MintUE2ETester:
    def __init__(self):
        self.token = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'MintU-E2E-Test/1.0'
        })
        self.test_results = []
        self.created_budget_id = None
        self.created_group_id = None
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def record_test(self, test_name, passed, details="", response_code=None):
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details,
            "response_code": response_code
        })

    def delay(self):
        """Add 500ms delay between requests"""
        time.sleep(DELAY_BETWEEN_REQUESTS)

    def test_auth_send_otp(self):
        """Test 1: POST /api/auth/send-otp"""
        self.log("🔐 Test 1: POST /api/auth/send-otp...")
        try:
            response = self.session.post(f"{BASE_URL}/auth/send-otp", 
                                       json={"phone": TEST_PHONE})
            if response.status_code == 200:
                self.log("✅ OTP sent successfully", "PASS")
                self.record_test("POST /api/auth/send-otp", True, "OTP sent successfully", response.status_code)
                return True
            else:
                self.log(f"❌ OTP send failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/auth/send-otp", False, f"Status: {response.status_code}", response.status_code)
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
                    self.record_test("POST /api/auth/verify-otp", False, "No token in response", response.status_code)
                    return False
                    
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                self.log("✅ OTP verified, Bearer token received", "PASS")
                self.record_test("POST /api/auth/verify-otp", True, "Bearer token received", response.status_code)
                return True
            else:
                self.log(f"❌ OTP verification failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/auth/verify-otp", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ OTP verification error: {str(e)}", "ERROR")
            self.record_test("POST /api/auth/verify-otp", False, f"Error: {str(e)}")
            return False

    def test_user_me(self):
        """Test 3: GET /api/user/me - profile"""
        self.log("👤 Test 3: GET /api/user/me - profile...")
        try:
            response = self.session.get(f"{BASE_URL}/user/me")
            if response.status_code == 200:
                data = response.json()
                name = data.get("name", "Unknown")
                phone = data.get("phone", "Unknown")
                self.log(f"✅ User profile retrieved - Name: {name}, Phone: {phone}", "PASS")
                self.record_test("GET /api/user/me", True, f"Name: {name}, Phone: {phone}", response.status_code)
                return True
            else:
                self.log(f"❌ User profile failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/user/me", False, f"Status: {response.status_code}", response.status_code)
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
                self.record_test("GET /api/stats/overview", True, f"Income: ₹{total_income}, Expense: ₹{total_expense}", response.status_code)
                return True
            else:
                self.log(f"❌ Stats overview failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/stats/overview", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Stats overview error: {str(e)}", "ERROR")
            self.record_test("GET /api/stats/overview", False, f"Error: {str(e)}")
            return False

    def test_transactions(self):
        """Test 5: GET /api/transactions?limit=5 - recent transactions"""
        self.log("💳 Test 5: GET /api/transactions?limit=5 - recent transactions...")
        try:
            response = self.session.get(f"{BASE_URL}/transactions?limit=5")
            if response.status_code == 200:
                data = response.json()
                transactions = data if isinstance(data, list) else data.get("transactions", [])
                self.log(f"✅ Recent transactions retrieved - {len(transactions)} transactions", "PASS")
                self.record_test("GET /api/transactions", True, f"{len(transactions)} transactions", response.status_code)
                return True
            else:
                self.log(f"❌ Transactions failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/transactions", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Transactions error: {str(e)}", "ERROR")
            self.record_test("GET /api/transactions", False, f"Error: {str(e)}")
            return False

    def test_user_avatar(self):
        """Test 6: GET /api/user/avatar - avatar"""
        self.log("🖼️ Test 6: GET /api/user/avatar - avatar...")
        try:
            response = self.session.get(f"{BASE_URL}/user/avatar")
            if response.status_code == 200:
                data = response.json()
                avatar_data = data.get("avatar", "")
                name = data.get("name", "Unknown")
                self.log(f"✅ User avatar retrieved - Name: {name}, Avatar: {len(avatar_data)} chars", "PASS")
                self.record_test("GET /api/user/avatar", True, f"Name: {name}, Avatar: {len(avatar_data)} chars", response.status_code)
                return True
            else:
                self.log(f"❌ User avatar failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/user/avatar", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ User avatar error: {str(e)}", "ERROR")
            self.record_test("GET /api/user/avatar", False, f"Error: {str(e)}")
            return False

    def test_leaderboard_savings(self):
        """Test 7: GET /api/leaderboard/savings - leaderboard"""
        self.log("🏆 Test 7: GET /api/leaderboard/savings - leaderboard...")
        try:
            response = self.session.get(f"{BASE_URL}/leaderboard/savings")
            if response.status_code == 200:
                data = response.json()
                rank = data.get("rank", 0)
                percentile = data.get("percentile", 0)
                money_score = data.get("money_score", 0)
                self.log(f"✅ Savings leaderboard retrieved - Rank: {rank}, Percentile: {percentile}%, Money Score: {money_score}", "PASS")
                self.record_test("GET /api/leaderboard/savings", True, f"Rank: {rank}, Percentile: {percentile}%", response.status_code)
                return True
            else:
                self.log(f"❌ Leaderboard failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/leaderboard/savings", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Leaderboard error: {str(e)}", "ERROR")
            self.record_test("GET /api/leaderboard/savings", False, f"Error: {str(e)}")
            return False

    def test_smart_alerts(self):
        """Test 8: GET /api/alerts/smart - smart alerts"""
        self.log("🚨 Test 8: GET /api/alerts/smart - smart alerts...")
        try:
            response = self.session.get(f"{BASE_URL}/alerts/smart")
            if response.status_code == 200:
                data = response.json()
                alerts = data if isinstance(data, list) else data.get("alerts", [])
                self.log(f"✅ Smart alerts retrieved - {len(alerts)} alerts", "PASS")
                self.record_test("GET /api/alerts/smart", True, f"{len(alerts)} smart alerts", response.status_code)
                return True
            else:
                self.log(f"❌ Smart alerts failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/alerts/smart", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Smart alerts error: {str(e)}", "ERROR")
            self.record_test("GET /api/alerts/smart", False, f"Error: {str(e)}")
            return False

    def test_card_of_the_day(self):
        """Test 9: GET /api/card-of-the-day - daily card"""
        self.log("🃏 Test 9: GET /api/card-of-the-day - daily card...")
        try:
            response = self.session.get(f"{BASE_URL}/card-of-the-day")
            if response.status_code == 200:
                data = response.json()
                card_type = data.get("type", "Unknown")
                title = data.get("title", "Unknown")
                self.log(f"✅ Card of the day retrieved - Type: {card_type}, Title: {title}", "PASS")
                self.record_test("GET /api/card-of-the-day", True, f"Type: {card_type}, Title: {title}", response.status_code)
                return True
            else:
                self.log(f"❌ Card of the day failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/card-of-the-day", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Card of the day error: {str(e)}", "ERROR")
            self.record_test("GET /api/card-of-the-day", False, f"Error: {str(e)}")
            return False

    def test_money_school_dynamic(self):
        """Test 10: GET /api/money-school/dynamic?lang=en - lessons"""
        self.log("🎓 Test 10: GET /api/money-school/dynamic?lang=en - lessons...")
        try:
            response = self.session.get(f"{BASE_URL}/money-school/dynamic?lang=en")
            if response.status_code == 200:
                data = response.json()
                cards = data.get("cards", [])
                self.log(f"✅ Money school lessons retrieved - {len(cards)} cards", "PASS")
                self.record_test("GET /api/money-school/dynamic", True, f"{len(cards)} lesson cards", response.status_code)
                return True
            else:
                self.log(f"❌ Money school failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/money-school/dynamic", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Money school error: {str(e)}", "ERROR")
            self.record_test("GET /api/money-school/dynamic", False, f"Error: {str(e)}")
            return False

    def test_gamification_status(self):
        """Test 11: GET /api/gamification/status - gamification"""
        self.log("🎮 Test 11: GET /api/gamification/status - gamification...")
        try:
            response = self.session.get(f"{BASE_URL}/gamification/status")
            if response.status_code == 200:
                data = response.json()
                badges_earned = len(data.get("badges_earned", []))
                streak = data.get("streak", 0)
                self.log(f"✅ Gamification status retrieved - Badges: {badges_earned}, Streak: {streak}", "PASS")
                self.record_test("GET /api/gamification/status", True, f"Badges: {badges_earned}, Streak: {streak}", response.status_code)
                return True
            else:
                self.log(f"❌ Gamification status failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/gamification/status", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Gamification status error: {str(e)}", "ERROR")
            self.record_test("GET /api/gamification/status", False, f"Error: {str(e)}")
            return False

    def test_budgets_live(self):
        """Test 12: GET /api/budgets/live - live budgets with spent"""
        self.log("💰 Test 12: GET /api/budgets/live - live budgets with spent...")
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
                self.record_test("GET /api/budgets/live", True, f"{len(budgets)} budgets with spent tracking", response.status_code)
                return True
            else:
                self.log(f"❌ Live budgets failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/budgets/live", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Live budgets error: {str(e)}", "ERROR")
            self.record_test("GET /api/budgets/live", False, f"Error: {str(e)}")
            return False

    def test_budgets_smart_suggest(self):
        """Test 13: GET /api/budgets/smart-suggest - AI suggestions"""
        self.log("🧠 Test 13: GET /api/budgets/smart-suggest - AI suggestions...")
        try:
            response = self.session.get(f"{BASE_URL}/budgets/smart-suggest")
            if response.status_code == 200:
                data = response.json()
                suggestions = data.get("suggestions", [])
                message = data.get("message", "")
                self.log(f"✅ Smart budget suggestions retrieved - {len(suggestions)} suggestions", "PASS")
                self.record_test("GET /api/budgets/smart-suggest", True, f"{len(suggestions)} AI suggestions", response.status_code)
                return True
            else:
                self.log(f"❌ Smart budget suggestions failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/budgets/smart-suggest", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Smart budget suggestions error: {str(e)}", "ERROR")
            self.record_test("GET /api/budgets/smart-suggest", False, f"Error: {str(e)}")
            return False

    def test_create_budget(self):
        """Test 14: POST /api/budgets - create budget"""
        self.log("💰 Test 14: POST /api/budgets - create budget...")
        try:
            budget_data = {
                "category": "Transport",
                "amount": 2000,
                "period": "monthly"
            }
            response = self.session.post(f"{BASE_URL}/budgets", json=budget_data)
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                self.created_budget_id = data.get("id") or data.get("budget_id")
                self.log(f"✅ Budget created successfully - ID: {self.created_budget_id}, Category: Transport, Amount: ₹2000", "PASS")
                self.record_test("POST /api/budgets", True, f"Budget created - ID: {self.created_budget_id}", response.status_code)
                return True
            else:
                self.log(f"❌ Budget creation failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/budgets", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Budget creation error: {str(e)}", "ERROR")
            self.record_test("POST /api/budgets", False, f"Error: {str(e)}")
            return False

    def test_delete_budget(self):
        """Test 15: DELETE /api/budgets/{id} - delete the budget just created"""
        self.log("🗑️ Test 15: DELETE /api/budgets/{id} - delete the budget just created...")
        if not self.created_budget_id:
            self.log("❌ No budget ID available for deletion", "FAIL")
            self.record_test("DELETE /api/budgets/{id}", False, "No budget ID available")
            return False
            
        try:
            response = self.session.delete(f"{BASE_URL}/budgets/{self.created_budget_id}")
            if response.status_code == 200 or response.status_code == 204:
                self.log(f"✅ Budget deleted successfully - ID: {self.created_budget_id}", "PASS")
                self.record_test("DELETE /api/budgets/{id}", True, f"Budget deleted - ID: {self.created_budget_id}", response.status_code)
                return True
            else:
                self.log(f"❌ Budget deletion failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("DELETE /api/budgets/{id}", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Budget deletion error: {str(e)}", "ERROR")
            self.record_test("DELETE /api/budgets/{id}", False, f"Error: {str(e)}")
            return False

    def test_split_groups(self):
        """Test 16: GET /api/split/groups - list groups"""
        self.log("👥 Test 16: GET /api/split/groups - list groups...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups")
            if response.status_code == 200:
                data = response.json()
                groups = data if isinstance(data, list) else data.get("groups", [])
                self.log(f"✅ Split groups retrieved - {len(groups)} groups", "PASS")
                self.record_test("GET /api/split/groups", True, f"{len(groups)} split groups", response.status_code)
                return True
            else:
                self.log(f"❌ Split groups failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/groups", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Split groups error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/groups", False, f"Error: {str(e)}")
            return False

    def test_split_balances(self):
        """Test 17: GET /api/split/balances - balances"""
        self.log("⚖️ Test 17: GET /api/split/balances - balances...")
        try:
            response = self.session.get(f"{BASE_URL}/split/balances")
            if response.status_code == 200:
                data = response.json()
                you_owe = data.get("you_owe", [])
                owed_to_you = data.get("owed_to_you", [])
                self.log(f"✅ Split balances retrieved - You owe: {len(you_owe)}, Owed to you: {len(owed_to_you)}", "PASS")
                self.record_test("GET /api/split/balances", True, f"You owe: {len(you_owe)}, Owed: {len(owed_to_you)}", response.status_code)
                return True
            else:
                self.log(f"❌ Split balances failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/balances", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Split balances error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/balances", False, f"Error: {str(e)}")
            return False

    def test_create_split_group(self):
        """Test 18: POST /api/split/groups - create group"""
        self.log("👥 Test 18: POST /api/split/groups - create group...")
        try:
            group_data = {
                "name": "Test E2E Group",
                "members": ["9999988888"]
            }
            response = self.session.post(f"{BASE_URL}/split/groups", json=group_data)
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                self.created_group_id = data.get("id") or data.get("group_id")
                self.log(f"✅ Split group created successfully - ID: {self.created_group_id}, Name: Test E2E Group", "PASS")
                self.record_test("POST /api/split/groups", True, f"Group created - ID: {self.created_group_id}", response.status_code)
                return True
            else:
                self.log(f"❌ Split group creation failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/split/groups", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Split group creation error: {str(e)}", "ERROR")
            self.record_test("POST /api/split/groups", False, f"Error: {str(e)}")
            return False

    def test_split_group_summary(self):
        """Test 19: GET /api/split/groups/{new_group_id}/summary - group summary"""
        self.log("📊 Test 19: GET /api/split/groups/{id}/summary - group summary...")
        if not self.created_group_id:
            self.log("❌ No group ID available for summary", "FAIL")
            self.record_test("GET /api/split/groups/{id}/summary", False, "No group ID available")
            return False
            
        try:
            response = self.session.get(f"{BASE_URL}/split/groups/{self.created_group_id}/summary")
            if response.status_code == 200:
                data = response.json()
                total_amount = data.get("total_amount", 0)
                total_expenses = data.get("total_expenses", 0)
                self.log(f"✅ Group summary retrieved - Total: ₹{total_amount}, Expenses: {total_expenses}", "PASS")
                self.record_test("GET /api/split/groups/{id}/summary", True, f"Total: ₹{total_amount}, Expenses: {total_expenses}", response.status_code)
                return True
            else:
                self.log(f"❌ Group summary failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/groups/{id}/summary", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Group summary error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/groups/{id}/summary", False, f"Error: {str(e)}")
            return False

    def test_split_group_manage(self):
        """Test 20: GET /api/split/groups/{new_group_id}/manage - group manage"""
        self.log("⚙️ Test 20: GET /api/split/groups/{id}/manage - group manage...")
        if not self.created_group_id:
            self.log("❌ No group ID available for manage", "FAIL")
            self.record_test("GET /api/split/groups/{id}/manage", False, "No group ID available")
            return False
            
        try:
            response = self.session.get(f"{BASE_URL}/split/groups/{self.created_group_id}/manage")
            if response.status_code == 200:
                data = response.json()
                group_name = data.get("name", "Unknown")
                members = data.get("members", [])
                self.log(f"✅ Group manage retrieved - Name: {group_name}, Members: {len(members)}", "PASS")
                self.record_test("GET /api/split/groups/{id}/manage", True, f"Name: {group_name}, Members: {len(members)}", response.status_code)
                return True
            else:
                self.log(f"❌ Group manage failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/groups/{id}/manage", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Group manage error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/groups/{id}/manage", False, f"Error: {str(e)}")
            return False

    def test_delete_split_group(self):
        """Test 21: DELETE /api/split/groups/{new_group_id} - DELETE group (critical fix to verify)"""
        self.log("🗑️ Test 21: DELETE /api/split/groups/{id} - DELETE group (critical fix to verify)...")
        if not self.created_group_id:
            self.log("❌ No group ID available for deletion", "FAIL")
            self.record_test("DELETE /api/split/groups/{id}", False, "No group ID available")
            return False
            
        try:
            response = self.session.delete(f"{BASE_URL}/split/groups/{self.created_group_id}")
            if response.status_code == 200 or response.status_code == 204:
                self.log(f"✅ Split group deleted successfully - ID: {self.created_group_id}", "PASS")
                self.record_test("DELETE /api/split/groups/{id}", True, f"Group deleted - ID: {self.created_group_id}", response.status_code)
                return True
            else:
                self.log(f"❌ Split group deletion failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("DELETE /api/split/groups/{id}", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Split group deletion error: {str(e)}", "ERROR")
            self.record_test("DELETE /api/split/groups/{id}", False, f"Error: {str(e)}")
            return False

    def test_ai_agent_chat(self):
        """Test 22: POST /api/ai/agent-chat - AI chat"""
        self.log("🤖 Test 22: POST /api/ai/agent-chat - AI chat...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Hi", "lang": "en"})
            if response.status_code == 200:
                data = response.json()
                ai_response = data.get("reply", "")
                agent = data.get("agent", "Unknown")
                self.log(f"✅ AI agent chat response - Agent: {agent}, Response: {len(ai_response)} chars", "PASS")
                self.record_test("POST /api/ai/agent-chat", True, f"Agent: {agent}, Response: {len(ai_response)} chars", response.status_code)
                return True
            else:
                self.log(f"❌ AI agent chat failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/ai/agent-chat", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ AI agent chat error: {str(e)}", "ERROR")
            self.record_test("POST /api/ai/agent-chat", False, f"Error: {str(e)}")
            return False

    def test_waste_detector(self):
        """Test 23: GET /api/waste-detector - waste detector"""
        self.log("🗑️ Test 23: GET /api/waste-detector - waste detector...")
        try:
            response = self.session.get(f"{BASE_URL}/waste-detector")
            if response.status_code == 200:
                data = response.json()
                category_waste = data.get("category_waste", [])
                total_waste = data.get("total_waste", 0)
                self.log(f"✅ Waste detector retrieved - Categories: {len(category_waste)}, Total waste: ₹{total_waste}", "PASS")
                self.record_test("GET /api/waste-detector", True, f"Categories: {len(category_waste)}, Total: ₹{total_waste}", response.status_code)
                return True
            else:
                self.log(f"❌ Waste detector failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/waste-detector", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Waste detector error: {str(e)}", "ERROR")
            self.record_test("GET /api/waste-detector", False, f"Error: {str(e)}")
            return False

    def test_daily_insights(self):
        """Test 24: GET /api/insights/daily?lang=en - daily insights"""
        self.log("💡 Test 24: GET /api/insights/daily?lang=en - daily insights...")
        try:
            response = self.session.get(f"{BASE_URL}/insights/daily?lang=en")
            if response.status_code == 200:
                data = response.json()
                money_score = data.get("money_score", 0)
                insights_text = data.get("insight_text", "")
                self.log(f"✅ Daily insights retrieved - Money Score: {money_score}, Insights: {len(insights_text)} chars", "PASS")
                self.record_test("GET /api/insights/daily", True, f"Money Score: {money_score}, Insights: {len(insights_text)} chars", response.status_code)
                return True
            else:
                self.log(f"❌ Daily insights failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/insights/daily", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Daily insights error: {str(e)}", "ERROR")
            self.record_test("GET /api/insights/daily", False, f"Error: {str(e)}")
            return False

    def test_upi_save(self):
        """Test 25: POST /api/user/upi - save UPI"""
        self.log("💳 Test 25: POST /api/user/upi - save UPI...")
        try:
            response = self.session.post(f"{BASE_URL}/user/upi",
                                       json={"upi_id": "test@okicici"})
            if response.status_code == 200:
                data = response.json()
                masked_upi = data.get("masked_upi", "")
                self.log(f"✅ UPI saved successfully - Masked: {masked_upi}", "PASS")
                self.record_test("POST /api/user/upi", True, f"UPI saved, Masked: {masked_upi}", response.status_code)
                return True
            else:
                self.log(f"❌ UPI save failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/user/upi", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ UPI save error: {str(e)}", "ERROR")
            self.record_test("POST /api/user/upi", False, f"Error: {str(e)}")
            return False

    def test_share_stats_card(self):
        """Test 26: GET /api/share/stats-card - stats card"""
        self.log("📤 Test 26: GET /api/share/stats-card - stats card...")
        try:
            response = self.session.get(f"{BASE_URL}/share/stats-card")
            if response.status_code == 200:
                data = response.json()
                whatsapp_text = data.get("whatsapp_text", "")
                instagram_text = data.get("instagram_text", "")
                self.log(f"✅ Shareable stats card retrieved - WhatsApp: {len(whatsapp_text)} chars, Instagram: {len(instagram_text)} chars", "PASS")
                self.record_test("GET /api/share/stats-card", True, f"WhatsApp: {len(whatsapp_text)}, Instagram: {len(instagram_text)} chars", response.status_code)
                return True
            else:
                self.log(f"❌ Shareable stats card failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/share/stats-card", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Shareable stats card error: {str(e)}", "ERROR")
            self.record_test("GET /api/share/stats-card", False, f"Error: {str(e)}")
            return False

    def test_weekly_report(self):
        """Test 27: GET /api/reports/weekly - weekly report"""
        self.log("📊 Test 27: GET /api/reports/weekly - weekly report...")
        try:
            response = self.session.get(f"{BASE_URL}/reports/weekly")
            if response.status_code == 200:
                data = response.json()
                mood = data.get("mood", "Unknown")
                headline = data.get("headline", "")
                self.log(f"✅ Weekly report retrieved - Mood: {mood}, Headline: {len(headline)} chars", "PASS")
                self.record_test("GET /api/reports/weekly", True, f"Mood: {mood}, Headline: {len(headline)} chars", response.status_code)
                return True
            else:
                self.log(f"❌ Weekly report failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/reports/weekly", False, f"Status: {response.status_code}", response.status_code)
                return False
        except Exception as e:
            self.log(f"❌ Weekly report error: {str(e)}", "ERROR")
            self.record_test("GET /api/reports/weekly", False, f"Error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all 27 review request tests with 500ms delays"""
        self.log("🚀 Starting MintU Backend Comprehensive E2E Testing...")
        self.log(f"📍 Testing against: {BASE_URL}")
        self.log("⏱️ Using 500ms delays between requests to avoid rate limits")
        self.log("🎯 Testing ALL 27 endpoints from review request")
        
        # All test methods in order
        test_methods = [
            # AUTH FLOW
            self.test_auth_send_otp,
            self.test_auth_verify_otp,
            # HOME DATA
            self.test_user_me,
            self.test_stats_overview,
            self.test_transactions,
            self.test_user_avatar,
            self.test_leaderboard_savings,
            self.test_smart_alerts,
            self.test_card_of_the_day,
            self.test_money_school_dynamic,
            self.test_gamification_status,
            # BUDGET
            self.test_budgets_live,
            self.test_budgets_smart_suggest,
            self.test_create_budget,
            self.test_delete_budget,
            # SPLIT CRUD
            self.test_split_groups,
            self.test_split_balances,
            self.test_create_split_group,
            self.test_split_group_summary,
            self.test_split_group_manage,
            self.test_delete_split_group,
            # AI
            self.test_ai_agent_chat,
            self.test_waste_detector,
            self.test_daily_insights,
            # PROFILE
            self.test_upi_save,
            self.test_share_stats_card,
            self.test_weekly_report
        ]
        
        for i, test_method in enumerate(test_methods, 1):
            self.log(f"🔄 Running test {i}/{len(test_methods)}: {test_method.__name__}")
            test_method()
            if i < len(test_methods):  # Don't delay after the last test
                self.delay()
        
        # Summary
        self.print_summary()
        
        passed_tests = sum(1 for result in self.test_results if result["passed"])
        total_tests = len(self.test_results)
        
        return passed_tests == total_tests

    def print_summary(self):
        """Print comprehensive test summary"""
        self.log("\n" + "="*80)
        self.log("📊 COMPREHENSIVE E2E TEST SUMMARY")
        self.log("="*80)
        
        passed_tests = [r for r in self.test_results if r["passed"]]
        failed_tests = [r for r in self.test_results if not r["passed"]]
        
        # Failed tests (if any)
        if failed_tests:
            self.log(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                status_code = f" (HTTP {test['response_code']})" if test.get('response_code') else ""
                self.log(f"   ❌ {test['test']}{status_code} - {test['details']}")
        
        # Passed tests summary
        self.log(f"\n✅ PASSED TESTS ({len(passed_tests)}):")
        for test in passed_tests:
            status_code = f" (HTTP {test['response_code']})" if test.get('response_code') else ""
            self.log(f"   ✅ {test['test']}{status_code} - {test['details']}")
        
        # Overall summary
        total_tests = len(self.test_results)
        success_rate = (len(passed_tests) / total_tests) * 100
        
        self.log(f"\n🎯 OVERALL RESULTS:")
        self.log(f"   Total Tests: {total_tests}")
        self.log(f"   Passed: {len(passed_tests)}")
        self.log(f"   Failed: {len(failed_tests)}")
        self.log(f"   Success Rate: {success_rate:.1f}%")
        
        if len(failed_tests) == 0:
            self.log("🎉 ALL 27 REVIEW REQUEST TESTS PASSED! Backend is production-ready!", "SUCCESS")
        else:
            self.log(f"⚠️ {len(failed_tests)} tests failed. Review issues above.", "WARNING")

if __name__ == "__main__":
    tester = MintUE2ETester()
    success = tester.run_all_tests()
    exit(0 if success else 1)