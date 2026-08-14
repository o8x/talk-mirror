package session

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"github.com/talk-mirror/talk-mirror/internal/hub"
	"github.com/talk-mirror/talk-mirror/internal/model"
	"github.com/talk-mirror/talk-mirror/internal/store/buffer"
	"github.com/talk-mirror/talk-mirror/internal/store/sqlite"
)

const (
	countSyncInterval = 5 * time.Second
	idleSweepInterval = 10 * time.Second
	udpIdleTimeout    = 60 * time.Second
)

// MessageEvent is the WebSocket payload for a newly received message.
type MessageEvent struct {
	model.Record
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
}

// Manager owns the live registry of clients and sessions and routes messages
// into the buffer and the WebSocket hub.
type Manager struct {
	mu        sync.Mutex
	db        *sqlite.Store
	buf       *buffer.Buffer
	hub       *hub.Hub
	log       *slog.Logger
	clients   map[string]*ClientState // by IP
	sessions  map[string]*SessionState // by session ID
	clientIDs map[string]string        // IP -> client ID
	keyIndex  map[string]string        // "ip|port|protocol" -> session ID
}

type ClientState struct {
	model.Client
	sessions    map[string]struct{}
	syncedCount int64
}

type SessionState struct {
	model.Session
	seq         int64
	syncedCount int64
	lastRecv    time.Time
}

func NewManager(db *sqlite.Store, buf *buffer.Buffer, h *hub.Hub, log *slog.Logger) *Manager {
	return &Manager{
		db:        db,
		buf:       buf,
		hub:       h,
		log:       log,
		clients:   make(map[string]*ClientState),
		sessions:  make(map[string]*SessionState),
		clientIDs: make(map[string]string),
		keyIndex:  make(map[string]string),
	}
}

// Handle processes one incoming message for the given transport source.
func (m *Manager) Handle(ip string, port int, transport string, in model.Incoming) {
	protocol := transport
	if in.Protocol == model.ProtocolTCP || in.Protocol == model.ProtocolUDP {
		protocol = in.Protocol
	}
	now := time.Now().UnixNano()
	if in.TimeNano == 0 {
		in.TimeNano = now
	}

	m.mu.Lock()
	clientID, cs := m.ensureClientLocked(ip, now)
	ss := m.ensureSessionLocked(clientID, cs, ip, port, protocol, now)
	ss.seq++
	ss.MessageCount++
	ss.lastRecv = time.Now()
	ss.LastActiveAt = now
	cs.MessageCount++
	cs.LastSeen = now
	sessID := ss.ID
	m.mu.Unlock()

	rec := model.Record{
		Seq:        ss.seq,
		SessionID:  sessID,
		TimeNano:   in.TimeNano,
		Tag:        in.Tag,
		Message:    in.Message,
		Data:       in.Data,
		ReceivedAt: now,
	}
	m.buf.Append(rec)

	ev := MessageEvent{Record: rec, IP: ip, Port: port, Protocol: protocol}
	m.hub.SendMessage(sessID, clientID, ev)
}

// Close marks a TCP session closed (called on disconnect).
func (m *Manager) Close(ip string, port int, protocol string) {
	now := time.Now().UnixNano()
	m.mu.Lock()
	key := keyOf(ip, port, protocol)
	sessID, ok := m.keyIndex[key]
	if !ok {
		m.mu.Unlock()
		return
	}
	ss := m.sessions[sessID]
	ss.Status = model.StatusClosed
	ss.LastActiveAt = now
	m.mu.Unlock()

	m.log.Info("session closed", "id", sessID, "ip", ip, "port", port, "protocol", protocol)
	_ = m.db.MarkSessionClosed(sessID, now)
	m.broadcastSession(sessID)
}

func (m *Manager) ensureClientLocked(ip string, now int64) (string, *ClientState) {
	if id, ok := m.clientIDs[ip]; ok {
		return id, m.clients[ip]
	}
	id := newID()
	if c, err := m.db.ClientByIP(ip); err == nil && c != nil {
		id = c.ID
	}
	cs := &ClientState{
		Client: model.Client{
			ID:        id,
			IP:        ip,
			FirstSeen: now,
			LastSeen:  now,
			Status:    model.StatusActive,
		},
		sessions: make(map[string]struct{}),
	}
	m.clients[ip] = cs
	m.clientIDs[ip] = id
	_ = m.db.UpsertClient(id, ip, now)
	m.log.Info("client connected", "id", id, "ip", ip)
	m.hub.Broadcast("connection", cs.Client)
	return id, cs
}

