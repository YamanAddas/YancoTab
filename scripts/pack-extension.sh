#!/usr/bin/env bash
# pack-extension.sh — Build a clean CWS-ready zip.
#
# Run from the repo root:
#   bash scripts/pack-extension.sh          # → yancotab-v<version>.zip
#   bash scripts/pack-extension.sh out.zip  # → out.zip
#
# Copies to a temp staging dir (avoids file-lock issues), excludes dev
# files, then zips. Works on macOS/Linux (zip) and Windows (PowerShell).
# Result should be < 10 MB (CWS limit).

set -euo pipefail

if [ ! -f package.json ]; then
  echo "Error: run from the repo root (where package.json lives)" >&2
  exit 1
fi

# Resolve native path for node/PowerShell on Windows
native_path() {
  if command -v cygpath &>/dev/null; then cygpath -w "$1"; else echo "$1"; fi
}

VERSION=$(node -e "process.stdout.write(require('./package.json').version)")
OUTNAME="${1:-yancotab-v${VERSION}.zip}"
OUT="$(pwd)/${OUTNAME}"

echo "Packing YancoTab v${VERSION}..."
rm -f "$OUT"

# ── Stage: copy to temp dir, skipping excluded paths ──
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

EXCLUDES=(
  '.git' '.github' '.claude' 'node_modules' 'tests' 'scripts' 'concepts'
  'CLAUDE.md' 'CONTRIBUTING.md' 'PRODUCTION_PLAN.md' 'SECURITY.md'
  'CHANGELOG.md' 'README.md' 'LICENSE' 'STORE_LISTING.md'
  '.gitignore' '.gitattributes'
  'package.json' 'package-lock.json' 'landing.html' 'sw.js'
  'manifest.webmanifest' '.DS_Store' 'Thumbs.db'
  # Dev artifacts at repo root that aren't part of the extension
  'kofi-logo-generator.html' 'promo-tile-generator.html' 'icon-concepts.html'
  'yancotab.png' 'yancotab-clean.png'
  'V1_COMPLETION_PLAN.md'
  # CWS listing assets — uploaded separately to the developer dashboard,
  # not part of the extension payload itself
  'assets/store'
)

if command -v rsync &>/dev/null; then
  RSYNC_EXCLUDES=()
  for pat in "${EXCLUDES[@]}"; do RSYNC_EXCLUDES+=(--exclude "$pat"); done
  RSYNC_EXCLUDES+=(--exclude '*.zip')
  rsync -a "${RSYNC_EXCLUDES[@]}" ./ "$STAGE/"
else
  # No rsync: cp everything then prune
  cp -r . "$STAGE/" 2>/dev/null || true
  for pat in "${EXCLUDES[@]}"; do rm -rf "${STAGE:?}/$pat"; done
  rm -f "$STAGE"/*.zip
fi

# ── Zip ──
if command -v zip &>/dev/null; then
  (cd "$STAGE" && zip -r "$OUT" . > /dev/null)
else
  # Windows: PowerShell Compress-Archive
  WINSTAGE=$(native_path "$STAGE")
  WINOUT=$(native_path "$OUT")
  powershell -NoProfile -Command "Compress-Archive -Path '$WINSTAGE\*' -DestinationPath '$WINOUT' -Force"
fi

# ── Report ──
if [ ! -f "$OUT" ]; then
  echo "Error: zip was not created" >&2
  exit 1
fi

WINOUT_NODE=$(native_path "$OUT")
node -e "
  const s = require('fs').statSync(process.argv[1]).size;
  const mb = (s / 1048576).toFixed(2);
  console.log('-> ' + process.argv[2] + ' (' + mb + ' MB)');
  if (s > 10485760) { console.log('WARNING: exceeds 10 MB CWS limit!'); process.exit(1); }
  console.log('Under 10 MB CWS limit');
" "$WINOUT_NODE" "$OUTNAME"
