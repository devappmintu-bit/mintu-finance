#!/usr/bin/env python3
"""
MintU Backend Test - Review Request Specific Testing
Tests NEW India finance news and AI expense report endpoints + existing endpoints
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

class ReviewTestRunner:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.results = []
        self.start_time = None
        
    def log_result(self, endpoint, method, status_code, response_time, response_data=None, error=None):
        """Log test result with timing information"""
        result = {
            'endpoint': endpoint,
            'method': method,
            'status_code': status_code,
            'response_time_ms': round(response_time * 1000, 2),
            'timestamp': datetime.now().isoformat(),
            'response_data': response_data,
            'error': error
        }
        self.results.append(result)
        
        # Real-time logging
        status_emoji = "✅" if status_code == 200 else "❌"
        print(f"{status_emoji} {method} {endpoint} - {status_code} ({result['response_time_ms']}ms)")
        
        if error:
            print(f"   Error: {error}")
        elif status_code == 200 and response_data:
            # Show key response data for verification
            if isinstance(response_data, dict):
                if 'articles' in response_data:
                    print(f"   📰 Articles: {len(response_data['articles'])}")
                elif 'report' in response_data:
                    print(f"   📊 Report: {response_data['report'].get('headline', 'N/A')}")
                elif 'ai_recommendation' in response_data:
                    print(f"   🤖 AI Recommendation: {len(response_data.get('ai_recommendation', ''))}")
                elif 'name' in response_data:
                    print(f"   👤 User: {response_data.get('name', 'N/A')}")
    
    def make_request(self, method, endpoint, data=None, headers=None):
        """Make HTTP request with timing and error handling"""
        url = f"{BASE_URL}{endpoint}"
        
        if headers is None:
            headers = {}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        headers['Content-Type'] = 'application/json'
        
        start_time = time.time()
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            response_time = time.time() - start_time
            
            try:
                response_data = response.json()
            except:
                response_data = response.text
            
            self.log_result(endpoint, method, response.status_code, response_time, response_data)
            
            return response.status_code, response_data, response_time
            
        except Exception as e:
            response_time = time.time() - start_time
            self.log_result(endpoint, method, 0, response_time, None, str(e))
            return 0, str(e), response_time
    
    def authenticate(self):
        """Perform authentication flow"""
        print("🔐 Starting Authentication Flow...")
        
        # Step 1: Send OTP
        status, data, _ = self.make_request('POST', '/auth/send-otp', {'phone': PHONE})
        if status != 200:
            print(f"❌ Failed to send OTP: {data}")
            return False
        
        # Small delay for OTP processing
        time.sleep(0.1)
        
        # Step 2: Verify OTP
        status, data, _ = self.make_request('POST', '/auth/verify-otp', {'phone': PHONE, 'otp': OTP})
        if status != 200:
            print(f"❌ Failed to verify OTP: {data}")
            return False
        
        if 'token' in data:
            self.token = data['token']
            print(f"✅ Authentication successful! Token acquired.")
            return True
        else:
            print(f"❌ No token in response: {data}")
            return False
    
    def test_new_endpoints(self):
        """Test the NEW endpoints mentioned in review request"""
        print("\n🆕 Testing NEW Endpoints...")
        
        # 1. NEW: India Finance News
        print("\n[1/2] Testing GET /api/news/india-finance")
        status, data, _ = self.make_request('GET', '/news/india-finance')
        if status == 200:
            if isinstance(data, dict) and 'articles' in data and 'date' in data:
                articles = data['articles']
                if isinstance(articles, list) and len(articles) >= 3:
                    print(f"   ✅ Valid response: {len(articles)} articles for {data['date']}")
                    # Check article structure
                    if articles:
                        article = articles[0]
                        required_fields = ['title', 'summary', 'category', 'emoji', 'source']
                        missing_fields = [f for f in required_fields if f not in article]
                        if not missing_fields:
                            print(f"   ✅ Article structure valid: {article['title'][:50]}...")
                        else:
                            print(f"   ⚠️ Missing fields in article: {missing_fields}")
                else:
                    print(f"   ⚠️ Expected 3-6 articles, got {len(articles) if isinstance(articles, list) else 'invalid'}")
            else:
                print(f"   ❌ Invalid response structure: {type(data)}")
        else:
            print(f"   ❌ Failed with status {status}")
        
        # 2. NEW: AI Expense Report Card
        print("\n[2/2] Testing GET /api/reports/ai-expense-card")
        status, data, _ = self.make_request('GET', '/reports/ai-expense-card')
        if status == 200:
            if isinstance(data, dict):
                required_fields = ['total_expense', 'total_income', 'savings_rate', 'categories', 'report']
                missing_fields = [f for f in required_fields if f not in data]
                if not missing_fields:
                    print(f"   ✅ Valid response structure")
                    # Check report object
                    report = data.get('report', {})
                    if isinstance(report, dict):
                        report_fields = ['headline', 'health_grade', 'highlights', 'recommendations']
                        report_missing = [f for f in report_fields if f not in report]
                        if not report_missing:
                            print(f"   ✅ Report object valid: {report.get('headline', 'N/A')}")
                        else:
                            print(f"   ⚠️ Missing report fields: {report_missing}")
                    else:
                        print(f"   ⚠️ Report object invalid: {type(report)}")
                else:
                    print(f"   ❌ Missing required fields: {missing_fields}")
            else:
                print(f"   ❌ Invalid response structure: {type(data)}")
        else:
            print(f"   ❌ Failed with status {status}")
    
    def test_existing_endpoints(self):
        """Test existing endpoints mentioned in review request"""
        print("\n🔄 Testing Existing Endpoints...")
        
        # 1. Waste Detector (should have ai_recommendation field)
        print("\n[1/3] Testing GET /api/waste-detector")
        status, data, _ = self.make_request('GET', '/waste-detector')
        if status == 200:
            if isinstance(data, dict) and 'ai_recommendation' in data:
                ai_rec = data['ai_recommendation']
                if isinstance(ai_rec, str) and len(ai_rec) > 0:
                    print(f"   ✅ ai_recommendation field present: {len(ai_rec)} chars")
                else:
                    print(f"   ⚠️ ai_recommendation field empty or invalid: {type(ai_rec)}")
            else:
                print(f"   ❌ ai_recommendation field missing from response")
        else:
            print(f"   ❌ Failed with status {status}")
        
        # 2. User Profile
        print("\n[2/3] Testing GET /api/user/me")
        status, data, _ = self.make_request('GET', '/user/me')
        if status == 200:
            if isinstance(data, dict) and 'name' in data and 'phone' in data:
                print(f"   ✅ Valid user profile: {data.get('name', 'N/A')}")
            else:
                print(f"   ❌ Invalid user profile structure")
        else:
            print(f"   ❌ Failed with status {status}")
        
        # 3. Profile Update
        print("\n[3/3] Testing PUT /api/user/profile")
        update_data = {"name": "Test Updated"}
        status, data, _ = self.make_request('PUT', '/user/profile', update_data)
        if status == 200:
            print(f"   ✅ Profile update successful")
            # Verify the update
            status2, data2, _ = self.make_request('GET', '/user/me')
            if status2 == 200 and isinstance(data2, dict):
                if data2.get('name') == 'Test Updated':
                    print(f"   ✅ Profile update verified: {data2.get('name')}")
                else:
                    print(f"   ⚠️ Profile update not reflected: {data2.get('name')}")
        else:
            print(f"   ❌ Profile update failed with status {status}")
    
    def run_review_test(self):
        """Run the complete review request test"""
        print("\n🚀 Starting Review Request Testing...")
        print("Testing NEW India finance news and AI expense report endpoints")
        
        self.start_time = time.time()
        
        # Test NEW endpoints
        self.test_new_endpoints()
        
        # Test existing endpoints
        self.test_existing_endpoints()
    
    def generate_report(self):
        """Generate comprehensive test report"""
        total_time = time.time() - self.start_time
        
        print("\n" + "="*80)
        print("📊 REVIEW REQUEST TEST REPORT")
        print("="*80)
        
        # Overall statistics
        total_requests = len(self.results)
        successful_requests = len([r for r in self.results if r['status_code'] == 200])
        failed_requests = total_requests - successful_requests
        
        print(f"⏱️  Total Test Duration: {total_time:.2f} seconds")
        print(f"📈 Total Requests: {total_requests}")
        print(f"✅ Successful (200 OK): {successful_requests}")
        print(f"❌ Failed: {failed_requests}")
        print(f"📊 Success Rate: {(successful_requests/total_requests)*100:.1f}%")
        
        # Detailed results
        print(f"\n📋 DETAILED RESULTS:")
        for result in self.results:
            status_emoji = "✅" if result['status_code'] == 200 else "❌"
            print(f"   {status_emoji} {result['method']} {result['endpoint']} - {result['status_code']} ({result['response_time_ms']}ms)")
            if result['error']:
                print(f"      Error: {result['error']}")
        
        # Failed requests analysis
        if failed_requests > 0:
            print(f"\n❌ FAILED REQUESTS ANALYSIS:")
            for result in self.results:
                if result['status_code'] != 200:
                    print(f"   {result['method']} {result['endpoint']} - {result['status_code']}")
                    if result['error']:
                        print(f"      Error: {result['error']}")
        
        # Performance assessment
        print(f"\n🎯 REVIEW REQUEST ASSESSMENT:")
        if successful_requests == total_requests:
            print("   🟢 EXCELLENT: All endpoints working correctly")
        elif successful_requests >= total_requests * 0.8:
            print("   🟡 PARTIAL: Most endpoints working")
        else:
            print("   🔴 CRITICAL: Multiple endpoint failures")
        
        print("\n" + "="*80)
        
        return {
            'total_requests': total_requests,
            'successful_requests': successful_requests,
            'failed_requests': failed_requests,
            'success_rate': (successful_requests/total_requests)*100,
            'total_duration': total_time
        }

def main():
    """Main test execution"""
    print("🔥 MintU Backend Test - Review Request Specific")
    print("=" * 60)
    print("Testing NEW India finance news and AI expense report endpoints")
    print("Also testing existing endpoints: waste-detector, user/me, user/profile")
    
    runner = ReviewTestRunner()
    
    # Step 1: Authenticate
    if not runner.authenticate():
        print("❌ Authentication failed. Cannot proceed with testing.")
        sys.exit(1)
    
    # Step 2: Run review tests
    runner.run_review_test()
    
    # Step 3: Generate report
    report = runner.generate_report()
    
    # Step 4: Exit with appropriate code
    if report['success_rate'] == 100:
        print("🎉 REVIEW REQUEST TEST PASSED: All endpoints working correctly!")
        sys.exit(0)
    else:
        print("⚠️ REVIEW REQUEST TEST ISSUES: Check report above")
        sys.exit(1)

if __name__ == "__main__":
    main()