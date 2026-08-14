package buffer

import (
	"sort"
	"sync"
	"time"

	"github.com/o8x/talk-mirror/internal/model"
	ldb "github.com/o8x/talk-mirror/internal/store/leveldb"
)

const (
	DefaultFlushCount = 10000
	DefaultFlushEvery = 30 * time.Second
)

// Buffer holds in-memory pending records and periodically flushes them into
// the LevelDB archive. It also merges archive + pending for queries.
type Buffer struct {
	mu         sync.Mutex
	db         *ldb.Store
	pending    []model.Record
	flushAt    int
	flushEvery time.Duration
	total      int64
}

func New(db *ldb.Store, flushAt int, flushEvery time.Duration) *Buffer {
	if flushAt <= 0 {
		flushAt = DefaultFlushCount
	}
	if flushEvery <= 0 {
		flushEvery = DefaultFlushEvery
	}
	return &Buffer{db: db, flushAt: flushAt, flushEvery: flushEvery}
}

// Append queues a record and triggers a flush when the threshold is reached.
func (b *Buffer) Append(r model.Record) {
	b.mu.Lock()
	b.pending = append(b.pending, r)
	b.total++
	needFlush := len(b.pending) >= b.flushAt
	b.mu.Unlock()
	if needFlush {
		b.Flush()
	}
}

// Flush writes all pending records to LevelDB.
func (b *Buffer) Flush() {
	b.mu.Lock()
	if len(b.pending) == 0 {
		b.mu.Unlock()
		return
	}
	batch := b.pending
	b.pending = nil
	b.mu.Unlock()
	_ = b.db.Put(batch)
}

// Run flushes on an interval until done is closed.
func (b *Buffer) Run(done <-chan struct{}) {
	t := time.NewTicker(b.flushEvery)
	defer t.Stop()
	for {
		select {
		case <-done:
			b.Flush()
			return
		case <-t.C:
			b.Flush()
		}
	}
}

// Total returns the total number of records seen since startup.
func (b *Buffer) Total() int64 {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.total
}

// Query merges archived and pending records for a session within [start, end),
// returned in ascending time order.
func (b *Buffer) Query(sessionID string, start, end int64) ([]model.Record, error) {
	archived, err := b.db.Range(sessionID, start, end, 0)
	if err != nil {
		return nil, err
	}
	b.mu.Lock()
	pending := filterPending(b.pending, sessionID, start, end)
	b.mu.Unlock()

	merged := append(archived, pending...)
	sort.Slice(merged, func(i, j int) bool { return merged[i].TimeNano < merged[j].TimeNano })
	return merged, nil
}

// Count returns the total count for a session within [start, end).
func (b *Buffer) Count(sessionID string, start, end int64) (int64, error) {
	archived, err := b.db.CountInRange(sessionID, start, end)
	if err != nil {
		return 0, err
	}
	b.mu.Lock()
	n := int64(len(filterPending(b.pending, sessionID, start, end)))
	b.mu.Unlock()
	return archived + n, nil
}

// Buckets returns global per-bucket message counts within [start, end).
func (b *Buffer) Buckets(start, end, bucketSize int64) (map[int64]int64, error) {
	buckets, err := b.db.GlobalBuckets(start, end, bucketSize)
	if err != nil {
		return nil, err
	}
	b.mu.Lock()
	for _, r := range b.pending {
		if r.TimeNano < start {
			continue
		}
		if end > 0 && r.TimeNano >= end {
			continue
		}
		buckets[(r.TimeNano/bucketSize)*bucketSize]++
	}
	b.mu.Unlock()
	return buckets, nil
}

func filterPending(pending []model.Record, sessionID string, start, end int64) []model.Record {
	var out []model.Record
	for _, r := range pending {
		if r.SessionID != sessionID {
			continue
		}
		if r.TimeNano < start {
			continue
		}
		if end > 0 && r.TimeNano >= end {
			continue
		}
		out = append(out, r)
	}
	return out
}
