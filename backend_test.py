#!/usr/bin/env python3
"""
MintU Backend API Testing - Phase 1 Retention Engine
Tests all new retention engine endpoints with real authentication flow
"""

import asyncio
import aiohttp
import json
import sys
from datetime import datetime, timedelta

# Backend URL from frontend .env
BACKEND_URL = "https://mintu-finance.preview.emergentagent.com/api"

# Test credentials from test_credentials.md
TEST_PHONE = "9876543210"
TEST_OTP = "123456"
TEST_NAME = "Test User"

class MintUTester:
    def __init__(self):
        self.session = None
        self.auth_token = None
        self.user_id = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def get_headers(self):
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        return headers
    
    async def make_request(self, method, endpoint, data=None, expect_status=200):
        """Make HTTP request with error handling"""
        url = f"{BACKEND_URL}{endpoint}"
        headers = self.get_headers()
        
        try:
            async with self.session.request(method, url, json=data, headers=headers) as response:
                response_text = await response.text()
                
                print(f"\n{method} {endpoint}")
                print(f"Status: {response.status}")
                print(f"Response: {response_text[:500]}...")
                
                if response.status != expect_status:
                    print(f"❌ Expected {expect_status}, got {response.status}")
                    return None
                
                try:
                    return await response.json() if response_text else {}
                except:
                    return {"raw_response": response_text}
                    
        except Exception as e:
            print(f"❌ Request failed: {str(e)}")
            return None
    
    async def test_auth_flow(self):
        """Test OTP authentication flow"""
        print("\n🔐 TESTING AUTHENTICATION FLOW")
        
        # Step 1: Send OTP
        print("\n1. Sending OTP...")
        otp_response = await self.make_request("POST", "/auth/send-otp", {
            "phone": TEST_PHONE
        })
        
        if not otp_response:
            print("❌ Failed to send OTP")
            return False
        
        print(f"✅ OTP sent successfully: {otp_response.get('message', '')}")
        
        # Step 2: Verify OTP
        print("\n2. Verifying OTP...")
        verify_response = await self.make_request("POST", "/auth/verify-otp", {
            "phone": TEST_PHONE,
            "otp": TEST_OTP,
            "name": TEST_NAME
        })
        
        if not verify_response or "token" not in verify_response:
            print("❌ Failed to verify OTP")
            return False
        
        self.auth_token = verify_response["token"]
        self.user_id = verify_response["user"]["id"]
        print(f"✅ Authentication successful! User ID: {self.user_id}")
        
        return True
    
    async def setup_test_data(self):
        """Create some test transactions for meaningful AI responses"""
        print("\n📊 SETTING UP TEST DATA")
        
        # Create sample transactions for better AI responses
        test_transactions = [
            {"amount": 500, "category": "Food", "description": "Swiggy order", "type": "debit"},
            {"amount": 200, "category": "Transport", "description": "Uber ride", "type": "debit"},
            {"amount": 1500, "category": "Shopping", "description": "Amazon purchase", "type": "debit"},
            {"amount": 300, "category": "Entertainment", "description": "Movie tickets", "type": "debit"},
            {"amount": 25000, "category": "Salary", "description": "Monthly salary", "type": "credit"},
            {"amount": 800, "category": "Bills", "description": "Electricity bill", "type": "debit"},
            {"amount": 1200, "category": "Groceries", "description": "D-Mart shopping", "type": "debit"},
        ]
        
        for txn in test_transactions:
            response = await self.make_request("POST", "/transactions", txn)
            if response:
                print(f"✅ Created transaction: {txn['description']} - ₹{txn['amount']}")
            else:
                print(f"❌ Failed to create transaction: {txn['description']}")
        
        # Create a test budget
        budget_response = await self.make_request("POST", "/budgets", {
            "category": "Food",
            "amount": 3000,
            "period": "monthly"
        })
        if budget_response:
            print("✅ Created test budget: Food ₹3000/month")
    
    async def test_ai_financial_coach(self):
        """Test AI Financial Coach endpoint"""
        print("\n🤖 TESTING AI FINANCIAL COACH")
        
        test_messages = [
            "How can I save more money?",
            "Am I overspending on food?",
            "What should I do with my salary this month?",
            "Help me reduce my expenses"
        ]
        
        for message in test_messages:
            print(f"\n💬 Testing message: '{message}'")
            response = await self.make_request("POST", "/ai/chat", {
                "message": message
            })
            
            if response and "reply" in response:
                print(f"✅ AI Response: {response['reply'][:200]}...")
                print(f"📊 Context used: {response.get('context_used', {})}")
            else:
                print("❌ AI Coach failed to respond")
                return False
        
        return True
    
    async def test_waste_detector(self):
        """Test Waste Detector endpoint"""
        print("\n💸 TESTING WASTE DETECTOR")
        
        response = await self.make_request("GET", "/waste-detector")
        
        if not response:
            print("❌ Waste Detector failed")
            return False
        
        print(f"✅ Total monthly expense: ₹{response.get('total_monthly_expense', 0)}")
        print(f"📊 Category waste insights: {len(response.get('category_waste', []))} categories")
        print(f"🎯 Overall equivalences: {len(response.get('overall_equivalences', []))} items")
        print(f"📈 Percentile: {response.get('comparison', {}).get('percentile', 0)}%")
        print(f"📱 Shareable text: {response.get('shareable_text', '')[:100]}...")
        
        return True
    
    async def test_weekly_report(self):
        """Test Weekly Report endpoint"""
        print("\n📅 TESTING WEEKLY REPORT")
        
        response = await self.make_request("GET", "/reports/weekly")
        
        if not response:
            print("❌ Weekly Report failed")
            return False
        
        print(f"✅ Period: {response.get('period', '')}")
        print(f"💰 Total spent: ₹{response.get('total_spent', 0)}")
        print(f"📊 Change from last week: {response.get('change_pct', 0)}%")
        print(f"😊 Mood: {response.get('mood', '')} - {response.get('mood_text', '')}")
        print(f"🏆 Top category: {response.get('top_category', {}).get('name', '')} - ₹{response.get('top_category', {}).get('amount', 0)}")
        print(f"🔥 Streak: {response.get('streak', 0)} days")
        print(f"📊 Money Score: {response.get('money_score', 0)}/100")
        print(f"📱 Shareable: {response.get('shareable_text', '')[:100]}...")
        
        return True
    
    async def test_smart_budget_suggestions(self):
        """Test Smart Budget Suggestions endpoint"""
        print("\n🎯 TESTING SMART BUDGET SUGGESTIONS")
        
        response = await self.make_request("GET", "/budgets/smart-suggest")
        
        if not response:
            print("❌ Smart Budget Suggestions failed")
            return False
        
        suggestions = response.get("suggestions", [])
        print(f"✅ Found {len(suggestions)} budget suggestions")
        print(f"💰 Total potential savings: ₹{response.get('total_potential_savings', 0)}")
        print(f"📝 Message: {response.get('message', '')}")
        
        for i, suggestion in enumerate(suggestions[:3]):  # Show first 3
            print(f"  {i+1}. {suggestion.get('category', '')}: ₹{suggestion.get('suggested_budget', 0)}/month")
            print(f"     Current avg: ₹{suggestion.get('current_monthly_avg', 0)}, Savings: ₹{suggestion.get('savings_potential', 0)}")
        
        return True
    
    async def test_auto_apply_budgets(self):
        """Test Auto Apply Budgets endpoint"""
        print("\n⚡ TESTING AUTO APPLY BUDGETS")
        
        response = await self.make_request("POST", "/budgets/auto-apply")
        
        if not response:
            print("❌ Auto Apply Budgets failed")
            return False
        
        print(f"✅ Applied {response.get('applied_count', 0)} budgets")
        print(f"📝 Message: {response.get('message', '')}")
        
        return True
    
    async def test_smart_alerts(self):
        """Test Smart Alerts endpoint"""
        print("\n🚨 TESTING SMART ALERTS")
        
        response = await self.make_request("GET", "/alerts/smart")
        
        if not response:
            print("❌ Smart Alerts failed")
            return False
        
        alerts = response.get("alerts", [])
        print(f"✅ Found {len(alerts)} smart alerts")
        
        for i, alert in enumerate(alerts):
            print(f"  {i+1}. {alert.get('emoji', '')} {alert.get('title', '')}")
            print(f"     {alert.get('message', '')}")
            print(f"     Type: {alert.get('type', '')}, Severity: {alert.get('severity', '')}")
        
        return True
    
    async def test_shareable_stats_card(self):
        """Test Shareable Stats Card endpoint"""
        print("\n📊 TESTING SHAREABLE STATS CARD")
        
        response = await self.make_request("GET", "/share/stats-card")
        
        if not response:
            print("❌ Shareable Stats Card failed")
            return False
        
        print(f"✅ Name: {response.get('name', '')}")
        print(f"📅 Month: {response.get('month', '')}")
        print(f"💰 Income: ₹{response.get('income', 0)}")
        print(f"💸 Expense: ₹{response.get('expense', 0)}")
        print(f"💎 Saved: ₹{response.get('saved', 0)}")
        print(f"📊 Money Score: {response.get('money_score', 0)}/100")
        print(f"🔥 Streak: {response.get('streak', 0)} days")
        print(f"📱 WhatsApp text: {response.get('whatsapp_text', '')[:100]}...")
        print(f"📸 Instagram caption: {response.get('instagram_caption', '')[:100]}...")
        
        return True
    
    async def run_all_tests(self):
        """Run all Phase 1 Retention Engine tests"""
        print("🚀 STARTING MINTU PHASE 1 RETENTION ENGINE TESTS")
        print(f"🌐 Backend URL: {BACKEND_URL}")
        print(f"📱 Test Phone: {TEST_PHONE}")
        
        results = {}
        
        # Authentication is required for all endpoints
        results["auth_flow"] = await self.test_auth_flow()
        if not results["auth_flow"]:
            print("❌ Authentication failed - cannot proceed with other tests")
            return results
        
        # Setup test data for meaningful responses
        await self.setup_test_data()
        
        # Test all Phase 1 Retention Engine endpoints
        results["ai_financial_coach"] = await self.test_ai_financial_coach()
        results["waste_detector"] = await self.test_waste_detector()
        results["weekly_report"] = await self.test_weekly_report()
        results["smart_budget_suggestions"] = await self.test_smart_budget_suggestions()
        results["auto_apply_budgets"] = await self.test_auto_apply_budgets()
        results["smart_alerts"] = await self.test_smart_alerts()
        results["shareable_stats_card"] = await self.test_shareable_stats_card()
        
        # Print summary
        print("\n" + "="*60)
        print("📋 TEST SUMMARY")
        print("="*60)
        
        passed = 0
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status} {test_name.replace('_', ' ').title()}")
            if result:
                passed += 1
        
        print(f"\n🎯 OVERALL: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
        
        if passed == total:
            print("🎉 ALL PHASE 1 RETENTION ENGINE ENDPOINTS WORKING!")
        else:
            print("⚠️  Some endpoints need attention")
        
        return results

async def main():
    """Main test runner"""
    async with MintUTester() as tester:
        results = await tester.run_all_tests()
        
        # Exit with appropriate code
        all_passed = all(results.values())
        sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    asyncio.run(main())