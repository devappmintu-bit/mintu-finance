#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bundle-size audit for the MintU Expo app.
#
# Produces two reports so the team can track bloat over time:
#   1. A flat text summary of the 30 heaviest modules (by gzipped size).
#   2. A sorted list of every `node_modules/<pkg>` consumed by the bundle.
#
# Usage:
#   bash /app/frontend/scripts/bundle_audit.sh
#
# Output goes to /app/frontend/.bundle-report/ (git-ignored — add it to
# your .gitignore if you commit this script).
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="/app/frontend"
OUT="$ROOT/.bundle-report"
mkdir -p "$OUT"

echo "→ Exporting production bundle for web (smallest surface)…"
cd "$ROOT"
# `expo export` writes a `dist/` directory that contains the bundle +
# sourcemaps. The --platform=web target keeps the audit fast for dev
# machines; pass PLATFORM=ios or android as env to switch.
PLATFORM="${PLATFORM:-web}"
npx expo export --platform="$PLATFORM" --dump-sourcemap --output-dir="$OUT/export" 2>&1 | tail -30

BUNDLE=$(find "$OUT/export" -name "*.js" -size +100k | head -1)
if [ -z "$BUNDLE" ]; then
  echo "ERROR: no JS bundle found under $OUT/export — check expo export output."
  exit 1
fi

SIZE_KB=$(du -k "$BUNDLE" | awk '{print $1}')
SIZE_GZ_KB=$(gzip -c "$BUNDLE" | wc -c | awk '{print int($1/1024)}')

cat > "$OUT/SUMMARY.md" <<MD
# Bundle Audit · $(date +%Y-%m-%d)

| Metric | Value |
|---|---|
| Platform | $PLATFORM |
| Bundle file | \`$(basename "$BUNDLE")\` |
| Raw size | ${SIZE_KB} KB |
| Gzipped size | ${SIZE_GZ_KB} KB |

## 30 heaviest \`node_modules/*\` packages

(measured by count of lines whose source points into \`node_modules\`)
MD

# Count occurrences of each package path in the sourcemap (cheap proxy
# for "how much code from this package landed in the bundle").
grep -oE '"node_modules/[^"]*"' "$BUNDLE".map 2>/dev/null \
  | sed -E 's#.*node_modules/(@[^/]+/[^/]+|[^/]+).*#\1#' \
  | sort | uniq -c | sort -rn | head -30 \
  | awk '{printf "  %s × %s\n", $1, $2}' >> "$OUT/SUMMARY.md" \
  || echo "  (no sourcemap — pass --dump-sourcemap)" >> "$OUT/SUMMARY.md"

echo ""
echo "→ Report written to $OUT/SUMMARY.md"
echo ""
cat "$OUT/SUMMARY.md"
