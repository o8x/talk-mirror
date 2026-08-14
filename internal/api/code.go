package api

import (
	"net"
	"net/http"
	"strconv"
	"strings"
)

// classExamples are client classes: constructor(address, port) auto-connects and
// exposes a single public talk() method that uses the stored connection.
var classExamples = map[string]string{
	"javascript": `// Node.js (stdlib only) - TalkMirror client class
const net = require('net');

class talk_mirror {
    constructor(address, port) {
        this.conn = net.createConnection({ host: address, port: port });
    }

    talk(message, tag, data = {}) {
        const json = Buffer.from(
            JSON.stringify({ time_nano: Date.now() * 1e6, tag, message, data }),
            'utf8'
        );
        if (json.length > 65535) throw new Error('frame too large');
        const header = Buffer.alloc(2);
        header.writeUInt16BE(json.length, 0);
        this.conn.write(Buffer.concat([header, json]));
    }
}
`,

	"python": `# Python 3 (stdlib only) - TalkMirror client class
import json
import socket
import struct
import time


class talk_mirror:
    def __init__(self, address, port):
        self.sock = socket.create_connection((address, port))

    def talk(self, message, tag, data=None):
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
        self.sock.sendall(struct.pack(">H", len(payload)) + payload)
`,

	"go": `package main

// Go (stdlib only) - TalkMirror client struct.
import (
    "encoding/binary"
    "encoding/json"
    "fmt"
    "net"
    "time"
)

type TalkMirror struct {
    conn net.Conn
}

func NewTalkMirror(address string, port int) *TalkMirror {
    conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", address, port))
    if err != nil {
        panic(err)
    }
    return &TalkMirror{conn: conn}
}

func (t *TalkMirror) Talk(message string, tag []string, data map[string]any) error {
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
    _, err = t.conn.Write(buf)
    return err
}
`,

	"shell": `#!/usr/bin/env bash
# Bash has no classes; emulate one with a constructor + a method function.

TALK_MIRROR_FD=

talk_mirror_init() {
    local address="$1" port="$2"
    exec {TALK_MIRROR_FD}<>/dev/tcp/$address/$port || return 1
}

talk_mirror_talk() {
    local message="$1" tag="$2" data="$3"
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
    printf "$(printf '\\%03o' "$hi")$(printf '\\%03o' "$lo")%s" "$json" >&"$TALK_MIRROR_FD"
}
`,

	"c++": `// C++17 (stdlib only) - TalkMirror client class.
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cstdint>
#include <cstring>
#include <map>
#include <string>
#include <vector>

class talk_mirror {
public:
    talk_mirror(const std::string& address, int port) {
        sock_ = socket(AF_INET, SOCK_STREAM, 0);
        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port);
        inet_pton(AF_INET, address.c_str(), &addr.sin_addr);
        connect(sock_, (sockaddr*)&addr, sizeof(addr));
    }

    void talk(const std::string& message,
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
        send(sock_, buf, 2 + json.size(), 0);
    }

private:
    int sock_;
};
`,
}

// appExamples show how to instantiate and use the class.
var appExamples = map[string]string{
	"javascript": `// Node.js (stdlib only) - usage
const tm = new talk_mirror('127.0.0.1', 3000);

tm.talk('hello', ['info'], { foo: 'bar' });
`,

	"python": `# Python 3 (stdlib only) - usage
tm = talk_mirror("127.0.0.1", 3000)

tm.talk("hello", ["info"], {"foo": "bar"})
`,

	"go": `package main

// Go (stdlib only) - usage.
func main() {
    tm := NewTalkMirror("127.0.0.1", 3000)

    _ = tm.Talk("hello", []string{"info"}, map[string]any{"foo": "bar"})
}
`,

	"shell": `#!/usr/bin/env bash
# Bash - usage.
talk_mirror_init 127.0.0.1 3000

talk_mirror_talk "hello" '["info"]' '{"foo":"bar"}'
`,

	"c++": `// C++17 (stdlib only) - usage.
int main() {
    talk_mirror tm("127.0.0.1", 3000);

    tm.talk("hello", {"info"}, {{"foo", "bar"}});
    return 0;
}
`,
}

func (h *Handler) code(w http.ResponseWriter, r *http.Request) {
	lang := r.PathValue("lang")
	class, ok := classExamples[lang]
	if !ok {
		writeErr(w, http.StatusNotFound, "unknown language")
		return
	}
	app := appExamples[lang]

	ip := internalIP()
	port := strconv.Itoa(h.dataPort)
	class = strings.ReplaceAll(class, "127.0.0.1", ip)
	class = strings.ReplaceAll(class, "3000", port)
	app = strings.ReplaceAll(app, "127.0.0.1", ip)
	app = strings.ReplaceAll(app, "3000", port)

	writeJSON(w, http.StatusOK, map[string]string{"lang": lang, "class": class, "app": app})
}

// internalIP returns the first private IPv4 address of an up, non-loopback
// interface, falling back to 127.0.0.1 when none is found.
func internalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	fallback := ""
	for _, a := range addrs {
		ipnet, ok := a.(*net.IPNet)
		if !ok {
			continue
		}
		ip4 := ipnet.IP.To4()
		if ip4 == nil || ip4.IsLoopback() {
			continue
		}
		if isPrivate(ip4) {
			return ip4.String()
		}
		if fallback == "" {
			fallback = ip4.String()
		}
	}
	if fallback != "" {
		return fallback
	}
	return "127.0.0.1"
}

func isPrivate(ip net.IP) bool {
	return ip[0] == 10 ||
		(ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31) ||
		(ip[0] == 192 && ip[1] == 168)
}
