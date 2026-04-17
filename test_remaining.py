#!/usr/bin/env python3
"""
Quick test of the rate-limited endpoints to verify they work
"""

import requests
import json
import time

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"

def test_remaining_endpoints():
    """Test the endpoints that were rate limited"""
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})
    
    # Get auth token
    print("Getting auth token...")
    otp_response = session.post(f"{BASE_URL}/auth/send-otp", json={"phone": TEST_PHONE})
    if otp_response.status_code != 200:
        print(f"❌ OTP failed: {otp_response.status_code}")
        return
    
    time.sleep(2)
    
    verify_response = session.post(f"{BASE_URL}/auth/verify-otp", 
                                 json={"phone": TEST_PHONE, "otp": TEST_OTP})
    if verify_response.status_code != 200:
        print(f"❌ Verify failed: {verify_response.status_code}")
        return
    
    token = verify_response.json().get("token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    
    print("✅ Got token, testing endpoints...")
    
    # Test the endpoints that were rate limited
    endpoints = [
        ("GET", "/alerts/smart", "Smart Alerts"),
        ("GET", "/user/avatar", "User Avatar"),
        ("GET", "/budgets/smart-suggest", "Smart Budget Suggestions"),
        ("GET", "/insights/daily?lang=en", "Daily Insights")
    ]
    
    for method, endpoint, name in endpoints:
        try:
            if method == "GET":
                response = session.get(f"{BASE_URL}{endpoint}")
            else:
                response = session.post(f"{BASE_URL}{endpoint}", json={})
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ {name}: 200 OK - {len(str(data))} chars response")
            else:
                print(f"❌ {name}: {response.status_code} - {response.text[:100]}")
        except Exception as e:
            print(f"❌ {name}: Error - {e}")
        
        time.sleep(1)  # Small delay between requests

if __name__ == "__main__":
    test_remaining_endpoints()