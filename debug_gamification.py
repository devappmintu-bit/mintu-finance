#!/usr/bin/env python3
"""
Quick test to debug the gamification status endpoint
"""

import requests
import json

# Configuration
BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"

def test_gamification_debug():
    session = requests.Session()
    session.headers.update({
        'Content-Type': 'application/json',
        'User-Agent': 'MintU-Debug/1.0'
    })
    
    # Get auth token
    print("Getting auth token...")
    response = session.post(f"{BASE_URL}/auth/send-otp", json={"phone": TEST_PHONE})
    print(f"Send OTP: {response.status_code}")
    
    response = session.post(f"{BASE_URL}/auth/verify-otp", json={"phone": TEST_PHONE, "otp": TEST_OTP})
    print(f"Verify OTP: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Test gamification status
        print("\nTesting gamification status...")
        response = session.get(f"{BASE_URL}/gamification/status")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response Type: {type(data)}")
            print(f"Response Keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
            print(f"Streak: {data.get('streak', 'Not found')}")
            print(f"Badges Earned: {len(data.get('badges_earned', []))}")
        else:
            print(f"Error: {response.text}")
    else:
        print(f"Auth failed: {response.text}")

if __name__ == "__main__":
    test_gamification_debug()