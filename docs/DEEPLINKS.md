# MintU Deep Links — Setup Guide

This is the companion to the `/join/[id]` deeplink route. For a production build to actually **open the app** when a user taps `https://mintu.app/join/abc123`, two small files need to be hosted on the `mintu.app` web domain.

## ✅ What's already configured (in-repo)

- **`scheme: "mintu"`** in `app.json` → `mintu://join/abc123` opens the app (works today in dev + release).
- **iOS `associatedDomains: ["applinks:mintu.app", "applinks:www.mintu.app"]`** — triggers Universal Link handling.
- **Android `intentFilters`** with `autoVerify: true` for:
  - `https://mintu.app/join/*`
  - `https://www.mintu.app/join/*`
  - `mintu://join/*` (private-scheme fallback)
- **Route `/app/join/[id].tsx`** handles the preview + self-join flow.
- **Expo Router** auto-maps incoming URLs to the matching file route.

## 🔶 What you need to host on the web domain

### 1) iOS — `apple-app-site-association`

Serve this at **`https://mintu.app/.well-known/apple-app-site-association`** with `Content-Type: application/json`, **no `.json` extension**, HTTPS only, no redirects.

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "<TEAM_ID>.com.mintu.finance",
        "paths": ["/join/*"]
      }
    ]
  }
}
```

Replace `<TEAM_ID>` with your Apple Developer Team ID (10-char alphanumeric from App Store Connect → Membership).

### 2) Android — `assetlinks.json`

Serve at **`https://mintu.app/.well-known/assetlinks.json`** with `Content-Type: application/json`, HTTPS, no redirects.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.mintu.finance",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:EE:FF:...   (release signing cert SHA-256)"
      ]
    }
  }
]
```

Get the SHA-256 via:
```bash
keytool -list -v -keystore <your-keystore>.jks -alias <your-alias>
# or for Play Store app signing: Play Console → Setup → App integrity → App signing key certificate
```

### 3) Fallback HTML page at `https://mintu.app/join/[id]`

For users who don't have the app installed, serve a page that:
1. Tries `mintu://join/<id>` via a meta-refresh or JS redirect
2. Falls back to the App Store / Play Store button
3. Also shows a nice "Join MintU" preview card

Simple stub:
```html
<!DOCTYPE html><html><head>
  <meta name="apple-itunes-app" content="app-id=<APP_STORE_ID>, app-argument=mintu://join/<id>">
  <script>setTimeout(()=>location.href='mintu://join/<id>',50);
          setTimeout(()=>location.href='https://apps.apple.com/app/id<APP_STORE_ID>',1500);</script>
</head><body>Redirecting to MintU…</body></html>
```

## 🧪 Testing locally

### iOS simulator
```bash
xcrun simctl openurl booted "mintu://join/69e005ed0bda38ad4b6eb54b"
```

### Android emulator
```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "mintu://join/69e005ed0bda38ad4b6eb54b" com.mintu.finance
```

### Expo Go (dev)
```bash
npx uri-scheme open "mintu://join/69e005ed0bda38ad4b6eb54b" --ios
# or on device: paste the URL into Safari → tap open in MintU
```

## ✅ Verification checklist

- [ ] `apple-app-site-association` uploaded + `curl -I https://mintu.app/.well-known/apple-app-site-association` returns 200 + `application/json`
- [ ] `assetlinks.json` uploaded + `curl -I https://mintu.app/.well-known/assetlinks.json` returns 200
- [ ] Universal Link opened from Notes app → opens MintU (iOS)
- [ ] Web link opened from Gmail / WhatsApp → opens MintU (Android, after `adb shell pm get-app-links com.mintu.finance` shows `verified`)
- [ ] Web fallback page renders with App Store / Play Store buttons for users without the app

## 📎 Reference

- Apple Universal Links: https://developer.apple.com/ios/universal-links/
- Android App Links: https://developer.android.com/studio/write/app-link-indexing
- Expo deep linking: https://docs.expo.dev/guides/deep-linking/
