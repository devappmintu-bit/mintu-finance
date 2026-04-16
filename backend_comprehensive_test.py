#!/usr/bin/env python3
"""
MintU Backend API Comprehensive Testing - Final Review
Tests ALL 24 critical endpoints as specified in the review request
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
                if self.token:
                    self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                    self.log("✅ OTP verified, token received", "PASS")
                    self.add_result("POST /api/auth/verify-otp", True, "Token received and set")
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
                if "phone" in data and "name" in data:
                    self.log(f"✅ User profile retrieved - Name: {data.get('name')}", "PASS")
                    self.add_result("GET /api/user/me", True, f"User: {data.get('name')}")
                    return True
                else:
                    self.log(f"❌ Missing user fields: {data}", "FAIL")
                    self.add_result("GET /api/user/me", False, "Missing required fields")
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
        self.log("💳 Testing UPI Save...")
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
                    self.log(f"❌ Unexpected response: {data}", "FAIL")
                    self.add_result("POST /api/user/upi", False, "Unexpected response format")
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
        self.log("💳 Testing UPI Retrieval...")
        try:
            response = self.session.get(f"{BASE_URL}/user/upi")
            
            if response.status_code == 200:
                data = response.json()
                if "upi_id" in data:
                    self.log(f"✅ UPI ID retrieved: {data.get('upi_id')}", "PASS")
                    self.add_result("GET /api/user/upi", True, f"UPI: {data.get('upi_id')}")
                    return True
                else:
                    self.log(f"❌ Missing UPI field: {data}", "FAIL")
                    self.add_result("GET /api/user/upi", False, "Missing UPI field")
                    return False
            else:
                self.log(f"❌ UPI retrieval failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/user/upi", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ UPI retrieval error: {str(e)}", "ERROR")
            self.add_result("GET /api/user/upi", False, f"Error: {str(e)}")
            return False
            
    def test_upload_avatar(self):
        """6. POST /api/user/avatar"""
        self.log("📸 Testing Avatar Upload...")
        try:
            # Create a small test base64 image
            test_image_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA=="
            
            response = self.session.post(f"{BASE_URL}/user/avatar",
                                       json={"avatar": test_image_b64})
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log("✅ Avatar uploaded successfully", "PASS")
                    self.add_result("POST /api/user/avatar", True, "Avatar uploaded")
                    return True
                else:
                    self.log(f"❌ Unexpected response: {data}", "FAIL")
                    self.add_result("POST /api/user/avatar", False, "Unexpected response format")
                    return False
            else:
                self.log(f"❌ Avatar upload failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/user/avatar", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Avatar upload error: {str(e)}", "ERROR")
            self.add_result("POST /api/user/avatar", False, f"Error: {str(e)}")
            return False
            
    def test_get_avatar(self):
        """7. GET /api/user/avatar"""
        self.log("🖼️ Testing Avatar Retrieval...")
        try:
            response = self.session.get(f"{BASE_URL}/user/avatar")
            
            if response.status_code == 200:
                data = response.json()
                if "avatar" in data and "name" in data:
                    self.log(f"✅ Avatar retrieved - Name: {data.get('name')}", "PASS")
                    self.add_result("GET /api/user/avatar", True, f"Avatar for {data.get('name')}")
                    return True
                else:
                    self.log(f"❌ Missing avatar/name fields: {data}", "FAIL")
                    self.add_result("GET /api/user/avatar", False, "Missing required fields")
                    return False
            else:
                self.log(f"❌ Avatar retrieval failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/user/avatar", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Avatar retrieval error: {str(e)}", "ERROR")
            self.add_result("GET /api/user/avatar", False, f"Error: {str(e)}")
            return False
            
    def test_get_transactions(self):
        """8. GET /api/transactions"""
        self.log("💰 Testing Get Transactions...")
        try:
            response = self.session.get(f"{BASE_URL}/transactions")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Transactions retrieved - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/transactions", True, f"{len(data)} transactions")
                    return True
                else:
                    self.log(f"❌ Expected list, got: {type(data)}", "FAIL")
                    self.add_result("GET /api/transactions", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ Get transactions failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/transactions", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Get transactions error: {str(e)}", "ERROR")
            self.add_result("GET /api/transactions", False, f"Error: {str(e)}")
            return False
            
    def test_create_transaction(self):
        """9. POST /api/transactions"""
        self.log("💸 Testing Create Transaction...")
        try:
            transaction_data = {
                "amount": 500,
                "category": "Food",
                "type": "debit",
                "description": "Lunch at restaurant"
            }
            
            response = self.session.post(f"{BASE_URL}/transactions",
                                       json=transaction_data)
            
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                if "id" in data or "message" in data:
                    self.log("✅ Transaction created successfully", "PASS")
                    self.add_result("POST /api/transactions", True, "Transaction created")
                    return True
                else:
                    self.log(f"❌ Unexpected response: {data}", "FAIL")
                    self.add_result("POST /api/transactions", False, "Unexpected response format")
                    return False
            else:
                self.log(f"❌ Create transaction failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/transactions", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Create transaction error: {str(e)}", "ERROR")
            self.add_result("POST /api/transactions", False, f"Error: {str(e)}")
            return False
            
    def test_get_budgets(self):
        """10. GET /api/budgets"""
        self.log("📊 Testing Get Budgets...")
        try:
            response = self.session.get(f"{BASE_URL}/budgets")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Budgets retrieved - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/budgets", True, f"{len(data)} budgets")
                    return True
                else:
                    self.log(f"❌ Expected list, got: {type(data)}", "FAIL")
                    self.add_result("GET /api/budgets", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ Get budgets failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/budgets", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Get budgets error: {str(e)}", "ERROR")
            self.add_result("GET /api/budgets", False, f"Error: {str(e)}")
            return False
            
    def test_stats_overview(self):
        """11. GET /api/stats/overview"""
        self.log("📈 Testing Stats Overview...")
        try:
            response = self.session.get(f"{BASE_URL}/stats/overview")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["total_income", "total_expense", "balance"]
                if all(field in data for field in required_fields):
                    self.log(f"✅ Stats overview - Balance: ₹{data.get('balance', 0)}", "PASS")
                    self.add_result("GET /api/stats/overview", True, f"Balance: ₹{data.get('balance', 0)}")
                    return True
                else:
                    missing = [f for f in required_fields if f not in data]
                    self.log(f"❌ Missing fields: {missing}", "FAIL")
                    self.add_result("GET /api/stats/overview", False, f"Missing: {missing}")
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
        """12. GET /api/leaderboard/savings"""
        self.log("🏆 Testing Savings Leaderboard...")
        try:
            response = self.session.get(f"{BASE_URL}/leaderboard/savings")
            
            if response.status_code == 200:
                data = response.json()
                if "user_rank" in data and "top_10" in data:
                    self.log(f"✅ Leaderboard - Rank: {data.get('user_rank')}", "PASS")
                    self.add_result("GET /api/leaderboard/savings", True, f"Rank: {data.get('user_rank')}")
                    return True
                else:
                    self.log(f"❌ Missing leaderboard fields: {data}", "FAIL")
                    self.add_result("GET /api/leaderboard/savings", False, "Missing required fields")
                    return False
            else:
                self.log(f"❌ Leaderboard failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/leaderboard/savings", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Leaderboard error: {str(e)}", "ERROR")
            self.add_result("GET /api/leaderboard/savings", False, f"Error: {str(e)}")
            return False
            
    def test_waste_detector(self):
        """13. GET /api/waste-detector"""
        self.log("🗑️ Testing Waste Detector...")
        try:
            response = self.session.get(f"{BASE_URL}/waste-detector")
            
            if response.status_code == 200:
                data = response.json()
                if "total_monthly_expense" in data or "category_waste" in data or "equivalences" in data or "message" in data:
                    self.log("✅ Waste detector working", "PASS")
                    self.add_result("GET /api/waste-detector", True, "Waste analysis complete")
                    return True
                else:
                    self.log(f"❌ Unexpected response: {data}", "FAIL")
                    self.add_result("GET /api/waste-detector", False, "Unexpected response format")
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
        """14. GET /api/alerts/smart"""
        self.log("🚨 Testing Smart Alerts...")
        try:
            response = self.session.get(f"{BASE_URL}/alerts/smart")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Smart alerts - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/alerts/smart", True, f"{len(data)} alerts")
                    return True
                else:
                    self.log(f"❌ Expected list, got: {type(data)}", "FAIL")
                    self.add_result("GET /api/alerts/smart", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ Smart alerts failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/alerts/smart", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Smart alerts error: {str(e)}", "ERROR")
            self.add_result("GET /api/alerts/smart", False, f"Error: {str(e)}")
            return False
            
    def test_weekly_report(self):
        """15. GET /api/reports/weekly"""
        self.log("📋 Testing Weekly Report...")
        try:
            response = self.session.get(f"{BASE_URL}/reports/weekly")
            
            if response.status_code == 200:
                data = response.json()
                if "mood" in data or "headline" in data or "message" in data:
                    self.log("✅ Weekly report generated", "PASS")
                    self.add_result("GET /api/reports/weekly", True, "Weekly report complete")
                    return True
                else:
                    self.log(f"❌ Unexpected response: {data}", "FAIL")
                    self.add_result("GET /api/reports/weekly", False, "Unexpected response format")
                    return False
            else:
                self.log(f"❌ Weekly report failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/reports/weekly", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Weekly report error: {str(e)}", "ERROR")
            self.add_result("GET /api/reports/weekly", False, f"Error: {str(e)}")
            return False
            
    def test_card_of_the_day(self):
        """16. GET /api/card-of-the-day"""
        self.log("🃏 Testing Card of the Day...")
        try:
            response = self.session.get(f"{BASE_URL}/card-of-the-day")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["type", "emoji", "title", "text"]
                if all(field in data for field in required_fields):
                    self.log(f"✅ Card of the Day - Type: {data.get('type')}", "PASS")
                    self.add_result("GET /api/card-of-the-day", True, f"Type: {data.get('type')}")
                    return True
                else:
                    missing = [f for f in required_fields if f not in data]
                    self.log(f"❌ Missing fields: {missing}", "FAIL")
                    self.add_result("GET /api/card-of-the-day", False, f"Missing: {missing}")
                    return False
            else:
                self.log(f"❌ Card of the Day failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/card-of-the-day", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Card of the Day error: {str(e)}", "ERROR")
            self.add_result("GET /api/card-of-the-day", False, f"Error: {str(e)}")
            return False
            
    def test_money_school_daily(self):
        """17. GET /api/money-school/daily"""
        self.log("🎓 Testing Money School Daily...")
        try:
            response = self.session.get(f"{BASE_URL}/money-school/daily")
            
            if response.status_code == 200:
                data = response.json()
                if "title" in data or "content" in data or "message" in data:
                    self.log("✅ Money School daily content", "PASS")
                    self.add_result("GET /api/money-school/daily", True, "Daily content available")
                    return True
                else:
                    self.log(f"❌ Unexpected response: {data}", "FAIL")
                    self.add_result("GET /api/money-school/daily", False, "Unexpected response format")
                    return False
            else:
                self.log(f"❌ Money School failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/money-school/daily", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money School error: {str(e)}", "ERROR")
            self.add_result("GET /api/money-school/daily", False, f"Error: {str(e)}")
            return False
            
    def test_gamification_status(self):
        """18. GET /api/gamification/status"""
        self.log("🎮 Testing Gamification Status...")
        try:
            response = self.session.get(f"{BASE_URL}/gamification/status")
            
            if response.status_code == 200:
                data = response.json()
                if "badges" in data or "streak" in data or "achievements" in data:
                    self.log("✅ Gamification status retrieved", "PASS")
                    self.add_result("GET /api/gamification/status", True, "Gamification data available")
                    return True
                else:
                    self.log(f"❌ Unexpected response: {data}", "FAIL")
                    self.add_result("GET /api/gamification/status", False, "Unexpected response format")
                    return False
            else:
                self.log(f"❌ Gamification status failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/gamification/status", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Gamification status error: {str(e)}", "ERROR")
            self.add_result("GET /api/gamification/status", False, f"Error: {str(e)}")
            return False
            
    def test_ai_agents(self):
        """19. GET /api/ai/agents"""
        self.log("🤖 Testing AI Agents List...")
        try:
            response = self.session.get(f"{BASE_URL}/ai/agents")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    self.log(f"✅ AI Agents - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/ai/agents", True, f"{len(data)} agents available")
                    return True
                else:
                    self.log(f"❌ Expected non-empty list, got: {data}", "FAIL")
                    self.add_result("GET /api/ai/agents", False, "No agents found")
                    return False
            else:
                self.log(f"❌ AI Agents failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/ai/agents", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI Agents error: {str(e)}", "ERROR")
            self.add_result("GET /api/ai/agents", False, f"Error: {str(e)}")
            return False
            
    def test_ai_proactive_nudges(self):
        """20. GET /api/ai/proactive-nudges"""
        self.log("💡 Testing AI Proactive Nudges...")
        try:
            response = self.session.get(f"{BASE_URL}/ai/proactive-nudges")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Proactive nudges - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/ai/proactive-nudges", True, f"{len(data)} nudges")
                    return True
                else:
                    self.log(f"❌ Expected list, got: {type(data)}", "FAIL")
                    self.add_result("GET /api/ai/proactive-nudges", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ Proactive nudges failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/ai/proactive-nudges", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Proactive nudges error: {str(e)}", "ERROR")
            self.add_result("GET /api/ai/proactive-nudges", False, f"Error: {str(e)}")
            return False
            
    def test_ai_agent_chat(self):
        """21. POST /api/ai/agent-chat"""
        self.log("💬 Testing AI Agent Chat...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Where did I overspend this month?"})
            
            if response.status_code == 200:
                data = response.json()
                if "response" in data or "reply" in data or "message" in data:
                    response_text = data.get("response", data.get("reply", data.get("message", "")))
                    if len(response_text) > 10:
                        self.log("✅ AI Agent chat working", "PASS")
                        self.add_result("POST /api/ai/agent-chat", True, "AI response received")
                        return True
                    else:
                        self.log(f"❌ Response too short: {response_text}", "FAIL")
                        self.add_result("POST /api/ai/agent-chat", False, "Response too short")
                        return False
                else:
                    self.log(f"❌ No response field: {data}", "FAIL")
                    self.add_result("POST /api/ai/agent-chat", False, "No response field")
                    return False
            else:
                self.log(f"❌ AI Agent chat failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("POST /api/ai/agent-chat", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI Agent chat error: {str(e)}", "ERROR")
            self.add_result("POST /api/ai/agent-chat", False, f"Error: {str(e)}")
            return False
            
    def test_split_groups(self):
        """22. GET /api/split/groups"""
        self.log("👥 Testing Split Groups...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Split groups - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/split/groups", True, f"{len(data)} groups")
                    return True
                else:
                    self.log(f"❌ Expected list, got: {type(data)}", "FAIL")
                    self.add_result("GET /api/split/groups", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ Split groups failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/split/groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split groups error: {str(e)}", "ERROR")
            self.add_result("GET /api/split/groups", False, f"Error: {str(e)}")
            return False
            
    def test_split_balances(self):
        """23. GET /api/split/balances"""
        self.log("💰 Testing Split Balances...")
        try:
            response = self.session.get(f"{BASE_URL}/split/balances")
            
            if response.status_code == 200:
                data = response.json()
                if "you_owe" in data and "owed_to_you" in data:
                    self.log("✅ Split balances retrieved", "PASS")
                    self.add_result("GET /api/split/balances", True, "Balance data available")
                    return True
                else:
                    self.log(f"❌ Missing balance fields: {data}", "FAIL")
                    self.add_result("GET /api/split/balances", False, "Missing required fields")
                    return False
            else:
                self.log(f"❌ Split balances failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/split/balances", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split balances error: {str(e)}", "ERROR")
            self.add_result("GET /api/split/balances", False, f"Error: {str(e)}")
            return False
            
    def test_split_settlements(self):
        """24. GET /api/split/settlements"""
        self.log("🧾 Testing Split Settlements...")
        try:
            response = self.session.get(f"{BASE_URL}/split/settlements")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Split settlements - Count: {len(data)}", "PASS")
                    self.add_result("GET /api/split/settlements", True, f"{len(data)} settlements")
                    return True
                else:
                    self.log(f"❌ Expected list, got: {type(data)}", "FAIL")
                    self.add_result("GET /api/split/settlements", False, "Invalid response format")
                    return False
            else:
                self.log(f"❌ Split settlements failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/split/settlements", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split settlements error: {str(e)}", "ERROR")
            self.add_result("GET /api/split/settlements", False, f"Error: {str(e)}")
            return False
            
    def test_share_stats_card(self):
        """25. GET /api/share/stats-card"""
        self.log("📤 Testing Share Stats Card...")
        try:
            response = self.session.get(f"{BASE_URL}/share/stats-card")
            
            if response.status_code == 200:
                data = response.json()
                if "whatsapp_text" in data or "instagram_caption" in data:
                    self.log("✅ Share stats card generated", "PASS")
                    self.add_result("GET /api/share/stats-card", True, "Shareable content ready")
                    return True
                else:
                    self.log(f"❌ Missing share fields: {data}", "FAIL")
                    self.add_result("GET /api/share/stats-card", False, "Missing share fields")
                    return False
            else:
                self.log(f"❌ Share stats card failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/share/stats-card", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Share stats card error: {str(e)}", "ERROR")
            self.add_result("GET /api/share/stats-card", False, f"Error: {str(e)}")
            return False
            
    def test_referral_enhanced_status(self):
        """26. GET /api/referral/enhanced-status"""
        self.log("🎁 Testing Enhanced Referral Status...")
        try:
            response = self.session.get(f"{BASE_URL}/referral/enhanced-status")
            
            if response.status_code == 200:
                data = response.json()
                if "referral_code" in data and "referral_count" in data:
                    self.log(f"✅ Referral status - Code: {data.get('referral_code')}", "PASS")
                    self.add_result("GET /api/referral/enhanced-status", True, f"Code: {data.get('referral_code')}")
                    return True
                else:
                    self.log(f"❌ Missing referral fields: {data}", "FAIL")
                    self.add_result("GET /api/referral/enhanced-status", False, "Missing required fields")
                    return False
            else:
                self.log(f"❌ Referral status failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("GET /api/referral/enhanced-status", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Referral status error: {str(e)}", "ERROR")
            self.add_result("GET /api/referral/enhanced-status", False, f"Error: {str(e)}")
            return False
            
    def run_all_tests(self):
        """Run all 26 comprehensive tests"""
        self.log("🚀 Starting MintU Comprehensive Backend Testing...")
        self.log(f"📍 Testing against: {BASE_URL}")
        self.log(f"📱 Using phone: {TEST_PHONE}, OTP: {TEST_OTP}")
        
        # Authentication flow (required for all other tests)
        if not self.send_otp():
            self.log("❌ Cannot proceed without OTP send", "CRITICAL")
            return False
            
        # Wait a moment for rate limiting
        time.sleep(1)
            
        if not self.verify_otp():
            self.log("❌ Cannot proceed without authentication", "CRITICAL")
            return False
            
        # Run all endpoint tests
        test_methods = [
            self.test_user_me,
            self.test_save_upi,
            self.test_get_upi,
            self.test_upload_avatar,
            self.test_get_avatar,
            self.test_get_transactions,
            self.test_create_transaction,
            self.test_get_budgets,
            self.test_stats_overview,
            self.test_leaderboard_savings,
            self.test_waste_detector,
            self.test_smart_alerts,
            self.test_weekly_report,
            self.test_card_of_the_day,
            self.test_money_school_daily,
            self.test_gamification_status,
            self.test_ai_agents,
            self.test_ai_proactive_nudges,
            self.test_ai_agent_chat,
            self.test_split_groups,
            self.test_split_balances,
            self.test_split_settlements,
            self.test_share_stats_card,
            self.test_referral_enhanced_status
        ]
        
        for test_method in test_methods:
            try:
                test_method()
                # Small delay between tests to respect rate limits
                time.sleep(0.2)
            except Exception as e:
                self.log(f"❌ Test method {test_method.__name__} failed: {str(e)}", "ERROR")
                
        # Generate summary
        self.generate_summary()
        
        # Return overall success
        passed_tests = sum(1 for result in self.test_results if result["passed"])
        total_tests = len(self.test_results)
        return passed_tests == total_tests
        
    def generate_summary(self):
        """Generate comprehensive test summary"""
        self.log("\n" + "="*80)
        self.log("📊 COMPREHENSIVE TEST SUMMARY")
        self.log("="*80)
        
        passed_tests = [r for r in self.test_results if r["passed"]]
        failed_tests = [r for r in self.test_results if not r["passed"]]
        
        self.log(f"✅ PASSED: {len(passed_tests)}/{len(self.test_results)} tests")
        self.log(f"❌ FAILED: {len(failed_tests)}/{len(self.test_results)} tests")
        
        if failed_tests:
            self.log("\n🔍 FAILED TESTS DETAILS:")
            for test in failed_tests:
                self.log(f"  ❌ {test['test']}: {test['details']}")
                
        if passed_tests:
            self.log("\n✅ PASSED TESTS:")
            for test in passed_tests:
                self.log(f"  ✅ {test['test']}: {test['details']}")
                
        success_rate = (len(passed_tests) / len(self.test_results)) * 100
        self.log(f"\n🎯 SUCCESS RATE: {success_rate:.1f}%")
        
        if success_rate == 100:
            self.log("🎉 ALL TESTS PASSED! MintU backend is production-ready!", "SUCCESS")
        elif success_rate >= 90:
            self.log("⚠️ Most tests passed, minor issues detected", "WARNING")
        else:
            self.log("🚨 Multiple critical issues detected", "CRITICAL")

if __name__ == "__main__":
    tester = MintUComprehensiveTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)