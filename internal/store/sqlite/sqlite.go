package sqlite

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"

	"github.com/o8x/talk-mirror/internal/model"
)

// Store persists client/session metadata and settings.
type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS clients (
			id TEXT PRIMARY KEY,
			ip TEXT NOT NULL UNIQUE,
			first_seen INTEGER NOT NULL,
			last_seen INTEGER NOT NULL,
			status TEXT NOT NULL DEFAULT 'active',
			message_count INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			client_id TEXT NOT NULL,
			ip TEXT NOT NULL,
			port INTEGER NOT NULL,
			protocol TEXT NOT NULL DEFAULT 'tcp',
			status TEXT NOT NULL DEFAULT 'active',
			created_at INTEGER NOT NULL,
			last_active_at INTEGER NOT NULL,
			message_count INTEGER NOT NULL DEFAULT 0,
			name TEXT NOT NULL DEFAULT '',
			UNIQUE (ip, port, protocol)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(client_id)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	// Migration for databases created before the name column existed.
	if !s.hasColumn("sessions", "name") {
		if _, err := s.db.Exec(`ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT ''`); err != nil {
			return fmt.Errorf("migrate add name: %w", err)
		}
	}
	return nil
}

func (s *Store) hasColumn(table, column string) bool {
	rows, err := s.db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notnull, pk int
		var cname, ctype string
		var dflt sql.NullString
		if err := rows.Scan(&cid, &cname, &ctype, &notnull, &dflt, &pk); err != nil {
			return false
		}
		if cname == column {
			return true
		}
	}
	return false
}

// UpsertClient inserts a client on first sight or refreshes its activity.
func (s *Store) UpsertClient(id, ip string, now int64) error {
	_, err := s.db.Exec(`INSERT INTO clients (id, ip, first_seen, last_seen, status)
		VALUES (?, ?, ?, ?, 'active')
		ON CONFLICT(ip) DO UPDATE SET last_seen = excluded.last_seen, status = 'active'`,
		id, ip, now, now)
	return err
}

func (s *Store) MarkClientClosed(ip string, now int64) error {
	_, err := s.db.Exec(`UPDATE clients SET last_seen = ?, status = 'closed' WHERE ip = ?`, now, ip)
	return err
}

