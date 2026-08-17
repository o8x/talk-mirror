package tlsutil

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// certScript is the packaged openssl helper that generates certificates.
const certScript = "talk-mirror-gen-certs.sh"

// EnsureCertificate returns a tls.Certificate, generating a 3-year self-signed
// certificate into certPath/keyPath when none exists yet. Generation is
// delegated to the packaged talk-mirror-gen-certs.sh helper (openssl) when
// available, falling back to the built-in generator otherwise.
func EnsureCertificate(certPath, keyPath string) (tls.Certificate, error) {
	if _, err := os.Stat(certPath); err == nil {
		if _, err := os.Stat(keyPath); err == nil {
			return tls.LoadX509KeyPair(certPath, keyPath)
		}
	}
	if err := generate(certPath, keyPath); err != nil {
		return tls.Certificate{}, err
	}
	return tls.LoadX509KeyPair(certPath, keyPath)
}

// generate creates a self-signed certificate, preferring the packaged openssl
// helper script and falling back to the built-in generator.
func generate(certPath, keyPath string) error {
	if err := generateWithScript(certPath, keyPath); err == nil {
		return nil
	}
	return generateBuiltin(certPath, keyPath)
}

// generateWithScript runs the packaged talk-mirror-gen-certs.sh helper, which
// uses openssl to create the certificate.
func generateWithScript(certPath, keyPath string) error {
	script := findScript()
	if script == "" {
		return fmt.Errorf("cert script %s not found", certScript)
	}
	out, err := exec.Command("sh", script, certPath, keyPath).CombinedOutput()
	if err != nil {
		return fmt.Errorf("run cert script: %w: %s", err, strings.TrimSpace(string(out)))
	}
	if _, err := os.Stat(certPath); err != nil {
		return fmt.Errorf("cert script did not produce %s", certPath)
	}
	if _, err := os.Stat(keyPath); err != nil {
		return fmt.Errorf("cert script did not produce %s", keyPath)
	}
	return nil
}

// findScript locates the certificate helper next to the executable or in PATH.
func findScript() string {
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		for _, name := range []string{certScript, strings.TrimSuffix(certScript, ".sh")} {
			p := filepath.Join(dir, name)
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	if p, err := exec.LookPath(certScript); err == nil {
		return p
	}
	return ""
}

// generateBuiltin is the fallback generator used when the helper script or
// openssl is unavailable (e.g. running the bare binary from `make build`).
func generateBuiltin(certPath, keyPath string) error {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return fmt.Errorf("generate key: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return fmt.Errorf("generate serial: %w", err)
	}

	now := time.Now()
	tmpl := x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: "talk-mirror", Organization: []string{"Talk-mirror"}},
		NotBefore:             now.Add(-time.Hour),
		NotAfter:              now.AddDate(3, 0, 0),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")},
		DNSNames:              []string{"localhost"},
		IsCA:                  true,
		BasicConstraintsValid: true,
	}

	der, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &key.PublicKey, key)
	if err != nil {
		return fmt.Errorf("create certificate: %w", err)
	}

	certOut, err := os.OpenFile(certPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("open cert: %w", err)
	}
	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: der}); err != nil {
		_ = certOut.Close()
		return fmt.Errorf("encode cert: %w", err)
	}
	_ = certOut.Close()

	keyOut, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("open key: %w", err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		_ = keyOut.Close()
		return fmt.Errorf("marshal key: %w", err)
	}
	if err := pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}); err != nil {
		_ = keyOut.Close()
		return fmt.Errorf("encode key: %w", err)
	}
	_ = keyOut.Close()

	return nil
}
