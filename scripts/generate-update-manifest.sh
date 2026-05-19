#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

TARBALL=$(ls src-tauri/target/universal-apple-darwin/release/bundle/macos/*.app.tar.gz 2>/dev/null | head -1)
if [[ -z "$TARBALL" ]]; then
  echo "ERROR: no .app.tar.gz found in universal-apple-darwin bundle" >&2
  exit 1
fi
SIG=$(cat "${TARBALL}.sig")
FILENAME=$(basename "$TARBALL")

cat > latest.json <<EOF
{
  "version": "${VERSION}",
  "notes": "Voir https://github.com/oukacha789/egestion-bureau/releases/tag/v${VERSION}",
  "pub_date": "${DATE}",
  "platforms": {
    "darwin-aarch64": {
      "signature": "${SIG}",
      "url": "https://github.com/oukacha789/egestion-bureau/releases/download/v${VERSION}/${FILENAME}"
    },
    "darwin-x86_64": {
      "signature": "${SIG}",
      "url": "https://github.com/oukacha789/egestion-bureau/releases/download/v${VERSION}/${FILENAME}"
    }
  }
}
EOF

echo "latest.json generated for v${VERSION}"
cat latest.json
