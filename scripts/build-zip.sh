#!/usr/bin/env bash
# Builds the Chrome Web Store upload: only the files the extension needs.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/santa-pop-in-$VERSION.zip"
mkdir -p dist && rm -f "$OUT"
zip -q -X "$OUT" manifest.json background.js content.js styles.css popup.html popup.css popup.js settings.js \
  images/icon16.png images/icon48.png images/icon128.png \
  images/santa-walk.webp images/peek-santa.webp images/sleigh.webp
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
