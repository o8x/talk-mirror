#!/bin/sh
set -e

# Create the service user if missing (portable across Debian/RHEL families).
if ! id -u talk-mirror >/dev/null 2>&1; then
  useradd -r -d /var/lib/talk-mirror talk-mirror 2>/dev/null || \
  useradd --system --home /var/lib/talk-mirror --shell /usr/sbin/nologin talk-mirror
fi

mkdir -p /var/lib/talk-mirror
chown -R talk-mirror:talk-mirror /var/lib/talk-mirror

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
  systemctl enable talk-mirror.service || true
fi

exit 0
