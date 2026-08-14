package api

import "net/http"

// appExamples are ready-to-run clients (application mode).
var appExamples = map[string]string{
	"javascript": `// Node.js (stdlib only) - TCP long-connection debug client
const net = require('net');

const HOST = '127.0.0.1';
const PORT = 3000;

function talkMirror(socket, obj) {
    const json = Buffer.from(JSON.stringify(obj), 'utf8');
    if (json.length > 65535) throw new Error('frame too large');
    const header = Buffer.alloc(2);
    header.writeUInt16BE(json.length, 0);
    socket.write(Buffer.concat([header, json]));
}

const client = net.createConnection({ host: HOST, port: PORT }, () => {
    console.log('connected to ' + HOST + ':' + PORT);
    talkMirror(client, { tag: ['info'], message: 'hello', data: { foo: 'bar' } });
});

setInterval(() => {
    talkMirror(client, {
        time_nano: Date.now() * 1e6,
        tag: ['tick'],
        message: 'heartbeat',
        data: { value: Math.floor(Math.random() * 1000) },
    });
}, 1000);

client.on('error', (e) => console.error(e.message));
client.on('close', () => console.log('disconnected'));
`,

	"python": `# Python 3 (stdlib only) - TCP long-connection debug client
import json
import socket
import struct
import time

HOST, PORT = "127.0.0.1", 3000


def talk_mirror(sock, obj):
    payload = json.dumps(obj).encode("utf-8")
    if len(payload) > 65535:
        raise ValueError("frame too large")
    sock.sendall(struct.pack(">H", len(payload)) + payload)


with socket.create_connection((HOST, PORT)) as sock:
    while True:
        talk_mirror(sock, {
            "time_nano": time.time_ns(),
            "tag": ["tick"],
            "message": "heartbeat",
            "data": {"value": 42},
        })
        time.sleep(1)
`,

	"go": `package main

// Go (stdlib only) - TCP long-connection debug client
import (
    "encoding/binary"
    "encoding/json"
    "fmt"
    "net"
    "time"
)

func main() {
    conn, err := net.Dial("tcp", "127.0.0.1:3000")
    if err != nil {
        panic(err)
    }
    defer conn.Close()

    for {
        msg := map[string]any{
            "time_nano": time.Now().UnixNano(),
            "tag":       []string{"tick"},
            "message":   "heartbeat",
            "data":      map[string]any{"value": 42},
        }
        body, _ := json.Marshal(msg)
        if len(body) > 65535 {
            panic("frame too large")
        }
        buf := make([]byte, 2+len(body))
        binary.BigEndian.PutUint16(buf[:2], uint16(len(body)))
        copy(buf[2:], body)
        if _, err := conn.Write(buf); err != nil {
            fmt.Println("write error:", err)
            return
        }
        time.Sleep(time.Second)
    }
}
`,

	"shell": `#!/usr/bin/env bash
# Bash (stdlib only) - TCP long-connection debug client
HOST=127.0.0.1
PORT=3000

talk_mirror() {
    local json="$1"
    local len=${#json}
    if [ "$len" -gt 65535 ]; then
        echo "frame too large" >&2
        return 1
    fi
    local hi=$(( (len >> 8) & 0xff ))
    local lo=$(( len & 0xff ))
    printf "$(printf '\\%03o' "$hi")$(printf '\\%03o' "$lo")%s" "$json"
}

exec 3<>/dev/tcp/$HOST/$PORT || { echo "connect failed" >&2; exit 1; }

while true; do
    ts=$(date +%s%N)
    json="{\"time_nano\":$ts,\"tag\":[\"tick\"],\"message\":\"heartbeat\",\"data\":{\"value\":42}}"
    talk_mirror "$json" >&3
    sleep 1
done
`,

	"c++": `// C++17 (stdlib only) - TCP long-connection debug client
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cstring>
#include <iostream>
#include <string>

int main() {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        std::cerr << "socket failed\n";
        return 1;
    }
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(3000);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);
    if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
        std::cerr << "connect failed\n";
        return 1;
    }

    std::string json =
        R"({"tag":["tick"],"message":"heartbeat","data":{"value":42}})";
    uint16_t len = htons(static_cast<uint16_t>(json.size()));
    char buf[2 + 65536];
    std::memcpy(buf, &len, 2);
    std::memcpy(buf + 2, json.data(), json.size());
    send(sock, buf, 2 + json.size(), 0);

    close(sock);
    return 0;
}
`,
}

