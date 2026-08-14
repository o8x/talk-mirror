<p align="center">
  <img src="views/public/logo.svg" alt="Talk-mirror logo" width="96" height="96" />
</p>

<h1 align="center">Talk-mirror</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/o8x/talk-mirror/actions/workflows/ci.yml"><img src="https://github.com/o8x/talk-mirror/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/o8x/talk-mirror/blob/main/LICENSE"><img src="https://img.shields.io/github/license/o8x/talk-mirror" alt="License"></a>
  <a href="https://github.com/o8x/talk-mirror/releases"><img src="https://img.shields.io/github/v/release/o8x/talk-mirror" alt="Release"></a>
  <a href="https://github.com/o8x/talk-mirror/blob/main/go.mod"><img src="https://img.shields.io/github/go-mod/go-version/o8x/talk-mirror" alt="Go version"></a>
  <a href="https://github.com/o8x/talk-mirror/releases"><img src="https://img.shields.io/github/downloads/o8x/talk-mirror/total" alt="Downloads"></a>
</p>

<p align="center">
  A self-contained <strong>remote debugger</strong> that ingests debug data over TCP/UDP,
  archives it to LevelDB, and visualizes it in a real-time web UI — all from a single binary.
</p>

---

## Features

- **Single binary** — the React/MUI frontend is embedded into the Go binary via `embed.FS`.
- **Raw TCP & UDP ingest** on a configurable data port (default `3000`).
- **Automatic frame handling** — `|2-byte big-endian length|JSON|` framing with sticky-packet splitting.
- **Client / session model** — an IP is a *client*, an `IP+port+protocol` pair is a *session*, each with a stable unique ID.
- **High-throughput storage** — raw messages are buffered in memory and flushed to **LevelDB** every 10 000 records or 30 s.
- **Metadata in SQLite** — clients, sessions and settings (pure-Go driver, no cgo).
- **Real-time WebSocket** push to the browser for messages, sessions, connections and stats.
- **Automatic TLS** — a 3-year self-signed certificate is generated when none is configured.
- **Kibana-like session view** with a live trend chart, brush-to-filter time ranges, expandable JSON rows and client-side pagination.
- **Access snippets** — ready-to-run stdlib-only clients for JavaScript, Python, Go, Shell and C++.
- **Pause** the whole system from the UI without stopping the process.
- **HTTP ingest** — write log messages via `POST /api/ingest`, so AI agents (with
  only an HTTP tool) can push logs; see the [skills](skills) directory.

## Quick start

```bash
make build
./talk-mirror
```

Then open `https://127.0.0.1:443` (accept the self-signed certificate on first run).

| Endpoint | Default |
|----------|---------|
| Web UI + WebSocket + API | `https://0.0.0.0:443` |
| Data ingest (TCP + UDP) | `0.0.0.0:3000` |

## Command line

```bash
./talk-mirror [flags]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-d` | *(platform-specific, see below)* | Data directory for SQLite, LevelDB, certificates and logs (auto-created). |
| `-w` | *(data dir)* | Log file path; defaults to `<data-dir>/talk-mirror.log`. |
| `--host` | *(settings)* | Override the web listen address (falls back to the `web_host` setting). |
| `--port` | *(settings)* | Override the web listen port (falls back to the `web_port` setting). |
| `--talk-port` | *(settings)* | Override the data listen port (falls back to the `data_port` setting). |

The default data directory is baked in at packaging time:

| Build | Default data directory |
|-------|------------------------|
| Portable binary | `./data` (relative to the working directory) |
| Linux package | `/var/lib/talk-mirror` |
| macOS package | `/usr/local/var/talk-mirror` |
| Windows installer | `%ProgramData%\Talk-mirror` |

## Installation (packaged)

Each GitHub Release ships native packages in addition to portable binaries.

### Linux

| Format | Install | Manage |
|--------|---------|--------|
| `.deb` | `sudo apt install ./talk-mirror-v<version>_linux-amd64.deb` | `systemctl status talk-mirror` |
| `.rpm` | `sudo dnf install ./talk-mirror-v<version>_linux-amd64.rpm` | `systemctl status talk-mirror` |
| `.run` | `sudo bash talk-mirror-v<version>_linux-amd64.run` | `systemctl status talk-mirror` |

The service runs as a dedicated `talk-mirror` system user with
`CAP_NET_BIND_SERVICE` (so it can bind port 443) and stores data in
`/var/lib/talk-mirror`.

### macOS

```bash
sudo installer -pkg talk-mirror-v<version>_macos-arm64.pkg -target /
```

