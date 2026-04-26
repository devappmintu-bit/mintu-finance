#!/usr/bin/env python3
"""Round 50 S5 — Hot-fix broken codemod outputs.

For every file with `c.*` references but missing `const c = useAppColors()`
in scope, inject the hook into the right component.
"""
import re
from pathlib import Path

FILES = """components/budget/BudgetInsightsSheet.tsx
components/budget/BudgetSmartSheet.tsx
components/home/PremiumHomeCard.tsx
components/profile/DeleteAccountSection.tsx
components/profile/DeleteAccountTrigger.tsx
components/profile/EditNameSheet.tsx
components/profile/LanguageSheet.tsx
components/profile/ProfilePhotoSheet.tsx
components/profile/ScoreBoostModal.tsx
components/profile/ScoreBreakdownModal.tsx
components/profile/ShareWeeklyWinModal.tsx
components/profile/StreakCoinsHealthCard.tsx
components/profile/SubScreenModal.tsx
components/profile/ThemeToggle.tsx
components/rewards/SocialFeedTicker.tsx
components/rewards/SpinWheel.tsx
components/rewards/TierCard.tsx
components/split/RemindersBanner.tsx
""".strip().split("\n")

ROOT = Path("/app/frontend")


def ensure_import(src: str) -> tuple[str, bool]:
    """Make sure useAppColors is imported."""
    if "useAppColors" in src:
        return src, False

    # Pattern A: existing theme import — extend it.
    m = re.search(r"import\s*\{([^}]+)\}\s*from\s*(['\"])([\.\/]+utils/theme)\2\s*;?", src)
    if m:
        new_inside = m.group(1).rstrip().rstrip(",") + ", useAppColors"
        new_import = f"import {{ {new_inside} }} from {m.group(2)}{m.group(3)}{m.group(2)};"
        return src[:m.start()] + new_import + src[m.end():], True

    # Pattern B: existing makeStyles import — append a new theme import line after it.
    m = re.search(r"(import\s+\{[^}]+\}\s+from\s+['\"]([\.\/]+utils/makeStyles)['\"]\s*;)", src)
    if m:
        # Determine path depth from makeStyles path
        prefix = m.group(2).replace("/utils/makeStyles", "/utils/theme")
        new_line = f"\nimport {{ useAppColors }} from '{prefix}';"
        return src[:m.end()] + new_line + src[m.end():], True

    # Pattern C: add at top of imports as a fallback (path: '../../utils/theme').
    m = re.search(r"^import\s.*$", src, re.MULTILINE)
    if m:
        new_line = "import { useAppColors } from '../../utils/theme';\n"
        return src[:m.start()] + new_line + src[m.start():], True

    return src, False


def remove_duplicate_hook_decls(src: str) -> tuple[str, int]:
    """Find component bodies with two `const c = useAppColors();` lines and
    remove the duplicate."""
    n = 0
    lines = src.split("\n")
    out = []
    seen_in_scope = set()
    brace_depth = 0
    in_func = False

    for line in lines:
        # Track function-body depth via `function NAME(` and `=>` heuristics.
        # When entering a new function block, reset seen.
        if re.match(r"^\s*(export\s+)?(default\s+)?function\s+[A-Z]", line):
            seen_in_scope = set()
            in_func = True
        if in_func:
            opens = line.count("{")
            closes = line.count("}")
            brace_depth += opens - closes
            if brace_depth <= 0 and (opens or closes):
                in_func = False
                seen_in_scope = set()

        m = re.match(r"^\s*const\s+c\s*=\s*useAppColors\(\)\s*;\s*$", line)
        if m:
            key = "c"
            if key in seen_in_scope:
                # Skip this duplicate.
                n += 1
                continue
            seen_in_scope.add(key)
        out.append(line)
    return "\n".join(out), n


def inject_hook_after_useStyles(src: str) -> tuple[str, int]:
    """In any function that calls useStyles() but doesn't declare `c`, add
    `const c = useAppColors();` right after the useStyles line."""
    if "useAppColors" not in src:
        return src, 0
    n = 0
    lines = src.split("\n")
    out = []
    i = 0
    while i < len(lines):
        out.append(lines[i])
        m = re.match(r"^(\s*)const\s+(s|styles|st|m)\s*=\s*useStyles\(\)\s*;\s*$", lines[i])
        if m:
            indent = m.group(1)
            # Look ahead in the same function body for either `c = useAppColors()` or end-of-func.
            already = False
            depth = 0
            for j in range(i + 1, min(i + 100, len(lines))):
                if re.search(r"\bconst\s+c\s*=\s*useAppColors\(\)", lines[j]):
                    already = True
                    break
                opens = lines[j].count("{")
                closes = lines[j].count("}")
                depth += opens - closes
                if depth < 0:
                    break  # exited scope without finding hook
            if not already:
                out.append(f"{indent}const c = useAppColors();")
                n += 1
        i += 1
    return "\n".join(out), n


def main():
    fixed = 0
    for f in FILES:
        path = ROOT / f
        if not path.exists():
            continue
        src = path.read_text()
        orig = src
        src, _ = ensure_import(src)
        src, dup = remove_duplicate_hook_decls(src)
        src, n = inject_hook_after_useStyles(src)
        if src != orig:
            path.write_text(src)
            print(f"  · {f} — hooks +{n}, duplicates removed {dup}")
            fixed += 1
    print(f"\n=== Fixed {fixed} files ===")


if __name__ == "__main__":
    main()
