#!/usr/bin/env python3
"""
MintU Backend Group Chat Feature Test
Tests the NEW group chat functionality as specified in the review request
"""

import requests
import time
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

class GroupChatTestRunner:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.results = []
        self.test_group_id = None
        
    def log_result(self, endpoint, method, status_code, response_data, error=None):
        """Log test result"""
        result = {
            'endpoint': endpoint,
            'method': method,
            'status_code': status_code,
            'response_data': response_data,
            'timestamp': datetime.now().isoformat(),
            'error': error
        }
        self.results.append(result)
        
        # Real-time logging
        status_emoji = "✅" if status_code == 200 else "❌"
        print(f"{status_emoji} {method} {endpoint} - {status_code}")
        
        if error:
            print(f"   Error: {error}")
        elif status_code == 200:
            if isinstance(response_data, dict):
                if 'message' in response_data:
                    print(f"   Response: {response_data['message']}")
                elif 'id' in response_data:
                    print(f"   ID: {response_data['id']}")
            elif isinstance(response_data, list):
                print(f"   Count: {len(response_data)} items")
    
    def make_request(self, method, endpoint, data=None, headers=None):
        """Make HTTP request with error handling"""
        url = f"{BASE_URL}{endpoint}"
        
        if headers is None:
            headers = {}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        headers['Content-Type'] = 'application/json'
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            try:
                response_data = response.json()
            except:
                response_data = response.text
            
            self.log_result(endpoint, method, response.status_code, response_data)
            
            return response.status_code, response_data
            
        except Exception as e:
            self.log_result(endpoint, method, 0, None, str(e))
            return 0, str(e)
    
    def authenticate(self):
        """Perform authentication flow"""
        print("🔐 Starting Authentication Flow...")
        
        # Step 1: Send OTP
        status, data = self.make_request('POST', '/auth/send-otp', {'phone': PHONE})
        if status != 200:
            print(f"❌ Failed to send OTP: {data}")
            return False
        
        # Small delay for OTP processing
        time.sleep(0.5)
        
        # Step 2: Verify OTP
        status, data = self.make_request('POST', '/auth/verify-otp', {'phone': PHONE, 'otp': OTP})
        if status != 200:
            print(f"❌ Failed to verify OTP: {data}")
            return False
        
        if isinstance(data, dict) and 'token' in data:
            self.token = data['token']
            print(f"✅ Authentication successful! Token acquired.")
            return True
        else:
            print(f"❌ No token in response: {data}")
            return False
    
    def test_group_chat_feature(self):
        """Test the NEW group chat feature as specified in review request"""
        print("\n🚀 Testing NEW Group Chat Feature...")
        print("📋 Review Request Specification:")
        print("1. GET /api/split/groups - Get groups list, pick the first group ID")
        print("2. GET /api/split/groups/{group_id}/messages - Get chat messages (should return array, possibly empty)")
        print("3. POST /api/split/groups/{group_id}/messages {\"content\":\"Hello everyone! 👋\",\"type\":\"text\"} - Send text message")
        print("4. POST /api/split/groups/{group_id}/messages {\"content\":\"🔥\",\"type\":\"sticker\"} - Send sticker")
        print("5. GET /api/split/groups/{group_id}/messages - Verify both messages appear")
        print("6. GET /api/split/groups/{group_id}/summary - Verify summary still works")
        print()
        
        # Step 1: Get groups list and pick first group ID
        print("📋 Step 1: GET /api/split/groups - Get groups list")
        status, groups_data = self.make_request('GET', '/split/groups')
        if status != 200:
            print(f"❌ Failed to get groups: {groups_data}")
            return False
        
        if not isinstance(groups_data, list) or len(groups_data) == 0:
            print(f"❌ No groups found. Response: {groups_data}")
            return False
        
        # Pick the first group ID
        first_group = groups_data[0]
        if 'id' not in first_group:
            print(f"❌ No 'id' field in first group: {first_group}")
            return False
        
        self.test_group_id = first_group['id']
        group_name = first_group.get('name', 'Unknown Group')
        print(f"✅ Selected group: {group_name} (ID: {self.test_group_id})")
        
        # Step 2: Get initial chat messages (should return array, possibly empty)
        print(f"\n📋 Step 2: GET /api/split/groups/{self.test_group_id}/messages - Get initial messages")
        status, initial_messages = self.make_request('GET', f'/split/groups/{self.test_group_id}/messages')
        if status != 200:
            print(f"❌ Failed to get initial messages: {initial_messages}")
            return False
        
        if not isinstance(initial_messages, list):
            print(f"❌ Messages should be an array, got: {type(initial_messages)}")
            return False
        
        initial_count = len(initial_messages)
        print(f"✅ Initial messages retrieved: {initial_count} messages")
        
        # Step 3: Send text message
        print(f"\n📋 Step 3: POST /api/split/groups/{self.test_group_id}/messages - Send text message")
        text_message_data = {
            "content": "Hello everyone! 👋",
            "type": "text"
        }
        status, text_response = self.make_request('POST', f'/split/groups/{self.test_group_id}/messages', text_message_data)
        if status != 200:
            print(f"❌ Failed to send text message: {text_response}")
            return False
        
        print(f"✅ Text message sent successfully")
        
        # Step 4: Send sticker message
        print(f"\n📋 Step 4: POST /api/split/groups/{self.test_group_id}/messages - Send sticker")
        sticker_message_data = {
            "content": "🔥",
            "type": "sticker"
        }
        status, sticker_response = self.make_request('POST', f'/split/groups/{self.test_group_id}/messages', sticker_message_data)
        if status != 200:
            print(f"❌ Failed to send sticker: {sticker_response}")
            return False
        
        print(f"✅ Sticker sent successfully")
        
        # Small delay to ensure messages are saved
        time.sleep(0.5)
        
        # Step 5: Verify both messages appear
        print(f"\n📋 Step 5: GET /api/split/groups/{self.test_group_id}/messages - Verify both messages appear")
        status, final_messages = self.make_request('GET', f'/split/groups/{self.test_group_id}/messages')
        if status != 200:
            print(f"❌ Failed to get final messages: {final_messages}")
            return False
        
        if not isinstance(final_messages, list):
            print(f"❌ Messages should be an array, got: {type(final_messages)}")
            return False
        
        final_count = len(final_messages)
        new_messages_count = final_count - initial_count
        
        print(f"✅ Final messages retrieved: {final_count} messages ({new_messages_count} new)")
        
        # Verify we have at least 2 new messages
        if new_messages_count < 2:
            print(f"❌ Expected at least 2 new messages, got {new_messages_count}")
            return False
        
        # Check the last 2 messages for our content
        last_messages = final_messages[-2:]
        text_found = False
        sticker_found = False
        
        print("\n📋 Verifying message content:")
        for i, msg in enumerate(last_messages):
            msg_type = msg.get('type', 'unknown')
            content = msg.get('content', '')
            sender_name = msg.get('sender_name', 'Unknown')
            
            print(f"   Message {i+1}: Type={msg_type}, Content='{content}', Sender={sender_name}")
            
            if msg_type == 'text' and 'Hello everyone! 👋' in content:
                text_found = True
            elif msg_type == 'sticker' and '🔥' in content:
                sticker_found = True
        
        if not text_found:
            print("❌ Text message 'Hello everyone! 👋' not found in recent messages")
            return False
        
        if not sticker_found:
            print("❌ Sticker message '🔥' not found in recent messages")
            return False
        
        print("✅ Both messages verified successfully!")
        
        # Step 6: Verify summary still works
        print(f"\n📋 Step 6: GET /api/split/groups/{self.test_group_id}/summary - Verify summary still works")
        status, summary_data = self.make_request('GET', f'/split/groups/{self.test_group_id}/summary')
        if status != 200:
            print(f"❌ Failed to get group summary: {summary_data}")
            return False
        
        if not isinstance(summary_data, dict):
            print(f"❌ Summary should be an object, got: {type(summary_data)}")
            return False
        
        # Check for expected summary fields
        expected_fields = ['total_amount', 'debts', 'activity']
        missing_fields = [field for field in expected_fields if field not in summary_data]
        
        if missing_fields:
            print(f"⚠️ Summary missing some expected fields: {missing_fields}")
        
        print(f"✅ Group summary working correctly")
        print(f"   Total Amount: {summary_data.get('total_amount', 'N/A')}")
        print(f"   Debts Count: {len(summary_data.get('debts', []))}")
        print(f"   Activity Count: {len(summary_data.get('activity', []))}")
        
        return True
    
    def analyze_message_structure(self):
        """Analyze and report the message data structure"""
        print("\n📊 MESSAGE DATA STRUCTURE ANALYSIS:")
        print("="*50)
        
        if not self.test_group_id:
            print("❌ No test group ID available for analysis")
            return
        
        # Get messages for analysis
        status, messages = self.make_request('GET', f'/split/groups/{self.test_group_id}/messages')
        if status != 200 or not isinstance(messages, list) or len(messages) == 0:
            print("❌ No messages available for analysis")
            return
        
        # Analyze the last message structure
        sample_message = messages[-1]
        
        print("📋 Sample Message Structure:")
        for key, value in sample_message.items():
            value_type = type(value).__name__
            if isinstance(value, str) and len(value) > 50:
                display_value = value[:47] + "..."
            else:
                display_value = value
            print(f"   {key}: {display_value} ({value_type})")
        
        # Analyze message types
        message_types = {}
        for msg in messages:
            msg_type = msg.get('type', 'unknown')
            message_types[msg_type] = message_types.get(msg_type, 0) + 1
        
        print(f"\n📊 Message Types Distribution:")
        for msg_type, count in message_types.items():
            print(f"   {msg_type}: {count} messages")
        
        print(f"\n📈 Total Messages: {len(messages)}")
    
    def generate_report(self):
        """Generate comprehensive test report"""
        print("\n" + "="*80)
        print("📊 GROUP CHAT FEATURE TEST REPORT")
        print("="*80)
        
        # Overall statistics
        total_tests = len(self.results)
        successful_tests = len([r for r in self.results if r['status_code'] == 200])
        failed_tests = total_tests - successful_tests
        
        print(f"📈 Total API Calls: {total_tests}")
        print(f"✅ Successful (200 OK): {successful_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"📊 Success Rate: {(successful_tests/total_tests)*100:.1f}%")
        
        # Test results by endpoint
        print(f"\n📋 ENDPOINT TEST RESULTS:")
        for result in self.results:
            status_emoji = "✅" if result['status_code'] == 200 else "❌"
            print(f"   {status_emoji} {result['method']} {result['endpoint']} - {result['status_code']}")
            if result['error']:
                print(f"      Error: {result['error']}")
        
        # Feature assessment
        print(f"\n🎯 FEATURE ASSESSMENT:")
        if successful_tests == total_tests:
            print("   🟢 EXCELLENT: All API calls successful")
            print("   🟢 GROUP CHAT: Fully functional")
        elif successful_tests >= total_tests * 0.8:
            print("   🟡 GOOD: Most API calls successful")
            print("   🟡 GROUP CHAT: Mostly functional")
        else:
            print("   🔴 NEEDS ATTENTION: Many API calls failed")
            print("   🔴 GROUP CHAT: Not functional")
        
        print("\n" + "="*80)
        
        return {
            'total_tests': total_tests,
            'successful_tests': successful_tests,
            'failed_tests': failed_tests,
            'success_rate': (successful_tests/total_tests)*100 if total_tests > 0 else 0
        }

def main():
    """Main test execution"""
    print("💬 MintU Backend Group Chat Feature Test")
    print("=" * 60)
    
    runner = GroupChatTestRunner()
    
    # Step 1: Authenticate
    if not runner.authenticate():
        print("❌ Authentication failed. Cannot proceed with group chat test.")
        sys.exit(1)
    
    # Step 2: Test group chat feature
    success = runner.test_group_chat_feature()
    
    # Step 3: Analyze message structure
    runner.analyze_message_structure()
    
    # Step 4: Generate report
    report = runner.generate_report()
    
    # Step 5: Exit with appropriate code
    if success and report['success_rate'] == 100:
        print("🎉 GROUP CHAT TEST PASSED: All endpoints working perfectly!")
        sys.exit(0)
    else:
        print("⚠️ GROUP CHAT TEST ISSUES DETECTED: Check report above")
        sys.exit(1)

if __name__ == "__main__":
    main()