#!/bin/bash
# Build a macOS .pkg installer (binary + LaunchDaemon plist) via pkgbuild.
#
# Usage: package.sh <binary> <version> <arch> <output-dir>
set -euo pipefail

# Avoid AppleDouble (._) metadata files being packaged on macOS.
export COPYFILE_DISABLE=1

BINARY="$1"
VERSION="$2"
ARCH="$3"
OUT="$4"

mkdir -p "$OUT"
STAGING="$(mktemp -d)"
SCRIPTS="$(mktemp -d)"
trap 'rm -rf "$STAGING" "$SCRIPTS"' EXIT

mkdir -p "$STAGING/usr/local/bin"
mkdir -p "$STAGING/Library/LaunchDaemons"

# Ad-hoc sign the binary so Gatekeeper does not reject it outright.
codesign --force --sign - "$BINARY" >/dev/null 2>&1 || true
cp "$BINARY" "$STAGING/usr/local/bin/talk-mirror"
cp packaging/macos/com.talk-mirror.plist "$STAGING/Library/LaunchDaemons/com.talk-mirror.plist"
cp packaging/macos/postinstall.sh "$SCRIPTS/postinstall"
chmod 0755 "$SCRIPTS/postinstall"

pkgbuild \
  --root "$STAGING" \
  --scripts "$SCRIPTS" \
  --identifier com.talk-mirror \
  --version "$VERSION" \
  --install-location / \
  "$OUT/talk-mirror-${VERSION}-${ARCH}.pkg"

echo "built: $OUT/talk-mirror-${VERSION}-${ARCH}.pkg"
