package leveldb

import (
	"encoding/binary"
	"encoding/json"
	"fmt"

	"github.com/syndtr/goleveldb/leveldb"
	"github.com/syndtr/goleveldb/leveldb/util"

	"github.com/o8x/talk-mirror/internal/model"
)

// Store is the append-only archive for raw message records.
type Store struct {
	db *leveldb.DB
}

func Open(path string) (*Store, error) {
	db, err := leveldb.OpenFile(path, nil)
	if err != nil {
		return nil, fmt.Errorf("open leveldb: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// Put writes a batch of records atomically.
func (s *Store) Put(records []model.Record) error {
	batch := new(leveldb.Batch)
	for _, r := range records {
		val, err := json.Marshal(r)
		if err != nil {
			return err
		}
		batch.Put(sessionKey(r.SessionID, r.TimeNano, r.Seq), val)
		batch.Put(globalKey(r.TimeNano, r.Seq), val)
	}
	return s.db.Write(batch, nil)
}

// Range returns records for a session within [start, end) inclusive-exclusive,
// ordered by time ascending, limited to `limit` records (0 = unlimited).
func (s *Store) Range(sessionID string, start, end int64, limit int) ([]model.Record, error) {
	prefix := sessionPrefix(sessionID)
	iter := s.db.NewIterator(util.BytesPrefix(prefix), nil)
	defer iter.Release()

	var out []model.Record
	for iter.Next() {
		_, ts, _ := decodeSessionKey(iter.Key())
		if ts < start {
			continue
		}
		if end > 0 && ts >= end {
			break
		}
		var r model.Record
		if err := json.Unmarshal(iter.Value(), &r); err != nil {
			continue
		}
		out = append(out, r)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out, iter.Error()
}

// CountInRange counts records for a session within [start, end).
func (s *Store) CountInRange(sessionID string, start, end int64) (int64, error) {
	prefix := sessionPrefix(sessionID)
	iter := s.db.NewIterator(util.BytesPrefix(prefix), nil)
	defer iter.Release()

	var n int64
	for iter.Next() {
		_, ts, _ := decodeSessionKey(iter.Key())
		if ts < start {
			continue
		}
		if end > 0 && ts >= end {
			break
		}
		n++
	}
	return n, iter.Error()
}

// GlobalBuckets counts all messages grouped into fixed-width time buckets.
func (s *Store) GlobalBuckets(start, end int64, bucketSize int64) (map[int64]int64, error) {
	if bucketSize <= 0 {
		bucketSize = 1
	}
	iter := s.db.NewIterator(util.BytesPrefix(globalTag), nil)
	defer iter.Release()

	buckets := map[int64]int64{}
	for iter.Next() {
		ts, _ := decodeGlobalKey(iter.Key())
		if ts < start {
			continue
		}
		if end > 0 && ts >= end {
			break
		}
		buckets[(ts/bucketSize)*bucketSize]++
	}
	return buckets, iter.Error()
}

// SessionBuckets counts a session's records grouped into fixed-width buckets.
func (s *Store) SessionBuckets(sessionID string, start, end int64, bucketSize int64) (map[int64]int64, error) {
	if bucketSize <= 0 {
		bucketSize = 1
	}
	prefix := sessionPrefix(sessionID)
	iter := s.db.NewIterator(util.BytesPrefix(prefix), nil)
	defer iter.Release()

	buckets := map[int64]int64{}
	for iter.Next() {
		_, ts, _ := decodeSessionKey(iter.Key())
		if ts < start {
			continue
		}
		if end > 0 && ts >= end {
			break
		}
		buckets[(ts/bucketSize)*bucketSize]++
	}
	return buckets, iter.Error()
}

// DeleteSession removes all archived records of a session (both the session
// index and the global time index).
func (s *Store) DeleteSession(sessionID string) error {
	prefix := sessionPrefix(sessionID)
	iter := s.db.NewIterator(util.BytesPrefix(prefix), nil)
	batch := new(leveldb.Batch)
	for iter.Next() {
		_, ts, seq := decodeSessionKey(iter.Key())
		batch.Delete(iter.Key())
		batch.Delete(globalKey(ts, seq))
	}
	iter.Release()
	if err := iter.Error(); err != nil {
		return err
	}
	return s.db.Write(batch, nil)
}

// --- key encoding ---

var (
	sessionTag = []byte("m:")
	globalTag  = []byte("t:")
)

func sessionPrefix(sessionID string) []byte {
	p := make([]byte, 0, len(sessionTag)+len(sessionID)+1)
	p = append(p, sessionTag...)
	p = append(p, sessionID...)
	p = append(p, ':')
	return p
}

func sessionKey(sessionID string, ts, seq int64) []byte {
	p := sessionPrefix(sessionID)
	p = binary.BigEndian.AppendUint64(p, uint64(ts))
	p = binary.BigEndian.AppendUint64(p, uint64(seq))
	return p
}

func globalKey(ts, seq int64) []byte {
	p := make([]byte, 0, len(globalTag)+16)
	p = append(p, globalTag...)
	p = binary.BigEndian.AppendUint64(p, uint64(ts))
	p = binary.BigEndian.AppendUint64(p, uint64(seq))
	return p
}

func decodeSessionKey(k []byte) (sessionID string, ts int64, seq int64) {
	body := k[len(sessionTag):]
	i := 0
	for i < len(body) && body[i] != ':' {
		i++
	}
	sessionID = string(body[:i])
	rest := body[i+1:]
	ts = int64(binary.BigEndian.Uint64(rest[:8]))
	seq = int64(binary.BigEndian.Uint64(rest[8:16]))
	return sessionID, ts, seq
}

func decodeGlobalKey(k []byte) (ts int64, seq int64) {
	body := k[len(globalTag):]
	ts = int64(binary.BigEndian.Uint64(body[:8]))
	seq = int64(binary.BigEndian.Uint64(body[8:16]))
	return ts, seq
}
