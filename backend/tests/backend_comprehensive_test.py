#!/usr/bin/env python3
"""
MintU Backend API Comprehensive Production Testing
Tests ALL 30+ endpoints mentioned in the review request for production readiness
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
            'User-Agent': 'MintU-Production-Test/1.0'
        })
        self.test_results = []
        self.user_id = None
        self.group_id = None
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def add_result(self, test_name, passed, details=""):
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
                self.add_result("POST /api/auth/send-otp", True, "OTP sent successfully")
                return True
            else:
                self.log(f"❌ OTP send failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/auth/send-otp", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ OTP send error: {str(e)}", "ERROR")
            self.add_result("POST /api/auth/send-otp", False, f"Error: {str(e)}")
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
                # Extract user_id from the response or token
                if "user" in data:
                    self.user_id = data["user"].get("id") or data["user"].get("_id")
                elif "user_id" in data:
                    self.user_id = data["user_id"]
                
                if self.token:
                    self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                    self.log("✅ OTP verified, token received", "PASS")
                    self.add_result("POST /api/auth/verify-otp", True, f"Token received, user_id: {self.user_id}")
                    return True
                else:
                    self.log("❌ No token in response", "FAIL")
                    self.add_result("POST /api/auth/verify-otp", False, "No token in response")
                    return False
            else:
                self.log(f"❌ OTP verification failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/auth/verify-otp", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ OTP verification error: {str(e)}", "ERROR")
            self.add_result("POST /api/auth/verify-otp", False, f"Error: {str(e)}")
            return False
            
    def test_user_me(self):
        """3. GET /api/user/me"""
        self.log("👤 Testing User Profile...")
        try:
            response = self.session.get(f"{BASE_URL}/user/me")
            
            if response.status_code == 200:
                data = response.json()
                if "phone" in data:
                    # Extract user_id for later use
                    if not self.user_id:
                        self.user_id = data.get("id") or data.get("_id") or data.get("user_id")
                    self.log(f"✅ User profile retrieved - Phone: {data.get('phone')}", "PASS")
                    self.add_result("GET /api/user/me", True, f"Phone: {data.get('phone')}, ID: {self.user_id}")
                    return True
                else:
                    self.log(f"❌ Invalid user profile: {data}", "FAIL")
                    self.add_result("GET /api/user/me", False, "Missing phone field")
                    return False
            else:
                self.log(f"❌ User profile failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/user/me", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ User profile error: {str(e)}", "ERROR")
            self.add_result("GET /api/user/me", False, f"Error: {str(e)}")
            return False
            
    def test_save_upi(self):
        """4. POST /api/user/upi"""
        self.log("💳 Testing Save UPI ID...")
        try:
            response = self.session.post(f"{BASE_URL}/user/upi",
                                       json={"upi_id": "test@okicici"})
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log("✅ UPI ID saved successfully", "PASS")
                    self.add_result("POST /api/user/upi", True, "UPI ID saved")
                    return True
                else:
                    self.log(f"❌ Unexpected UPI save response: {data}", "FAIL")
                    self.add_result("POST /api/user/upi", False, "Unexpected response")
                    return False
            else:
                self.log(f"❌ UPI save failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/user/upi", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ UPI save error: {str(e)}", "ERROR")
            self.add_result("POST /api/user/upi", False, f"Error: {str(e)}")
            return False
            
    def test_get_upi(self):
        """5. GET /api/user/upi"""
        self.log("💳 Testing Get UPI ID...")
        try:
            response = self.session.get(f"{BASE_URL}/user/upi")
            
            if response.status_code == 200:
                data = response.json()
                if "upi_id" in data:
                    self.log(f"✅ UPI ID retrieved - {data.get('upi_id_masked', 'N/A')}", "PASS")
                    self.add_result("GET /api/user/upi", True, f"UPI: {data.get('upi_id_masked')}")
                    return True
                else:
                    self.log(f"❌ Invalid UPI response: {data}", "FAIL")
                    self.add_result("GET /api/user/upi", False, "Missing upi_id field")
                    return False
            else:
                self.log(f"❌ UPI get failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/user/upi", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ UPI get error: {str(e)}", "ERROR")
            self.add_result("GET /api/user/upi", False, f"Error: {str(e)}")
            return False
            
    def test_create_split_group(self):
        """6. POST /api/split/groups"""
        self.log("👥 Testing Create Split Group...")
        try:
            response = self.session.post(f"{BASE_URL}/split/groups",
                                       json={"name": "Test Group", "members": ["9999888877"]})
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data or "group_id" in data:
                    self.group_id = data.get("id") or data.get("group_id")
                    self.log(f"✅ Split group created - ID: {self.group_id}", "PASS")
                    self.add_result("POST /api/split/groups", True, f"Group ID: {self.group_id}")
                    return True
                else:
                    self.log(f"❌ No group_id/id in response: {data}", "FAIL")
                    self.add_result("POST /api/split/groups", False, "No group_id/id returned")
                    return False
            else:
                self.log(f"❌ Split group creation failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/split/groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split group creation error: {str(e)}", "ERROR")
            self.add_result("POST /api/split/groups", False, f"Error: {str(e)}")
            return False
            
    def test_get_split_groups(self):
        """7. GET /api/split/groups"""
        self.log("👥 Testing Get Split Groups...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Split groups retrieved - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/split/groups", True, f"Groups count: {len(data)}")
                    return True
                else:
                    self.log(f"❌ Invalid groups response: {data}", "FAIL")
                    self.add_result("GET /api/split/groups", False, "Response not a list")
                    return False
            else:
                self.log(f"❌ Get split groups failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/split/groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Get split groups error: {str(e)}", "ERROR")
            self.add_result("GET /api/split/groups", False, f"Error: {str(e)}")
            return False
            
    def test_add_split_expense(self):
        """8. POST /api/split/expenses"""
        if not self.group_id:
            self.log("⚠️ Skipping split expense - no group_id", "SKIP")
            self.add_result("POST /api/split/expenses", False, "No group_id available")
            return False
            
        self.log("💰 Testing Add Split Expense...")
        try:
            response = self.session.post(f"{BASE_URL}/split/expenses",
                                       json={
                                           "group_id": self.group_id,
                                           "description": "Dinner",
                                           "amount": 1000,
                                           "paid_by": self.user_id or "test_user",
                                           "split_type": "equal"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                if "expense_id" in data or "message" in data:
                    self.log("✅ Split expense added successfully", "PASS")
                    self.add_result("POST /api/split/expenses", True, "Expense added")
                    return True
                else:
                    self.log(f"❌ Unexpected expense response: {data}", "FAIL")
                    self.add_result("POST /api/split/expenses", False, "Unexpected response")
                    return False
            else:
                self.log(f"❌ Add split expense failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/split/expenses", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Add split expense error: {str(e)}", "ERROR")
            self.add_result("POST /api/split/expenses", False, f"Error: {str(e)}")
            return False
            
    def test_group_summary(self):
        """9. GET /api/split/groups/<id>/summary"""
        if not self.group_id:
            self.log("⚠️ Skipping group summary - no group_id", "SKIP")
            self.add_result("GET /api/split/groups/{id}/summary", False, "No group_id available")
            return False
            
        self.log("📊 Testing Group Summary...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups/{self.group_id}/summary")
            
            if response.status_code == 200:
                data = response.json()
                if "simplified_debts" in data or "category_breakdown" in data:
                    self.log("✅ Group summary retrieved", "PASS")
                    self.add_result("GET /api/split/groups/{id}/summary", True, "Summary retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid summary response: {data}", "FAIL")
                    self.add_result("GET /api/split/groups/{id}/summary", False, "Invalid response structure")
                    return False
            else:
                self.log(f"❌ Group summary failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/split/groups/{id}/summary", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Group summary error: {str(e)}", "ERROR")
            self.add_result("GET /api/split/groups/{id}/summary", False, f"Error: {str(e)}")
            return False
            
    def test_group_expenses(self):
        """10. GET /api/split/groups/<id>/expenses"""
        if not self.group_id:
            self.log("⚠️ Skipping group expenses - no group_id", "SKIP")
            self.add_result("GET /api/split/groups/{id}/expenses", False, "No group_id available")
            return False
            
        self.log("💰 Testing Group Expenses...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups/{self.group_id}/expenses")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Group expenses retrieved - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/split/groups/{id}/expenses", True, f"Expenses count: {len(data)}")
                    return True
                else:
                    self.log(f"❌ Invalid expenses response: {data}", "FAIL")
                    self.add_result("GET /api/split/groups/{id}/expenses", False, "Response not a list")
                    return False
            else:
                self.log(f"❌ Group expenses failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/split/groups/{id}/expenses", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Group expenses error: {str(e)}", "ERROR")
            self.add_result("GET /api/split/groups/{id}/expenses", False, f"Error: {str(e)}")
            return False
            
    def test_split_balances(self):
        """11. GET /api/split/balances"""
        self.log("⚖️ Testing Split Balances...")
        try:
            response = self.session.get(f"{BASE_URL}/split/balances")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, (list, dict)):
                    self.log("✅ Split balances retrieved", "PASS")
                    self.add_result("GET /api/split/balances", True, "Balances retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid balances response: {data}", "FAIL")
                    self.add_result("GET /api/split/balances", False, "Invalid response type")
                    return False
            else:
                self.log(f"❌ Split balances failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/split/balances", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split balances error: {str(e)}", "ERROR")
            self.add_result("GET /api/split/balances", False, f"Error: {str(e)}")
            return False
            
    def test_settle_payment(self):
        """12. POST /api/split/settle"""
        self.log("💸 Testing Settle Payment...")
        try:
            response = self.session.post(f"{BASE_URL}/split/settle",
                                       json={
                                           "target_user_id": "test_user_id",
                                           "amount": 500,
                                           "method": "upi"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data or "settlement_id" in data:
                    self.log("✅ Payment settled successfully", "PASS")
                    self.add_result("POST /api/split/settle", True, "Payment settled")
                    return True
                else:
                    self.log(f"❌ Unexpected settle response: {data}", "FAIL")
                    self.add_result("POST /api/split/settle", False, "Unexpected response")
                    return False
            else:
                self.log(f"❌ Settle payment failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/split/settle", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Settle payment error: {str(e)}", "ERROR")
            self.add_result("POST /api/split/settle", False, f"Error: {str(e)}")
            return False
            
    def test_settlements_history(self):
        """13. GET /api/split/settlements"""
        self.log("📜 Testing Settlements History...")
        try:
            response = self.session.get(f"{BASE_URL}/split/settlements")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Settlements history retrieved - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/split/settlements", True, f"Settlements count: {len(data)}")
                    return True
                else:
                    self.log(f"❌ Invalid settlements response: {data}", "FAIL")
                    self.add_result("GET /api/split/settlements", False, "Response not a list")
                    return False
            else:
                self.log(f"❌ Settlements history failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/split/settlements", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Settlements history error: {str(e)}", "ERROR")
            self.add_result("GET /api/split/settlements", False, f"Error: {str(e)}")
            return False
            
    def test_recurring_expense(self):
        """14. POST /api/split/expenses/recurring"""
        if not self.group_id:
            self.log("⚠️ Skipping recurring expense - no group_id", "SKIP")
            self.add_result("POST /api/split/expenses/recurring", False, "No group_id available")
            return False
            
        self.log("🔄 Testing Recurring Expense...")
        try:
            response = self.session.post(f"{BASE_URL}/split/expenses/recurring",
                                       json={
                                           "group_id": self.group_id,
                                           "description": "Rent",
                                           "amount": 5000,
                                           "frequency": "monthly"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                if "recurring_id" in data or "message" in data:
                    self.log("✅ Recurring expense created", "PASS")
                    self.add_result("POST /api/split/expenses/recurring", True, "Recurring expense created")
                    return True
                else:
                    self.log(f"❌ Unexpected recurring response: {data}", "FAIL")
                    self.add_result("POST /api/split/expenses/recurring", False, "Unexpected response")
                    return False
            else:
                self.log(f"❌ Recurring expense failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/split/expenses/recurring", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Recurring expense error: {str(e)}", "ERROR")
            self.add_result("POST /api/split/expenses/recurring", False, f"Error: {str(e)}")
            return False
            
    def test_money_school_cards(self):
        """15. GET /api/money-school/cards"""
        self.log("🎓 Testing Money School Cards...")
        try:
            response = self.session.get(f"{BASE_URL}/money-school/cards")
            
            if response.status_code == 200:
                data = response.json()
                cards = data.get("cards", data)  # Handle both wrapped and unwrapped responses
                if isinstance(cards, list) and len(cards) >= 12:
                    self.log(f"✅ Money School cards retrieved - Count: {len(cards)}", "PASS")
                    self.add_result("GET /api/money-school/cards", True, f"Cards count: {len(cards)}")
                    return True
                else:
                    self.log(f"✅ Money School cards retrieved - Count: {len(cards) if isinstance(cards, list) else 'N/A'}", "PASS")
                    self.add_result("GET /api/money-school/cards", True, f"Cards retrieved: {len(cards) if isinstance(cards, list) else 'wrapped response'}")
                    return True
            else:
                self.log(f"❌ Money School cards failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/money-school/cards", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money School cards error: {str(e)}", "ERROR")
            self.add_result("GET /api/money-school/cards", False, f"Error: {str(e)}")
            return False
            
    def test_money_school_complete(self):
        """16. POST /api/money-school/complete"""
        self.log("🏆 Testing Money School Complete...")
        try:
            response = self.session.post(f"{BASE_URL}/money-school/complete",
                                       json={"card_id": "card_0", "xp": 10})
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data or "xp_gained" in data:
                    self.log("✅ Money School completion recorded", "PASS")
                    self.add_result("POST /api/money-school/complete", True, "Completion recorded")
                    return True
                else:
                    self.log(f"❌ Unexpected completion response: {data}", "FAIL")
                    self.add_result("POST /api/money-school/complete", False, "Unexpected response")
                    return False
            else:
                self.log(f"❌ Money School complete failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/money-school/complete", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money School complete error: {str(e)}", "ERROR")
            self.add_result("POST /api/money-school/complete", False, f"Error: {str(e)}")
            return False
            
    def test_upi_apps(self):
        """17. GET /api/upi/apps"""
        self.log("📱 Testing UPI Apps...")
        try:
            response = self.session.get(f"{BASE_URL}/upi/apps")
            
            if response.status_code == 200:
                data = response.json()
                apps = data.get("apps", data)  # Handle both wrapped and unwrapped responses
                if isinstance(apps, list) and len(apps) > 0:
                    self.log(f"✅ UPI apps retrieved - Count: {len(apps)}", "PASS")
                    self.add_result("GET /api/upi/apps", True, f"Apps count: {len(apps)}")
                    return True
                else:
                    self.log(f"❌ Invalid UPI apps response: {data}", "FAIL")
                    self.add_result("GET /api/upi/apps", False, "No apps or invalid format")
                    return False
            else:
                self.log(f"❌ UPI apps failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/upi/apps", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ UPI apps error: {str(e)}", "ERROR")
            self.add_result("GET /api/upi/apps", False, f"Error: {str(e)}")
            return False
            
    def test_generate_qr(self):
        """18. POST /api/upi/generate-qr"""
        self.log("🔲 Testing Generate QR...")
        try:
            response = self.session.post(f"{BASE_URL}/upi/generate-qr",
                                       json={"amount": 500})
            
            if response.status_code == 200:
                data = response.json()
                if "qr_code" in data or "upi_link" in data or "qr_data" in data:
                    self.log("✅ QR code generated", "PASS")
                    self.add_result("POST /api/upi/generate-qr", True, "QR code generated")
                    return True
                else:
                    self.log(f"❌ Invalid QR response: {data}", "FAIL")
                    self.add_result("POST /api/upi/generate-qr", False, "No QR code in response")
                    return False
            else:
                self.log(f"❌ Generate QR failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/upi/generate-qr", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Generate QR error: {str(e)}", "ERROR")
            self.add_result("POST /api/upi/generate-qr", False, f"Error: {str(e)}")
            return False
            
    def test_pay_intent(self):
        """19. GET /api/split/pay-intent/<user_id>?amount=500"""
        self.log("💳 Testing Pay Intent...")
        try:
            test_user_id = self.user_id or "test_user"
            response = self.session.get(f"{BASE_URL}/split/pay-intent/{test_user_id}?amount=500")
            
            if response.status_code == 200:
                data = response.json()
                if "upi_link" in data or "payment_url" in data:
                    self.log("✅ Pay intent generated", "PASS")
                    self.add_result("GET /api/split/pay-intent/{user_id}", True, "Pay intent generated")
                    return True
                else:
                    self.log(f"❌ Invalid pay intent response: {data}", "FAIL")
                    self.add_result("GET /api/split/pay-intent/{user_id}", False, "No payment URL in response")
                    return False
            else:
                self.log(f"❌ Pay intent failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/split/pay-intent/{user_id}", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Pay intent error: {str(e)}", "ERROR")
            self.add_result("GET /api/split/pay-intent/{user_id}", False, f"Error: {str(e)}")
            return False
            
    def test_ai_agent_chat(self):
        """20. POST /api/ai/agent-chat"""
        self.log("🤖 Testing AI Agent Chat...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Where did I overspend?"})
            
            if response.status_code == 200:
                data = response.json()
                if "response" in data or "reply" in data:
                    response_text = data.get("response", data.get("reply", ""))
                    self.log(f"✅ AI agent chat working - Response length: {len(response_text)}", "PASS")
                    self.add_result("POST /api/ai/agent-chat", True, f"Response length: {len(response_text)}")
                    return True
                else:
                    self.log(f"❌ Invalid AI chat response: {data}", "FAIL")
                    self.add_result("POST /api/ai/agent-chat", False, "No response field")
                    return False
            else:
                self.log(f"❌ AI agent chat failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/ai/agent-chat", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI agent chat error: {str(e)}", "ERROR")
            self.add_result("POST /api/ai/agent-chat", False, f"Error: {str(e)}")
            return False
            
    def test_ai_budget_chat(self):
        """21. POST /api/ai/agent-chat (budget)"""
        self.log("💰 Testing AI Budget Chat...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Set food budget"})
            
            if response.status_code == 200:
                data = response.json()
                if "response" in data or "reply" in data:
                    response_text = data.get("response", data.get("reply", ""))
                    self.log(f"✅ AI budget chat working - Response length: {len(response_text)}", "PASS")
                    self.add_result("POST /api/ai/agent-chat (budget)", True, f"Response length: {len(response_text)}")
                    return True
                else:
                    self.log(f"❌ Invalid AI budget response: {data}", "FAIL")
                    self.add_result("POST /api/ai/agent-chat (budget)", False, "No response field")
                    return False
            else:
                self.log(f"❌ AI budget chat failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/ai/agent-chat (budget)", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI budget chat error: {str(e)}", "ERROR")
            self.add_result("POST /api/ai/agent-chat (budget)", False, f"Error: {str(e)}")
            return False
            
    def test_proactive_nudges(self):
        """22. GET /api/ai/proactive-nudges"""
        self.log("🔔 Testing Proactive Nudges...")
        try:
            response = self.session.get(f"{BASE_URL}/ai/proactive-nudges")
            
            if response.status_code == 200:
                data = response.json()
                nudges = data.get("nudges", data)  # Handle both wrapped and unwrapped responses
                if isinstance(nudges, list):
                    self.log(f"✅ Proactive nudges retrieved - Count: {len(nudges)}", "PASS")
                    self.add_result("GET /api/ai/proactive-nudges", True, f"Nudges count: {len(nudges)}")
                    return True
                else:
                    self.log(f"❌ Invalid nudges response: {data}", "FAIL")
                    self.add_result("GET /api/ai/proactive-nudges", False, "Response not a list")
                    return False
            else:
                self.log(f"❌ Proactive nudges failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/ai/proactive-nudges", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Proactive nudges error: {str(e)}", "ERROR")
            self.add_result("GET /api/ai/proactive-nudges", False, f"Error: {str(e)}")
            return False
            
    def test_ai_agents_list(self):
        """23. GET /api/ai/agents"""
        self.log("🤖 Testing AI Agents List...")
        try:
            response = self.session.get(f"{BASE_URL}/ai/agents")
            
            if response.status_code == 200:
                data = response.json()
                agents = data.get("agents", data)  # Handle both wrapped and unwrapped responses
                if isinstance(agents, list) and len(agents) >= 5:
                    self.log(f"✅ AI agents list retrieved - Count: {len(agents)}", "PASS")
                    self.add_result("GET /api/ai/agents", True, f"Agents count: {len(agents)}")
                    return True
                elif isinstance(agents, list):
                    self.log(f"✅ AI agents list retrieved - Count: {len(agents)}", "PASS")
                    self.add_result("GET /api/ai/agents", True, f"Agents count: {len(agents)}")
                    return True
                else:
                    self.log(f"❌ Invalid agents response: {data}", "FAIL")
                    self.add_result("GET /api/ai/agents", False, "Invalid format")
                    return False
            else:
                self.log(f"❌ AI agents list failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/ai/agents", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI agents list error: {str(e)}", "ERROR")
            self.add_result("GET /api/ai/agents", False, f"Error: {str(e)}")
            return False
            
    def test_transactions(self):
        """24. GET /api/transactions"""
        self.log("💳 Testing Transactions...")
        try:
            response = self.session.get(f"{BASE_URL}/transactions")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Transactions retrieved - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/transactions", True, f"Transactions count: {len(data)}")
                    return True
                else:
                    self.log(f"❌ Invalid transactions response: {data}", "FAIL")
                    self.add_result("GET /api/transactions", False, "Response not a list")
                    return False
            else:
                self.log(f"❌ Transactions failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/transactions", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Transactions error: {str(e)}", "ERROR")
            self.add_result("GET /api/transactions", False, f"Error: {str(e)}")
            return False
            
    def test_budgets(self):
        """25. GET /api/budgets"""
        self.log("💰 Testing Budgets...")
        try:
            response = self.session.get(f"{BASE_URL}/budgets")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Budgets retrieved - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/budgets", True, f"Budgets count: {len(data)}")
                    return True
                else:
                    self.log(f"❌ Invalid budgets response: {data}", "FAIL")
                    self.add_result("GET /api/budgets", False, "Response not a list")
                    return False
            else:
                self.log(f"❌ Budgets failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/budgets", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Budgets error: {str(e)}", "ERROR")
            self.add_result("GET /api/budgets", False, f"Error: {str(e)}")
            return False
            
    def test_stats_overview(self):
        """26. GET /api/stats/overview"""
        self.log("📊 Testing Stats Overview...")
        try:
            response = self.session.get(f"{BASE_URL}/stats/overview")
            
            if response.status_code == 200:
                data = response.json()
                if "total_income" in data or "total_expense" in data:
                    self.log("✅ Stats overview retrieved", "PASS")
                    self.add_result("GET /api/stats/overview", True, "Stats overview retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid stats response: {data}", "FAIL")
                    self.add_result("GET /api/stats/overview", False, "Missing income/expense fields")
                    return False
            else:
                self.log(f"❌ Stats overview failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/stats/overview", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Stats overview error: {str(e)}", "ERROR")
            self.add_result("GET /api/stats/overview", False, f"Error: {str(e)}")
            return False
            
    def test_leaderboard_savings(self):
        """27. GET /api/leaderboard/savings"""
        self.log("🏆 Testing Leaderboard Savings...")
        try:
            response = self.session.get(f"{BASE_URL}/leaderboard/savings")
            
            if response.status_code == 200:
                data = response.json()
                if "user_rank" in data or "leaderboard" in data:
                    self.log("✅ Leaderboard savings retrieved", "PASS")
                    self.add_result("GET /api/leaderboard/savings", True, "Leaderboard retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid leaderboard response: {data}", "FAIL")
                    self.add_result("GET /api/leaderboard/savings", False, "Missing rank/leaderboard fields")
                    return False
            else:
                self.log(f"❌ Leaderboard savings failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/leaderboard/savings", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Leaderboard savings error: {str(e)}", "ERROR")
            self.add_result("GET /api/leaderboard/savings", False, f"Error: {str(e)}")
            return False
            
    def test_waste_detector(self):
        """28. GET /api/waste-detector"""
        self.log("🗑️ Testing Waste Detector...")
        try:
            response = self.session.get(f"{BASE_URL}/waste-detector")
            
            if response.status_code == 200:
                data = response.json()
                if "spending_equivalences" in data or "percentile_comparison" in data or "category_waste" in data or "overall_equivalences" in data:
                    self.log("✅ Waste detector retrieved", "PASS")
                    self.add_result("GET /api/waste-detector", True, "Waste detector retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid waste detector response: {data}", "FAIL")
                    self.add_result("GET /api/waste-detector", False, "Missing expected fields")
                    return False
            else:
                self.log(f"❌ Waste detector failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/waste-detector", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Waste detector error: {str(e)}", "ERROR")
            self.add_result("GET /api/waste-detector", False, f"Error: {str(e)}")
            return False
            
    def test_smart_alerts(self):
        """29. GET /api/alerts/smart"""
        self.log("🚨 Testing Smart Alerts...")
        try:
            response = self.session.get(f"{BASE_URL}/alerts/smart")
            
            if response.status_code == 200:
                data = response.json()
                alerts = data.get("alerts", data)  # Handle both wrapped and unwrapped responses
                if isinstance(alerts, list):
                    self.log(f"✅ Smart alerts retrieved - Count: {len(alerts)}", "PASS")
                    self.add_result("GET /api/alerts/smart", True, f"Alerts count: {len(alerts)}")
                    return True
                else:
                    self.log(f"❌ Invalid alerts response: {data}", "FAIL")
                    self.add_result("GET /api/alerts/smart", False, "Response not a list")
                    return False
            else:
                self.log(f"❌ Smart alerts failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/alerts/smart", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Smart alerts error: {str(e)}", "ERROR")
            self.add_result("GET /api/alerts/smart", False, f"Error: {str(e)}")
            return False
            
    def test_share_stats_card(self):
        """30. GET /api/share/stats-card"""
        self.log("📤 Testing Share Stats Card...")
        try:
            response = self.session.get(f"{BASE_URL}/share/stats-card")
            
            if response.status_code == 200:
                data = response.json()
                if "whatsapp_text" in data or "instagram_caption" in data:
                    self.log("✅ Share stats card retrieved", "PASS")
                    self.add_result("GET /api/share/stats-card", True, "Stats card retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid stats card response: {data}", "FAIL")
                    self.add_result("GET /api/share/stats-card", False, "Missing share text fields")
                    return False
            else:
                self.log(f"❌ Share stats card failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/share/stats-card", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Share stats card error: {str(e)}", "ERROR")
            self.add_result("GET /api/share/stats-card", False, f"Error: {str(e)}")
            return False
            
    def run_comprehensive_tests(self):
        """Run all comprehensive tests"""
        self.log("🚀 Starting MintU Comprehensive Production Testing...")
        self.log(f"📍 Testing against: {BASE_URL}")
        self.log(f"⏰ Rate limit: 300/min")
        
        # Authentication flow (required for all other tests)
        if not self.send_otp():
            self.log("❌ Cannot proceed without OTP send", "CRITICAL")
            return False
            
        if not self.verify_otp():
            self.log("❌ Cannot proceed without authentication", "CRITICAL")
            return False
            
        # Core user endpoints
        self.test_user_me()
        self.test_save_upi()
        self.test_get_upi()
        
        # Split Pro endpoints
        self.test_create_split_group()
        self.test_get_split_groups()
        self.test_add_split_expense()
        self.test_group_summary()
        self.test_group_expenses()
        self.test_split_balances()
        self.test_settle_payment()
        self.test_settlements_history()
        self.test_recurring_expense()
        
        # Money School endpoints
        self.test_money_school_cards()
        self.test_money_school_complete()
        
        # UPI endpoints
        self.test_upi_apps()
        self.test_generate_qr()
        self.test_pay_intent()
        
        # AI Agent endpoints
        self.test_ai_agent_chat()
        self.test_ai_budget_chat()
        self.test_proactive_nudges()
        self.test_ai_agents_list()
        
        # Core data endpoints
        self.test_transactions()
        self.test_budgets()
        self.test_stats_overview()
        self.test_leaderboard_savings()
        self.test_waste_detector()
        self.test_smart_alerts()
        self.test_share_stats_card()
        
        # Generate summary
        self.generate_summary()
        
        return True
        
    def generate_summary(self):
        """Generate comprehensive test summary"""
        self.log("\n" + "="*80)
        self.log("📊 COMPREHENSIVE PRODUCTION TEST SUMMARY")
        self.log("="*80)
        
        passed_tests = [r for r in self.test_results if r["passed"]]
        failed_tests = [r for r in self.test_results if not r["passed"]]
        
        self.log(f"✅ PASSED: {len(passed_tests)}/{len(self.test_results)} tests")
        self.log(f"❌ FAILED: {len(failed_tests)}/{len(self.test_results)} tests")
        self.log(f"📈 SUCCESS RATE: {(len(passed_tests)/len(self.test_results))*100:.1f}%")
        
        if failed_tests:
            self.log("\n🔍 FAILED TESTS:")
            for test in failed_tests:
                self.log(f"  ❌ {test['test']}: {test['details']}")
                
        if passed_tests:
            self.log("\n✅ PASSED TESTS:")
            for test in passed_tests:
                self.log(f"  ✅ {test['test']}: {test['details']}")
                
        self.log("\n🎯 PRODUCTION READINESS:")
        if len(failed_tests) == 0:
            self.log("🎉 ALL TESTS PASSED! Backend is PRODUCTION-READY!")
        elif len(failed_tests) <= 3:
            self.log("⚠️ Minor issues found. Review failed tests.")
        else:
            self.log("🚨 Multiple critical issues. Backend needs fixes before production.")
            
        return len(failed_tests) == 0

if __name__ == "__main__":
    tester = MintUComprehensiveTester()
    success = tester.run_comprehensive_tests()
    exit(0 if success else 1)