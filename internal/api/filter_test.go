package api

import (
	"encoding/json"
	"testing"

	"github.com/o8x/talk-mirror/internal/model"
)

func rec(seq int64, tags []string, msg string, data string) model.Record {
	return model.Record{Seq: seq, Tag: tags, Message: msg, Data: json.RawMessage(data)}
}

func TestFilterRecords(t *testing.T) {
	records := []model.Record{
		rec(1, []string{"pay"}, "order paid", `{"order_id":"123","amount":9.9}`),
		rec(2, []string{"ship"}, "package sent", `{"tracking":"abc"}`),
		rec(3, []string{"pay", "refund"}, "refund issued", `{"order_id":"123","amount":9.9}`),
	}
	clone := func() []model.Record {
		out := make([]model.Record, len(records))
		copy(out, records)
		return out
	}

	byTag := filterRecords(clone(), "Pay", "", "", "")
	if len(byTag) != 2 {
		t.Fatalf("tag filter: want 2, got %d", len(byTag))
	}

	byDataKey := filterRecords(clone(), "", "tracking", "", "")
	if len(byDataKey) != 1 || byDataKey[0].Seq != 2 {
		t.Fatalf("data key filter: want seq 2, got %+v", byDataKey)
	}

	byDataKV := filterRecords(clone(), "", "order_id", "123", "")
	if len(byDataKV) != 2 {
		t.Fatalf("data key/value filter: want 2, got %d", len(byDataKV))
	}

	byKeyword := filterRecords(clone(), "", "", "", "refund")
	if len(byKeyword) != 1 || byKeyword[0].Seq != 3 {
		t.Fatalf("keyword filter: want seq 3, got %+v", byKeyword)
	}

	combined := filterRecords(clone(), "pay", "order_id", "123", "issued")
	if len(combined) != 1 || combined[0].Seq != 3 {
		t.Fatalf("combined filter: want seq 3, got %+v", combined)
	}

	noFilter := filterRecords(clone(), "", "", "", "")
	if len(noFilter) != 3 {
		t.Fatalf("no filter: want 3, got %d", len(noFilter))
	}
}

func TestMatchDataNonObject(t *testing.T) {
	r := rec(1, nil, "plain", `"just a string"`)
	if matchData(r.Data, "anything", "") {
		t.Fatal("non-object data should never match a key")
	}
}
