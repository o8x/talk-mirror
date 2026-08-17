package api

import (
	"crypto/subtle"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/o8x/talk-mirror/internal/config"
	"github.com/o8x/talk-mirror/internal/hub"
	"github.com/o8x/talk-mirror/internal/model"
	"github.com/o8x/talk-mirror/internal/session"
	"github.com/o8x/talk-mirror/internal/state"
	"github.com/o8x/talk-mirror/internal/store/buffer"
	"github.com/o8x/talk-mirror/internal/store/sqlite"
)

// Handler serves the REST API.
type Handler struct {
	mgr      *session.Manager
	buf      *buffer.Buffer
	db       *sqlite.Store
	gate     *state.Gate
	hub      *hub.Hub
	cfg      *config.Config
	dataPort int
	log      *slog.Logger
}

func New(mgr *session.Manager, buf *buffer.Buffer, db *sqlite.Store, gate *state.Gate, h *hub.Hub, cfg *config.Config, dataPort int, log *slog.Logger) *Handler {
	return &Handler{mgr: mgr, buf: buf, db: db, gate: gate, hub: h, cfg: cfg, dataPort: dataPort, log: log}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/stats", h.stats)
	mux.HandleFunc("GET /api/stats/overview", h.overview)
	mux.HandleFunc("GET /api/version", h.version)
	mux.HandleFunc("GET /api/connections", h.listConnections)
	mux.HandleFunc("GET /api/connections/{id}", h.connectionDetail)
	mux.HandleFunc("POST /api/connections/{id}/sessions", h.createSession)
	mux.HandleFunc("DELETE /api/connections/{id}", h.deleteConnection)
	mux.HandleFunc("GET /api/sessions", h.listSessions)
	mux.HandleFunc("GET /api/sessions/{id}/messages", h.sessionMessages)
	mux.HandleFunc("GET /api/sessions/{id}/export", h.exportSession)
	mux.HandleFunc("GET /api/sessions/{id}/buckets", h.sessionBuckets)
	mux.HandleFunc("DELETE /api/sessions/{id}", h.deleteSession)
	mux.HandleFunc("GET /api/settings", h.getSettings)
	mux.HandleFunc("POST /api/settings", h.saveSettings)
	mux.HandleFunc("POST /api/pause", h.pause)
	mux.HandleFunc("GET /api/code/{lang}", h.code)
	mux.HandleFunc("POST /api/ingest", h.ingest)
	mux.HandleFunc("POST /api/login", h.login)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// extractKey returns the key carried in the Authorization or X-Talk-Mirror-Key
// header.
func extractKey(r *http.Request) string {
	key := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer"))
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("X-Talk-Mirror-Key"))
	}
	return key
}

// validKey reports whether key matches the CLI key or the stored DB key.
func (h *Handler) validKey(key string) bool {
	if key == "" {
		return false
	}
	if h.cfg.Key != "" && subtle.ConstantTimeCompare([]byte(key), []byte(h.cfg.Key)) == 1 {
		return true
	}
	dbKey, err := h.db.GetSetting(config.KeyAuthKey)
	if err == nil && dbKey != "" && subtle.ConstantTimeCompare([]byte(key), []byte(dbKey)) == 1 {
		return true
	}
	return false
}

// Authenticate checks the request key, writing a 401 response when invalid.
func (h *Handler) Authenticate(w http.ResponseWriter, r *http.Request) bool {
	if h.validKey(extractKey(r)) {
		return true
	}
	writeErr(w, http.StatusUnauthorized, "unauthorized")
	return false
}