// fnExamples are concise reusable-function snippets (function mode): connection
// creation + a single talkMirror/talk_mirror function callable from other code.
var fnExamples = map[string]string{
	"javascript": `// Node.js (stdlib only) - reusable function
const net = require('net');

// Create a connection (reuse it across calls):
const conn = net.createConnection({ host: '127.0.0.1', port: 3000 });

function talkMirror(conn, message, tag, data = {}) {
    const json = Buffer.from(
        JSON.stringify({ time_nano: Date.now() * 1e6, tag, message, data }),
        'utf8'
    );
    if (json.length > 65535) throw new Error('frame too large');
    const header = Buffer.alloc(2);
    header.writeUInt16BE(json.length, 0);
    conn.write(Buffer.concat([header, json]));
}

// usage:
// talkMirror(conn, 'hello', ['info']);                 // data defaults to {}
// talkMirror(conn, 'hello', ['info'], { foo: 'bar' });
`,

	"python": `# Python 3 (stdlib only) - reusable function
import json
import socket
import struct
import time

# Create a connection (reuse it across calls):
sock = socket.create_connection(("127.0.0.1", 3000))


def talk_mirror(sock, message, tag, data=None):
    if data is None:
        data = {}
    payload = json.dumps({
        "time_nano": time.time_ns(),
        "tag": tag,
        "message": message,
        "data": data,
    }).encode("utf-8")
    if len(payload) > 65535:
        raise ValueError("frame too large")
    sock.sendall(struct.pack(">H", len(payload)) + payload)


# usage:
# talk_mirror(sock, "hello", ["info"])                    # data defaults to {}
# talk_mirror(sock, "hello", ["info"], {"foo": "bar"})
`,

	"go": `package main

// Go (stdlib only) - reusable function.
import (
    "encoding/binary"
    "encoding/json"
    "fmt"
    "net"
    "time"
)

// TalkMirror sends one debug frame. Go has no default arguments, so data is
// always required; pass nil to omit it.
func TalkMirror(conn net.Conn, message string, tag []string, data map[string]any) error {
    body, err := json.Marshal(map[string]any{
        "time_nano": time.Now().UnixNano(),
        "tag":       tag,
        "message":   message,
        "data":      data,
    })
    if err != nil {
        return err
    }
    if len(body) > 65535 {
        return fmt.Errorf("frame too large")
    }
    buf := make([]byte, 2+len(body))
    binary.BigEndian.PutUint16(buf[:2], uint16(len(body)))
    copy(buf[2:], body)
    _, err = conn.Write(buf)
    return err
}

func main() {
    conn, err := net.Dial("tcp", "127.0.0.1:3000")
    if err != nil {
        panic(err)
    }
    defer conn.Close()

    _ = TalkMirror(conn, "hello", []string{"info"}, nil)
}
`,

	"shell": `# Bash (stdlib only) - reusable function.
HOST=127.0.0.1
PORT=3000

# Create a connection (file descriptor 3):
exec 3<>/dev/tcp/$HOST/$PORT || { echo "connect failed" >&2; exit 1; }

# tag and data are JSON strings (e.g. '["info"]' and '{"foo":"bar"}').
talk_mirror() {
    local fd="$1" message="$2" tag="$3" data="$4"
    local ts
    ts=$(date +%s%N)
    local json
    json="{\"time_nano\":$ts,\"tag\":$tag,\"message\":$message,\"data\":$data}"
    local len=${#json}
    if [ "$len" -gt 65535 ]; then
        echo "frame too large" >&2
        return 1
    fi
    local hi=$(( (len >> 8) & 0xff ))
    local lo=$(( len & 0xff ))
    printf "$(printf '\\%03o' "$hi")$(printf '\\%03o' "$lo")%s" "$json" >&"$fd"
}

# usage:
# talk_mirror 3 "hello" '["info"]' '{"foo":"bar"}'
`,

	"c++": `// C++17 (stdlib only) - reusable function.
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cstdint>
#include <cstring>
#include <iostream>
#include <map>
#include <string>
#include <vector>

void talk_mirror(int sock, const std::string& message,
                 const std::vector<std::string>& tag,
                 const std::map<std::string, std::string>& data = {}) {
    std::string tags;
    for (size_t i = 0; i < tag.size(); i++) {
        if (i) tags += "\",\"";
        tags += tag[i];
    }
    std::string fields;
    for (auto it = data.begin(); it != data.end(); ++it) {
        if (it != data.begin()) fields += ",";
        fields += "\"" + it->first + "\":\"" + it->second + "\"";
    }
    std::string json =
        "{\"tag\":[\"" + tags + "\"],\"message\":\"" + message +
        "\",\"data\":{" + fields + "}}";
    uint16_t len = htons(static_cast<uint16_t>(json.size()));
    char buf[2 + 65536];
    std::memcpy(buf, &len, 2);
    std::memcpy(buf + 2, json.data(), json.size());
    send(sock, buf, 2 + json.size(), 0);
}

int main() {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(3000);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);
    connect(sock, (sockaddr*)&addr, sizeof(addr));

    talk_mirror(sock, "hello", {"info"});  // data defaults to {}
    close(sock);
    return 0;
}
`,
}

func (h *Handler) code(w http.ResponseWriter, r *http.Request) {
	lang := r.PathValue("lang")
	app, ok := appExamples[lang]
	if !ok {
		writeErr(w, http.StatusNotFound, "unknown language")
		return
	}
	fn := fnExamples[lang]
	writeJSON(w, http.StatusOK, map[string]string{"lang": lang, "app": app, "fn": fn})
}
