package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/talk-mirror/talk-mirror/internal/config"
	"github.com/talk-mirror/talk-mirror/internal/hub"
	"github.com/talk-mirror/talk-mirror/internal/model"
	"github.com/talk-mirror/talk-mirror/internal/session"
	"github.com/talk-mirror/talk-mirror/internal/state"
	"github.com/talk-mirror/talk-mirror/internal/store/buffer"
	"github.com/talk-mirror/talk-mirror/internal/store/sqlite"
)

// Handler serves the REST API.
type Handler struct {
	mgr  *session.Manager
	buf  *buffer.Buffer
	db   *sqlite.Store
	gate *state.Gate
	hub  *hub.Hub
	cfg  *config.Config
	log  *slog.Logger
}

func New(mgr *session.Manager, buf *buffer.Buffer, db *sqlite.Store, gate *state.Gate, h *hub.Hub, cfg *config.Config, log *slog.Logger) *Handler {
	return &Handler{mgr: mgr, buf: buf, db: db, gate: gate, hub: h, cfg: cfg, log: log}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/stats/overview", h.overview)
	mux.HandleFunc("GET /api/connections", h.listConnections)
	mux.HandleFunc("GET /api/connections/{id}", h.connectionDetail)
	mux.HandleFunc("GET /api/sessions", h.listSessions)
	mux.HandleFunc("GET /api/sessions/{id}/messages", h.sessionMessages)
	mux.HandleFunc("GET /api/settings", h.getSettings)
	mux.HandleFunc("POST /api/settings", h.saveSettings)
	mux.HandleFunc("POST /api/pause", h.pause)
	mux.HandleFunc("GET /api/code/{lang}", h.code)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// --- stats ---

type overviewResponse struct {
	TotalMessages     int64          `json:"total_messages"`
	QPS               float64        `json:"qps"`
	ActiveConnections int            `json:"active_connections"`
	ActiveSessions    int            `json:"active_sessions"`
	TotalConnections  int            `json:"total_connections"`
	TotalSessions     int            `json:"total_sessions"`
	Buckets           []bucketPoint  `json:"buckets"`
}

type bucketPoint struct {
	TS    int64 `json:"ts"`
	Count int64 `json:"count"`
}

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	seconds := int64(300)
	if v := r.URL.Query().Get("seconds"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			seconds = n
		}
	}
	bucket := int64(seconds / 120)
	if bucket < 1 {
		bucket = 1
	}
	if v := r.URL.Query().Get("bucket"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			bucket = n
		}
	}

	now := time.Now().UnixNano()
	start := now - seconds*int64(time.Second)

	buckets, _ := h.buf.Buckets(start, now, bucket*int64(time.Second))
	points := make([]bucketPoint, 0, len(buckets))
	for ts, count := range buckets {
		points = append(points, bucketPoint{TS: ts, Count: count})
	}
	sort.Slice(points, func(i, j int) bool { return points[i].TS < points[j].TS })

	qps := 0.0
	if n, ok := buckets[(now/int64(time.Second))*int64(time.Second)]; ok {
		qps = float64(n)
	}

	conns, sess := h.mgr.ActiveCounts()
	totalSessions := len(h.mgr.Sessions(""))

	writeJSON(w, http.StatusOK, overviewResponse{
		TotalMessages:     h.buf.Total(),
		QPS:               qps,
		ActiveConnections: conns,
		ActiveSessions:    sess,
		TotalConnections:  len(h.mgr.Clients()),
		TotalSessions:     totalSessions,
		Buckets:           points,
	})
}

// --- connections ---

type connectionDTO struct {
	model.Client
	SessionCount   int `json:"session_count"`
	ActiveSessions int `json:"active_sessions"`
}

