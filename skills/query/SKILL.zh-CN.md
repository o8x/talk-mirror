---
name: talk-mirror-query
description: 通过 REST API 查询 Talk-mirror 调试器的连接、会话、消息、统计、设置与接入示例代码。
---

# 查询模块

所有请求均为 `GET`，目标地址 `https://<host>:443`。因自签名证书需使用 `verify: false`。
无请求体。

## 能力与提示词规则

### 1. 统计概览

- **触发词**：魔镜魔镜告诉我，最近的统计概览
- **意图**：全局消息总量、QPS、活跃连接/会话数、趋势。
- **动作**：`GET /api/stats/overview?seconds=300&bucket=5`
  - `seconds`：时间窗口（秒），默认 `300`。
  - `bucket`：趋势桶宽度（秒），默认自动。
- **回复**：总结 `total_messages`、`qps`、`active_connections`、`active_sessions`，
  以及 `buckets` 趋势的峰值。

### 2. 连接列表

- **触发词**：魔镜魔镜告诉我，现在有哪些客户端连接？
- **意图**：有哪些客户端 IP（正在或曾经）连接。
- **动作**：`GET /api/connections`
- **回复**：逐个汇报 `ip`、`status`、`message_count`、`session_count`、
  `active_sessions`、`last_seen`。

### 3. 连接详情

- **触发词**：魔镜魔镜告诉我，这个 IP 的连接详情
- **意图**：某个连接下的会话列表。
- **动作**：`GET /api/connections/{id}`
- **回复**：连接字段及其会话列表。

### 4. 会话列表

- **触发词**：魔镜魔镜告诉我，有哪些会话？
- **意图**：当前活跃/已关闭的会话。
- **动作**：`GET /api/sessions`（可选 `?client_id=<id>`）
- **回复**：逐个汇报 `ip`、`port`、`protocol`、`status`、`message_count`、
  `last_active_at`。

### 5. 消息查询

- **触发词**：魔镜魔镜告诉我，这个会话里有哪些消息？
- **意图**：某会话的消息（最新在前）。
- **动作**：`GET /api/sessions/{id}/messages?limit=100&offset=0&start=<ns>&end=<ns>`
  - `limit` / `offset`：分页（默认 `limit=100`）。
  - `start` / `end`：纳秒时间范围（可选）。
- **回复**：`total` 总数，以及 `items`（每条含 `tag`、`message`、`data`、`time_nano`）。

### 6. 设置

- **触发词**：魔镜魔镜告诉我，当前设置
- **意图**：当前配置。
- **动作**：`GET /api/settings`
- **回复**：键值设置（Web/数据地址与端口、TLS 路径、主题色、深色模式、暂停状态、
  leveldb/sqlite 路径）。

### 7. 接入示例代码

- **触发词**：魔镜魔镜告诉我，怎么用 Go（或 Python/JavaScript/Shell/C++）接入？
- **意图**：可直接复制的客户端示例。
- **动作**：`GET /api/code/{lang}`，其中 `lang` ∈ `javascript|python|go|shell|c++`
- **回复**：`app`（完整示例）与 `fn`（可复用函数）。

## 响应结构

`/api/connections`：

```json
[{ "id": "", "ip": "", "first_seen": 0, "last_seen": 0, "status": "active",
   "message_count": 0, "session_count": 0, "active_sessions": 0 }]
```

`/api/sessions`：

```json
[{ "id": "", "client_id": "", "ip": "", "port": 0, "protocol": "tcp",
   "status": "active", "created_at": 0, "last_active_at": 0, "message_count": 0 }]
```

`/api/sessions/{id}/messages`：

```json
{ "total": 42,
  "items": [{ "seq": 0, "session_id": "", "time_nano": 0, "tag": [],
              "message": "", "data": {}, "received_at": 0 }] }
```

`/api/stats/overview`：

```json
{ "total_messages": 0, "qps": 0, "active_connections": 0, "active_sessions": 0,
  "total_connections": 0, "total_sessions": 0,
  "buckets": [{ "ts": 0, "count": 0 }] }
```
