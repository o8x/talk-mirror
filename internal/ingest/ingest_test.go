package ingest

import (
	"bytes"
	"encoding/binary"
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
