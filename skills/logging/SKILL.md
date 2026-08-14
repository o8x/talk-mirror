---
name: talk-mirror-logging
description: Write a debug log message to Talk-mirror over HTTP. Assume the user has an https_request tool.
---

# Logging module

Write a log message by POSTing a JSON payload to the ingest endpoint.

- **Endpoint**: `POST https://<host>:443/api/ingest`
- **Headers**: `Content-Type: application/json`
- **TLS**: `verify: false` (self-signed certificate).

## Log message format

```json
{
  "time_nano": 1786686829000000000,
  "tag": ["payment", "success"],
  "message": "payment succeeded",
  "data": { "order_id": "12345", "amount": 99 }
}
```

| Field       | Type     | Required | Meaning |
|-------------|----------|----------|---------|
| `time_nano` | int      | no       | Nanosecond timestamp; defaults to the server receive time. |
| `tag`       | string[] | no       | Free-form tags shown in the UI. |
| `message`   | string   | no       | Short human-readable message. |
| `data`      | object   | no       | Arbitrary payload; defaults to `{}`. |

The session is derived automatically from the caller IP with protocol `http`,
so no session id is needed.

## https_request call template

```
https_request(
  method: "POST",
  url: "https://<host>:443/api/ingest",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    "tag": ["..."],
    "message": "...",
    "data": { ... }          // optional
  }),
  verify: false
)
```

On success the server returns `{"ok": true}`. While paused it returns
`503 {"error": "system is paused"}`.

## Prompt rules

- **Trigger**: 魔镜魔镜，请记录一条日志：\<message\>
  - **Action**: `POST /api/ingest` with `message` set; derive a sensible `tag`.

- **Trigger**: 魔镜魔镜，请记录：\<message\>，标签为 \<tag\>
  - **Action**: `POST /api/ingest` with `tag: ["<tag>"]`.

- **Trigger**: 魔镜魔镜，请记录：\<message\>，数据为 \<json\>
  - **Action**: `POST /api/ingest` with `message` and `data` set from the JSON.

If the user provides structured values, put them in `data`. Always send a
descriptive `message`. After writing, confirm with a short reply, e.g.
「已记录到魔镜」("recorded into the mirror").

## Alternative: raw TCP/UDP ingest

For non-HTTP clients, the same message is pushed to the data port (default
`3000`) as a length-prefixed frame `|2-byte big-endian length|JSON|`. This
module uses the HTTP endpoint because the agent only has an `https_request`
tool.
