#!/bin/sh
set -e

mkdir -p /usr/local/var/talk-mirror

# Reload the LaunchDaemon so brew services / launchctl sees the fresh install.
launchctl bootout system/com.talk-mirror 2>/dev/null || true
launchctl bootstrap system /Library/LaunchDaemons/com.talk-mirror.plist 2>/dev/null || true
launchctl enable system/com.talk-mirror 2>/dev/null || true

exit 0
