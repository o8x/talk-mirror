package ingest

import (
	"bytes"
	"encoding/binary"
	"reflect"
	"testing"
)

func TestReadFrame(t *testing.T) {
	payload := []byte(`{"message":"hi"}`)
	var buf bytes.Buffer
	var lenBuf [2]byte
	binary.BigEndian.PutUint16(lenBuf[:], uint16(len(payload)))
	buf.Write(lenBuf[:])
	buf.Write(payload)

	frame, err := readFrame(&buf)
	if err != nil {
		t.Fatalf("readFrame: %v", err)
	}
	if !bytes.Equal(frame, payload) {
		t.Fatalf("got %q, want %q", frame, payload)
	}
}

func TestReadFrameShort(t *testing.T) {
	var buf bytes.Buffer
	buf.Write([]byte{0x00}) // truncated header
	if _, err := readFrame(&buf); err == nil {
		t.Fatal("expected error for truncated frame")
	}
}

func TestTakeRecords(t *testing.T) {
	in := []byte(`{"a":1}` + "\n\n" + `{"b":2}` + "\n\n" + `{"c":3}` + "\n")
	rest, recs := takeRecords(in)
	want := [][]byte{[]byte(`{"a":1}`), []byte(`{"b":2}`)}
	if !reflect.DeepEqual(recs, want) {
		t.Fatalf("recs = %q, want %q", recs, want)
	}
	if string(rest) != `{"c":3}`+"\n" {
		t.Fatalf("rest = %q", rest)
	}
}

func TestTakeRecordsPrettyMultiline(t *testing.T) {
	in := []byte("{\n  \"a\": 1\n}\n\n{\"b\": 2}\n\n")
	rest, recs := takeRecords(in)
	if len(recs) != 2 {
		t.Fatalf("want 2 records, got %d: %q", len(recs), recs)
	}
	if string(recs[0]) != "{\n  \"a\": 1\n}" {
		t.Fatalf("rec[0] = %q", recs[0])
	}
	if string(recs[1]) != `{"b": 2}` {
		t.Fatalf("rec[1] = %q", recs[1])
	}
	if len(rest) != 0 {
		t.Fatalf("rest = %q", rest)
	}
}

func TestTakeRecordsBlankLinesIgnored(t *testing.T) {
	in := []byte("\n\n{\"a\":1}\n\n\n\n")
	rest, recs := takeRecords(in)
	if len(recs) != 1 || string(recs[0]) != `{"a":1}` {
		t.Fatalf("recs = %q", recs)
	}
	if len(rest) != 0 {
		t.Fatalf("rest = %q", rest)
	}
}
