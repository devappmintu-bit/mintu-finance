#!/usr/bin/env python3
"""
MintU Backend Stress Test - Peak Load Simulation
Tests rate limiting and robustness with minimal delays between requests
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

class StressTestRunner:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.results = []
        self.start_time = None
        self.stress_group_id = None
        
    def log_result(self, endpoint, method, status_code, response_time, error=None):
        """Log test result with timing information"""
        result = {
            'endpoint': endpoint,
            'method': method,
            'status_code': status_code,
            'response_time_ms': round(response_time * 1000, 2),
            'timestamp': datetime.now().isoformat(),
            'error': error
        }
        self.results.append(result)
        
        # Real-time logging
        status_emoji = "✅" if status_code == 200 else "❌"
        print(f"{status_emoji} {method} {endpoint} - {status_code} ({result['response_time_ms']}ms)")
        
        if error:
            print(f"   Error: {error}")
    
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
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            response_time = time.time() - start_time
            
            try:
                response_data = response.json()
            except:
                response_data = response.text
            
            self.log_result(endpoint, method, response.status_code, response_time)
            
            return response.status_code, response_data, response_time
            
        except Exception as e:
            response_time = time.time() - start_time
            self.log_result(endpoint, method, 0, response_time, str(e))
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
    
    def run_stress_test(self):
        """Run the 20 endpoint stress test with minimal delays"""
        print("\n🚀 Starting STRESS-LEVEL Peak Load Simulation...")
        print("⚡ Running 20 endpoints as fast as possible to test rate limiting and robustness")
        
        self.start_time = time.time()
        
        # Test endpoints in the exact order specified
        test_endpoints = [
            ('GET', '/user/me'),
            ('GET', '/stats/overview'),
            ('GET', '/transactions?limit=10'),
            ('GET', '/budgets/live'),
            ('GET', '/split/groups'),
            ('GET', '/split/balances'),
            ('POST', '/transactions', {"amount": 100, "description": "Stress test", "category": "Food", "type": "expense"}),
            ('GET', '/alerts/smart'),
            ('GET', '/waste-detector'),
            ('GET', '/insights/daily?lang=en'),
            ('POST', '/split/groups', {"name": "Stress Group", "members": ["9555666777"]}),
            ('GET', '/leaderboard/savings'),
            ('GET', '/gamification/status'),
            ('GET', '/card-of-the-day'),
            ('GET', '/money-school/dynamic?lang=en'),
            ('GET', '/reports/weekly'),
            ('GET', '/share/stats-card'),
            ('GET', '/budgets/smart-suggest'),
            ('POST', '/ai/agent-chat', {"message": "Quick test", "lang": "en"}),
        ]
        
        print(f"\n📊 Executing {len(test_endpoints)} endpoints with MINIMAL delays...")
        
        for i, (method, endpoint, *data) in enumerate(test_endpoints, 1):
            request_data = data[0] if data else None
            
            print(f"\n[{i}/{len(test_endpoints)}] {method} {endpoint}")
            
            status, response_data, response_time = self.make_request(method, endpoint, request_data)
            
            # Store stress group ID for cleanup
            if endpoint == '/split/groups' and method == 'POST' and status == 200:
                if isinstance(response_data, dict) and 'group_id' in response_data:
                    self.stress_group_id = response_data['group_id']
                    print(f"   📝 Stress group created: {self.stress_group_id}")
            
            # MINIMAL delay for stress testing (10ms)
            time.sleep(0.01)
        
        # Cleanup: Delete stress group
        if self.stress_group_id:
            print(f"\n🧹 Cleaning up stress group: {self.stress_group_id}")
            status, _, _ = self.make_request('DELETE', f'/split/groups/{self.stress_group_id}')
            if status == 200:
                print("✅ Stress group deleted successfully")
            else:
                print(f"⚠️ Failed to delete stress group: {status}")
    
    def generate_report(self):
        """Generate comprehensive stress test report"""
        total_time = time.time() - self.start_time
        
        print("\n" + "="*80)
        print("📊 STRESS TEST REPORT - PEAK LOAD SIMULATION")
        print("="*80)
        
        # Overall statistics
        total_requests = len(self.results)
        successful_requests = len([r for r in self.results if r['status_code'] == 200])
        failed_requests = total_requests - successful_requests
        rate_limited = len([r for r in self.results if r['status_code'] == 429])
        
        print(f"⏱️  Total Test Duration: {total_time:.2f} seconds")
        print(f"📈 Total Requests: {total_requests}")
        print(f"✅ Successful (200 OK): {successful_requests}")
        print(f"❌ Failed: {failed_requests}")
        print(f"🚫 Rate Limited (429): {rate_limited}")
        print(f"📊 Success Rate: {(successful_requests/total_requests)*100:.1f}%")
        print(f"⚡ Requests per Second: {total_requests/total_time:.2f}")
        
        # Response time analysis
        response_times = [r['response_time_ms'] for r in self.results if r['status_code'] == 200]
        if response_times:
            avg_response = sum(response_times) / len(response_times)
            max_response = max(response_times)
            min_response = min(response_times)
            
            print(f"\n⏱️  RESPONSE TIME ANALYSIS:")
            print(f"   Average: {avg_response:.2f}ms")
            print(f"   Minimum: {min_response:.2f}ms")
            print(f"   Maximum: {max_response:.2f}ms")
        
        # Rate limiting analysis
        if rate_limited > 0:
            print(f"\n🚫 RATE LIMITING DETECTED:")
            print(f"   {rate_limited} requests were rate limited (429 errors)")
            print("   This indicates the rate limiting system is working correctly")
        else:
            print(f"\n✅ NO RATE LIMITING TRIGGERED:")
            print("   All requests completed without hitting rate limits")
        
        # Failed requests analysis
        if failed_requests > 0:
            print(f"\n❌ FAILED REQUESTS ANALYSIS:")
            for result in self.results:
                if result['status_code'] != 200:
                    print(f"   {result['method']} {result['endpoint']} - {result['status_code']}")
                    if result['error']:
                        print(f"      Error: {result['error']}")
        
        # Performance assessment
        print(f"\n🎯 PERFORMANCE ASSESSMENT:")
        if successful_requests == total_requests:
            print("   🟢 EXCELLENT: All requests successful")
        elif successful_requests >= total_requests * 0.95:
            print("   🟡 GOOD: >95% success rate")
        else:
            print("   🔴 NEEDS ATTENTION: <95% success rate")
        
        if rate_limited == 0:
            print("   🟢 RATE LIMITING: No 429 errors (as requested)")
        else:
            print(f"   🔴 RATE LIMITING: {rate_limited} requests rate limited")
        
        if response_times and avg_response < 1000:
            print("   🟢 RESPONSE TIME: Average <1s (excellent)")
        elif response_times and avg_response < 3000:
            print("   🟡 RESPONSE TIME: Average <3s (acceptable)")
        else:
            print("   🔴 RESPONSE TIME: Average >3s (slow)")
        
        print("\n" + "="*80)
        
        return {
            'total_requests': total_requests,
            'successful_requests': successful_requests,
            'failed_requests': failed_requests,
            'rate_limited': rate_limited,
            'success_rate': (successful_requests/total_requests)*100,
            'avg_response_time': avg_response if response_times else 0,
            'total_duration': total_time
        }

def main():
    """Main stress test execution"""
    print("🔥 MintU Backend Stress Test - Peak Load Simulation")
    print("=" * 60)
    
    runner = StressTestRunner()
    
    # Step 1: Authenticate
    if not runner.authenticate():
        print("❌ Authentication failed. Cannot proceed with stress test.")
        sys.exit(1)
    
    # Step 2: Run stress test
    runner.run_stress_test()
    
    # Step 3: Generate report
    report = runner.generate_report()
    
    # Step 4: Exit with appropriate code
    if report['rate_limited'] == 0 and report['success_rate'] == 100:
        print("🎉 STRESS TEST PASSED: All endpoints working, zero 429 errors!")
        sys.exit(0)
    else:
        print("⚠️ STRESS TEST ISSUES DETECTED: Check report above")
        sys.exit(1)

if __name__ == "__main__":
    main()