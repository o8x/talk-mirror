package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/o8x/talk-mirror/internal/api"
	"github.com/o8x/talk-mirror/internal/config"
	"github.com/o8x/talk-mirror/internal/hub"
	"github.com/o8x/talk-mirror/internal/ingest"
	"github.com/o8x/talk-mirror/internal/logger"
	"github.com/o8x/talk-mirror/internal/server"
	"github.com/o8x/talk-mirror/internal/service"
	"github.com/o8x/talk-mirror/internal/session"
	"github.com/o8x/talk-mirror/internal/state"
	"github.com/o8x/talk-mirror/internal/store/buffer"
	"github.com/o8x/talk-mirror/internal/store/leveldb"
	"github.com/o8x/talk-mirror/internal/store/sqlite"
	"github.com/o8x/talk-mirror/internal/tlsutil"
)

func main() {
	cfg, err := config.ParseFlags()
	if err != nil {
		slog.Error("parse flags", "error", err)
		os.Exit(1)
	}

	if service.IsService() {
		if err := service.Run("talk-mirror", func(ctx context.Context) error {
			return runApp(ctx, cfg)
		}); err != nil {
			slog.Error("service error", "error", err)
			os.Exit(1)
		}
		return
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := runApp(ctx, cfg); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func runApp(ctx context.Context, cfg *config.Config) error {
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		return err
	}

	log, closeLog, err := logger.New(cfg.LogPath())
	if err != nil {
		return err
	}
	defer closeLog()

	log.Info("talk-mirror starting", "data_dir", cfg.DataDir, "log_file", cfg.LogPath())

	db, err := sqlite.Open(cfg.DBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	if err := os.MkdirAll(cfg.LevelDBPath(), 0o755); err != nil {
		return err
	}
	ldb, err := leveldb.Open(cfg.LevelDBPath())
	if err != nil {
		return err
	}
	defer ldb.Close()

	settings, err := db.AllSettings()
	if err != nil {
		return err
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
	if cfg.TalkPort != 0 {
		dataPort = cfg.TalkPort
	}
	ing := ingest.New(dataHost, dataPort, mgr, gate, log)
	if err := ing.Start(); err != nil {
		return err
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
		return err
	}
	log.Info("tls certificate ready", "cert", certPath, "key", keyPath)

	// Web server (CLI --host/--port override the persisted settings).
	webHost := settings[config.KeyWebHost]
	if webHost == "" {
		webHost = config.DefaultWebHost
	}
	if cfg.Host != "" {
		webHost = cfg.Host
	}
	webPort, _ := strconv.Atoi(settings[config.KeyWebPort])
	if webPort == 0 {
		webPort = config.DefaultWebPort
	}
	if cfg.Port != 0 {
		webPort = cfg.Port
	}
	apiHandler := api.New(mgr, buf, db, gate, h, cfg, dataPort, log)
	srv := server.New(webHost, webPort, cert, viewsFS, h, apiHandler, log)

	go func() {
		if err := srv.Start(); err != nil {
			log.Error("web server stopped", "error", err)
		}
	}()

	go buf.Run(ctx.Done())
	go mgr.Run(ctx.Done())

	<-ctx.Done()
	log.Info("shutting down")
	buf.Flush()
	mgr.SyncCounts()
	return srv.Close()
}
