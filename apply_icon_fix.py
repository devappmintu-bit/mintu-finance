#!/usr/bin/env python3
"""apply_icon_fix.py — Round 52c: Fix app icon configuration."""
import json, sys, os

FE = "/app/frontend"
path = f"{FE}/app.json"

if not os.path.exists(path):
    print(f"ERROR: {path} not found")
    sys.exit(1)

with open(path) as f:
    app = json.load(f)

expo = app["expo"]

# iOS: explicitly declare icon (transparent PNG)
expo.setdefault("ios", {})["icon"] = "./assets/images/icon.png"

# Android adaptive: brand orange background + centered mascot foreground
expo.setdefault("android", {})["adaptiveIcon"] = {
    "foregroundImage": "./assets/images/adaptive-icon.png",
    "backgroundColor": "#F56E1E"
}

# Root icon (web / Expo Go fallback)
expo["icon"] = "./assets/images/icon.png"

with open(path, "w") as f:
    json.dump(app, f, indent=2)

print("OK app.json updated")
print("  ios.icon           -> icon.png (transparent)")
print("  android.adaptiveIcon.backgroundColor -> #F56E1E (brand orange)")
print("  android.adaptiveIcon.foregroundImage -> adaptive-icon.png")
