---
name: talk-mirror-query
description: Query the Talk-mirror debugger for connections, sessions, messages, statistics, settings and access code samples via its REST API.
---

# Query module

All requests use `GET` against `https://<host>:443`. Use `verify: false` for the
self-signed certificate. No request body.

## Capabilities & prompt rules

### 1. Overview / statistics

- **Trigger**: 魔镜魔镜告诉我，最近的统计概览
- **Intent**: global totals, QPS, active connections/sessions and the trend.
- **Action**: `GET /api/stats/overview?seconds=300&bucket=5`
  - `seconds`: time window in seconds (default `300`).
  - `bucket`: trend bucket width in seconds (default auto).
- **Reply**: summarize `total_messages`, `qps`, `active_connections`,
  `active_sessions`, and the top of the `buckets` trend.

### 2. List connections

- **Trigger**: 魔镜魔镜告诉我，现在有哪些客户端连接？
- **Intent**: which client IPs are (or were) connected.
- **Action**: `GET /api/connections`
- **Reply**: for each connection report `ip`, `status`, `message_count`,
  `session_count`, `active_sessions`, `last_seen`.

### 3. Connection detail

- **Trigger**: 魔镜魔镜告诉我，这个 IP 的连接详情
- **Intent**: the sessions belonging to one connection.
- **Action**: `GET /api/connections/{id}`
- **Reply**: the connection fields plus its session list.

### 4. List sessions

- **Trigger**: 魔镜魔镜告诉我，有哪些会话？
- **Intent**: the active/closed sessions.
- **Action**: `GET /api/sessions` (optionally `?client_id=<id>`)
- **Reply**: for each session report `ip`, `port`, `protocol`, `status`,
  `message_count`, `last_active_at`.

### 5. Query messages

- **Trigger**: 魔镜魔镜告诉我，这个会话里有哪些消息？
- **Intent**: the messages of a session (newest first).
- **Action**: `GET /api/sessions/{id}/messages?limit=100&offset=0&start=<ns>&end=<ns>`
  - `limit` / `offset`: pagination (default limit `100`).
  - `start` / `end`: nanosecond time range (optional).
- **Reply**: the `total` count and the `items` (each with `tag`, `message`,
  `data`, `time_nano`).

### 6. Settings

- **Trigger**: 魔镜魔镜告诉我，当前设置
- **Intent**: the current configuration.
- **Action**: `GET /api/settings`
- **Reply**: the key/value settings (web/data host+port, TLS paths, theme,
  dark mode, paused, leveldb/sqlite paths).

### 7. Access code samples

- **Trigger**: 魔镜魔镜告诉我，怎么用 Go（或 Python/JavaScript/Shell/C++）接入？
- **Intent**: a ready-to-copy client snippet.
- **Action**: `GET /api/code/{lang}` where `lang` ∈ `javascript|python|go|shell|c++`
- **Reply**: `app` (full example) and `fn` (reusable function).

## Response shapes

`/api/connections`:

```json
[{ "id": "", "ip": "", "first_seen": 0, "last_seen": 0, "status": "active",
   "message_count": 0, "session_count": 0, "active_sessions": 0 }]
```

`/api/sessions`:

```json
[{ "id": "", "client_id": "", "ip": "", "port": 0, "protocol": "tcp",
   "status": "active", "created_at": 0, "last_active_at": 0, "message_count": 0 }]
```

`/api/sessions/{id}/messages`:

```json
{ "total": 42,
  "items": [{ "seq": 0, "session_id": "", "time_nano": 0, "tag": [],
              "message": "", "data": {}, "received_at": 0 }] }
```

`/api/stats/overview`:

```json
{ "total_messages": 0, "qps": 0, "active_connections": 0, "active_sessions": 0,
  "total_connections": 0, "total_sessions": 0,
  "buckets": [{ "ts": 0, "count": 0 }] }
```
