#!/bin/bash
# Build a self-extracting .run installer for Linux (systemd + binary + user setup).
#
# Usage: make_run.sh <binary> <version> <arch> <output-dir>
set -euo pipefail

BINARY="$1"
VERSION="$2"
ARCH="$3"
OUT="$4"

mkdir -p "$OUT"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

cp "$BINARY" "$STAGING/talk-mirror"
cp packaging/linux/talk-mirror.service "$STAGING/talk-mirror.service"
cp packaging/linux/talk-mirror.default "$STAGING/talk-mirror.default"
cp packaging/scripts/talk-mirror-gen-certs.sh "$STAGING/talk-mirror-gen-certs.sh"
chmod 0755 "$STAGING/talk-mirror" "$STAGING/talk-mirror-gen-certs.sh"

RUN_FILE="$OUT/talk-mirror-v${VERSION}_linux-${ARCH}.run"

# The installer header. Everything after the __ARCHIVE_BELOW__ marker is the
# gzip-compressed tar payload.
cat > "$RUN_FILE" <<'HEADER'
#!/bin/sh
# Talk-mirror self-extracting installer
set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root: sudo $0" >&2
  exit 1
fi

ARCHIVE_LINE=$(awk '/^__ARCHIVE_BELOW__$/ { print NR + 1; exit 0 }' "$0")
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

tail -n +"$ARCHIVE_LINE" "$0" | tar xz -C "$TMPDIR"

install -m 0755 "$TMPDIR/talk-mirror" /usr/bin/talk-mirror
install -m 0755 "$TMPDIR/talk-mirror-gen-certs.sh" /usr/bin/talk-mirror-gen-certs.sh
install -m 0644 "$TMPDIR/talk-mirror.service" /etc/systemd/system/talk-mirror.service
install -m 0644 "$TMPDIR/talk-mirror.default" /etc/default/talk-mirror

if ! id -u talk-mirror >/dev/null 2>&1; then
  useradd -r -d /var/lib/talk-mirror talk-mirror 2>/dev/null || \
  useradd --system --home /var/lib/talk-mirror --shell /usr/sbin/nologin talk-mirror
fi
mkdir -p /var/lib/talk-mirror
chown -R talk-mirror:talk-mirror /var/lib/talk-mirror

systemctl daemon-reload
systemctl enable --now talk-mirror.service

echo ""
echo "Talk-mirror installed and started."
echo "  UI:     https://<host>:443"
echo "  Data:   /var/lib/talk-mirror"
echo "  Manage: systemctl status|stop|start talk-mirror"
exit 0
__ARCHIVE_BELOW__
HEADER

# Append the payload archive.
(cd "$STAGING" && tar czf - .) >> "$RUN_FILE"
chmod 0755 "$RUN_FILE"

echo "built: $RUN_FILE"