func (s *Store) ClientByIP(ip string) (*model.Client, error) {
	row := s.db.QueryRow(`SELECT id, ip, first_seen, last_seen, status, message_count FROM clients WHERE ip = ?`, ip)
	var c model.Client
	if err := row.Scan(&c.ID, &c.IP, &c.FirstSeen, &c.LastSeen, &c.Status, &c.MessageCount); err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Store) ClientByID(id string) (*model.Client, error) {
	row := s.db.QueryRow(`SELECT id, ip, first_seen, last_seen, status, message_count FROM clients WHERE id = ?`, id)
	var c model.Client
	if err := row.Scan(&c.ID, &c.IP, &c.FirstSeen, &c.LastSeen, &c.Status, &c.MessageCount); err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Store) ListClients() ([]model.Client, error) {
	rows, err := s.db.Query(`SELECT id, ip, first_seen, last_seen, status, message_count FROM clients ORDER BY last_seen DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Client
	for rows.Next() {
		var c model.Client
		if err := rows.Scan(&c.ID, &c.IP, &c.FirstSeen, &c.LastSeen, &c.Status, &c.MessageCount); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// UpsertSession inserts a session on first sight or refreshes its activity.
func (s *Store) UpsertSession(sess *model.Session) error {
	_, err := s.db.Exec(`INSERT INTO sessions (id, client_id, ip, port, protocol, status, created_at, last_active_at, message_count, name)
		VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 0, ?)
		ON CONFLICT(ip, port, protocol) DO UPDATE SET last_active_at = excluded.last_active_at, status = 'active'`,
		sess.ID, sess.ClientID, sess.IP, sess.Port, sess.Protocol, sess.CreatedAt, sess.LastActiveAt, sess.Name)
	return err
}

// UpdateSession renames and/or changes the port of a session.
func (s *Store) UpdateSession(id string, name string, port int) error {
	_, err := s.db.Exec(`UPDATE sessions SET name = ?, port = ? WHERE id = ?`, name, port, id)
	return err
}

func (s *Store) SessionByKey(ip string, port int, protocol string) (*model.Session, error) {
	row := s.db.QueryRow(`SELECT id, client_id, ip, port, protocol, status, created_at, last_active_at, message_count, name
		FROM sessions WHERE ip = ? AND port = ? AND protocol = ?`, ip, port, protocol)
	var sess model.Session
	if err := row.Scan(&sess.ID, &sess.ClientID, &sess.IP, &sess.Port, &sess.Protocol,
		&sess.Status, &sess.CreatedAt, &sess.LastActiveAt, &sess.MessageCount, &sess.Name); err != nil {
		return nil, err
	}
	return &sess, nil
}

func (s *Store) SessionByID(id string) (*model.Session, error) {
	row := s.db.QueryRow(`SELECT id, client_id, ip, port, protocol, status, created_at, last_active_at, message_count, name
		FROM sessions WHERE id = ?`, id)
	var sess model.Session
	if err := row.Scan(&sess.ID, &sess.ClientID, &sess.IP, &sess.Port, &sess.Protocol,
		&sess.Status, &sess.CreatedAt, &sess.LastActiveAt, &sess.MessageCount, &sess.Name); err != nil {
		return nil, err
	}
	return &sess, nil
}

func (s *Store) ListSessions(clientID string) ([]model.Session, error) {
	q := `SELECT id, client_id, ip, port, protocol, status, created_at, last_active_at, message_count, name FROM sessions`
	var args []any
	if clientID != "" {
		q += ` WHERE client_id = ?`
		args = append(args, clientID)
	}
	q += ` ORDER BY last_active_at DESC`
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Session
	for rows.Next() {
		var sess model.Session
		if err := rows.Scan(&sess.ID, &sess.ClientID, &sess.IP, &sess.Port, &sess.Protocol,
			&sess.Status, &sess.CreatedAt, &sess.LastActiveAt, &sess.MessageCount, &sess.Name); err != nil {
			return nil, err
		}
		out = append(out, sess)
	}
	return out, rows.Err()
}

// TotalMessages returns the cumulative message count across all sessions.
func (s *Store) TotalMessages() (int64, error) {
	var n int64
	err := s.db.QueryRow(`SELECT COALESCE(SUM(message_count), 0) FROM sessions`).Scan(&n)
	return n, err
}

func (s *Store) MarkSessionClosed(id string, now int64) error {
	_, err := s.db.Exec(`UPDATE sessions SET last_active_at = ?, status = 'closed' WHERE id = ?`, now, id)
	return err
}

func (s *Store) DeleteSession(id string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE id = ?`, id)
	return err
}

func (s *Store) DeleteSessionsByClient(clientID string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE client_id = ?`, clientID)
	return err
}

func (s *Store) DeleteClient(id string) error {
	_, err := s.db.Exec(`DELETE FROM clients WHERE id = ?`, id)
	return err
}

// AddCounts increments message counters and refreshes activity timestamps.
func (s *Store) AddCounts(clientID, sessionID string, delta, lastActiveAt int64) error {
	if sessionID != "" {
		if _, err := s.db.Exec(`UPDATE sessions SET message_count = message_count + ?, last_active_at = ? WHERE id = ?`, delta, lastActiveAt, sessionID); err != nil {
			return err
		}
	}
	if clientID != "" {
		if _, err := s.db.Exec(`UPDATE clients SET message_count = message_count + ?, last_seen = ? WHERE id = ?`, delta, lastActiveAt, clientID); err != nil {
			return err
		}
	}
	return nil
}

// GetSetting returns a setting value or "" when absent.
func (s *Store) GetSetting(key string) (string, error) {
	var v string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return v, err
}

func (s *Store) SetSetting(key, value string) error {
	_, err := s.db.Exec(`INSERT INTO settings (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

func (s *Store) AllSettings() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}
