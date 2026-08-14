#!/bin/bash
# Build .deb and .rpm packages for one architecture using nfpm.
#
# Usage: package.sh <binary> <version> <arch> <output-dir>
set -euo pipefail

BINARY="$1"
VERSION="$2"
ARCH="$3"
OUT="$4"

mkdir -p "$OUT"

sed -e "s/__ARCH__/${ARCH}/g" \
    -e "s/__VERSION__/${VERSION}/g" \
    -e "s#__BINARY__#${BINARY}#g" \
    packaging/linux/nfpm.yaml > "$OUT/nfpm-${ARCH}.yaml"

nfpm package --config "$OUT/nfpm-${ARCH}.yaml" --packager deb --target "$OUT/talk-mirror_${VERSION}_${ARCH}.deb"
nfpm package --config "$OUT/nfpm-${ARCH}.yaml" --packager rpm --target "$OUT/talk-mirror-${VERSION}-${ARCH}.rpm"

echo "built:"
ls -la "$OUT"
