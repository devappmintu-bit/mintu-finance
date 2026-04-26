#!/usr/bin/env python3
"""Dedup `const c = useAppColors();` declarations within the same function scope."""
import re
from pathlib import Path

ROOT = Path("/app/frontend/components")

def dedup_in_func(text: str) -> tuple[str, int]:
    """Walk through file, track function scope by `function NAME(` markers and
    brace depth. Within each function, keep only the FIRST
    `const c = useAppColors();` line."""
    lines = text.split("\n")
    out: list[str] = []
    in_func_stack: list[bool] = []  # tracks whether we've seen `c =` in current func
    brace_depth = 0
    n_removed = 0

    for line in lines:
        # Detect new function entrance.
        if re.search(r"\b(function\s+[A-Za-z_]|=>\s*\{)", line):
            in_func_stack.append(False)

        is_decl = re.match(r"^\s*const\s+c\s*=\s*useAppColors\(\)\s*;\s*$", line)
        if is_decl and in_func_stack and in_func_stack[-1]:
            n_removed += 1
            continue
        if is_decl and in_func_stack:
            in_func_stack[-1] = True
        if is_decl and not in_func_stack:
            # module-level — track separately
            in_func_stack.append(True)

        out.append(line)

        # Track depth (after writing the line).
        opens = line.count("{")
        closes = line.count("}")
        for _ in range(closes):
            if in_func_stack and brace_depth - 1 < len(in_func_stack):
                # When a closing brace pops a func scope.
                pass
        brace_depth += opens - closes
        # Heuristic: if we drop below the in_func_stack depth, pop.
        while in_func_stack and brace_depth < len(in_func_stack) - 1:
            in_func_stack.pop()

    return "\n".join(out), n_removed


def main():
    total = 0
    for f in ROOT.rglob("*.tsx"):
        src = f.read_text()
        # Only process files with > 1 declaration.
        if len(re.findall(r"^\s*const\s+c\s*=\s*useAppColors\(\)", src, re.MULTILINE)) <= 1:
            continue
        new, n = dedup_in_func(src)
        if n:
            f.write_text(new)
            print(f"  · {f.relative_to(Path('/app/frontend'))} — {n} duplicates removed")
            total += n
    print(f"\n=== Total duplicates removed: {total} ===")


if __name__ == "__main__":
    main()
