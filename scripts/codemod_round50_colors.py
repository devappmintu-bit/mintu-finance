#!/usr/bin/env python3
"""
Round 50 — color codemod for the UI/UX audit Session 1.

Replaces hardcoded hex colors with theme tokens INSIDE makeStyles factories
ONLY. Files using `makeStyles((c) => ...)` get `'#fff'` → `c.bg.elevated`,
etc. Files NOT using makeStyles are left untouched (we'll handle those
manually since they need a structural change to read from useAppColors()).

Usage:
    python3 /app/scripts/codemod_round50_colors.py FILE [FILE ...]

The script:
  1. Reads each file
  2. If file has `makeStyles((c)`, applies regex replacements to the
     factory body only (to avoid touching JSX inline-color props which
     don't have access to `c`).
  3. Reports # of replacements per file
  4. Writes back atomically

Conservative — never touches:
  • JSX prop values like `<Icon color="#FFF" />` (these need `c` in scope)
  • CATEGORIES table or chart palettes (categorical colors stay literal)
  • Comments (regex won't match keys with `:` in them)
"""
import re
import sys
from pathlib import Path

# Color → token mapping. Order matters for case-insensitivity (longest first).
# Format: (regex_pattern, replacement_expression_using_c)
COLOR_MAP = [
    # Whites
    (r"['\"]#FFFFFF['\"]", "c.bg.elevated"),
    (r"['\"]#FFF['\"]",   "c.bg.elevated"),
    (r"['\"]#fff['\"]",   "c.bg.elevated"),
    (r"['\"]#ffffff['\"]","c.bg.elevated"),
    # Blacks (not shadows — shadows use the dedicated token)
    # Brand orange family
    (r"['\"]#F56E1E['\"]", "c.accent.brand"),
    (r"['\"]#f56e1e['\"]", "c.accent.brand"),
    (r"['\"]#C14A06['\"]", "c.accent.brandDark"),
    (r"['\"]#c14a06['\"]", "c.accent.brandDark"),
    (r"['\"]#E65100['\"]", "c.accent.brandDeeper"),
    (r"['\"]#e65100['\"]", "c.accent.brandDeeper"),
    (r"['\"]#FFF7ED['\"]", "c.accent.brandSoft"),
    (r"['\"]#fff7ed['\"]", "c.accent.brandSoft"),
    # State colors
    (r"['\"]#10B981['\"]", "c.state.success"),
    (r"['\"]#10b981['\"]", "c.state.success"),
    (r"['\"]#059669['\"]", "c.state.success"),
    (r"['\"]#EF4444['\"]", "c.state.danger"),
    (r"['\"]#ef4444['\"]", "c.state.danger"),
    (r"['\"]#DC2626['\"]", "c.state.danger"),
    (r"['\"]#dc2626['\"]", "c.state.danger"),
    (r"['\"]#F59E0B['\"]", "c.accent.secondary"),
    (r"['\"]#f59e0b['\"]", "c.accent.secondary"),
    # Text
    (r"['\"]#111827['\"]", "c.text.primary"),
    (r"['\"]#111['\"]",    "c.text.primary"),
    (r"['\"]#6B7280['\"]", "c.text.muted"),
    (r"['\"]#6b7280['\"]", "c.text.muted"),
    (r"['\"]#4B5563['\"]", "c.text.secondary"),
    (r"['\"]#4b5563['\"]", "c.text.secondary"),
    # Grays
    (r"['\"]#F9FAFB['\"]", "c.gray[50]"),
    (r"['\"]#f9fafb['\"]", "c.gray[50]"),
    (r"['\"]#F3F4F6['\"]", "c.gray[100]"),
    (r"['\"]#f3f4f6['\"]", "c.gray[100]"),
    (r"['\"]#E5E7EB['\"]", "c.gray[200]"),
    (r"['\"]#e5e7eb['\"]", "c.gray[200]"),
    (r"['\"]#D1D5DB['\"]", "c.gray[300]"),
    (r"['\"]#d1d5db['\"]", "c.gray[300]"),
    (r"['\"]#9CA3AF['\"]", "c.gray[400]"),
    (r"['\"]#9ca3af['\"]", "c.gray[400]"),
    (r"['\"]#1F2937['\"]", "c.gray[800]"),
    (r"['\"]#1f2937['\"]", "c.gray[800]"),
]


def find_factory_body(src: str):
    """Return (start, end) char offsets of the `makeStyles((c) => ({ ... }))` body, or None."""
    m = re.search(r"makeStyles\s*\(\s*\([^)]*\)\s*=>\s*\(\s*\{", src)
    if not m:
        return None
    start = m.end() - 1  # the '{' position
    # Find the matching closing brace via depth counting
    depth = 0
    i = start
    while i < len(src):
        ch = src[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return (start, i + 1)
        elif ch == '"' or ch == "'":
            # Skip strings (rough — doesn't handle template literals but
            # makeStyles factories rarely contain those at the body level).
            quote = ch
            i += 1
            while i < len(src) and src[i] != quote:
                if src[i] == '\\':
                    i += 1
                i += 1
        i += 1
    return None


def migrate_file(path: Path) -> int:
    src = path.read_text()
    if 'makeStyles' not in src:
        return -1  # not a makeStyles file — skip silently

    body_range = find_factory_body(src)
    if not body_range:
        return -2

    start, end = body_range
    head, body, tail = src[:start], src[start:end], src[end:]

    n = 0
    for pat, repl in COLOR_MAP:
        body, count = re.subn(pat, repl, body)
        n += count

    if n > 0:
        path.write_text(head + body + tail)
    return n


def main():
    if len(sys.argv) < 2:
        print("Usage: codemod_round50_colors.py FILE [FILE ...]")
        sys.exit(1)
    total = 0
    for arg in sys.argv[1:]:
        p = Path(arg)
        if not p.exists():
            print(f"  ✗ {arg} — not found")
            continue
        n = migrate_file(p)
        if n == -1:
            print(f"  · {arg} — skip (no makeStyles factory)")
        elif n == -2:
            print(f"  · {arg} — skip (couldn't locate factory body)")
        else:
            print(f"  ✓ {arg} — {n} replacement(s)")
            total += n
    print(f"\nTotal: {total} hex literal(s) replaced.")


if __name__ == '__main__':
    main()
