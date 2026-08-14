package leveldb

import (
	"encoding/json"
	"testing"

	"github.com/o8x/talk-mirror/internal/model"
)

func TestPutRange(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer s.Close()

	recs := []model.Record{
		{Seq: 1, SessionID: "s1", TimeNano: 100, Data: json.RawMessage(`{"a":1}`)},
		{Seq: 2, SessionID: "s1", TimeNano: 200, Data: json.RawMessage(`{"a":2}`)},
		{Seq: 3, SessionID: "s1", TimeNano: 300, Data: json.RawMessage(`{"a":3}`)},
		{Seq: 1, SessionID: "s2", TimeNano: 150, Data: json.RawMessage(`{"b":1}`)},
	}
	if err := s.Put(recs); err != nil {
		t.Fatalf("put: %v", err)
	}

	got, err := s.Range("s1", 0, 0, 0)
	if err != nil {
		t.Fatalf("range: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("want 3 records, got %d", len(got))
	}
	if got[0].Seq != 1 || got[2].Seq != 3 {
		t.Fatalf("unexpected order: %+v", got)
	}

	// range filter
	filtered, err := s.Range("s1", 150, 250, 0)
	if err != nil {
		t.Fatalf("range filter: %v", err)
	}
	if len(filtered) != 1 || filtered[0].Seq != 2 {
		t.Fatalf("range filter wrong: %+v", filtered)
	}
}
