# MintU — App Store & Play Store Publishing Requirements

## Complete Checklist for Publishing MintU

---

## 1. GOOGLE PLAY STORE (Android)

### 1.1 Developer Account
- [ ] Google Play Developer Account ($25 one-time fee)
- [ ] Register at: https://play.google.com/console
- [ ] Verify identity (government ID required)
- [ ] Set up payment profile for receiving revenue

### 1.2 App Listing Assets
| Asset | Specification | Status |
|-------|-------------|--------|
| App Name | "MintU - Smart Money Manager" (max 30 chars) | Needed |
| Short Description | Max 80 chars | Needed |
| Full Description | Max 4000 chars | Needed |
| App Icon | 512x512 PNG, 32-bit, no alpha | Needed |
| Feature Graphic | 1024x500 PNG/JPEG | Needed |
| Phone Screenshots | Min 2, max 8 (16:9 or 9:16) | Needed |
| Tablet Screenshots | 7-inch and 10-inch if tablet support | Optional |
| Video | YouTube URL (30-120 seconds) | Optional |

### 1.3 App Configuration
- [ ] Package name: `com.mintu.app` (set in app.json)
- [ ] Version code: integer, increment each release
- [ ] Version name: "1.0.0"
- [ ] Target API level: API 34+ (Android 14, required by Google)
- [ ] Minimum SDK: API 24 (Android 7.0)

### 1.4 Content Rating (IARC)
- [ ] Complete content rating questionnaire
- [ ] Expected rating: **"Everyone"** (no violence, gambling, etc.)
- [ ] Declare: Financial services category

### 1.5 Data Safety Section (MANDATORY since 2022)
```
Data Collected:
✅ Phone number (Authentication)
✅ Name (Personalization)
✅ Financial info - Transaction data (Core functionality)

Data NOT Collected:
❌ Location, Contacts, Photos, Health, Files

Data Shared:
✅ Anonymized spending data → OpenAI (AI insights generation)
❌ No PII shared with third parties

Security:
✅ Data encrypted in transit (HTTPS/TLS)
✅ Data deletion available (in-app)
```

### 1.6 Permissions Declaration
```json
// app.json - already configured
{
  "android": {
    "permissions": ["RECORD_AUDIO"]
  }
}
```
- [ ] Justify RECORD_AUDIO: "Voice input for hands-free expense tracking"
- [ ] NO SMS_READ permission (we use paste, not auto-read)

### 1.7 App Signing
- [ ] Generate upload key (.keystore file)
- [ ] Enable Google Play App Signing (recommended)
- [ ] Store keystore securely (NEVER lose it)

### 1.8 Build & Submit
```bash
# Using EAS Build (Expo Application Services)
eas build --platform android --profile production
eas submit --platform android
```

### 1.9 Financial App Specific Requirements
- [ ] **Sensitive permissions declaration** — explain why microphone is needed
- [ ] **Financial services policy compliance** — if offering financial advice
- [ ] **India-specific**: RBI doesn't regulate expense trackers (no NBFC license needed)
- [ ] Add "This app does not offer financial products" disclaimer

---

## 2. APPLE APP STORE (iOS)

### 2.1 Developer Account
- [ ] Apple Developer Program ($99/year)
- [ ] Register at: https://developer.apple.com/programs/
- [ ] DUNS number required for organizations
- [ ] Individual accounts need government ID

### 2.2 App Listing Assets
| Asset | Specification | Status |
|-------|-------------|--------|
| App Name | "MintU - Smart Money Manager" (max 30 chars) | Needed |
| Subtitle | Max 30 chars | Needed |
| Description | Max 4000 chars | Needed |
| Keywords | Max 100 chars, comma-separated | Needed |
| App Icon | 1024x1024 PNG, no alpha, no rounded corners | Needed |
| iPhone Screenshots | 6.7" (1290x2796), 6.5" (1242x2688) | Needed |
| iPad Screenshots | 12.9" (2048x2732) if supporting iPad | Optional |
| App Preview Video | 15-30 seconds, device-specific resolution | Optional |

