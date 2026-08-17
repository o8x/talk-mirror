package model

import "encoding/json"

const (
	StatusActive = "active"
	StatusClosed = "closed"

	ProtocolTCP = "tcp"
	ProtocolUDP = "udp"
)

// Client represents a unique remote client identified by its IP address.
type Client struct {
	ID           string `json:"id"`
	IP           string `json:"ip"`
	FirstSeen    int64  `json:"first_seen"`
	LastSeen     int64  `json:"last_seen"`
	Status       string `json:"status"`
	MessageCount int64  `json:"message_count"`
}

// Session represents a unique stream identified by IP + port + protocol.
type Session struct {
	ID           string `json:"id"`
	ClientID     string `json:"client_id"`
	IP           string `json:"ip"`
	Port         int    `json:"port"`
	Protocol     string `json:"protocol"`
	Status       string `json:"status"`
	CreatedAt    int64  `json:"created_at"`
	LastActiveAt int64  `json:"last_active_at"`
	MessageCount int64  `json:"message_count"`
}

// Incoming is the wire format accepted from a remote client.
type Incoming struct {
	TimeNano  int64           `json:"time_nano"`
	SessionID string          `json:"session_id"`
	Tag       []string        `json:"tag"`
	Message   string          `json:"message"`
	Data      json.RawMessage `json:"data"`
	Protocol  string          `json:"protocol"`
}

// Record is a stored message attached to a session.
type Record struct {
	Seq        int64           `json:"seq"`
	SessionID  string          `json:"session_id"`
	TimeNano   int64           `json:"time_nano"`
	Tag        []string        `json:"tag"`
	Message    string          `json:"message"`
	Data       json.RawMessage `json:"data"`
	ReceivedAt int64           `json:"received_at"`
}
