#!/bin/sh
set -e

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop talk-mirror.service 2>/dev/null || true
  systemctl disable talk-mirror.service 2>/dev/null || true
  systemctl daemon-reload 2>/dev/null || true
fi

exit 0
