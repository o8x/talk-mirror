---
name: talk-mirror-logging
description: 通过 HTTP 向 Talk-mirror 写入一条调试日志。假设用户拥有 https_request 工具。
---

# 日志写入模块

向摄入端点 POST 一段 JSON 即可写入一条日志消息。

- **端点**：`POST https://<host>:443/api/ingest`
- **请求头**：`Content-Type: application/json`、`Authorization: Bearer <key>`
- **TLS**：`verify: false`（自签名证书）。

## 日志消息格式

```json
{
  "time_nano": 1786686829000000000,
  "tag": ["payment", "success"],
  "message": "payment succeeded",
  "data": { "order_id": "12345", "amount": 99 }
}
```

| 字段        | 类型     | 必填 | 说明 |
|-------------|----------|------|------|
| `time_nano` | int      | 否   | 纳秒时间戳；缺省使用服务器接收时间。 |
| `tag`       | string[] | 否   | 自由标签，会展示在界面中。 |
| `message`   | string   | 否   | 简短易读的消息。 |
| `data`      | object   | 否   | 任意负载；缺省为 `{}`。 |

会话会根据调用方 IP 自动派生（协议为 `http`），无需指定会话 ID。

## https_request 调用模板

```
https_request(
  method: "POST",
  url: "https://<host>:443/api/ingest",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer <key>" },
  body: JSON.stringify({
    "tag": ["..."],
    "message": "...",
    "data": { ... }          // 可选
  }),
  verify: false
)
```

成功时服务器返回 `{"ok": true}`。暂停状态下返回 `503 {"error": "system is paused"}`。

## 提示词规则

- **触发词**：魔镜魔镜，请记录一条日志：\<message\>
  - **动作**：`POST /api/ingest`，设置 `message`，并推导一个合适的 `tag`。

- **触发词**：魔镜魔镜，请记录：\<message\>，标签为 \<tag\>
  - **动作**：`POST /api/ingest`，设置 `tag: ["<tag>"]`。

- **触发词**：魔镜魔镜，请记录：\<message\>，数据为 \<json\>
  - **动作**：`POST /api/ingest`，根据 JSON 设置 `message` 与 `data`。

若用户提供了结构化数据，请放入 `data`。`message` 尽量写得有描述性。写入完成后用
简短的话确认，例如「已记录到魔镜」。

## 备选：原始 TCP/UDP 摄入

对于非 HTTP 客户端，同样的消息以「`|2字节大端长度|JSON|`」的长度前缀帧推送到数据
端口（默认 `3000`）。本模块使用 HTTP 端点，因为代理只拥有 `https_request` 工具。
