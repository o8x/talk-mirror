package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/talk-mirror/talk-mirror/internal/api"
	"github.com/talk-mirror/talk-mirror/internal/config"
	"github.com/talk-mirror/talk-mirror/internal/hub"
	"github.com/talk-mirror/talk-mirror/internal/ingest"
	"github.com/talk-mirror/talk-mirror/internal/logger"
	"github.com/talk-mirror/talk-mirror/internal/server"
	"github.com/talk-mirror/talk-mirror/internal/session"
	"github.com/talk-mirror/talk-mirror/internal/state"
	"github.com/talk-mirror/talk-mirror/internal/store/buffer"
	"github.com/talk-mirror/talk-mirror/internal/store/leveldb"
	"github.com/talk-mirror/talk-mirror/internal/store/sqlite"
	"github.com/talk-mirror/talk-mirror/internal/tlsutil"
)

func main() {
	cfg, err := config.ParseFlags()
	if err != nil {
		slog.Error("parse flags", "error", err)
		os.Exit(1)
	}

	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		slog.Error("create data dir", "error", err)
		os.Exit(1)
	}

	log, closeLog, err := logger.New(cfg.LogPath())
	if err != nil {
		slog.Error("init logger", "error", err)
		os.Exit(1)
	}
	defer closeLog()

	log.Info("talk-mirror starting", "data_dir", cfg.DataDir, "log_file", cfg.LogPath())

	db, err := sqlite.Open(cfg.DBPath())
	if err != nil {
		log.Error("open sqlite", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := os.MkdirAll(cfg.LevelDBPath(), 0o755); err != nil {
		log.Error("create leveldb dir", "error", err)
		os.Exit(1)
	}
	ldb, err := leveldb.Open(cfg.LevelDBPath())
	if err != nil {
		log.Error("open leveldb", "error", err)
		os.Exit(1)
	}
	defer ldb.Close()

	settings, err := db.AllSettings()
	if err != nil {
		log.Error("load settings", "error", err)
		os.Exit(1)
	}
	for k, v := range config.DefaultSettings() {
		if _, ok := settings[k]; !ok {
			if err := db.SetSetting(k, v); err != nil {
				log.Error("write default setting", "key", k, "error", err)
			}
		}
	}
	settings, _ = db.AllSettings()

	gate := &state.Gate{}
	if settings[config.KeyPaused] == "true" {
		gate.Pause()
		log.Info("system resumed in paused state")
	}

	h := hub.New(log)
	buf := buffer.New(ldb, 0, 0)
	mgr := session.NewManager(db, buf, h, log)

	// Data listener (TCP + UDP).
	dataHost := settings[config.KeyDataHost]
	if dataHost == "" {
		dataHost = config.DefaultDataHost
	}
	dataPort, _ := strconv.Atoi(settings[config.KeyDataPort])
	if dataPort == 0 {
		dataPort = config.DefaultDataPort
	}
	ing := ingest.New(dataHost, dataPort, mgr, gate, log)
	if err := ing.Start(); err != nil {
		log.Error("start data listener", "addr", net.JoinHostPort(dataHost, strconv.Itoa(dataPort)), "error", err)
		os.Exit(1)
	}
	defer ing.Close()

	// TLS certificate.
	certPath := settings[config.KeyTLSCert]
	keyPath := settings[config.KeyTLSKey]
	if certPath == "" || keyPath == "" {
		certPath, keyPath = cfg.CertPath(), cfg.KeyPath()
	}
	cert, err := tlsutil.EnsureCertificate(certPath, keyPath)
	if err != nil {
		log.Error("prepare tls certificate", "error", err)
		os.Exit(1)
	}
	log.Info("tls certificate ready", "cert", certPath, "key", keyPath)

	// Web server.
	webHost := settings[config.KeyWebHost]
	if webHost == "" {
		webHost = config.DefaultWebHost
	}
	webPort, _ := strconv.Atoi(settings[config.KeyWebPort])
	if webPort == 0 {
		webPort = config.DefaultWebPort
	}
	apiHandler := api.New(mgr, buf, db, gate, h, cfg, log)
	srv := server.New(webHost, webPort, cert, viewsFS, h, apiHandler, log)

	go func() {
		if err := srv.Start(); err != nil {
			log.Error("web server stopped", "error", err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go buf.Run(ctx.Done())
	go mgr.Run(ctx.Done())

	<-ctx.Done()
	log.Info("shutting down")
	_ = srv.Close()
}
