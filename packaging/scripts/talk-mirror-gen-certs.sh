#!/bin/sh
# DNAK-Analyzer TLS certificate generator.
#
# Creates a 3-year self-signed certificate with openssl. The DNAK-Analyzer
# service runs this automatically when no certificate is configured; you can
# also run it yourself to (re)generate the certificate at any time.
#
# Usage: DNAK-Analyzer-gen-certs.sh <cert-path> <key-path>

set -e

CERT="${1:-watch-view.crt}"
KEY="${2:-watch-view.key}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "error: openssl is required to generate the TLS certificate" >&2
  exit 1
fi

mkdir -p "$(dirname "$CERT")" "$(dirname "$KEY")"

openssl req -x509 -newkey rsa:2048 \
  -keyout "$KEY" -out "$CERT" -days 1095 -nodes \
  -subj "/CN=DNAK-Analyzer/O=DNAK-Analyzer" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign" \
  -addext "extendedKeyUsage=serverAuth"

chmod 0600 "$KEY"
chmod 0644 "$CERT"

echo "TLS certificate generated:"
echo "  cert: $CERT"
echo "  key:  $KEY"

openssl x509 -in $CERT -text -noout