### 2.3 Privacy Nutrition Labels (MANDATORY)
```
Data Used to Track You: None
Data Linked to You:
  - Phone Number (Authentication)
  - Name (Personalization)
  - Financial Info (App Functionality)
Data Not Linked to You:
  - Usage Data (Analytics)
  - Diagnostics
```

### 2.4 App Privacy Policy URL
- [ ] Host privacy policy at a public URL
- [ ] Must describe data collected, usage, and deletion process
- [ ] Required for all apps on App Store

### 2.5 Info.plist Permissions (already configured)
```json
{
  "ios": {
    "infoPlist": {
      "NSMicrophoneUsageDescription": "Record voice to add expenses hands-free"
    }
  }
}
```
- [ ] Apple REJECTS vague permission strings
- [ ] Must explain user benefit, not just what you access

### 2.6 App Review Guidelines — Common Rejection Reasons
| Guideline | Risk | Mitigation |
|-----------|------|-----------|
| 4.2 Minimum Functionality | App must do more than a website | ✅ Has native features (voice, biometric) |
| 4.3 Spam/Duplicate | Must be unique | ✅ AI insights + Indian context unique |
| 5.1.1 Data Collection | Must declare all data | ✅ Privacy labels completed |
| 5.1.2 Data Use/Sharing | OpenAI data sharing | ✅ Anonymized, documented |
| 2.1 Performance: App Completeness | No placeholder content | ⚠️ Ensure all screens functional |
| 1.2 User Generated Content | Financial data is user content | ✅ Moderation not needed (private data) |
| 3.1.1 In-App Purchase | If adding premium features | ❌ Must use Apple IAP (30% cut) |

### 2.7 Build & Submit
```bash
# Using EAS Build
eas build --platform ios --profile production
eas submit --platform ios
```

### 2.8 TestFlight
- [ ] Upload build to TestFlight first
- [ ] Test with internal team (up to 100 testers)
- [ ] External beta testing (up to 10,000 testers)
- [ ] Collect feedback before full release

---

## 3. COMMON REQUIREMENTS (Both Stores)

### 3.1 Legal Documents Needed
- [ ] **Privacy Policy** (hosted at public URL) — GDPR + DPDP compliant
- [ ] **Terms of Service** — usage terms, liability limitations
- [ ] **Data Deletion Instructions** — how users can delete data
- [ ] **Support Contact** — email or URL for user support

### 3.2 App Branding Assets Needed
| Asset | Format | Where Used |
|-------|--------|-----------|
| App Icon (1024x1024) | PNG, no transparency | Both stores |
| Splash Screen | Match app theme | In-app |
| Feature Graphic (1024x500) | PNG/JPEG | Play Store |
| Screenshots (6-8 per device) | PNG | Both stores |
| App Preview Video (optional) | MP4 | Both stores |
| Logo (various sizes) | SVG + PNG | Marketing |

### 3.3 Production Backend Requirements
| Requirement | Current Status | Action Needed |
|-------------|---------------|---------------|
| HTTPS with valid SSL | ✅ Done (preview) | Need production domain |
| Custom domain | ❌ Missing | Buy mintu.app or mintu.in |
| Production database | ⚠️ Local MongoDB | Migrate to MongoDB Atlas |
| API rate limiting | ✅ Done | Adjust limits for production load |
| Error monitoring | ❌ Missing | Add Sentry or similar |
| Logging | ✅ Audit logs | Add structured logging (ELK/CloudWatch) |
| Auto-scaling | ❌ Missing | Deploy to AWS/GCP with auto-scaling |
| CDN | ❌ Missing | CloudFront for static assets |
| Backup | ❌ Missing | Automated MongoDB backups |

### 3.4 Real SMS Provider (Required for Production)
- [ ] Replace mock OTP with real SMS gateway
- [ ] Options: Twilio ($0.50/SMS) or MSG91 ($0.15/SMS)
- [ ] Get API key and integrate
- [ ] Test OTP delivery across major Indian carriers (Jio, Airtel, Vi, BSNL)

