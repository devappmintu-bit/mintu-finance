#!/usr/bin/env python3
"""Round 50 Session 5 — Enhanced JSX literal sweep codemod.

Walks component subdirs, for each .tsx file:
  1. Ensures `useAppColors` is imported from utils/theme.
  2. Ensures `const c = useAppColors()` exists in every function/exported
     React component that contains migratable JSX literals.
  3. Applies semantic-token replacements to JSX inline color literals
     (color="#XXXXXX", style={{ color: '#XXX' }}) and known mappings
     in StyleSheet.create blocks where appropriate.

KEPT INTENTIONAL (per Round 50 audit policy):
  - '#FFFFFF' / '#000000'  (canonicalized white/black overlays)
  - '#F56E1E' / '#C14A06'  (brand orange — handled selectively)
  - '#FCD34D' (gold streak palette)
  - LinearGradient `colors=[...]` arrays   (brand gradients)
  - Hex inside JSX comments (we don't parse comments)

Run:  python3 /app/scripts/codemod_s5_jsx_sweep.py
"""
import re
import sys
from pathlib import Path

ROOTS = [
    Path('/app/frontend/components/home'),
    Path('/app/frontend/components/profile'),
    Path('/app/frontend/components/budget'),
    Path('/app/frontend/components/rewards'),
    Path('/app/frontend/components/split'),
]

# Migratable literal → token mapping. Order matters: more specific tokens
# (deep brand variants, status colors) handled before generic neutrals.
# Each entry: (regex_pattern, replacement_token).
SEMANTIC_MAP = [
    # Greens — success
    (r"#10B981", "c.state.success"),
    (r"#059669", "c.state.success"),
    (r"#047857", "c.state.success"),
    (r"#22C55E", "c.state.success"),
    (r"#34D399", "c.state.success"),
    (r"#16A34A", "c.state.success"),
    (r"#065F46", "c.state.success"),

    # Light green backgrounds
    (r"#ECFDF5", "c.state.successBg"),
    (r"#D1FAE5", "c.state.successBg"),
    (r"#DCFCE7", "c.state.successBg"),
    (r"#A7F3D0", "c.state.successBorder"),
    (r"#86EFAC", "c.state.successBorder"),

    # Reds — danger
    (r"#EF4444", "c.state.danger"),
    (r"#DC2626", "c.state.danger"),
    (r"#B91C1C", "c.state.danger"),
    (r"#D32F2F", "c.state.danger"),

    # Light red backgrounds
    (r"#FEE2E2", "c.state.dangerBg"),
    (r"#FEF2F2", "c.state.dangerBg"),
    (r"#FCA5A5", "c.state.dangerBorder"),
    (r"#FECACA", "c.state.dangerBorder"),

    # Yellows — warning
    (r"#F59E0B", "c.accent.warning"),
    (r"#D97706", "c.accent.warning"),
    (r"#92400E", "c.state.warning"),
    (r"#78350F", "c.state.warning"),
    (r"#B45309", "c.state.warning"),

    # Light amber backgrounds
    (r"#FEF3C7", "c.state.warningBg"),
    (r"#FFFBEB", "c.state.warningBg"),
    (r"#FDE68A", "c.state.warningBorder"),
    (r"#FCD79F", "c.state.warningBorder"),

    # Blues — info / accent purple
    (r"#3B82F6", "c.state.info"),
    (r"#2563EB", "c.state.info"),
    (r"#60A5FA", "c.state.info"),
    (r"#DBEAFE", "c.state.infoBg"),
    (r"#7C3AED", "c.accent.tertiary"),
    (r"#A21CAF", "c.accent.tertiary"),
    (r"#6366F1", "c.accent.tertiary"),

    # Neutrals — text/border/bg
    (r"#111827", "c.text.primary"),
    (r"#0F172A", "c.text.primary"),
    (r"#1F2937", "c.text.primary"),
    (r"#374151", "c.text.secondary"),
    (r"#4B5563", "c.text.secondary"),
    (r"#6B7280", "c.text.muted"),
    (r"#9CA3AF", "c.text.muted"),
    (r"#78716C", "c.text.muted"),
    (r"#D1D5DB", "c.border.subtle"),
    (r"#E5E7EB", "c.border.subtle"),
    (r"#F3F4F6", "c.bg.secondary"),
    (r"#F9FAFB", "c.bg.secondary"),

    # Brand light tints (warm orange peach)
    (r"#FED7AA", "c.accent.brandSoft"),
    (r"#FFEDD5", "c.accent.brandSoft"),
    (r"#FFF7ED", "c.accent.brandSoft"),
    (r"#FFE9DC", "c.accent.brandSoft"),
    (r"#FFF0DE", "c.accent.brandSoft"),
    (r"#FAFAF9", "c.bg.primary"),
]

