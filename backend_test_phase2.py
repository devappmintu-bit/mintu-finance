#!/usr/bin/env python3
"""
MintU Backend API Testing - Phase 2 Leaderboard & Referral
Tests Phase 2 endpoints: Leaderboard, Friend Comparison, Enhanced Referral
Plus verification of existing endpoints
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

class MintUPhase2Tester:
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
        """Create some test transactions and split groups for meaningful responses"""
        print("\n📊 SETTING UP TEST DATA FOR PHASE 2")
        
        # Create sample transactions for better leaderboard data
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
        
        # Create a test split group for friend comparison
        split_group_response = await self.make_request("POST", "/split/groups", {
            "name": "Test Friends Group",
            "description": "Testing friend comparison"
        })
        if split_group_response:
            print("✅ Created test split group for friend comparison")
    
    async def test_savings_leaderboard(self):
        """Test Phase 2: Savings Leaderboard endpoint"""
        print("\n🏆 TESTING SAVINGS LEADERBOARD")
        
        response = await self.make_request("GET", "/leaderboard/savings")
        
        if not response:
            print("❌ Savings Leaderboard failed")
            return False
        
        print(f"✅ User rank: {response.get('user_rank', 'N/A')}")
        print(f"📊 Total users: {response.get('total_users', 0)}")
        print(f"📈 Percentile: {response.get('percentile', 0)}%")
        print(f"💰 User score: {response.get('user_score', 0)}/100")
        print(f"💎 Monthly saved: ₹{response.get('monthly_saved', 0)}")
        print(f"💬 Comparison text: {response.get('comparison_text', '')}")
        
        top_10 = response.get('top_10', [])
        print(f"🏅 Top 10 leaderboard: {len(top_10)} users")
        for i, user in enumerate(top_10[:3]):  # Show top 3
            print(f"  {user.get('rank', i+1)}. {user.get('name', 'User')} - Score: {user.get('score', 0)}")
        
        motivations = response.get('motivations', [])
        print(f"🎯 Motivations: {len(motivations)} messages")
        for motivation in motivations[:2]:
            if motivation.strip():
                print(f"  • {motivation}")
        
        return True
    
    async def test_friend_comparison(self):
        """Test Phase 2: Friend Comparison endpoint"""
        print("\n👥 TESTING FRIEND COMPARISON")
        
        response = await self.make_request("GET", "/leaderboard/friends")
        
        if not response:
            print("❌ Friend Comparison failed")
            return False
        
        you = response.get('you', {})
        print(f"✅ Your data: {you.get('name', 'You')} - Score: {you.get('score', 0)}")
        
        friends = response.get('friends', [])
        print(f"👥 Friends found: {len(friends)}")
        
        if friends:
            for i, friend in enumerate(friends[:3]):  # Show first 3 friends
                print(f"  {i+1}. {friend.get('name', 'Friend')} - Score: {friend.get('score', 0)}")
                print(f"     Diff: {friend.get('diff', 0)}, Ahead: {friend.get('ahead', False)}")
                print(f"     Taunt: {friend.get('taunt', '')}")
        else:
            print("📝 No friends found - this is expected for new users")
        
        print(f"📊 Summary: {response.get('summary', '')}")
        print(f"🎯 Challenge text: {response.get('challenge_text', '')[:100]}...")
        
        return True
    
    async def test_enhanced_referral_status(self):
        """Test Phase 2: Enhanced Referral Status endpoint"""
        print("\n🎁 TESTING ENHANCED REFERRAL STATUS")
        
        response = await self.make_request("GET", "/referral/enhanced-status")
        
        if not response:
            print("❌ Enhanced Referral Status failed")
            return False
        
        print(f"✅ Referral code: {response.get('referral_code', '')}")
        print(f"👥 Referral count: {response.get('referral_count', 0)}")
        print(f"⭐ Total Pro days earned: {response.get('total_pro_days_earned', 0)}")
        
        reward_tiers = response.get('reward_tiers', [])
        print(f"🏆 Reward tiers: {len(reward_tiers)} tiers")
        for tier in reward_tiers:
            status = "✅" if tier.get('unlocked', False) else "🔒"
            print(f"  {status} {tier.get('friends', 0)} friends → {tier.get('reward', '')}")
        
        next_milestone = response.get('next_milestone', {})
        print(f"🎯 Next milestone: {next_milestone.get('friends_needed', 0)} friends needed for {next_milestone.get('reward', '')}")
        
        recent_referrals = response.get('recent_referrals', [])
        print(f"📅 Recent referrals: {len(recent_referrals)} recent")
        
        print(f"📱 Share text: {response.get('share_text', '')[:100]}...")
        print(f"💬 WhatsApp text: {response.get('whatsapp_text', '')[:100]}...")
        
        return True
    
    async def test_existing_referral_my_code(self):
        """Test existing referral/my-code endpoint"""
        print("\n🔗 TESTING EXISTING REFERRAL/MY-CODE")
        
        response = await self.make_request("GET", "/referral/my-code")
        
        if not response:
            print("❌ Referral My Code failed")
            return False
        
        print(f"✅ Referral code: {response.get('referral_code', '')}")
        print(f"👥 Referral count: {response.get('referral_count', 0)}")
        print(f"🏆 Tier: {response.get('tier', '')}")
        print(f"💰 Rewards earned: ₹{response.get('rewards_earned', 0)}")
        
        return True
    
    async def test_existing_gamification_status(self):
        """Test existing gamification/status endpoint"""
        print("\n🎮 TESTING EXISTING GAMIFICATION/STATUS")
        
        response = await self.make_request("GET", "/gamification/status")
        
        if not response:
            print("❌ Gamification Status failed")
            return False
        
        print(f"✅ Level: {response.get('level', 0)}")
        print(f"⭐ XP: {response.get('xp', 0)}")
        print(f"🏆 Badges: {len(response.get('badges', []))}")
        print(f"🔥 Streak: {response.get('streak_days', 0)} days")
        print(f"📊 Money Score: {response.get('money_score', 0)}/100")
        
        achievements = response.get('achievements', [])
        print(f"🎯 Achievements: {len(achievements)} unlocked")
        for achievement in achievements[:3]:  # Show first 3
            print(f"  • {achievement.get('title', '')} - {achievement.get('description', '')}")
        
        return True
    
    async def test_existing_waste_detector(self):
        """Test existing waste-detector endpoint"""
        print("\n💸 TESTING EXISTING WASTE DETECTOR")
        
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
    
    async def test_existing_smart_alerts(self):
        """Test existing alerts/smart endpoint"""
        print("\n🚨 TESTING EXISTING SMART ALERTS")
        
        response = await self.make_request("GET", "/alerts/smart")
        
        if not response:
            print("❌ Smart Alerts failed")
            return False
        
        alerts = response.get("alerts", [])
        print(f"✅ Found {len(alerts)} smart alerts")
        
        for i, alert in enumerate(alerts[:3]):  # Show first 3
            print(f"  {i+1}. {alert.get('emoji', '')} {alert.get('title', '')}")
            print(f"     {alert.get('message', '')}")
            print(f"     Type: {alert.get('type', '')}, Severity: {alert.get('severity', '')}")
        
        return True
    
    async def run_all_tests(self):
        """Run all Phase 2 tests"""
        print("🚀 STARTING MINTU PHASE 2 LEADERBOARD & REFERRAL TESTS")
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
        
        # Test Phase 2 NEW endpoints
        print("\n" + "="*60)
        print("🆕 PHASE 2 NEW ENDPOINTS")
        print("="*60)
        results["savings_leaderboard"] = await self.test_savings_leaderboard()
        results["friend_comparison"] = await self.test_friend_comparison()
        results["enhanced_referral_status"] = await self.test_enhanced_referral_status()
        
        # Test existing endpoints to ensure they still work
        print("\n" + "="*60)
        print("✅ EXISTING ENDPOINTS VERIFICATION")
        print("="*60)
        results["existing_referral_my_code"] = await self.test_existing_referral_my_code()
        results["existing_gamification_status"] = await self.test_existing_gamification_status()
        results["existing_waste_detector"] = await self.test_existing_waste_detector()
        results["existing_smart_alerts"] = await self.test_existing_smart_alerts()
        
        # Print summary
        print("\n" + "="*60)
        print("📋 PHASE 2 TEST SUMMARY")
        print("="*60)
        
        passed = 0
        total = len(results)
        
        # Separate Phase 2 new vs existing
        phase2_new = ["savings_leaderboard", "friend_comparison", "enhanced_referral_status"]
        existing = ["existing_referral_my_code", "existing_gamification_status", "existing_waste_detector", "existing_smart_alerts"]
        
        print("\n🆕 PHASE 2 NEW ENDPOINTS:")
        for test_name in phase2_new:
            if test_name in results:
                status = "✅ PASS" if results[test_name] else "❌ FAIL"
                print(f"  {status} {test_name.replace('_', ' ').title()}")
                if results[test_name]:
                    passed += 1
        
        print("\n✅ EXISTING ENDPOINTS:")
        for test_name in existing:
            if test_name in results:
                status = "✅ PASS" if results[test_name] else "❌ FAIL"
                print(f"  {status} {test_name.replace('existing_', '').replace('_', ' ').title()}")
                if results[test_name]:
                    passed += 1
        
        # Auth flow
        if "auth_flow" in results:
            status = "✅ PASS" if results["auth_flow"] else "❌ FAIL"
            print(f"\n🔐 AUTHENTICATION: {status}")
            if results["auth_flow"]:
                passed += 1
        
        print(f"\n🎯 OVERALL: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
        
        if passed == total:
            print("🎉 ALL PHASE 2 ENDPOINTS WORKING!")
        else:
            print("⚠️  Some endpoints need attention")
        
        return results

async def main():
    """Main test runner"""
    async with MintUPhase2Tester() as tester:
        results = await tester.run_all_tests()
        
        # Exit with appropriate code
        all_passed = all(results.values())
        sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    asyncio.run(main())