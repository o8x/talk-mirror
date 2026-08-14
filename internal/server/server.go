package server

import (
	"crypto/tls"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/talk-mirror/talk-mirror/internal/api"
	"github.com/talk-mirror/talk-mirror/internal/hub"
)

// Server is the TLS HTTP server serving the SPA, REST API and WebSocket.
type Server struct {
	host   string
	port   int
	cert   tls.Certificate
	views  fs.FS
	hub    *hub.Hub
	api    *api.Handler
	log    *slog.Logger
	server *http.Server
}

func New(host string, port int, cert tls.Certificate, views fs.FS, h *hub.Hub, a *api.Handler, log *slog.Logger) *Server {
	return &Server{host: host, port: port, cert: cert, views: views, hub: h, api: a, log: log}
}

func (s *Server) buildHandler() http.Handler {
	mux := http.NewServeMux()
	s.api.Register(mux)
	mux.HandleFunc("/ws", s.hub.ServeWS)

	dist, err := fs.Sub(s.views, "views/dist")
	if err != nil {
		dist = s.views
	}
	fileServer := http.FileServer(http.FS(dist))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws" {
			mux.ServeHTTP(w, r)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if f, err := dist.Open(path); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback to index.html for client-side routes.
		http.ServeFileFS(w, r, dist, "index.html")
	})
}

func (s *Server) Start() error {
	s.server = &http.Server{
		Addr:      s.addr(),
		Handler:   s.buildHandler(),
		TLSConfig: &tls.Config{Certificates: []tls.Certificate{s.cert}, MinVersion: tls.VersionTLS12},
	}
	s.log.Info("web server started", "addr", s.addr(), "tls", true)
	return s.server.ListenAndServeTLS("", "")
}

func (s *Server) Close() error {
	if s.server != nil {
		return s.server.Close()
	}
	return nil
}

func (s *Server) addr() string {
	return net.JoinHostPort(s.host, strconv.Itoa(s.port))
}
