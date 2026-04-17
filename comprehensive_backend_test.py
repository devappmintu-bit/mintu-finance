#!/usr/bin/env python3
"""
MintU Backend API Comprehensive Testing - Final Production Test
Tests ALL 30 endpoints as specified in the review request
Focus on verifying the 3 previously failing endpoints are now fixed:
- POST /api/split/settle (was 500, should be 200 now)
- GET /api/split/settlements (was 500, should be 200 now)  
- GET /api/ai/proactive-nudges (was 500, should be 200 now)
"""

import requests
import json
import base64
from datetime import datetime
import time

# Configuration
BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"

class MintUComprehensiveTester:
    def __init__(self):
        self.token = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'MintU-ComprehensiveTest/1.0'
        })
        self.test_results = []
        self.group_id = None
        self.test_user_id = None
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def record_test(self, test_name, passed, details=""):
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })
        
    def send_otp(self):
        """1. POST /api/auth/send-otp"""
        self.log("🔐 Testing OTP Send...")
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
            
    def verify_otp(self):
        """2. POST /api/auth/verify-otp"""
        self.log("🔑 Testing OTP Verification...")
        try:
            response = self.session.post(f"{BASE_URL}/auth/verify-otp",
                                       json={"phone": TEST_PHONE, "otp": TEST_OTP})
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("token")
                if self.token:
                    self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                    self.log("✅ OTP verified, token received", "PASS")
                    self.record_test("POST /api/auth/verify-otp", True, "Token received")
                    return True
                else:
                    self.log("❌ No token in response", "FAIL")
                    self.record_test("POST /api/auth/verify-otp", False, "No token in response")
                    return False
            else:
                self.log(f"❌ OTP verification failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/auth/verify-otp", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ OTP verification error: {str(e)}", "ERROR")
            self.record_test("POST /api/auth/verify-otp", False, f"Error: {str(e)}")
            return False

    def test_user_me(self):
        """4. GET /api/user/me"""
        self.log("👤 Testing User Profile...")
        try:
            response = self.session.get(f"{BASE_URL}/user/me")
            
            if response.status_code == 200:
                data = response.json()
                if "phone" in data:
                    self.test_user_id = data.get("id", data.get("_id", "test_user"))
                    self.log(f"✅ User profile retrieved - Phone: {data['phone']}", "PASS")
                    self.record_test("GET /api/user/me", True, f"Phone: {data['phone']}")
                    return True
                else:
                    self.log(f"❌ Invalid user data: {data}", "FAIL")
                    self.record_test("GET /api/user/me", False, "Invalid user data")
                    return False
            else:
                self.log(f"❌ User profile failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/user/me", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ User profile error: {str(e)}", "ERROR")
            self.record_test("GET /api/user/me", False, f"Error: {str(e)}")
            return False

    def test_upi_save(self):
        """5. POST /api/user/upi"""
        self.log("💳 Testing UPI Save...")
        try:
            response = self.session.post(f"{BASE_URL}/user/upi",
                                       json={"upi_id": "test@okicici"})
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ UPI ID saved successfully", "PASS")
                self.record_test("POST /api/user/upi", True, "UPI ID saved")
                return True
            else:
                self.log(f"❌ UPI save failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/user/upi", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ UPI save error: {str(e)}", "ERROR")
            self.record_test("POST /api/user/upi", False, f"Error: {str(e)}")
            return False

    def test_upi_get(self):
        """6. GET /api/user/upi"""
        self.log("💳 Testing UPI Retrieve...")
        try:
            response = self.session.get(f"{BASE_URL}/user/upi")
            
            if response.status_code == 200:
                data = response.json()
                if "upi_id" in data:
                    self.log(f"✅ UPI ID retrieved: {data.get('upi_id_masked', data['upi_id'])}", "PASS")
                    self.record_test("GET /api/user/upi", True, f"UPI: {data.get('upi_id_masked', data['upi_id'])}")
                    return True
                else:
                    self.log(f"❌ No UPI ID in response: {data}", "FAIL")
                    self.record_test("GET /api/user/upi", False, "No UPI ID in response")
                    return False
            else:
                self.log(f"❌ UPI retrieve failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/user/upi", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ UPI retrieve error: {str(e)}", "ERROR")
            self.record_test("GET /api/user/upi", False, f"Error: {str(e)}")
            return False

    def test_create_split_group(self):
        """7. POST /api/split/groups"""
        self.log("👥 Testing Create Split Group...")
        try:
            response = self.session.post(f"{BASE_URL}/split/groups",
                                       json={"name": "Final Test", "members": ["9999888877"]})
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data or "_id" in data:
                    self.group_id = data.get("id", data.get("_id"))
                    self.log(f"✅ Split group created: {data.get('name', 'Final Test')}", "PASS")
                    self.record_test("POST /api/split/groups", True, f"Group ID: {self.group_id}")
                    return True
                else:
                    self.log(f"❌ No group ID in response: {data}", "FAIL")
                    self.record_test("POST /api/split/groups", False, "No group ID in response")
                    return False
            else:
                self.log(f"❌ Create split group failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/split/groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Create split group error: {str(e)}", "ERROR")
            self.record_test("POST /api/split/groups", False, f"Error: {str(e)}")
            return False

    def test_get_split_groups(self):
        """8. GET /api/split/groups"""
        self.log("👥 Testing Get Split Groups...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    self.log(f"✅ Retrieved {len(data)} split groups", "PASS")
                    self.record_test("GET /api/split/groups", True, f"{len(data)} groups found")
                    return True
                else:
                    self.log("✅ No split groups found (empty list)", "PASS")
                    self.record_test("GET /api/split/groups", True, "Empty list returned")
                    return True
            else:
                self.log(f"❌ Get split groups failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Get split groups error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/groups", False, f"Error: {str(e)}")
            return False

    def test_add_split_expense(self):
        """9. POST /api/split/expenses"""
        self.log("💰 Testing Add Split Expense...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping expense test", "SKIP")
                self.record_test("POST /api/split/expenses", False, "No group ID available")
                return False
                
            response = self.session.post(f"{BASE_URL}/split/expenses",
                                       json={
                                           "group_id": self.group_id,
                                           "description": "Test Expense",
                                           "amount": 1000,
                                           "paid_by": self.test_user_id or "test_user",
                                           "split_type": "equal"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Split expense added successfully", "PASS")
                self.record_test("POST /api/split/expenses", True, "Expense added")
                return True
            else:
                self.log(f"❌ Add split expense failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/split/expenses", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Add split expense error: {str(e)}", "ERROR")
            self.record_test("POST /api/split/expenses", False, f"Error: {str(e)}")
            return False

    def test_group_summary(self):
        """10. GET /api/split/groups/{id}/summary"""
        self.log("📊 Testing Group Summary...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping summary test", "SKIP")
                self.record_test("GET /api/split/groups/{id}/summary", False, "No group ID available")
                return False
                
            response = self.session.get(f"{BASE_URL}/split/groups/{self.group_id}/summary")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Group summary retrieved", "PASS")
                self.record_test("GET /api/split/groups/{id}/summary", True, "Summary retrieved")
                return True
            else:
                self.log(f"❌ Group summary failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/groups/{id}/summary", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Group summary error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/groups/{id}/summary", False, f"Error: {str(e)}")
            return False

    def test_split_balances(self):
        """11. GET /api/split/balances"""
        self.log("⚖️ Testing Split Balances...")
        try:
            response = self.session.get(f"{BASE_URL}/split/balances")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Split balances retrieved", "PASS")
                self.record_test("GET /api/split/balances", True, "Balances retrieved")
                return True
            else:
                self.log(f"❌ Split balances failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/balances", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split balances error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/balances", False, f"Error: {str(e)}")
            return False

    def test_recurring_expenses(self):
        """12. POST /api/split/expenses/recurring"""
        self.log("🔄 Testing Recurring Expenses...")
        try:
            response = self.session.post(f"{BASE_URL}/split/expenses/recurring",
                                       json={
                                           "description": "Monthly Rent",
                                           "amount": 5000,
                                           "frequency": "monthly",
                                           "group_id": self.group_id or "test_group"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Recurring expense created", "PASS")
                self.record_test("POST /api/split/expenses/recurring", True, "Recurring expense created")
                return True
            else:
                self.log(f"❌ Recurring expenses failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/split/expenses/recurring", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Recurring expenses error: {str(e)}", "ERROR")
            self.record_test("POST /api/split/expenses/recurring", False, f"Error: {str(e)}")
            return False

    def test_money_school_cards(self):
        """13. GET /api/money-school/cards"""
        self.log("🎓 Testing Money School Cards...")
        try:
            response = self.session.get(f"{BASE_URL}/money-school/cards")
            
            if response.status_code == 200:
                data = response.json()
                # Handle both direct array and wrapped response
                cards = data if isinstance(data, list) else data.get("cards", [])
                if isinstance(cards, list):
                    self.log(f"✅ Retrieved {len(cards)} money school cards", "PASS")
                    self.record_test("GET /api/money-school/cards", True, f"{len(cards)} cards found")
                    return True
                else:
                    self.log(f"❌ Invalid response format: {data}", "FAIL")
                    self.record_test("GET /api/money-school/cards", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ Money school cards failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/money-school/cards", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money school cards error: {str(e)}", "ERROR")
            self.record_test("GET /api/money-school/cards", False, f"Error: {str(e)}")
            return False

    def test_money_school_complete(self):
        """14. POST /api/money-school/complete"""
        self.log("✅ Testing Money School Complete...")
        try:
            response = self.session.post(f"{BASE_URL}/money-school/complete",
                                       json={"card_id": "card_0", "xp": 10})
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Money school card completed", "PASS")
                self.record_test("POST /api/money-school/complete", True, "Card completed")
                return True
            else:
                self.log(f"❌ Money school complete failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/money-school/complete", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money school complete error: {str(e)}", "ERROR")
            self.record_test("POST /api/money-school/complete", False, f"Error: {str(e)}")
            return False

    def test_upi_apps(self):
        """15. GET /api/upi/apps"""
        self.log("📱 Testing UPI Apps...")
        try:
            response = self.session.get(f"{BASE_URL}/upi/apps")
            
            if response.status_code == 200:
                data = response.json()
                # Handle both direct array and wrapped response
                apps = data if isinstance(data, list) else data.get("apps", [])
                if isinstance(apps, list):
                    self.log(f"✅ Retrieved {len(apps)} UPI apps", "PASS")
                    self.record_test("GET /api/upi/apps", True, f"{len(apps)} apps found")
                    return True
                else:
                    self.log(f"❌ Invalid response format: {data}", "FAIL")
                    self.record_test("GET /api/upi/apps", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ UPI apps failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/upi/apps", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ UPI apps error: {str(e)}", "ERROR")
            self.record_test("GET /api/upi/apps", False, f"Error: {str(e)}")
            return False

    def test_generate_qr(self):
        """16. POST /api/upi/generate-qr"""
        self.log("📱 Testing Generate QR...")
        try:
            response = self.session.post(f"{BASE_URL}/upi/generate-qr",
                                       json={"amount": 500})
            
            if response.status_code == 200:
                data = response.json()
                # Check for various QR code field names
                if "qr_code" in data or "upi_link" in data or "qr_data" in data:
                    self.log("✅ QR code generated", "PASS")
                    self.record_test("POST /api/upi/generate-qr", True, "QR code generated")
                    return True
                else:
                    self.log(f"❌ No QR code in response: {data}", "FAIL")
                    self.record_test("POST /api/upi/generate-qr", False, "No QR code in response")
                    return False
            else:
                self.log(f"❌ Generate QR failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/upi/generate-qr", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Generate QR error: {str(e)}", "ERROR")
            self.record_test("POST /api/upi/generate-qr", False, f"Error: {str(e)}")
            return False

    def test_ai_agent_chat(self):
        """17. POST /api/ai/agent-chat"""
        self.log("🤖 Testing AI Agent Chat...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Where did I overspend?"})
            
            if response.status_code == 200:
                data = response.json()
                if "response" in data or "reply" in data:
                    response_text = data.get("response", data.get("reply", ""))
                    self.log(f"✅ AI agent chat working - Response length: {len(response_text)} chars", "PASS")
                    self.record_test("POST /api/ai/agent-chat", True, f"Response: {len(response_text)} chars")
                    return True
                else:
                    self.log(f"❌ No response in AI chat: {data}", "FAIL")
                    self.record_test("POST /api/ai/agent-chat", False, "No response in AI chat")
                    return False
            else:
                self.log(f"❌ AI agent chat failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/ai/agent-chat", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI agent chat error: {str(e)}", "ERROR")
            self.record_test("POST /api/ai/agent-chat", False, f"Error: {str(e)}")
            return False

    def test_ai_agents(self):
        """18. GET /api/ai/agents"""
        self.log("🤖 Testing AI Agents List...")
        try:
            response = self.session.get(f"{BASE_URL}/ai/agents")
            
            if response.status_code == 200:
                data = response.json()
                # Handle both direct array and wrapped response
                agents = data if isinstance(data, list) else data.get("agents", [])
                if isinstance(agents, list):
                    self.log(f"✅ Retrieved {len(agents)} AI agents", "PASS")
                    self.record_test("GET /api/ai/agents", True, f"{len(agents)} agents found")
                    return True
                else:
                    self.log(f"❌ Invalid response format: {data}", "FAIL")
                    self.record_test("GET /api/ai/agents", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ AI agents failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/ai/agents", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI agents error: {str(e)}", "ERROR")
            self.record_test("GET /api/ai/agents", False, f"Error: {str(e)}")
            return False

    def test_transactions(self):
        """19. GET /api/transactions"""
        self.log("💳 Testing Transactions...")
        try:
            response = self.session.get(f"{BASE_URL}/transactions")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Retrieved {len(data)} transactions", "PASS")
                    self.record_test("GET /api/transactions", True, f"{len(data)} transactions found")
                    return True
                else:
                    self.log(f"❌ Invalid response format: {data}", "FAIL")
                    self.record_test("GET /api/transactions", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ Transactions failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/transactions", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Transactions error: {str(e)}", "ERROR")
            self.record_test("GET /api/transactions", False, f"Error: {str(e)}")
            return False

    def test_budgets(self):
        """20. GET /api/budgets"""
        self.log("💰 Testing Budgets...")
        try:
            response = self.session.get(f"{BASE_URL}/budgets")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Retrieved {len(data)} budgets", "PASS")
                    self.record_test("GET /api/budgets", True, f"{len(data)} budgets found")
                    return True
                else:
                    self.log(f"❌ Invalid response format: {data}", "FAIL")
                    self.record_test("GET /api/budgets", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ Budgets failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/budgets", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Budgets error: {str(e)}", "ERROR")
            self.record_test("GET /api/budgets", False, f"Error: {str(e)}")
            return False

    def test_stats_overview(self):
        """21. GET /api/stats/overview"""
        self.log("📊 Testing Stats Overview...")
        try:
            response = self.session.get(f"{BASE_URL}/stats/overview")
            
            if response.status_code == 200:
                data = response.json()
                if "total_income" in data or "total_expense" in data:
                    self.log("✅ Stats overview retrieved", "PASS")
                    self.record_test("GET /api/stats/overview", True, "Stats overview retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid stats format: {data}", "FAIL")
                    self.record_test("GET /api/stats/overview", False, "Invalid stats format")
                    return False
            else:
                self.log(f"❌ Stats overview failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/stats/overview", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Stats overview error: {str(e)}", "ERROR")
            self.record_test("GET /api/stats/overview", False, f"Error: {str(e)}")
            return False

    def test_leaderboard_savings(self):
        """22. GET /api/leaderboard/savings"""
        self.log("🏆 Testing Leaderboard Savings...")
        try:
            response = self.session.get(f"{BASE_URL}/leaderboard/savings")
            
            if response.status_code == 200:
                data = response.json()
                # Check for various leaderboard field names
                if "rank" in data or "leaderboard" in data or "user_rank" in data or "top_10" in data:
                    self.log("✅ Leaderboard savings retrieved", "PASS")
                    self.record_test("GET /api/leaderboard/savings", True, "Leaderboard retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid leaderboard format: {data}", "FAIL")
                    self.record_test("GET /api/leaderboard/savings", False, "Invalid leaderboard format")
                    return False
            else:
                self.log(f"❌ Leaderboard savings failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/leaderboard/savings", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Leaderboard savings error: {str(e)}", "ERROR")
            self.record_test("GET /api/leaderboard/savings", False, f"Error: {str(e)}")
            return False

    def test_waste_detector(self):
        """23. GET /api/waste-detector"""
        self.log("🗑️ Testing Waste Detector...")
        try:
            response = self.session.get(f"{BASE_URL}/waste-detector")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Waste detector working", "PASS")
                self.record_test("GET /api/waste-detector", True, "Waste detector working")
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
        """24. GET /api/alerts/smart"""
        self.log("🚨 Testing Smart Alerts...")
        try:
            response = self.session.get(f"{BASE_URL}/alerts/smart")
            
            if response.status_code == 200:
                data = response.json()
                # Handle both direct array and wrapped response
                alerts = data if isinstance(data, list) else data.get("alerts", [])
                if isinstance(alerts, list):
                    self.log(f"✅ Retrieved {len(alerts)} smart alerts", "PASS")
                    self.record_test("GET /api/alerts/smart", True, f"{len(alerts)} alerts found")
                    return True
                else:
                    self.log(f"❌ Invalid alerts format: {data}", "FAIL")
                    self.record_test("GET /api/alerts/smart", False, "Invalid alerts format")
                    return False
            else:
                self.log(f"❌ Smart alerts failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/alerts/smart", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Smart alerts error: {str(e)}", "ERROR")
            self.record_test("GET /api/alerts/smart", False, f"Error: {str(e)}")
            return False

    def test_share_stats_card(self):
        """25. GET /api/share/stats-card"""
        self.log("📤 Testing Share Stats Card...")
        try:
            response = self.session.get(f"{BASE_URL}/share/stats-card")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Share stats card working", "PASS")
                self.record_test("GET /api/share/stats-card", True, "Share stats card working")
                return True
            else:
                self.log(f"❌ Share stats card failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/share/stats-card", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Share stats card error: {str(e)}", "ERROR")
            self.record_test("GET /api/share/stats-card", False, f"Error: {str(e)}")
            return False

    def test_card_of_the_day(self):
        """26. GET /api/card-of-the-day"""
        self.log("🃏 Testing Card of the Day...")
        try:
            response = self.session.get(f"{BASE_URL}/card-of-the-day")
            
            if response.status_code == 200:
                data = response.json()
                if "title" in data and "text" in data:
                    self.log(f"✅ Card of the day - Title: {data.get('title', 'N/A')}", "PASS")
                    self.record_test("GET /api/card-of-the-day", True, f"Title: {data.get('title', 'N/A')}")
                    return True
                else:
                    self.log(f"❌ Invalid card format: {data}", "FAIL")
                    self.record_test("GET /api/card-of-the-day", False, "Invalid card format")
                    return False
            else:
                self.log(f"❌ Card of the day failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/card-of-the-day", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Card of the day error: {str(e)}", "ERROR")
            self.record_test("GET /api/card-of-the-day", False, f"Error: {str(e)}")
            return False

    def test_money_school_daily(self):
        """27. GET /api/money-school/daily"""
        self.log("🎓 Testing Money School Daily...")
        try:
            response = self.session.get(f"{BASE_URL}/money-school/daily")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Money school daily working", "PASS")
                self.record_test("GET /api/money-school/daily", True, "Money school daily working")
                return True
            else:
                self.log(f"❌ Money school daily failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/money-school/daily", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money school daily error: {str(e)}", "ERROR")
            self.record_test("GET /api/money-school/daily", False, f"Error: {str(e)}")
            return False

    def test_gamification_status(self):
        """28. GET /api/gamification/status"""
        self.log("🎮 Testing Gamification Status...")
        try:
            response = self.session.get(f"{BASE_URL}/gamification/status")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Gamification status working", "PASS")
                self.record_test("GET /api/gamification/status", True, "Gamification status working")
                return True
            else:
                self.log(f"❌ Gamification status failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/gamification/status", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Gamification status error: {str(e)}", "ERROR")
            self.record_test("GET /api/gamification/status", False, f"Error: {str(e)}")
            return False

    def test_referral_enhanced_status(self):
        """29. GET /api/referral/enhanced-status"""
        self.log("🎁 Testing Referral Enhanced Status...")
        try:
            response = self.session.get(f"{BASE_URL}/referral/enhanced-status")
            
            if response.status_code == 200:
                data = response.json()
                if "referral_code" in data:
                    self.log(f"✅ Referral enhanced status - Code: {data.get('referral_code', 'N/A')}", "PASS")
                    self.record_test("GET /api/referral/enhanced-status", True, f"Code: {data.get('referral_code', 'N/A')}")
                    return True
                else:
                    self.log(f"❌ Invalid referral format: {data}", "FAIL")
                    self.record_test("GET /api/referral/enhanced-status", False, "Invalid referral format")
                    return False
            else:
                self.log(f"❌ Referral enhanced status failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/referral/enhanced-status", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Referral enhanced status error: {str(e)}", "ERROR")
            self.record_test("GET /api/referral/enhanced-status", False, f"Error: {str(e)}")
            return False

    def test_weekly_report(self):
        """30. GET /api/reports/weekly"""
        self.log("📊 Testing Weekly Report...")
        try:
            response = self.session.get(f"{BASE_URL}/reports/weekly")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Weekly report working", "PASS")
                self.record_test("GET /api/reports/weekly", True, "Weekly report working")
                return True
            else:
                self.log(f"❌ Weekly report failed: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/reports/weekly", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Weekly report error: {str(e)}", "ERROR")
            self.record_test("GET /api/reports/weekly", False, f"Error: {str(e)}")
            return False

    # CRITICAL TESTS - Previously failing endpoints that should now be fixed
    def test_split_settle(self):
        """CRITICAL: POST /api/split/settle - Was 500, should be 200 now"""
        self.log("🔥 CRITICAL TEST: Split Settle (was 500, should be 200)...")
        try:
            response = self.session.post(f"{BASE_URL}/split/settle",
                                       json={
                                           "target_user_id": "test_user",
                                           "amount": 500,
                                           "method": "upi"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ CRITICAL FIX VERIFIED: Split settle now working (was 500)", "PASS")
                self.record_test("POST /api/split/settle (CRITICAL)", True, "Fixed from 500 to 200")
                return True
            else:
                self.log(f"❌ CRITICAL ISSUE: Split settle still failing: {response.status_code} - {response.text}", "FAIL")
                self.record_test("POST /api/split/settle (CRITICAL)", False, f"Still failing: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ CRITICAL ERROR: Split settle error: {str(e)}", "ERROR")
            self.record_test("POST /api/split/settle (CRITICAL)", False, f"Error: {str(e)}")
            return False

    def test_split_settlements(self):
        """CRITICAL: GET /api/split/settlements - Was 500, should be 200 now"""
        self.log("🔥 CRITICAL TEST: Split Settlements (was 500, should be 200)...")
        try:
            response = self.session.get(f"{BASE_URL}/split/settlements")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ CRITICAL FIX VERIFIED: Split settlements now working (was 500)", "PASS")
                self.record_test("GET /api/split/settlements (CRITICAL)", True, "Fixed from 500 to 200")
                return True
            else:
                self.log(f"❌ CRITICAL ISSUE: Split settlements still failing: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/split/settlements (CRITICAL)", False, f"Still failing: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ CRITICAL ERROR: Split settlements error: {str(e)}", "ERROR")
            self.record_test("GET /api/split/settlements (CRITICAL)", False, f"Error: {str(e)}")
            return False

    def test_ai_proactive_nudges(self):
        """CRITICAL: GET /api/ai/proactive-nudges - Was 500, should be 200 now"""
        self.log("🔥 CRITICAL TEST: AI Proactive Nudges (was 500, should be 200)...")
        try:
            response = self.session.get(f"{BASE_URL}/ai/proactive-nudges")
            
            if response.status_code == 200:
                data = response.json()
                # Handle both direct array and wrapped response
                nudges = data if isinstance(data, list) else data.get("nudges", [])
                if isinstance(nudges, list):
                    self.log(f"✅ CRITICAL FIX VERIFIED: AI proactive nudges now working (was 500) - {len(nudges)} nudges", "PASS")
                    self.record_test("GET /api/ai/proactive-nudges (CRITICAL)", True, f"Fixed from 500 to 200 - {len(nudges)} nudges")
                    return True
                else:
                    self.log(f"❌ CRITICAL ISSUE: Invalid nudges format: {data}", "FAIL")
                    self.record_test("GET /api/ai/proactive-nudges (CRITICAL)", False, "Invalid format")
                    return False
            else:
                self.log(f"❌ CRITICAL ISSUE: AI proactive nudges still failing: {response.status_code} - {response.text}", "FAIL")
                self.record_test("GET /api/ai/proactive-nudges (CRITICAL)", False, f"Still failing: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ CRITICAL ERROR: AI proactive nudges error: {str(e)}", "ERROR")
            self.record_test("GET /api/ai/proactive-nudges (CRITICAL)", False, f"Error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all 30 endpoint tests"""
        self.log("🚀 Starting MintU Comprehensive Backend Testing...")
        self.log(f"📍 Testing against: {BASE_URL}")
        self.log("🎯 Focus: Verify ALL 30 endpoints + 3 critical fixes")
        
        # Authentication flow
        if not self.send_otp():
            self.log("❌ Cannot proceed without OTP send", "CRITICAL")
            return False
            
        if not self.verify_otp():
            self.log("❌ Cannot proceed without authentication", "CRITICAL")
            return False

        # Get user profile first
        self.test_user_me()
        
        # Test all endpoints in order
        test_methods = [
            self.test_upi_save,
            self.test_upi_get,
            self.test_create_split_group,
            self.test_get_split_groups,
            self.test_add_split_expense,
            self.test_group_summary,
            self.test_split_balances,
            self.test_recurring_expenses,
            self.test_money_school_cards,
            self.test_money_school_complete,
            self.test_upi_apps,
            self.test_generate_qr,
            self.test_ai_agent_chat,
            self.test_ai_agents,
            self.test_transactions,
            self.test_budgets,
            self.test_stats_overview,
            self.test_leaderboard_savings,
            self.test_waste_detector,
            self.test_smart_alerts,
            self.test_share_stats_card,
            self.test_card_of_the_day,
            self.test_money_school_daily,
            self.test_gamification_status,
            self.test_referral_enhanced_status,
            self.test_weekly_report,
            # CRITICAL TESTS - Previously failing endpoints
            self.test_split_settle,
            self.test_split_settlements,
            self.test_ai_proactive_nudges
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
        self.log("📊 COMPREHENSIVE TEST SUMMARY - ALL 30 ENDPOINTS")
        self.log("="*80)
        
        passed_tests = [r for r in self.test_results if r["passed"]]
        failed_tests = [r for r in self.test_results if not r["passed"]]
        critical_tests = [r for r in self.test_results if "CRITICAL" in r["test"]]
        
        # Critical tests summary
        self.log("\n🔥 CRITICAL FIXES (Previously failing endpoints):")
        for test in critical_tests:
            status = "✅ FIXED" if test["passed"] else "❌ STILL FAILING"
            self.log(f"   {status}: {test['test']} - {test['details']}")
        
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
        
        critical_passed = sum(1 for test in critical_tests if test["passed"])
        critical_total = len(critical_tests)
        
        if critical_total > 0:
            self.log(f"   Critical Fixes: {critical_passed}/{critical_total} working")
        
        if len(failed_tests) == 0:
            self.log("🎉 ALL TESTS PASSED! Backend is production-ready!", "SUCCESS")
        else:
            self.log(f"⚠️ {len(failed_tests)} tests failed. Review issues above.", "WARNING")

if __name__ == "__main__":
    tester = MintUComprehensiveTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)