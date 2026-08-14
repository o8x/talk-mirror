package hub

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 54 * time.Second
	maxMessageSize = 1024
	sendBuffer     = 512
)

// Event is the envelope pushed to browsers over WebSocket.
type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Hub tracks connected browser clients and broadcasts events.
type Hub struct {
	mu       sync.RWMutex
	clients  map[*client]struct{}
	log      *slog.Logger
	upgrader websocket.Upgrader
}

func New(log *slog.Logger) *Hub {
	return &Hub{
		clients: make(map[*client]struct{}),
		log:     log,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin:     func(*http.Request) bool { return true },
		},
	}
}

type client struct {
	hub              *Hub
	conn             *websocket.Conn
	send             chan []byte
	mu               sync.RWMutex
	filterSession    string
	filterConnection string
}

func (h *Hub) register(c *client) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	h.log.Info("websocket client connected", "clients", len(h.clients))
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	h.unregisterLocked(c)
	h.mu.Unlock()
}

// unregisterLocked removes a client and closes its send channel. Caller must
// hold h.mu.
func (h *Hub) unregisterLocked(c *client) {
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
	}
	h.log.Info("websocket client disconnected", "clients", len(h.clients))
}

// SendMessage routes a message event to clients subscribed to the matching
// session or connection (empty filter means "all").
func (h *Hub) SendMessage(sessionID, clientID string, data any) {
	ev := Event{Type: "message", Data: data}
	payload, err := json.Marshal(ev)
	if err != nil {
		return
	}
	h.mu.Lock()
	for c := range h.clients {
		c.mu.RLock()
		match := (c.filterSession == "" && c.filterConnection == "") ||
			(c.filterSession != "" && c.filterSession == sessionID) ||
			(c.filterConnection != "" && c.filterConnection == clientID)
		c.mu.RUnlock()
		if !match {
			continue
		}
		select {
		case c.send <- payload:
		default:
			h.unregisterLocked(c)
		}
	}
	h.mu.Unlock()
}

// Broadcast sends an event to every connected client.
func (h *Hub) Broadcast(evType string, data any) {
	ev := Event{Type: evType, Data: data}
	payload, err := json.Marshal(ev)
	if err != nil {
		return
	}
	h.mu.Lock()
	for c := range h.clients {
		select {
		case c.send <- payload:
		default:
			h.unregisterLocked(c)
		}
	}
	h.mu.Unlock()
}

// Count returns the number of connected clients.
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// ServeWS upgrades an HTTP request to a WebSocket connection.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.log.Error("ws upgrade failed", "error", err)
		return
	}
	c := &client{hub: h, conn: conn, send: make(chan []byte, sendBuffer)}
	h.register(c)

	go c.writePump()
	go c.readPump()
}

func (c *client) readPump() {
	defer func() {
		c.hub.unregister(c)
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var req struct {
			Type         string `json:"type"`
			SessionID    string `json:"session_id"`
			ConnectionID string `json:"connection_id"`
		}
		if json.Unmarshal(msg, &req) != nil {
			continue
		}
		switch req.Type {
		case "subscribe":
			c.mu.Lock()
			c.filterSession = req.SessionID
			c.filterConnection = req.ConnectionID
			c.mu.Unlock()
		case "unsubscribe":
			c.mu.Lock()
			c.filterSession = ""
			c.filterConnection = ""
			c.mu.Unlock()
		}
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
