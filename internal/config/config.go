package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// Defaults applied when a setting is absent.
const (
	DefaultWebHost  = "0.0.0.0"
	DefaultWebPort  = 443
	DefaultDataHost = "0.0.0.0"
	DefaultDataPort = 3000

	DefaultThemeColor = "#c62828"
	DefaultDarkMode   = false
	DefaultPaused     = false

	DefaultAuthKey = "tm-76c296d3244f05b26cd082254"
)

// DefaultDataDir is the fallback value of the -d flag. Packaged builds override
// it at link time, e.g. -ldflags "-X
// github.com/o8x/talk-mirror/internal/config.DefaultDataDir=/var/lib/talk-mirror".
var DefaultDataDir = "./data"

// Config carries all runtime configuration resolved from flags and settings.
type Config struct {
	DataDir  string // -d, root data folder
	LogFile  string // -w, optional explicit log file path
	ExeDir   string // directory of the running binary
	Host     string // --host, override web listen address (empty = use settings)
	Port     int    // --port, override web listen port (0 = use settings)
	TalkPort int    // --talk-port, override data listen port (0 = use settings)
	Key      string // --key, super-admin login key (empty = use the stored key)
}

// Paths derived from DataDir.
func (c *Config) DBPath() string      { return filepath.Join(c.DataDir, "talk-mirror.db") }
func (c *Config) LevelDBPath() string { return filepath.Join(c.DataDir, "leveldb") }
func (c *Config) CertPath() string    { return filepath.Join(c.DataDir, "cert.pem") }
func (c *Config) KeyPath() string     { return filepath.Join(c.DataDir, "key.pem") }
func (c *Config) LogPath() string {
	if c.LogFile != "" {
		return c.LogFile
	}
	return filepath.Join(c.DataDir, "talk-mirror.log")
}

// ParseFlags resolves the -d and -w command line flags.
func ParseFlags() (*Config, error) {
	dataDir := flag.String("d", DefaultDataDir, "data directory for sqlite, leveldb, certs and logs")
	logFile := flag.String("w", "", "log file path (defaults to <data-dir>/talk-mirror.log)")
	host := flag.String("host", "", "override web listen address (default: use settings)")
	port := flag.Int("port", 0, "override web listen port (default: use settings)")
	talkPort := flag.Int("talk-port", 0, "override data listen port (default: use settings)")
	key := flag.String("key", "", "super-admin login key (default: use the stored key)")
	flag.Parse()

	absData, err := filepath.Abs(*dataDir)
	if err != nil {
		return nil, fmt.Errorf("resolve data dir: %w", err)
	}
	absLog := ""
	if *logFile != "" {
		if absLog, err = filepath.Abs(*logFile); err != nil {
			return nil, fmt.Errorf("resolve log file: %w", err)
		}
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve executable: %w", err)
	}

	return &Config{
		DataDir:  absData,
		LogFile:  absLog,
		ExeDir:   filepath.Dir(exe),
		Host:     *host,
		Port:     *port,
		TalkPort: *talkPort,
		Key:      *key,
	}, nil
}

// Setting keys persisted in sqlite.
const (
	KeyWebHost    = "web_host"
	KeyWebPort    = "web_port"
	KeyDataHost   = "data_host"
	KeyDataPort   = "data_port"
	KeyTLSCert    = "tls_cert"
	KeyTLSKey     = "tls_key"
	KeyThemeColor = "theme_color"
	KeyDarkMode   = "dark_mode"
	KeyPaused     = "paused"
	KeyAuthKey    = "auth_key"
)

// DefaultSettings returns the key/value defaults written on first run.
func DefaultSettings() map[string]string {
	return map[string]string{
		KeyWebHost:    DefaultWebHost,
		KeyWebPort:    strconv.Itoa(DefaultWebPort),
		KeyDataHost:   DefaultDataHost,
		KeyDataPort:   strconv.Itoa(DefaultDataPort),
		KeyTLSCert:    "",
		KeyTLSKey:     "",
		KeyThemeColor: DefaultThemeColor,
		KeyDarkMode:   strconv.FormatBool(DefaultDarkMode),
		KeyPaused:     strconv.FormatBool(DefaultPaused),
		KeyAuthKey:    DefaultAuthKey,
	}
}
