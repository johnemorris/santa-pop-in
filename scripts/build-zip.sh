#!/usr/bin/env bash
# Builds the Chrome Web Store upload: only the files the extension needs.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/build-zip.js
