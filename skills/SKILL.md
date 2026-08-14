---
name: talk-mirror
description: >
  Interact with the Talk-mirror remote debugger — query connections, sessions,
  messages, statistics and settings, or write debug log messages. Trigger
  phrases begin with "魔镜魔镜告诉我" (Magic mirror, magic mirror, tell me) for
  queries, and "魔镜魔镜，请记录" for log writing. Use whenever the user asks to
  inspect debugging data or push a log to Talk-mirror.
---

# Talk-mirror Skill

Talk-mirror is a self-contained remote debugger: clients push debug data over
TCP/UDP, and the platform stores it and shows it in a web UI. It also exposes a
REST API over HTTPS (default port `443`) for querying, plus an HTTP ingest
endpoint for writing log messages.

## Prerequisites

- **Base URL**: `https://<host>:443` (the Talk-mirror server address).
- **TLS**: the server uses a self-signed certificate by default, so the
  `https_request` tool must allow insecure connections (`verify: false`).
- **Auth**: none required by default.

## How to interact

The user speaks to the "magic mirror". Map their request to one of the modules
below and make the matching HTTP call with the `https_request` tool.

| Module  | Purpose                                                                 | File |
|---------|-------------------------------------------------------------------------|------|
| Query   | Inspect connections, sessions, messages, statistics, settings, code samples | `query/SKILL.md` |
| Logging | Write a debug log message over HTTP                                      | `logging/SKILL.md` |

Read the relevant module file for the exact endpoint, parameters and examples.

## Trigger phrase convention

- **Query** — the phrase starts with `魔镜魔镜告诉我` (Magic mirror, magic
  mirror, tell me), followed by what the user wants to know:

  > 魔镜魔镜告诉我，现在有哪些连接？
  > 魔镜魔镜告诉我，这个会话里最近有什么消息？

- **Write** — the phrase starts with `魔镜魔镜，请记录` (Magic mirror, please
  record), followed by the log content:

  > 魔镜魔镜，请记录一条日志：支付成功，订单号 12345。

## Prompt rule generation

For every capability, a rule is generated in this shape:

```
Trigger : <anthropomorphic phrase>
Intent  : <what the user wants>
Action  : <HTTP method> <path> [?query]
Body    : <request body, if any>
Reply   : <how to summarize the response>
```

Each module lists its capabilities with concrete trigger phrases and rules.