Installs `/usr/local/bin/talk-mirror` and a LaunchDaemon
(`com.talk-mirror`) that starts on boot. Manage it with `launchctl` (or
`brew services` once registered):

```bash
launchctl list com.talk-mirror
sudo launchctl bootout system/com.talk-mirror
sudo launchctl bootstrap system /Library/LaunchDaemons/com.talk-mirror.plist
```

### Windows

Run `talk-mirror-v<version>_windows-amd64.exe`. The installer registers the binary as the
Windows service `TalkMirror` (auto-start) and stores data in
`%ProgramData%\Talk-mirror`. Manage it with:

```powershell
sc.exe query TalkMirror
sc.exe stop TalkMirror
sc.exe start TalkMirror
```

## Data format

Clients push JSON objects over TCP or UDP.

**TCP** uses length-prefixed frames:

```
| 2-byte big-endian uint16 length | JSON bytes |
```

**UDP** datagrams are self-delimiting — each datagram is one JSON object (an optional
length prefix is tolerated).

The JSON payload:

```json
{
  "time_nano": 1786686829000000000,
  "tag": ["info", "request"],
  "message": "hello",
  "data": {
    "anything": "you like"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `time_nano` | int | Nanosecond timestamp (defaults to receive time). |
| `tag` | string[] | Optional tags shown in the UI. |
| `message` | string | Short human-readable message. |
| `data` | object | Arbitrary user payload. |
| `protocol` | string | Optional `"tcp"` or `"udp"` override; defaults to the transport used. |

The session key is `IP + port + protocol`, so TCP and UDP streams from the same source
are tracked independently.

## Client example (Go, stdlib only)

```go
package main

import (
    "encoding/binary"
    "encoding/json"
    "net"
    "time"
)

func main() {
    conn, _ := net.Dial("tcp", "127.0.0.1:3000")
    defer conn.Close()
    for {
        msg := map[string]any{
            "time_nano": time.Now().UnixNano(),
            "tag":       []string{"tick"},
            "message":   "heartbeat",
            "data":      map[string]any{"value": 42},
        }
        body, _ := json.Marshal(msg)
        buf := make([]byte, 2+len(body))
        binary.BigEndian.PutUint16(buf[:2], uint16(len(body)))
        copy(buf[2:], body)
        conn.Write(buf)
        time.Sleep(time.Second)
    }
}
```

More examples (JavaScript, Python, Shell, C++) are available in the **Access** page of the UI.

## Configuration

Settings are editable in the **Settings** page and persisted to SQLite:

- Web address / port (default `0.0.0.0:443`)
- Data address / port (default `0.0.0.0:3000`)
- TLS certificate / key paths (auto-generated when empty)
- Theme color and dark mode (dark = green, light = red)
- Pause / resume the system

The LevelDB directory and SQLite file locations are shown read-only (they live under `-d`).

## Project structure

```
.
├── main.go                 # entry point, wiring and graceful shutdown
├── embed.go                # embeds the frontend into the binary
├── Makefile
├── internal/
│   ├── api/                # REST handlers + access snippets
│   ├── config/             # flags and defaults
│   ├── hub/                # WebSocket hub
│   ├── ingest/             # TCP/UDP servers and frame parsing
│   ├── logger/             # slog setup (console + file)
│   ├── model/              # shared entities
│   ├── server/             # TLS HTTP server + SPA serving
│   ├── service/            # OS service integration (Windows SCM)
│   ├── session/            # client/session registry
│   ├── state/              # pause gate
│   ├── store/
│   │   ├── buffer/         # in-memory buffer -> LevelDB flush
│   │   ├── leveldb/        # message archive
│   │   └── sqlite/         # metadata & settings
│   └── tlsutil/            # self-signed certificate generation
├── packaging/
│   ├── linux/              # systemd unit + nfpm (deb/rpm) + .run builder
│   ├── macos/              # launchd plist + pkgbuilder script
│   └── windows/            # NSIS installer script
├── skills/                 # bilingual AI agent skills (query + log writing)
└── views/                  # React + MUI + ECharts frontend (pnpm)
```

## Development

```bash
# backend
go test ./...

# frontend (hot reload)
cd views && pnpm install && pnpm dev

# full build
make build
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the
development workflow, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community
guidelines, and [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## AI skills

The [skills](skills) directory contains bilingual (English / 中文) `SKILL.md`
files that teach an AI agent — equipped with an `https_request` tool — how to
query and write logs to Talk-mirror. Trigger phrases use the "魔镜魔镜告诉我"
(Magic mirror, magic mirror, tell me) persona.

## License

[MIT](LICENSE)
