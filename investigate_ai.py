#!/usr/bin/env python3
"""
Detailed investigation of AI endpoints that returned 0 characters
"""

import requests
import json
import time

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"

def get_auth_token():
    """Get authentication token"""
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})
    
    # Send OTP
    print("Sending OTP...")
    otp_response = session.post(f"{BASE_URL}/auth/send-otp", json={"phone": TEST_PHONE})
    print(f"OTP Response: {otp_response.status_code} - {otp_response.text}")
    
    if otp_response.status_code != 200:
        return None, None
    
    time.sleep(2)
    
    # Verify OTP
    print("Verifying OTP...")
    verify_response = session.post(f"{BASE_URL}/auth/verify-otp", 
                                 json={"phone": TEST_PHONE, "otp": TEST_OTP})
    print(f"Verify Response: {verify_response.status_code} - {verify_response.text}")
    
    if verify_response.status_code == 200:
        data = verify_response.json()
        token = data.get("token")
        return token, session
    
    return None, None

def investigate_ai_endpoints():
    """Investigate AI endpoints that returned 0 characters"""
    token, session = get_auth_token()
    
    if not token:
        print("❌ Could not get authentication token")
        return
    
    session.headers.update({"Authorization": f"Bearer {token}"})
    
    print(f"\n✅ Got token: {token[:20]}...")
    
    # Test AI agent chat
    print("\n🤖 Testing AI agent chat...")
    try:
        ai_response = session.post(f"{BASE_URL}/ai/agent-chat",
                                 json={"message": "Am I overspending?", "lang": "en"})
        print(f"AI Chat Status: {ai_response.status_code}")
        print(f"AI Chat Response: {ai_response.text}")
        
        if ai_response.status_code == 200:
            data = ai_response.json()
            print(f"AI Response Keys: {list(data.keys())}")
            response_text = data.get("response", "")
            print(f"Response Length: {len(response_text)}")
            print(f"Response Content: {response_text[:200]}...")
    except Exception as e:
        print(f"AI Chat Error: {e}")
    
    # Test daily insights
    print("\n💡 Testing daily insights...")
    try:
        insights_response = session.get(f"{BASE_URL}/insights/daily?lang=en")
        print(f"Insights Status: {insights_response.status_code}")
        print(f"Insights Response: {insights_response.text}")
        
        if insights_response.status_code == 200:
            data = insights_response.json()
            print(f"Insights Keys: {list(data.keys())}")
            insights_text = data.get("insights_text", "")
            print(f"Insights Length: {len(insights_text)}")
            print(f"Insights Content: {insights_text[:200]}...")
    except Exception as e:
        print(f"Insights Error: {e}")

if __name__ == "__main__":
    investigate_ai_endpoints()