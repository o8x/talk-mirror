package api

import (
	"net/http"
)

var codeExamples = map[string]string{
	"javascript": `// Node.js (stdlib only) - TCP long-connection debug client
const net = require('net');

const HOST = '127.0.0.1';
const PORT = 3000;

function send(socket, obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  if (json.length > 65535) throw new Error('frame too large');
  const header = Buffer.alloc(2);
  header.writeUInt16BE(json.length, 0);
  socket.write(Buffer.concat([header, json]));
}

const client = net.createConnection({ host: HOST, port: PORT }, () => {
  console.log('connected to ' + HOST + ':' + PORT);
  send(client, { tag: ['info'], message: 'hello', data: { foo: 'bar' } });
});

setInterval(() => {
  send(client, {
    time_nano: Date.now() * 1e6,
    tag: ['tick'],
    message: 'heartbeat',
    data: { value: Math.floor(Math.random() * 1000) }
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


def send(sock, obj):
    payload = json.dumps(obj).encode("utf-8")
    if len(payload) > 65535:
        raise ValueError("frame too large")
    sock.sendall(struct.pack(">H", len(payload)) + payload)


with socket.create_connection((HOST, PORT)) as sock:
    while True:
        send(sock, {
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

send_frame() {
  local json="$1"
  local len=${#json}
  if [ "$len" -gt 65535 ]; then
    echo "frame too large" >&2
    return 1
  fi
  printf "\\x%02x\\x%02x%s" $((len >> 8)) $((len & 0xff)) "$json"
}

exec 3<>/dev/tcp/$HOST/$PORT || { echo "connect failed" >&2; exit 1; }

while true; do
  ts=$(date +%s%N)
  json="{\"time_nano\":$ts,\"tag\":[\"tick\"],\"message\":\"heartbeat\",\"data\":{\"value\":42}}"
  send_frame "$json" >&3
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

func (h *Handler) code(w http.ResponseWriter, r *http.Request) {
	lang := r.PathValue("lang")
	code, ok := codeExamples[lang]
	if !ok {
		writeErr(w, http.StatusNotFound, "unknown language")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"lang": lang, "code": code})
}
