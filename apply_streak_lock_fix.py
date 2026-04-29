#!/usr/bin/env python3
"""apply_streak_lock_fix.py — Round 52b — gate daily check-in on unlock."""
import os, sys

FE = "/app/frontend"
passed = 0
failed = 0

def patch(path, old, new, label):
    global passed, failed
    full = os.path.join(FE, path) if not path.startswith("/") else path
    if not os.path.exists(full):
        print(f"  SKIP (not found): {path}")
        return
    with open(full, encoding="utf-8") as f:
        content = f.read()
    if new in content:
        print(f"  Already applied: {label}")
        passed += 1
        return
    if old not in content:
        print(f"  NOT FOUND: {label}")
        failed += 1
        return
    with open(full, "w", encoding="utf-8") as f:
        f.write(content.replace(old, new, 1))
    print(f"  OK: {label}")
    passed += 1

print("="*60)
print("  Round 52b — Fix streak toast on lock screen")
print("="*60)

patch(
    "hooks/useDailyCheckIn.ts",
    "import { useAuthStore } from '../store/authStore';\n\nexport function useDailyCheckIn() {\n  const fired = useRef(false);\n  const lastTokenRef = useRef<string | null>(null);\n  const token = useAuthStore((s) => s.token);",
    """import { useAuthStore } from '../store/authStore';

export function useDailyCheckIn() {
  const fired = useRef(false);
  const lastTokenRef = useRef<string | null>(null);
  const token = useAuthStore((s) => s.token);
  // Don't fire while the app-lock screen (/unlock) is active.
  // The toast must only appear on the home screen after PIN/biometric passes.
  const locked = useAuthStore((s) => s.locked);""",
    "useDailyCheckIn: subscribe to locked state"
)

patch(
    "hooks/useDailyCheckIn.ts",
    "    if (token !== lastTokenRef.current) {\n      fired.current = false;\n      lastTokenRef.current = token;\n    }\n\n    if (fired.current || !token) return;",
    """    if (token !== lastTokenRef.current) {
      fired.current = false;
      lastTokenRef.current = token;
    }

    // Wait until the user has passed the lock screen before showing any toast.
    if (fired.current || !token || locked) return;""",
    "useDailyCheckIn: skip when app is locked"
)

patch(
    "hooks/useDailyCheckIn.ts",
    "  }, [token]);\n}",
    "  }, [token, locked]);\n}",
    "useDailyCheckIn: add locked to useEffect deps"
)

print("="*60)
print(f"  Done: {passed} OK  {failed} FAIL")
print("="*60)
sys.exit(1 if failed else 0)
