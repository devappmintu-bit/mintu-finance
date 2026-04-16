#!/usr/bin/env python3
"""
MintU Backend API Testing - UX Overhaul New Endpoints
Tests the new avatar and card-of-the-day endpoints plus verifies existing endpoints still work
"""

import requests
import json
import base64
from datetime import datetime

# Configuration
BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"

class MintUTester:
    def __init__(self):
        self.token = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'MintU-Test/1.0'
        })
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def send_otp(self):
        """Send OTP to test phone number"""
        self.log("🔐 Testing OTP Send...")
        try:
            response = self.session.post(f"{BASE_URL}/auth/send-otp", 
                                       json={"phone": TEST_PHONE})
            
            if response.status_code == 200:
                self.log("✅ OTP sent successfully", "PASS")
                return True
            else:
                self.log(f"❌ OTP send failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ OTP send error: {str(e)}", "ERROR")
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
                    return True
                else:
                    self.log("❌ No token in response", "FAIL")
                    return False
            else:
                self.log(f"❌ OTP verification failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ OTP verification error: {str(e)}", "ERROR")
            return False
            
    def test_upload_avatar(self):
        """Test POST /api/user/avatar - Upload profile photo"""
        self.log("📸 Testing Avatar Upload...")
        try:
            # Create a small test base64 image (1x1 pixel PNG)
            test_image_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
            
            response = self.session.post(f"{BASE_URL}/user/avatar",
                                       json={"avatar": test_image_b64})
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "updated" in data["message"].lower():
                    self.log("✅ Avatar uploaded successfully", "PASS")
                    return True
                else:
                    self.log(f"❌ Unexpected response: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Avatar upload failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Avatar upload error: {str(e)}", "ERROR")
            return False
            
    def test_get_avatar(self):
        """Test GET /api/user/avatar - Retrieve avatar"""
        self.log("🖼️ Testing Avatar Retrieval...")
        try:
            response = self.session.get(f"{BASE_URL}/user/avatar")
            
            if response.status_code == 200:
                data = response.json()
                if "avatar" in data and "name" in data:
                    avatar_data = data.get("avatar", "")
                    user_name = data.get("name", "")
                    self.log(f"✅ Avatar retrieved - Name: {user_name}, Avatar length: {len(avatar_data)} chars", "PASS")
                    return True
                else:
                    self.log(f"❌ Missing avatar/name fields: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Avatar retrieval failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Avatar retrieval error: {str(e)}", "ERROR")
            return False
            
    def test_card_of_the_day(self):
        """Test GET /api/card-of-the-day - Daily motivational card"""
        self.log("🃏 Testing Card of the Day...")
        try:
            response = self.session.get(f"{BASE_URL}/card-of-the-day")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["type", "emoji", "title", "text", "color", "app_link"]
                
                if all(field in data for field in required_fields):
                    self.log(f"✅ Card of the Day - Type: {data['type']}, Title: {data['title']}", "PASS")
                    return True
                else:
                    missing = [f for f in required_fields if f not in data]
                    self.log(f"❌ Missing fields: {missing}", "FAIL")
                    return False
            else:
                self.log(f"❌ Card of the Day failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Card of the Day error: {str(e)}", "ERROR")
            return False
            
    def test_card_of_the_day_refresh(self):
        """Test GET /api/card-of-the-day?refresh=true - Random card"""
        self.log("🔄 Testing Card of the Day Refresh...")
        try:
            response = self.session.get(f"{BASE_URL}/card-of-the-day?refresh=true")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["type", "emoji", "title", "text", "color", "app_link"]
                
                if all(field in data for field in required_fields):
                    self.log(f"✅ Card Refresh - Type: {data['type']}, Title: {data['title']}", "PASS")
                    return True
                else:
                    missing = [f for f in required_fields if f not in data]
                    self.log(f"❌ Missing fields: {missing}", "FAIL")
                    return False
            else:
                self.log(f"❌ Card refresh failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Card refresh error: {str(e)}", "ERROR")
            return False
            
    def test_existing_endpoints(self):
        """Test existing endpoints to ensure they still work"""
        endpoints = [
            ("GET", "/leaderboard/savings", "Savings Leaderboard"),
            ("GET", "/gamification/status", "Gamification Status"),
            ("GET", "/alerts/smart", "Smart Alerts"),
            ("GET", "/reports/weekly", "Weekly Report"),
            ("GET", "/waste-detector", "Waste Detector"),
            ("GET", "/share/stats-card", "Shareable Stats Card"),
            ("GET", "/money-school/daily?lang=hi", "Money School Daily (Hindi)"),
        ]
        
        results = []
        for method, endpoint, name in endpoints:
            self.log(f"🔍 Testing {name}...")
            try:
                if method == "GET":
                    response = self.session.get(f"{BASE_URL}{endpoint}")
                else:
                    response = self.session.post(f"{BASE_URL}{endpoint}")
                    
                if response.status_code == 200:
                    data = response.json()
                    self.log(f"✅ {name} working", "PASS")
                    
                    # Special check for stats-card app download link
                    if "stats-card" in endpoint:
                        if "whatsapp_text" in data or "instagram_caption" in data:
                            text_content = data.get("whatsapp_text", "") + data.get("instagram_caption", "")
                            if "mintu.app" in text_content.lower() or "download" in text_content.lower():
                                self.log("✅ Stats card contains app download link", "PASS")
                            else:
                                self.log("⚠️ Stats card missing app download link", "WARN")
                    
                    results.append(True)
                else:
                    self.log(f"❌ {name} failed: {response.status_code}", "FAIL")
                    results.append(False)
            except Exception as e:
                self.log(f"❌ {name} error: {str(e)}", "ERROR")
                results.append(False)
                
        return results
        
    def test_ai_chat(self):
        """Test POST /api/ai/chat with Hindi language"""
        self.log("🤖 Testing AI Chat...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/chat",
                                       json={"message": "मैं कैसे पैसे बचा सकता हूं?", "lang": "hi"})
            
            if response.status_code == 200:
                data = response.json()
                # Check for either "response" or "reply" field
                response_text = data.get("response", data.get("reply", ""))
                if response_text and len(response_text) > 10:
                    self.log(f"✅ AI Chat working - Response length: {len(response_text)} chars", "PASS")
                    return True
                else:
                    self.log(f"❌ AI Chat response too short or missing: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ AI Chat failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ AI Chat error: {str(e)}", "ERROR")
            return False
            
    def run_all_tests(self):
        """Run all tests in sequence"""
        self.log("🚀 Starting MintU UX Overhaul Backend Testing...")
        self.log(f"📍 Testing against: {BASE_URL}")
        
        # Authentication flow
        if not self.send_otp():
            self.log("❌ Cannot proceed without OTP send", "CRITICAL")
            return False
            
        if not self.verify_otp():
            self.log("❌ Cannot proceed without authentication", "CRITICAL")
            return False
            
        # Test new endpoints
        new_endpoint_results = []
        new_endpoint_results.append(self.test_upload_avatar())
        new_endpoint_results.append(self.test_get_avatar())
        new_endpoint_results.append(self.test_card_of_the_day())
        new_endpoint_results.append(self.test_card_of_the_day_refresh())
        
        # Test existing endpoints
        existing_results = self.test_existing_endpoints()
        
        # Test AI chat
        ai_result = self.test_ai_chat()
        
        # Summary
        self.log("\n" + "="*60)
        self.log("📊 TEST SUMMARY")
        self.log("="*60)
        
        new_passed = sum(new_endpoint_results)
        new_total = len(new_endpoint_results)
        existing_passed = sum(existing_results)
        existing_total = len(existing_results)
        
        self.log(f"🆕 NEW Endpoints: {new_passed}/{new_total} passed")
        self.log(f"🔄 EXISTING Endpoints: {existing_passed}/{existing_total} passed")
        self.log(f"🤖 AI Chat: {'✅ PASS' if ai_result else '❌ FAIL'}")
        
        total_passed = new_passed + existing_passed + (1 if ai_result else 0)
        total_tests = new_total + existing_total + 1
        
        self.log(f"🎯 OVERALL: {total_passed}/{total_tests} tests passed ({(total_passed/total_tests)*100:.1f}%)")
        
        if total_passed == total_tests:
            self.log("🎉 ALL TESTS PASSED! UX Overhaul backend is working perfectly!", "SUCCESS")
        else:
            self.log(f"⚠️ {total_tests - total_passed} tests failed. Review issues above.", "WARNING")
            
        return total_passed == total_tests

if __name__ == "__main__":
    tester = MintUTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)