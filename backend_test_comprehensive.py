#!/usr/bin/env python3
"""
MintU Backend API Comprehensive Testing - ALL Endpoints
Tests all endpoints including new GPay-style split features, Settlement Gamification, and Money School AI
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
            'User-Agent': 'MintU-Test/1.0'
        })
        self.test_results = []
        self.group_id = None
        self.test_user_id = None
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def add_result(self, test_name, success, details=""):
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
    def send_otp(self):
        """Send OTP to test phone number"""
        self.log("🔐 Testing OTP Send...")
        try:
            response = self.session.post(f"{BASE_URL}/auth/send-otp", 
                                       json={"phone": TEST_PHONE})
            
            if response.status_code == 200:
                self.log("✅ OTP sent successfully", "PASS")
                self.add_result("OTP Send", True, "OTP sent successfully")
                return True
            else:
                self.log(f"❌ OTP send failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("OTP Send", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ OTP send error: {str(e)}", "ERROR")
            self.add_result("OTP Send", False, f"Error: {str(e)}")
            return False
            
    def verify_otp(self):
        """Verify OTP and get JWT token"""
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
                    self.add_result("OTP Verify", True, "Token received")
                    return True
                else:
                    self.log("❌ No token in response", "FAIL")
                    self.add_result("OTP Verify", False, "No token in response")
                    return False
            else:
                self.log(f"❌ OTP verification failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("OTP Verify", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ OTP verification error: {str(e)}", "ERROR")
            self.add_result("OTP Verify", False, f"Error: {str(e)}")
            return False

    def test_user_me(self):
        """Test GET /api/user/me"""
        self.log("👤 Testing User Profile...")
        try:
            response = self.session.get(f"{BASE_URL}/user/me")
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "phone" in data and "name" in data:
                    self.test_user_id = data["id"]
                    self.log(f"✅ User profile - Name: {data['name']}, Phone: {data['phone']}", "PASS")
                    self.add_result("User Profile", True, f"User: {data['name']}")
                    return True
                else:
                    self.log(f"❌ Missing user fields: {data}", "FAIL")
                    self.add_result("User Profile", False, "Missing fields")
                    return False
            else:
                self.log(f"❌ User profile failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("User Profile", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ User profile error: {str(e)}", "ERROR")
            self.add_result("User Profile", False, f"Error: {str(e)}")
            return False

    def test_upi_save(self):
        """Test POST /api/user/upi"""
        self.log("💳 Testing UPI Save...")
        try:
            response = self.session.post(f"{BASE_URL}/user/upi",
                                       json={"upi_id": "test@okicici"})
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log("✅ UPI ID saved successfully", "PASS")
                    self.add_result("UPI Save", True, "UPI ID saved")
                    return True
                else:
                    self.log(f"❌ Unexpected UPI save response: {data}", "FAIL")
                    self.add_result("UPI Save", False, "Unexpected response")
                    return False
            else:
                self.log(f"❌ UPI save failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("UPI Save", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ UPI save error: {str(e)}", "ERROR")
            self.add_result("UPI Save", False, f"Error: {str(e)}")
            return False

    def test_split_groups(self):
        """Test GET /api/split/groups"""
        self.log("👥 Testing Split Groups...")
        try:
            response = self.session.get(f"{BASE_URL}/split/groups")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Split groups retrieved - Count: {len(data)}", "PASS")
                    self.add_result("Split Groups", True, f"{len(data)} groups")
                    # Store first group ID for later tests
                    if data:
                        self.group_id = data[0].get("id")
                    return True
                else:
                    self.log(f"❌ Invalid split groups response: {data}", "FAIL")
                    self.add_result("Split Groups", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Split groups failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Split Groups", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split groups error: {str(e)}", "ERROR")
            self.add_result("Split Groups", False, f"Error: {str(e)}")
            return False

    def test_create_split_group(self):
        """Test POST /api/split/groups"""
        self.log("➕ Testing Create Split Group...")
        try:
            response = self.session.post(f"{BASE_URL}/split/groups",
                                       json={"name": "GPay Test", "members": ["9999888877"]})
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "name" in data:
                    self.group_id = data["id"]
                    self.log(f"✅ Split group created - ID: {data['id']}, Name: {data['name']}", "PASS")
                    self.add_result("Create Split Group", True, f"Group: {data['name']}")
                    return True
                else:
                    self.log(f"❌ Invalid create group response: {data}", "FAIL")
                    self.add_result("Create Split Group", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Create split group failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Create Split Group", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Create split group error: {str(e)}", "ERROR")
            self.add_result("Create Split Group", False, f"Error: {str(e)}")
            return False

    def test_split_balances(self):
        """Test GET /api/split/balances"""
        self.log("💰 Testing Split Balances...")
        try:
            response = self.session.get(f"{BASE_URL}/split/balances")
            
            if response.status_code == 200:
                data = response.json()
                # Check for either old format or new format
                if ("you_owe" in data and "owed_to_you" in data) or ("total_you_owe" in data and "total_owed_to_you" in data):
                    total_owe = data.get('total_you_owe', 0)
                    total_owed = data.get('total_owed_to_you', 0)
                    self.log(f"✅ Split balances - You owe: ₹{total_owe}, Owed to you: ₹{total_owed}", "PASS")
                    self.add_result("Split Balances", True, "Balances retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid split balances response: {data}", "FAIL")
                    self.add_result("Split Balances", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Split balances failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Split Balances", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Split balances error: {str(e)}", "ERROR")
            self.add_result("Split Balances", False, f"Error: {str(e)}")
            return False

    def test_settlement_with_rewards(self):
        """Test POST /api/split/settle-with-rewards"""
        self.log("🎁 Testing Settlement with Rewards...")
        try:
            response = self.session.post(f"{BASE_URL}/split/settle-with-rewards",
                                       json={"target_user_id": "test_user", "amount": 500, "method": "upi"})
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data or "coins_earned" in data:
                    self.log(f"✅ Settlement with rewards successful", "PASS")
                    self.add_result("Settlement with Rewards", True, "Settlement completed")
                    return True
                else:
                    self.log(f"❌ Invalid settlement response: {data}", "FAIL")
                    self.add_result("Settlement with Rewards", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Settlement with rewards failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Settlement with Rewards", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Settlement with rewards error: {str(e)}", "ERROR")
            self.add_result("Settlement with Rewards", False, f"Error: {str(e)}")
            return False

    def test_settlement_leaderboard(self):
        """Test GET /api/split/settlement-leaderboard"""
        self.log("🏆 Testing Settlement Leaderboard...")
        try:
            response = self.session.get(f"{BASE_URL}/split/settlement-leaderboard")
            
            if response.status_code == 200:
                data = response.json()
                if "leaderboard" in data or "user_rank" in data:
                    self.log(f"✅ Settlement leaderboard retrieved", "PASS")
                    self.add_result("Settlement Leaderboard", True, "Leaderboard retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid leaderboard response: {data}", "FAIL")
                    self.add_result("Settlement Leaderboard", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Settlement leaderboard failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Settlement Leaderboard", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Settlement leaderboard error: {str(e)}", "ERROR")
            self.add_result("Settlement Leaderboard", False, f"Error: {str(e)}")
            return False

    def test_redeem_coins(self):
        """Test POST /api/split/redeem-coins"""
        self.log("🪙 Testing Redeem Coins...")
        try:
            response = self.session.post(f"{BASE_URL}/split/redeem-coins",
                                       json={"coins": 10})
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data or "cashback" in data:
                    self.log(f"✅ Coins redeemed successfully", "PASS")
                    self.add_result("Redeem Coins", True, "Coins redeemed")
                    return True
                else:
                    self.log(f"❌ Invalid redeem response: {data}", "FAIL")
                    self.add_result("Redeem Coins", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Redeem coins failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Redeem Coins", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Redeem coins error: {str(e)}", "ERROR")
            self.add_result("Redeem Coins", False, f"Error: {str(e)}")
            return False

    def test_money_school_personalized(self):
        """Test GET /api/money-school/personalized"""
        self.log("🎓 Testing Money School Personalized...")
        try:
            response = self.session.get(f"{BASE_URL}/money-school/personalized")
            
            if response.status_code == 200:
                data = response.json()
                if "cards" in data or "personalized_tips" in data:
                    self.log(f"✅ Personalized money school retrieved", "PASS")
                    self.add_result("Money School Personalized", True, "Personalized content retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid money school response: {data}", "FAIL")
                    self.add_result("Money School Personalized", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Money school personalized failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Money School Personalized", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money school personalized error: {str(e)}", "ERROR")
            self.add_result("Money School Personalized", False, f"Error: {str(e)}")
            return False

    def test_money_school_cards(self):
        """Test GET /api/money-school/cards"""
        self.log("📚 Testing Money School Cards...")
        try:
            response = self.session.get(f"{BASE_URL}/money-school/cards")
            
            if response.status_code == 200:
                data = response.json()
                if "cards" in data or isinstance(data, list):
                    cards_count = len(data.get("cards", data))
                    self.log(f"✅ Money school cards retrieved - Count: {cards_count}", "PASS")
                    self.add_result("Money School Cards", True, f"{cards_count} cards")
                    return True
                else:
                    self.log(f"❌ Invalid cards response: {data}", "FAIL")
                    self.add_result("Money School Cards", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Money school cards failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Money School Cards", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money school cards error: {str(e)}", "ERROR")
            self.add_result("Money School Cards", False, f"Error: {str(e)}")
            return False

    def test_money_school_complete(self):
        """Test POST /api/money-school/complete"""
        self.log("✅ Testing Money School Complete...")
        try:
            response = self.session.post(f"{BASE_URL}/money-school/complete",
                                       json={"card_id": "card_0", "xp": 10})
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data or "xp_earned" in data:
                    self.log(f"✅ Money school completion successful", "PASS")
                    self.add_result("Money School Complete", True, "XP earned")
                    return True
                else:
                    self.log(f"❌ Invalid completion response: {data}", "FAIL")
                    self.add_result("Money School Complete", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Money school complete failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Money School Complete", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Money school complete error: {str(e)}", "ERROR")
            self.add_result("Money School Complete", False, f"Error: {str(e)}")
            return False

    def test_recurring_expenses(self):
        """Test POST /api/split/expenses/recurring"""
        self.log("🔄 Testing Recurring Expenses...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping recurring expenses test", "WARN")
                self.add_result("Recurring Expenses", False, "No group ID")
                return False
                
            response = self.session.post(f"{BASE_URL}/split/expenses/recurring",
                                       json={"group_id": self.group_id, "description": "Monthly Rent", "amount": 5000, "frequency": "monthly"})
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data or "message" in data:
                    self.log(f"✅ Recurring expense created successfully", "PASS")
                    self.add_result("Recurring Expenses", True, "Recurring expense created")
                    return True
                else:
                    self.log(f"❌ Invalid recurring expense response: {data}", "FAIL")
                    self.add_result("Recurring Expenses", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Recurring expenses failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Recurring Expenses", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Recurring expenses error: {str(e)}", "ERROR")
            self.add_result("Recurring Expenses", False, f"Error: {str(e)}")
            return False

    def test_group_summary(self):
        """Test GET /api/split/groups/<id>/summary"""
        self.log("📊 Testing Group Summary...")
        try:
            if not self.group_id:
                self.log("⚠️ No group ID available, skipping group summary test", "WARN")
                self.add_result("Group Summary", False, "No group ID")
                return False
                
            response = self.session.get(f"{BASE_URL}/split/groups/{self.group_id}/summary")
            
            if response.status_code == 200:
                data = response.json()
                if "simplified_debts" in data or "group_name" in data:
                    self.log(f"✅ Group summary retrieved successfully", "PASS")
                    self.add_result("Group Summary", True, "Summary retrieved")
                    return True
                else:
                    self.log(f"❌ Invalid group summary response: {data}", "FAIL")
                    self.add_result("Group Summary", False, "Invalid response")
                    return False
            else:
                self.log(f"❌ Group summary failed: {response.status_code} - {response.text}", "FAIL")
                self.add_result("Group Summary", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Group summary error: {str(e)}", "ERROR")
            self.add_result("Group Summary", False, f"Error: {str(e)}")
            return False

    def test_existing_endpoints(self):
        """Test all existing endpoints"""
        endpoints = [
            ("GET", "/upi/apps", "UPI Apps"),
            ("POST", "/ai/agent-chat", "AI Agent Chat", {"message": "Where did I overspend?"}),
            ("GET", "/ai/proactive-nudges", "AI Proactive Nudges"),
            ("GET", "/stats/overview", "Stats Overview"),
            ("GET", "/leaderboard/savings", "Savings Leaderboard"),
            ("GET", "/waste-detector", "Waste Detector"),
            ("GET", "/share/stats-card", "Share Stats Card"),
            ("GET", "/alerts/smart", "Smart Alerts"),
            ("GET", "/card-of-the-day", "Card of the Day"),
            ("GET", "/transactions", "Transactions"),
            ("GET", "/budgets", "Budgets"),
        ]
        
        results = []
        for endpoint_data in endpoints:
            method = endpoint_data[0]
            endpoint = endpoint_data[1]
            name = endpoint_data[2]
            payload = endpoint_data[3] if len(endpoint_data) > 3 else None
            
            self.log(f"🔍 Testing {name}...")
            try:
                if method == "GET":
                    response = self.session.get(f"{BASE_URL}{endpoint}")
                else:
                    response = self.session.post(f"{BASE_URL}{endpoint}", json=payload)
                    
                if response.status_code == 200:
                    data = response.json()
                    self.log(f"✅ {name} working", "PASS")
                    self.add_result(name, True, "Working correctly")
                    results.append(True)
                else:
                    self.log(f"❌ {name} failed: {response.status_code}", "FAIL")
                    self.add_result(name, False, f"Status: {response.status_code}")
                    results.append(False)
            except Exception as e:
                self.log(f"❌ {name} error: {str(e)}", "ERROR")
                self.add_result(name, False, f"Error: {str(e)}")
                results.append(False)
                
        return results

    def run_all_tests(self):
        """Run all comprehensive tests"""
        self.log("🚀 Starting MintU Comprehensive Backend Testing...")
        self.log(f"📍 Testing against: {BASE_URL}")
        
        # Authentication flow
        if not self.send_otp():
            self.log("❌ Cannot proceed without OTP send", "CRITICAL")
            return False
            
        if not self.verify_otp():
            self.log("❌ Cannot proceed without authentication", "CRITICAL")
            return False
            
        # Core tests
        self.test_user_me()
        self.test_upi_save()
        
        # Split functionality tests
        self.test_split_groups()
        self.test_create_split_group()
        self.test_split_balances()
        
        # NEW Settlement Gamification tests
        self.test_settlement_with_rewards()
        self.test_settlement_leaderboard()
        self.test_redeem_coins()
        
        # NEW Money School AI tests
        self.test_money_school_personalized()
        self.test_money_school_cards()
        self.test_money_school_complete()
        
        # NEW Split Features tests
        self.test_recurring_expenses()
        self.test_group_summary()
        
        # Existing endpoints verification
        self.test_existing_endpoints()
        
        # Summary
        self.log("\n" + "="*60)
        self.log("📊 COMPREHENSIVE TEST SUMMARY")
        self.log("="*60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        self.log(f"🎯 OVERALL: {passed}/{total} tests passed ({(passed/total)*100:.1f}%)")
        
        # Show failed tests
        failed_tests = [result for result in self.test_results if not result["success"]]
        if failed_tests:
            self.log("\n❌ FAILED TESTS:")
            for test in failed_tests:
                self.log(f"  - {test['test']}: {test['details']}")
        
        if passed == total:
            self.log("🎉 ALL TESTS PASSED! MintU backend is working perfectly!", "SUCCESS")
        else:
            self.log(f"⚠️ {total - passed} tests failed. Review issues above.", "WARNING")
            
        return passed == total

if __name__ == "__main__":
    tester = MintUComprehensiveTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)