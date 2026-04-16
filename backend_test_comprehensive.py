#!/usr/bin/env python3
"""
MintU Backend API Testing - COMPREHENSIVE UPI + AGENTIC AI SYSTEM
Tests the NEW UPI Payment Integration and 5-Agent AI System plus verifies existing endpoints
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
        self.user_id = None
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
                    # Extract user_id from token for later use
                    import jwt
                    try:
                        payload = jwt.decode(self.token, options={"verify_signature": False})
                        self.user_id = payload.get("user_id")
                        self.log(f"✅ OTP verified, token received, user_id: {self.user_id}", "PASS")
                    except:
                        self.log("✅ OTP verified, token received (couldn't extract user_id)", "PASS")
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

    # ============== NEW FEATURE 1: UPI PAYMENT INTEGRATION ==============
    
    def test_save_upi_id(self):
        """Test POST /api/user/upi - Save UPI ID"""
        self.log("💳 Testing UPI ID Save...")
        try:
            response = self.session.post(f"{BASE_URL}/user/upi",
                                       json={"upi_id": "testuser@okicici"})
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "upi_id" in data:
                    self.log(f"✅ UPI ID saved - Masked: {data.get('upi_id', 'N/A')}", "PASS")
                    return True
                else:
                    self.log(f"❌ Unexpected response: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ UPI ID save failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ UPI ID save error: {str(e)}", "ERROR")
            return False
    
    def test_get_upi_id(self):
        """Test GET /api/user/upi - Retrieve UPI ID"""
        self.log("🔍 Testing UPI ID Retrieval...")
        try:
            response = self.session.get(f"{BASE_URL}/user/upi")
            
            if response.status_code == 200:
                data = response.json()
                if "upi_id" in data and "masked" in data:
                    self.log(f"✅ UPI ID retrieved - Full: {data.get('upi_id', 'N/A')}, Masked: {data.get('masked', 'N/A')}", "PASS")
                    return True
                else:
                    self.log(f"❌ Missing UPI fields: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ UPI ID retrieval failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ UPI ID retrieval error: {str(e)}", "ERROR")
            return False
    
    def test_invalid_upi_validation(self):
        """Test POST /api/user/upi with invalid UPI ID"""
        self.log("❌ Testing Invalid UPI Validation...")
        try:
            response = self.session.post(f"{BASE_URL}/user/upi",
                                       json={"upi_id": "invalid"})
            
            if response.status_code == 400:
                self.log("✅ Invalid UPI ID rejected correctly", "PASS")
                return True
            else:
                self.log(f"❌ Invalid UPI should be rejected: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ UPI validation error: {str(e)}", "ERROR")
            return False
    
    def test_upi_pay_intent(self):
        """Test GET /api/split/pay-intent/{user_id}?amount=500 - Generate UPI deep link"""
        self.log("🔗 Testing UPI Pay Intent Generation...")
        try:
            if not self.user_id:
                self.log("❌ No user_id available for pay intent test", "FAIL")
                return False
                
            response = self.session.get(f"{BASE_URL}/split/pay-intent/{self.user_id}?amount=500")
            
            if response.status_code == 200:
                data = response.json()
                if "upi_link" in data and "payee_upi" in data:
                    upi_link = data.get("upi_link", "")
                    if upi_link.startswith("upi://pay"):
                        self.log(f"✅ UPI pay intent generated - Payee: {data.get('payee_upi', 'N/A')}", "PASS")
                        return True
                    else:
                        self.log(f"❌ Invalid UPI link format: {upi_link}", "FAIL")
                        return False
                else:
                    self.log(f"❌ Missing UPI link fields: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ UPI pay intent failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ UPI pay intent error: {str(e)}", "ERROR")
            return False
    
    def test_settle_payment(self):
        """Test POST /api/split/settle - Mark payment settled"""
        self.log("💰 Testing Payment Settlement...")
        try:
            if not self.user_id:
                self.log("❌ No user_id available for settlement test", "FAIL")
                return False
                
            response = self.session.post(f"{BASE_URL}/split/settle",
                                       json={
                                           "target_user_id": self.user_id,
                                           "amount": 500,
                                           "method": "upi"
                                       })
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log(f"✅ Payment settled - {data.get('message', 'N/A')}", "PASS")
                    return True
                else:
                    self.log(f"❌ Unexpected settlement response: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Payment settlement failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Payment settlement error: {str(e)}", "ERROR")
            return False
    
    def test_settlement_history(self):
        """Test GET /api/split/settlements - Get settlement history"""
        self.log("📜 Testing Settlement History...")
        try:
            response = self.session.get(f"{BASE_URL}/split/settlements")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Settlement history retrieved - {len(data)} settlements", "PASS")
                    return True
                elif isinstance(data, dict) and "settlements" in data:
                    settlements = data["settlements"]
                    self.log(f"✅ Settlement history retrieved - {len(settlements)} settlements", "PASS")
                    return True
                else:
                    self.log(f"❌ Unexpected history format: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Settlement history failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Settlement history error: {str(e)}", "ERROR")
            return False

    # ============== NEW FEATURE 2: AGENTIC AI SYSTEM (5 AGENTS) ==============
    
    def test_agent_chat_expense_tracker(self):
        """Test POST /api/ai/agent-chat - Route to expense_tracker agent"""
        self.log("🤖 Testing Agent Chat - Expense Tracker...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Where did I overspend?"})
            
            if response.status_code == 200:
                data = response.json()
                if "reply" in data and "agent" in data:
                    agent_info = data["agent"]
                    expected_agents = ["expense_tracker", "budget_manager"]  # Could route to either
                    if agent_info.get("id") in expected_agents:
                        self.log(f"✅ Expense query routed to {agent_info.get('name', 'N/A')} agent", "PASS")
                        return True
                    else:
                        self.log(f"❌ Unexpected agent routing: {agent_info}", "FAIL")
                        return False
                else:
                    self.log(f"❌ Missing response/agent fields: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Agent chat failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Agent chat error: {str(e)}", "ERROR")
            return False
    
    def test_agent_chat_budget_manager(self):
        """Test POST /api/ai/agent-chat - Route to budget_manager agent"""
        self.log("📊 Testing Agent Chat - Budget Manager...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Set a food budget for me"})
            
            if response.status_code == 200:
                data = response.json()
                if "reply" in data and "agent" in data:
                    agent_info = data["agent"]
                    if agent_info.get("id") == "budget_manager":
                        self.log(f"✅ Budget query routed to {agent_info.get('name', 'N/A')} agent", "PASS")
                        return True
                    else:
                        self.log(f"❌ Expected budget_manager, got: {agent_info}", "FAIL")
                        return False
                else:
                    self.log(f"❌ Missing response/agent fields: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Agent chat failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Agent chat error: {str(e)}", "ERROR")
            return False
    
    def test_agent_chat_split_manager(self):
        """Test POST /api/ai/agent-chat - Route to split_manager agent"""
        self.log("💸 Testing Agent Chat - Split Manager...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Who owes me money?"})
            
            if response.status_code == 200:
                data = response.json()
                if "reply" in data and "agent" in data:
                    agent_info = data["agent"]
                    if agent_info.get("id") == "split_manager":
                        self.log(f"✅ Split query routed to {agent_info.get('name', 'N/A')} agent", "PASS")
                        return True
                    else:
                        self.log(f"❌ Expected split_manager, got: {agent_info}", "FAIL")
                        return False
                else:
                    self.log(f"❌ Missing response/agent fields: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Agent chat failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Agent chat error: {str(e)}", "ERROR")
            return False
    
    def test_agent_chat_insights_agent(self):
        """Test POST /api/ai/agent-chat - Route to insights_agent"""
        self.log("📈 Testing Agent Chat - Insights Agent...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "Show me my weekly spending report"})
            
            if response.status_code == 200:
                data = response.json()
                if "reply" in data and "agent" in data:
                    agent_info = data["agent"]
                    if agent_info.get("id") == "insights_agent":
                        self.log(f"✅ Insights query routed to {agent_info.get('name', 'N/A')} agent", "PASS")
                        return True
                    else:
                        self.log(f"❌ Expected insights_agent, got: {agent_info}", "FAIL")
                        return False
                else:
                    self.log(f"❌ Missing response/agent fields: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Agent chat failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Agent chat error: {str(e)}", "ERROR")
            return False
    
    def test_agent_chat_market_intel(self):
        """Test POST /api/ai/agent-chat - Route to market_intel agent"""
        self.log("🛒 Testing Agent Chat - Market Intelligence...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/agent-chat",
                                       json={"message": "How to save on Netflix subscription?"})
            
            if response.status_code == 200:
                data = response.json()
                if "reply" in data and "agent" in data:
                    agent_info = data["agent"]
                    if agent_info.get("id") == "market_intel":
                        self.log(f"✅ Market query routed to {agent_info.get('name', 'N/A')} agent", "PASS")
                        return True
                    else:
                        self.log(f"❌ Expected market_intel, got: {agent_info}", "FAIL")
                        return False
                else:
                    self.log(f"❌ Missing response/agent fields: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Agent chat failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Agent chat error: {str(e)}", "ERROR")
            return False
    
    def test_proactive_nudges(self):
        """Test GET /api/ai/proactive-nudges - Get proactive AI nudges"""
        self.log("🔔 Testing Proactive AI Nudges...")
        try:
            response = self.session.get(f"{BASE_URL}/ai/proactive-nudges")
            
            if response.status_code == 200:
                data = response.json()
                if "nudges" in data:
                    nudges = data["nudges"]
                    self.log(f"✅ Proactive nudges retrieved - {len(nudges)} nudges", "PASS")
                    return True
                elif isinstance(data, list):
                    self.log(f"✅ Proactive nudges retrieved - {len(data)} nudges", "PASS")
                    return True
                else:
                    self.log(f"❌ Unexpected nudges format: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ Proactive nudges failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ Proactive nudges error: {str(e)}", "ERROR")
            return False
    
    def test_save_agent_memory(self):
        """Test POST /api/ai/memory - Save AI memory"""
        self.log("🧠 Testing AI Memory Save...")
        try:
            response = self.session.post(f"{BASE_URL}/ai/memory",
                                       json={
                                           "preferences": {"risk": "low"},
                                           "habits": ["eats out often"]
                                       })
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log(f"✅ AI memory saved - {data.get('message', 'N/A')}", "PASS")
                    return True
                else:
                    self.log(f"❌ Unexpected memory response: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ AI memory save failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ AI memory save error: {str(e)}", "ERROR")
            return False
    
    def test_list_agents(self):
        """Test GET /api/ai/agents - List all 5 agents"""
        self.log("📋 Testing List All Agents...")
        try:
            response = self.session.get(f"{BASE_URL}/ai/agents")
            
            if response.status_code == 200:
                data = response.json()
                if "agents" in data:
                    agents = data["agents"]
                    if len(agents) == 5:
                        agent_names = [agent.get("name", "Unknown") for agent in agents]
                        self.log(f"✅ All 5 agents listed: {', '.join(agent_names)}", "PASS")
                        return True
                    else:
                        self.log(f"❌ Expected 5 agents, got {len(agents)}", "FAIL")
                        return False
                else:
                    self.log(f"❌ Missing agents field: {data}", "FAIL")
                    return False
            else:
                self.log(f"❌ List agents failed: {response.status_code} - {response.text}", "FAIL")
                return False
        except Exception as e:
            self.log(f"❌ List agents error: {str(e)}", "ERROR")
            return False

    # ============== EXISTING ENDPOINTS VERIFICATION ==============
    
    def test_existing_endpoints(self):
        """Test existing endpoints to ensure they still work"""
        endpoints = [
            ("GET", "/user/me", "User Profile"),
            ("GET", "/transactions", "Transactions List"),
            ("GET", "/budgets", "Budgets List"),
            ("GET", "/stats/overview", "Stats Overview"),
            ("GET", "/leaderboard/savings", "Savings Leaderboard"),
            ("GET", "/waste-detector", "Waste Detector"),
            ("GET", "/alerts/smart", "Smart Alerts"),
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
                    self.log(f"✅ {name} working", "PASS")
                    results.append(True)
                else:
                    self.log(f"❌ {name} failed: {response.status_code}", "FAIL")
                    results.append(False)
            except Exception as e:
                self.log(f"❌ {name} error: {str(e)}", "ERROR")
                results.append(False)
                
        return results

    def run_all_tests(self):
        """Run all tests in sequence"""
        self.log("🚀 Starting MintU COMPREHENSIVE Backend Testing...")
        self.log(f"📍 Testing against: {BASE_URL}")
        self.log("🎯 Focus: UPI Payment Integration + 5-Agent AI System")
        
        # Authentication flow
        if not self.send_otp():
            self.log("❌ Cannot proceed without OTP send", "CRITICAL")
            return False
            
        if not self.verify_otp():
            self.log("❌ Cannot proceed without authentication", "CRITICAL")
            return False
        
        # Test NEW FEATURE 1: UPI Payment Integration
        self.log("\n" + "="*60)
        self.log("🆕 TESTING UPI PAYMENT INTEGRATION")
        self.log("="*60)
        
        upi_results = []
        upi_results.append(self.test_save_upi_id())
        upi_results.append(self.test_get_upi_id())
        upi_results.append(self.test_invalid_upi_validation())
        upi_results.append(self.test_upi_pay_intent())
        upi_results.append(self.test_settle_payment())
        upi_results.append(self.test_settlement_history())
        
        # Test NEW FEATURE 2: Agentic AI System
        self.log("\n" + "="*60)
        self.log("🤖 TESTING AGENTIC AI SYSTEM (5 AGENTS)")
        self.log("="*60)
        
        ai_results = []
        ai_results.append(self.test_agent_chat_expense_tracker())
        ai_results.append(self.test_agent_chat_budget_manager())
        ai_results.append(self.test_agent_chat_split_manager())
        ai_results.append(self.test_agent_chat_insights_agent())
        ai_results.append(self.test_agent_chat_market_intel())
        ai_results.append(self.test_proactive_nudges())
        ai_results.append(self.test_save_agent_memory())
        ai_results.append(self.test_list_agents())
        
        # Test existing endpoints
        self.log("\n" + "="*60)
        self.log("🔄 TESTING EXISTING ENDPOINTS")
        self.log("="*60)
        
        existing_results = self.test_existing_endpoints()
        
        # Summary
        self.log("\n" + "="*80)
        self.log("📊 COMPREHENSIVE TEST SUMMARY")
        self.log("="*80)
        
        upi_passed = sum(upi_results)
        upi_total = len(upi_results)
        ai_passed = sum(ai_results)
        ai_total = len(ai_results)
        existing_passed = sum(existing_results)
        existing_total = len(existing_results)
        
        self.log(f"💳 UPI PAYMENT INTEGRATION: {upi_passed}/{upi_total} passed ({(upi_passed/upi_total)*100:.1f}%)")
        self.log(f"🤖 AGENTIC AI SYSTEM: {ai_passed}/{ai_total} passed ({(ai_passed/ai_total)*100:.1f}%)")
        self.log(f"🔄 EXISTING ENDPOINTS: {existing_passed}/{existing_total} passed ({(existing_passed/existing_total)*100:.1f}%)")
        
        total_passed = upi_passed + ai_passed + existing_passed
        total_tests = upi_total + ai_total + existing_total
        
        self.log(f"🎯 OVERALL: {total_passed}/{total_tests} tests passed ({(total_passed/total_tests)*100:.1f}%)")
        
        if total_passed == total_tests:
            self.log("🎉 ALL TESTS PASSED! UPI + Agentic AI backend is working perfectly!", "SUCCESS")
        else:
            failed_tests = total_tests - total_passed
            self.log(f"⚠️ {failed_tests} tests failed. Review issues above.", "WARNING")
            
            # Detailed failure breakdown
            if upi_passed < upi_total:
                self.log(f"❌ UPI Integration: {upi_total - upi_passed} failures", "FAIL")
            if ai_passed < ai_total:
                self.log(f"❌ Agentic AI System: {ai_total - ai_passed} failures", "FAIL")
            if existing_passed < existing_total:
                self.log(f"❌ Existing Endpoints: {existing_total - existing_passed} failures", "FAIL")
            
        return total_passed == total_tests

if __name__ == "__main__":
    tester = MintUComprehensiveTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)