// login validates a key and reports success.
func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	key := extractKey(r)
	if key == "" {
		var body struct {
			Key string `json:"key"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		key = strings.TrimSpace(body.Key)
	}
	if !h.validKey(key) {
		writeErr(w, http.StatusUnauthorized, "invalid key")
		return
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "ip": ip})
}

// --- stats ---

// version reports the build version injected at link time.
func (h *Handler) version(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"version": config.Version})
}

// stats returns a compact summary of the system's current state.
func (h *Handler) stats(w http.ResponseWriter, r *http.Request) {
	conns, sess := h.mgr.ActiveCounts()
	writeJSON(w, http.StatusOK, map[string]any{
		"total_messages":     h.buf.Total(),
		"connections":        len(h.mgr.Clients()),
		"sessions":           len(h.mgr.Sessions("")),
		"active_connections": conns,
		"active_sessions":    sess,
	})
}

type overviewResponse struct {
	TotalMessages     int64         `json:"total_messages"`
	QPS               float64       `json:"qps"`
	ActiveConnections int           `json:"active_connections"`
	ActiveSessions    int           `json:"active_sessions"`
	TotalConnections  int           `json:"total_connections"`
	TotalSessions     int           `json:"total_sessions"`
	Buckets           []bucketPoint `json:"buckets"`
}

type bucketPoint struct {
	TS    int64 `json:"ts"`
	Count int64 `json:"count"`
}

// fillBuckets returns a fixed sequence of bucket points ending at the aligned
// end time, filling empty buckets with a count of zero. It yields up to
// `points` points (one per bucket) covering the requested range.
func fillBuckets(buckets map[int64]int64, start, end, bucketSize int64, points int) []bucketPoint {
	if bucketSize <= 0 {
		bucketSize = int64(time.Second)
	}
	if points <= 0 {
		points = config.DefaultTrendPoints
	}
	endAligned := (end / bucketSize) * bucketSize
	first := endAligned - int64(points-1)*bucketSize
	if first < start {
		first = start
	}
	out := make([]bucketPoint, 0, points)
	for ts := first; ts <= endAligned; ts += bucketSize {
		out = append(out, bucketPoint{TS: ts, Count: buckets[ts]})
	}
	return out
}

// trendPoints returns the configured trend point count, falling back to the
// default of 300.
func (h *Handler) trendPoints() int {
	v, err := h.db.GetSetting(config.KeyTrendPoints)
	if err != nil || v == "" {
		return config.DefaultTrendPoints
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return config.DefaultTrendPoints
	}
	if n > 5000 {
		n = 5000
	}
	return n
}

// requestedPoints returns the trend point count, preferring an explicit
// `points` query parameter over the configured setting.
func (h *Handler) requestedPoints(q url.Values) int {
	n := h.trendPoints()
	if v := q.Get("points"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			n = p
		}
	}
	return n
}

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	now := time.Now().UnixNano()
	start := now - 300*int64(time.Second)
	end := now
	if v := q.Get("seconds"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			start = now - n*int64(time.Second)
		}
	}
	if v := q.Get("start"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			start = n
		}
	}
	if v := q.Get("end"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			end = n
		}
	}
	points := h.requestedPoints(q)
	bucketSize := (end - start) / int64(points)
	if bucketSize <= 0 {
		bucketSize = int64(time.Second)
	}
	if v := q.Get("bucket"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			bucketSize = n * int64(time.Second)
		}
	}

	buckets, _ := h.buf.Buckets(start, end, bucketSize)
	filled := fillBuckets(buckets, start, end, bucketSize, points)

	qps := 0.0
	// qps is the message count in the current second, queried independently of
	// the (possibly sub-second) trend bucket size.
	if qb, err := h.buf.Buckets(now-5*int64(time.Second), now, int64(time.Second)); err == nil {
		if n, ok := qb[(now/int64(time.Second))*int64(time.Second)]; ok {
			qps = float64(n)
		}
	}

	conns, sess := h.mgr.ActiveCounts()
	totalMessages, _ := h.db.TotalMessages()
	totalClients, _ := h.db.ListClients()
	totalSessionsList, _ := h.db.ListSessions("")

	writeJSON(w, http.StatusOK, overviewResponse{
		TotalMessages:     totalMessages,
		QPS:               qps,
		ActiveConnections: conns,
		ActiveSessions:    sess,
		TotalConnections:  len(totalClients),
		TotalSessions:     len(totalSessionsList),
		Buckets:           filled,
	})
}

// --- connections ---

type connectionDTO struct {
	model.Client
	SessionCount   int `json:"session_count"`
	ActiveSessions int `json:"active_sessions"`
}

func (h *Handler) listConnections(w http.ResponseWriter, r *http.Request) {
	persisted, _ := h.db.ListClients()
	live := h.mgr.Clients()
	liveByIP := make(map[string]model.Client, len(live))
	for _, c := range live {
		liveByIP[c.IP] = c
	}

	sessions := h.mergedSessions("")
	sessByClient := map[string][]model.Session{}
	for _, s := range sessions {
		sessByClient[s.ClientID] = append(sessByClient[s.ClientID], s)
	}

	out := make([]connectionDTO, 0, len(persisted))
	for _, c := range persisted {
		if lc, ok := liveByIP[c.IP]; ok {
			c = lc
		}
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
		if pc, err := h.db.ClientByID(id); err == nil && pc != nil {
			c = pc
		}
	}
	if c == nil {
		writeErr(w, http.StatusNotFound, "connection not found")
		return
	}
	sessions := h.mergedSessions(id)
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

// createSession creates a new session for a connection with a fresh ID and a
// random port, so clients can push data to it by session_id.
func (h *Handler) createSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c := h.mgr.ClientByID(id)
	if c == nil {
		if pc, err := h.db.ClientByID(id); err == nil && pc != nil {
			c = pc
		}
	}
	if c == nil {
		writeErr(w, http.StatusNotFound, "connection not found")
		return
	}
	ss := h.mgr.CreateNamedSession(c.ID, c.IP, "http", time.Now().UnixNano())
	h.log.Info("session created for connection", "id", ss.ID, "ip", c.IP, "port", ss.Port)
	writeJSON(w, http.StatusOK, ss.Session)
}

// --- sessions ---

// mergedSessions combines persisted sessions with live in-memory state so that
// historical sessions remain visible even when no clients are connected.
func (h *Handler) mergedSessions(clientID string) []model.Session {
	persisted, _ := h.db.ListSessions(clientID)
	live := h.mgr.Sessions(clientID)
	liveByID := make(map[string]model.Session, len(live))
	for _, s := range live {
		liveByID[s.ID] = s
	}
	out := make([]model.Session, 0, len(persisted))
	for _, s := range persisted {
		if ls, ok := liveByID[s.ID]; ok {
			s = ls
		}
		out = append(out, s)
	}
	return out
}

func (h *Handler) listSessions(w http.ResponseWriter, r *http.Request) {
	clientID := r.URL.Query().Get("client_id")
	start, _ := strconv.ParseInt(r.URL.Query().Get("start"), 10, 64)
	end, _ := strconv.ParseInt(r.URL.Query().Get("end"), 10, 64)

	sessions := h.mergedSessions(clientID)
	out := make([]model.Session, 0, len(sessions))
	for _, s := range sessions {
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

// deleteSession removes a session and all of its message records.
func (h *Handler) deleteSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := h.db.SessionByID(id)
	if err != nil || sess == nil {
		writeErr(w, http.StatusNotFound, "session not found")
		return
	}
	_ = h.buf.DeleteSession(id)
	_ = h.db.DeleteSession(id)
	h.mgr.RemoveSession(id)
	h.log.Info("session deleted", "id", id, "ip", sess.IP, "port", sess.Port)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// deleteConnection removes a connection, all of its sessions and their messages.
func (h *Handler) deleteConnection(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	client, err := h.db.ClientByID(id)
	if err != nil || client == nil {
		writeErr(w, http.StatusNotFound, "connection not found")
		return
	}
	sessions, _ := h.db.ListSessions(id)
	for _, sess := range sessions {
		_ = h.buf.DeleteSession(sess.ID)
		_ = h.db.DeleteSession(sess.ID)
	}
	_ = h.db.DeleteClient(id)
	h.mgr.RemoveClient(id)
	h.log.Info("connection deleted", "id", id, "ip", client.IP, "sessions", len(sessions))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- messages ---

type messagesResponse struct {
	Total int64                  `json:"total"`
	Items []session.MessageEvent `json:"items"`
}

func (h *Handler) sessionMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess := h.mgr.SessionByID(id)
	if sess == nil {
		if ps, err := h.db.SessionByID(id); err == nil && ps != nil {
			sess = ps
		}
	}
	if sess == nil {
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

	records, err := h.buf.Query(id, start, end)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	records = filterRecords(records, q.Get("tag"), q.Get("data_key"), q.Get("data_value"), q.Get("q"))

	sort.Slice(records, func(i, j int) bool { return records[i].TimeNano > records[j].TimeNano })

	total := int64(len(records))
	slice := records
	if offset < len(records) {
		hi := offset + limit
		if hi > len(records) {
			hi = len(records)
		}
		slice = records[offset:hi]
	}

	items := make([]session.MessageEvent, 0, len(slice))
	for _, rec := range slice {
		items = append(items, session.MessageEvent{
			Record:   rec,
			IP:       sess.IP,
			Port:     sess.Port,
			Protocol: sess.Protocol,
		})
	}

	writeJSON(w, http.StatusOK, messagesResponse{Total: total, Items: items})
}

// filterRecords applies tag / data key-value / keyword filters to a record
// list in place, preserving the original slice backing array.
func filterRecords(records []model.Record, tag, dataKey, dataValue, keyword string) []model.Record {
	if tag == "" && dataKey == "" && keyword == "" {
		return records
	}
	kw := strings.ToLower(strings.TrimSpace(keyword))
	out := records[:0]
	for _, r := range records {
		if tag != "" && !matchTag(r.Tag, tag) {
			continue
		}
		if dataKey != "" && !matchData(r.Data, dataKey, dataValue) {
			continue
		}
		if kw != "" && !matchKeyword(r, kw) {
			continue
		}
		out = append(out, r)
	}
	return out
}

func matchTag(tags []string, tag string) bool {
	for _, t := range tags {
		if strings.EqualFold(t, tag) {
			return true
		}
	}
	return false
}

// matchData reports whether the record's data object contains the key (and,
// when value is non-empty, that its value stringifies to value).
func matchData(data json.RawMessage, key, value string) bool {
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return false
	}
	v, ok := obj[key]
	if !ok {
		return false
	}
	if value == "" {
		return true
	}
	return strings.EqualFold(fmt.Sprint(v), value)
}

func matchKeyword(r model.Record, kw string) bool {
	if strings.Contains(strings.ToLower(r.Message), kw) {
		return true
	}
	for _, t := range r.Tag {
		if strings.Contains(strings.ToLower(t), kw) {
			return true
		}
	}
	return strings.Contains(strings.ToLower(string(r.Data)), kw)
}

type sessionExport struct {
	Session  model.Session          `json:"session"`
	Messages []session.MessageEvent `json:"messages"`
}

// exportSession streams a session and all of its messages as JSON or CSV for
// download.
func (h *Handler) exportSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess := h.mgr.SessionByID(id)
	if sess == nil {
		if ps, err := h.db.SessionByID(id); err == nil && ps != nil {
			sess = ps
		}
	}
	if sess == nil {
		writeErr(w, http.StatusNotFound, "session not found")
		return
	}
	records, err := h.buf.Query(id, 0, 0)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	sort.Slice(records, func(i, j int) bool { return records[i].TimeNano < records[j].TimeNano })

	messages := make([]session.MessageEvent, 0, len(records))
	for _, rec := range records {
		messages = append(messages, session.MessageEvent{
			Record:   rec,
			IP:       sess.IP,
			Port:     sess.Port,
			Protocol: sess.Protocol,
		})
	}

	base := "session-" + id
	if strings.EqualFold(r.URL.Query().Get("format"), "csv") {
		writeSessionCSV(w, base, messages)
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="`+base+`.json"`)
	writeJSON(w, http.StatusOK, sessionExport{Session: *sess, Messages: messages})
}