func (h *Handler) listConnections(w http.ResponseWriter, r *http.Request) {
	clients := h.mgr.Clients()
	sessions := h.mgr.Sessions("")

	sessByClient := map[string][]model.Session{}
	for _, s := range sessions {
		sessByClient[s.ClientID] = append(sessByClient[s.ClientID], s)
	}

	out := make([]connectionDTO, 0, len(clients))
	for _, c := range clients {
		list := sessByClient[c.ID]
		active := 0
		for _, s := range list {
			if s.Status == model.StatusActive {
				active++
			}
		}
		out = append(out, connectionDTO{Client: c, SessionCount: len(list), ActiveSessions: active})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastSeen > out[j].LastSeen })
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) connectionDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c := h.mgr.ClientByID(id)
	if c == nil {
		writeErr(w, http.StatusNotFound, "connection not found")
		return
	}
	sessions := h.mgr.Sessions(id)
	active := 0
	for _, s := range sessions {
		if s.Status == model.StatusActive {
			active++
		}
	}
	writeJSON(w, http.StatusOK, connectionDTO{
		Client:         *c,
		SessionCount:   len(sessions),
		ActiveSessions: active,
	})
}

// --- sessions ---

func (h *Handler) listSessions(w http.ResponseWriter, r *http.Request) {
	clientID := r.URL.Query().Get("client_id")
	start, _ := strconv.ParseInt(r.URL.Query().Get("start"), 10, 64)
	end, _ := strconv.ParseInt(r.URL.Query().Get("end"), 10, 64)

	live := h.mgr.Sessions(clientID)
	out := make([]model.Session, 0, len(live))
	for _, s := range live {
		if start > 0 && s.LastActiveAt < start {
			continue
		}
		if end > 0 && s.LastActiveAt > end {
			continue
		}
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastActiveAt > out[j].LastActiveAt })
	writeJSON(w, http.StatusOK, out)
}

// --- messages ---

type messagesResponse struct {
	Total int64           `json:"total"`
	Items []model.Record  `json:"items"`
}

func (h *Handler) sessionMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if h.mgr.SessionByID(id) == nil {
		writeErr(w, http.StatusNotFound, "session not found")
		return
	}
	q := r.URL.Query()
	start, _ := strconv.ParseInt(q.Get("start"), 10, 64)
	end, _ := strconv.ParseInt(q.Get("end"), 10, 64)
	limit := 100
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	offset := 0
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	total, _ := h.buf.Count(id, start, end)
	records, err := h.buf.Query(id, start, end)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	sort.Slice(records, func(i, j int) bool { return records[i].TimeNano > records[j].TimeNano })

	items := []model.Record{}
	if offset < len(records) {
		hi := offset + limit
		if hi > len(records) {
			hi = len(records)
		}
		items = records[offset:hi]
	}

	writeJSON(w, http.StatusOK, messagesResponse{Total: total, Items: items})
}

// --- settings ---

func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	all, err := h.db.AllSettings()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defaults := config.DefaultSettings()
	for k, v := range defaults {
		if _, ok := all[k]; !ok {
			all[k] = v
		}
	}
	all["leveldb_dir"] = h.cfg.LevelDBPath()
	all["sqlite_file"] = h.cfg.DBPath()
	writeJSON(w, http.StatusOK, all)
}

func (h *Handler) saveSettings(w http.ResponseWriter, r *http.Request) {
	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	for k, v := range body {
		if k == "leveldb_dir" || k == "sqlite_file" {
			continue
		}
		if err := h.db.SetSetting(k, v); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		h.log.Info("setting changed", "key", k, "value", v)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) pause(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Paused bool `json:"paused"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.Paused {
		h.gate.Pause()
	} else {
		h.gate.Resume()
	}
	_ = h.db.SetSetting(config.KeyPaused, strconv.FormatBool(body.Paused))
	h.hub.Broadcast("paused", map[string]bool{"paused": body.Paused})
	h.log.Info("system pause toggled", "paused", body.Paused)
	writeJSON(w, http.StatusOK, map[string]bool{"paused": body.Paused})
}