func (m *Manager) ensureSessionLocked(clientID string, cs *ClientState, ip string, port int, protocol string, now int64) *SessionState {
	key := keyOf(ip, port, protocol)
	if id, ok := m.keyIndex[key]; ok {
		return m.sessions[id]
	}
	id := newID()
	if s, err := m.db.SessionByKey(ip, port, protocol); err == nil && s != nil {
		id = s.ID
	}
	ss := &SessionState{
		Session: model.Session{
			ID:           id,
			ClientID:     clientID,
			IP:           ip,
			Port:         port,
			Protocol:     protocol,
			Status:       model.StatusActive,
			CreatedAt:    now,
			LastActiveAt: now,
		},
		lastRecv: time.Now(),
	}
	m.sessions[id] = ss
	m.keyIndex[key] = id
	cs.sessions[id] = struct{}{}
	_ = m.db.UpsertSession(&ss.Session)
	m.log.Info("session created", "id", id, "ip", ip, "port", port, "protocol", protocol)
	m.hub.Broadcast("session", ss.Session)
	return ss
}

func (m *Manager) broadcastSession(id string) {
	m.mu.Lock()
	ss, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return
	}
	snap := ss.Session
	m.mu.Unlock()
	m.hub.Broadcast("session", snap)
}

// Clients returns a live snapshot of all clients.
func (m *Manager) Clients() []model.Client {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]model.Client, 0, len(m.clients))
	for _, cs := range m.clients {
		out = append(out, cs.Client)
	}
	return out
}

// Sessions returns a live snapshot of all sessions, optionally filtered by client.
func (m *Manager) Sessions(clientID string) []model.Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]model.Session, 0, len(m.sessions))
	for _, ss := range m.sessions {
		if clientID != "" && ss.ClientID != clientID {
			continue
		}
		out = append(out, ss.Session)
	}
	return out
}

func (m *Manager) ClientByID(id string) *model.Client {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, cs := range m.clients {
		if cs.ID == id {
			c := cs.Client
			return &c
		}
	}
	return nil
}

func (m *Manager) SessionByID(id string) *model.Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	if ss, ok := m.sessions[id]; ok {
		s := ss.Session
		return &s
	}
	return nil
}

// ActiveCounts returns live active connection and session counts.
func (m *Manager) ActiveCounts() (int, int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	conns, sess := 0, 0
	for _, cs := range m.clients {
		if cs.Status == model.StatusActive {
			conns++
		}
	}
	for _, ss := range m.sessions {
		if ss.Status == model.StatusActive {
			sess++
		}
	}
	return conns, sess
}

func (m *Manager) syncCounts() {
	m.mu.Lock()
	for _, cs := range m.clients {
		if cs.MessageCount != cs.syncedCount {
			_ = m.db.AddCounts(cs.ID, "", cs.MessageCount-cs.syncedCount, cs.LastSeen)
			cs.syncedCount = cs.MessageCount
		}
	}
	for _, ss := range m.sessions {
		if ss.MessageCount != ss.syncedCount {
			_ = m.db.AddCounts("", ss.ID, ss.MessageCount-ss.syncedCount, ss.LastActiveAt)
			ss.syncedCount = ss.MessageCount
		}
	}
	m.mu.Unlock()
}

func (m *Manager) sweepIdle() {
	now := time.Now()
	m.mu.Lock()
	for id, ss := range m.sessions {
		if ss.Protocol == model.ProtocolUDP && ss.Status == model.StatusActive && now.Sub(ss.lastRecv) > udpIdleTimeout {
			ss.Status = model.StatusClosed
			m.mu.Unlock()
			_ = m.db.MarkSessionClosed(id, now.UnixNano())
			m.log.Info("udp session timed out", "id", id)
			m.hub.Broadcast("session", ss.Session)
			m.mu.Lock()
		}
	}
	m.mu.Unlock()
}

// Run drives periodic count sync and idle sweeps until done is closed.
func (m *Manager) Run(done <-chan struct{}) {
	countT := time.NewTicker(countSyncInterval)
	sweepT := time.NewTicker(idleSweepInterval)
	defer countT.Stop()
	defer sweepT.Stop()
	for {
		select {
		case <-done:
			m.syncCounts()
			return
		case <-countT.C:
			m.syncCounts()
		case <-sweepT.C:
			m.sweepIdle()
		}
	}
}

func keyOf(ip string, port int, protocol string) string {
	return ip + "|" + strconv.Itoa(port) + "|" + protocol
}

func newID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
