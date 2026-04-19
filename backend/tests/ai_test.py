#!/usr/bin/env python3
"""
Quick AI endpoint verification test
"""

import requests
import json

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"

# Get auth token
auth_response = requests.post(f"{BASE_URL}/auth/verify-otp", 
                             json={"phone": TEST_PHONE, "otp": TEST_OTP})
token = auth_response.json().get("token")

headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {token}'
}

# Test AI agent chat
print("Testing AI agent chat...")
ai_response = requests.post(f"{BASE_URL}/ai/agent-chat",
                           json={"message": "How much did I spend on food this month?", "lang": "en"},
                           headers=headers)
print(f"Status: {ai_response.status_code}")
print(f"Response: {ai_response.json()}")

print("\nTesting waste detector...")
waste_response = requests.get(f"{BASE_URL}/waste-detector", headers=headers)
print(f"Status: {waste_response.status_code}")
print(f"Response: {waste_response.json()}")

print("\nTesting daily insights...")
insights_response = requests.get(f"{BASE_URL}/insights/daily?lang=en", headers=headers)
print(f"Status: {insights_response.status_code}")
print(f"Response: {insights_response.json()}")