func writeSessionCSV(w http.ResponseWriter, base string, messages []session.MessageEvent) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+base+`.csv"`)
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"seq", "session_id", "time_nano", "received_at", "tag", "message", "data", "ip", "port", "protocol"})
	for _, m := range messages {
		tagJSON, _ := json.Marshal(m.Tag)
		dataJSON, _ := json.Marshal(m.Data)
		_ = cw.Write([]string{
			strconv.FormatInt(m.Seq, 10),
			m.SessionID,
			strconv.FormatInt(m.TimeNano, 10),
			strconv.FormatInt(m.ReceivedAt, 10),
			string(tagJSON),
			m.Message,
			string(dataJSON),
			m.IP,
			strconv.Itoa(m.Port),
			m.Protocol,
		})
	}
	cw.Flush()
}

// sessionBuckets returns per-bucket message counts for a session.
func (h *Handler) sessionBuckets(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if h.mgr.SessionByID(id) == nil {
		if ps, err := h.db.SessionByID(id); err != nil || ps == nil {
			writeErr(w, http.StatusNotFound, "session not found")
			return
		}
	}
	q := r.URL.Query()
	now := time.Now().UnixNano()
	seconds := int64(300)
	if v := q.Get("seconds"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			seconds = n
		}
	}
	start := now - seconds*int64(time.Second)
	end := now
	if v := q.Get("start"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			start = n
		}
	}
	if v := q.Get("end"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			end = n
		}
	}
	points := h.requestedPoints(q)
	bucketSize := (end - start) / int64(points)
	if bucketSize <= 0 {
		bucketSize = int64(time.Second)
	}
	if v := q.Get("bucket"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			bucketSize = n * int64(time.Second)
		}
	}

	buckets, err := h.buf.SessionBuckets(id, start, end, bucketSize)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	filled := fillBuckets(buckets, start, end, bucketSize, points)
	writeJSON(w, http.StatusOK, filled)
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

// ingest writes a debug log message over HTTP. It routes into the same
// session/archive pipeline as the TCP/UDP listeners, keyed by the caller's IP
// with the "http" protocol.
func (h *Handler) ingest(w http.ResponseWriter, r *http.Request) {
	if h.gate.Paused() {
		writeErr(w, http.StatusServiceUnavailable, "system is paused")
		return
	}
	var in model.Incoming
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if in.Data == nil {
		in.Data = json.RawMessage("{}")
	}
	ip, portStr, err := net.SplitHostPort(r.RemoteAddr)
	port := 0
	if err != nil {
		ip = r.RemoteAddr
	} else {
		port, _ = strconv.Atoi(portStr)
	}
	h.mgr.Handle(ip, port, "http", in)
	h.log.Info("http log ingested", "ip", ip, "port", port, "message", in.Message)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "ip": ip, "port": port})
}