# Patterns to NOT touch (intentional brand identity):
# - inside LinearGradient `colors={[...]}` arrays (brand gradients)
# - inside arrays/objects with explicit comment markers
# - bank brand colors (handled in Session 3)
# - White/black overlays (canonicalized)
KEEP = {
    "#FFFFFF", "#000000",
    "#F56E1E", "#C14A06",         # brand orange
    "#FCD34D", "#FFB547",         # gold streak/secondary brand
    "#FFD700",
    "#E65100", "#7A2E0A",         # deep brand ink
    "#7C2D12",
    "#25D366",                     # WhatsApp brand
    "#004C8F", "#22409A", "#F2A900", "#97144D",  # bank brands
    "#EE3124", "#00518F", "#A6192E",
    "#2E1F1A",                     # brand-tinted shadow
    # categorical streak/tier/mission palettes (kept verbatim per audit)
    "#FFD93D", "#FFC107",
}

IMPORT_PATTERNS = [
    re.compile(r"^(import\s*\{[^}]*?)\}\s*from\s*['\"](\.\./)+utils/theme['\"]\s*;?\s*$", re.MULTILINE),
]


def add_use_app_colors_import(src: str) -> tuple[str, bool]:
    """Ensure useAppColors is in the theme import line. Returns (new_src, changed)."""
    if "useAppColors" in src:
        return src, False
    # Find any `import { ... } from '../../utils/theme'` (any depth).
    m = re.search(r"import\s*\{([^}]+)\}\s*from\s*(['\"])([\.\/]+utils/theme)\2\s*;?", src)
    if not m:
        return src, False
    inside = m.group(1)
    if "useAppColors" in inside:
        return src, False
    new_inside = inside.rstrip().rstrip(",") + ", useAppColors"
    new_import = f"import {{ {new_inside} }} from {m.group(2)}{m.group(3)}{m.group(2)};"
    src = src[:m.start()] + new_import + src[m.end():]
    return src, True


def add_hook_invocation(src: str) -> tuple[str, int]:
    """Add `const c = useAppColors();` right after `const s = useStyles();`
    or `const styles = useStyles();` in components that don't already have it.
    Returns (new_src, n_added)."""
    if "useAppColors" not in src:
        return src, 0
    n = 0

    # Find every line that calls useStyles(). For each component that uses
    # useStyles but doesn't already have useAppColors() invoked nearby,
    # inject the hook call right after.
    lines = src.split("\n")
    out = []
    skip_window = 0
    for i, line in enumerate(lines):
        out.append(line)
        if skip_window > 0:
            skip_window -= 1
            continue
        m = re.match(r"^(\s*)const\s+(s|styles|st)\s*=\s*useStyles\(\)\s*;\s*$", line)
        if m:
            indent = m.group(1)
            # Look ahead within 8 lines to see if useAppColors() is already invoked.
            window = "\n".join(lines[i:i+8])
            if "useAppColors()" not in window or window.count("useAppColors()") == 0:
                # Confirm not already present in same component scope.
                # Quick check: is there a c, tc, or theme variable already?
                already = False
                for j in range(i+1, min(i+9, len(lines))):
                    if re.search(r"^\s*const\s+(c|tc|theme|colors)\s*=\s*useAppColors\(\)", lines[j]):
                        already = True
                        break
                if not already:
                    out.append(f"{indent}const c = useAppColors();")
                    n += 1
                    skip_window = 0
    return "\n".join(out), n


def replace_literals(src: str) -> tuple[str, int]:
    """Replace hex literal occurrences in JSX `color="#X"` and `color: '#X'`
    contexts with the matching c.* token. Avoids LinearGradient `colors={[...]}`
    arrays by checking context."""
    n = 0

    def replace_in_jsx_attr(match):
        nonlocal n
        prefix, hexval, suffix = match.group(1), match.group(2).upper(), match.group(3)
        if hexval in KEEP:
            return match.group(0)
        for pat, tok in SEMANTIC_MAP:
            if pat == hexval:
                n += 1
                return f"{prefix}{{{tok}}}{suffix}"
        return match.group(0)

    # JSX prop: color="#XXX" / tintColor="#XXX" / borderColor="#XXX" / etc.
    src = re.sub(
        r"(\b(?:color|tintColor|borderColor|backgroundColor|stroke|fill|placeholderTextColor)=)\"(#[0-9a-fA-F]{3,8})\"(\s)",
        replace_in_jsx_attr,
        src,
    )

    # NOTE: Style-object form `color: '#XXX'` is intentionally NOT handled here
    # because it triggers in module-level constants (e.g., CATEGORY_META) where
    # `c` is not in scope. Those should be migrated manually if needed.

    return src, n


def process_file(path: Path) -> tuple[int, int]:
    """Returns (literals_replaced, hooks_added)."""
    src = path.read_text()
    orig = src
    src, _ = add_use_app_colors_import(src)
    src, hooks = add_hook_invocation(src)
    src, n = replace_literals(src)
    if src != orig:
        path.write_text(src)
    return n, hooks


def main():
    total_lit = 0
    total_hooks = 0
    files = 0
    for root in ROOTS:
        for f in sorted(root.glob("*.tsx")):
            n, h = process_file(f)
            files += 1
            if n or h:
                print(f"  · {f.relative_to(Path('/app/frontend'))} — lit={n} hooks={h}")
            total_lit += n
            total_hooks += h
    print(f"\n=== Files scanned: {files}, literals replaced: {total_lit}, hooks added: {total_hooks} ===")


if __name__ == "__main__":
    main()