### 3.5 Security Audit Checklist
- [ ] Penetration testing by external firm
- [ ] OWASP Top 10 validation
- [ ] Data encryption at rest (MongoDB encryption)
- [ ] Secure key management (AWS KMS or similar)
- [ ] DDoS protection (CloudFlare or AWS Shield)
- [ ] Vulnerability scanning (automated CI/CD)

---

## 4. INDIA-SPECIFIC REQUIREMENTS

### 4.1 Regulatory
| Requirement | Applicable? | Status |
|------------|------------|--------|
| RBI License | ❌ Not needed (expense tracker, not payment) | N/A |
| NBFC Registration | ❌ Not needed (no lending/investing) | N/A |
| SEBI Registration | ❌ Not needed (no investment advice) | N/A |
| DPDP Act 2023 | ✅ Required | ✅ Compliant |
| IT Act 2000 | ✅ Required | ✅ Compliant |
| GST Registration | ✅ If revenue > ₹20L | Needed at scale |

### 4.2 Disclaimers Required
```
"MintU is an expense tracking and financial literacy tool. It does not offer 
financial products, investment advice, or payment services. All AI-generated 
insights are for informational purposes only and should not be considered 
professional financial advice. Consult a certified financial advisor for 
investment decisions."
```

### 4.3 India App Store Optimization (ASO)
- Primary language: English (India)
- Secondary: Hindi
- Keywords: expense tracker, budget planner, money manager, paise bachao, kharcha tracker
- Category: Finance
- Sub-category: Personal Finance

---

## 5. PRE-LAUNCH CHECKLIST

### Week 1: Technical Readiness
- [ ] Production backend deployed (AWS/GCP)
- [ ] Custom domain with SSL (mintu.app)
- [ ] MongoDB Atlas migration
- [ ] Real SMS gateway integrated
- [ ] Sentry error monitoring added
- [ ] All environment variables configured

### Week 2: Store Assets
- [ ] App icon designed (1024x1024)
- [ ] 8 screenshots per device size
- [ ] Feature graphic (Play Store)
- [ ] App preview video (30 seconds)
- [ ] Store descriptions (EN + Hindi)
- [ ] Privacy policy hosted at URL

### Week 3: Testing
- [ ] Internal testing (team of 10)
- [ ] Beta testing via TestFlight + Play Store internal track
- [ ] Performance testing (100+ concurrent users)
- [ ] Security penetration testing
- [ ] Accessibility testing

### Week 4: Submission
- [ ] Submit to Google Play (review: 1-3 days)
- [ ] Submit to Apple App Store (review: 1-7 days)
- [ ] Prepare for rejection responses (common for financial apps)
- [ ] Plan launch marketing

---

## 6. ESTIMATED COSTS

| Item | One-Time | Monthly | Annual |
|------|---------|---------|--------|
| Google Play Developer | $25 | — | — |
| Apple Developer | — | — | $99 |
| Domain (mintu.app) | $15 | — | $15/yr |
| MongoDB Atlas (M10) | — | $60 | $720 |
| AWS/GCP Hosting | — | $50-200 | $600-2400 |
| SMS Gateway (MSG91) | — | $20-100 | $240-1200 |
| SSL Certificate | Free (Let's Encrypt) | — | — |
| Sentry (Error Tracking) | Free tier | — | — |
| CloudFlare (CDN+DDoS) | Free tier | — | — |
| **Total Estimated** | **$40** | **$130-360** | **$1,674-4,434** |

---

## 7. POST-LAUNCH

- [ ] Monitor crash rates (target: <1%)
- [ ] Respond to user reviews within 24 hours
- [ ] Weekly app updates for first month
- [ ] A/B test onboarding flow
- [ ] Track: DAU, retention D1/D7/D30, MAU
- [ ] Target metrics: 4.5+ star rating, 30% D7 retention
