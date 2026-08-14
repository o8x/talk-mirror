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
  一个自包含的<strong>远程调试器</strong>：通过 TCP/UDP 摄取调试数据，归档到 LevelDB，
  并以实时 Web 界面展示 —— 全部打包进一个单一二进制。
</p>

---

## 功能特性

- **单一二进制** —— React/MUI 前端通过 `embed.FS` 打包进 Go 二进制。
- **原始 TCP & UDP 摄取**，数据端口可配置（默认 `3000`）。
- **自动拆帧** —— `|2字节大端长度|JSON|` 帧格式，自动解决粘包。
- **客户端 / 会话模型** —— IP 是*客户端*，`IP+端口+协议` 是*会话*，各自拥有稳定的唯一 ID。
- **高吞吐存储** —— 原始消息先在内存缓冲，每 10000 条或 30 秒批量写入 **LevelDB**。
- **元数据存 SQLite** —— 客户端、会话与设置（纯 Go 驱动，无 cgo）。
- **实时 WebSocket** 推送消息、会话、连接与统计到浏览器。
- **自动 TLS** —— 未配置证书时自动生成 3 年有效期的自签名证书。
- **类 Kibana 的会话视图** —— 实时趋势图、框选时间段筛选、可展开的 JSON 行、前端分页。
- **接入示例** —— 可直接运行的纯标准库客户端（JavaScript、Python、Go、Shell、C++）。
- **暂停系统** —— 从界面即可暂停，无需停止进程。
- **HTTP 摄入** —— 通过 `POST /api/ingest` 写入日志，AI 代理（仅需 HTTP 工具）也能推送日志；
  详见 [skills](skills) 目录。

## 快速开始

```bash
make build
./talk-mirror
```

然后打开 `https://127.0.0.1:443`（首次访问需信任自签名证书）。

| 端点 | 默认值 |
|------|--------|
| Web 界面 + WebSocket + API | `https://0.0.0.0:443` |
| 数据摄取（TCP + UDP） | `0.0.0.0:3000` |

## 命令行

```bash
./talk-mirror [flags]
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-d` | *(平台相关，见下)* | SQLite、LevelDB、证书与日志的数据目录（自动创建）。 |
| `-w` | *(数据目录)* | 日志文件路径；默认 `<data-dir>/talk-mirror.log`。 |

默认数据目录在打包时内置：

| 构建方式 | 默认数据目录 |
|----------|--------------|
| 便携二进制 | `./data`（相对于工作目录） |
| Linux 软件包 | `/var/lib/talk-mirror` |
| macOS 软件包 | `/usr/local/var/talk-mirror` |
| Windows 安装包 | `%ProgramData%\Talk-mirror` |

## 安装（软件包）

每个 GitHub Release 除便携二进制外，还提供各平台原生安装包。

### Linux

| 格式 | 安装 | 管理 |
|------|------|------|
| `.deb` | `sudo apt install ./talk-mirror-v<version>_linux-amd64.deb` | `systemctl status talk-mirror` |
| `.rpm` | `sudo dnf install ./talk-mirror-v<version>_linux-amd64.rpm` | `systemctl status talk-mirror` |
| `.run` | `sudo bash talk-mirror-v<version>_linux-amd64.run` | `systemctl status talk-mirror` |

服务以专用系统用户 `talk-mirror` 运行，并授予 `CAP_NET_BIND_SERVICE`（以便绑定 443 端口），
数据存放在 `/var/lib/talk-mirror`。

### macOS

```bash
sudo installer -pkg talk-mirror-v<version>_macos-arm64.pkg -target /
```

安装 `/usr/local/bin/talk-mirror` 以及一个开机自启的 LaunchDaemon
（`com.talk-mirror`）。可用 `launchctl`（或注册后的 `brew services`）管理：

```bash
launchctl list com.talk-mirror
sudo launchctl bootout system/com.talk-mirror
sudo launchctl bootstrap system /Library/LaunchDaemons/com.talk-mirror.plist
```

### Windows

运行 `talk-mirror-v<version>_windows-amd64.exe`。安装程序会将二进制注册为 Windows 服务
`TalkMirror`（开机自启），数据存放在 `%ProgramData%\Talk-mirror`。管理命令：

```powershell
sc.exe query TalkMirror
sc.exe stop TalkMirror
sc.exe start TalkMirror
```

## 数据格式

客户端通过 TCP 或 UDP 推送 JSON 对象。

**TCP** 使用长度前缀帧：

```
| 2 字节大端 uint16 长度 | JSON 字节 |
```

**UDP** 数据报自带边界 —— 每个数据报即一个 JSON 对象（也兼容带长度前缀的情况）。

JSON 负载：

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

| 字段 | 类型 | 说明 |
|------|------|------|
| `time_nano` | int | 纳秒时间戳（缺省为接收时间）。 |
| `tag` | string[] | 可选标签，展示在界面中。 |
| `message` | string | 简短易读的消息。 |
| `data` | object | 任意用户负载。 |
| `protocol` | string | 可选 `"tcp"` / `"udp"` 覆盖；缺省按所用传输层决定。 |

会话键为 `IP + 端口 + 协议`，因此来自同一来源的 TCP 与 UDP 流会被独立追踪。

## 客户端示例（Go，仅标准库）

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

更多示例（JavaScript、Python、Shell、C++）见界面的 **接入（Access）** 页面。

## 配置

可在 **设置（Settings）** 页面修改并持久化到 SQLite：

- Web 地址 / 端口（默认 `0.0.0.0:443`）
- 数据地址 / 端口（默认 `0.0.0.0:3000`）
- TLS 证书 / 密钥路径（为空时自动生成）
- 主题色与深色模式（深色 = 中绿，浅色 = 中红）
- 暂停 / 恢复系统

LevelDB 目录与 SQLite 文件位置为只读展示（位于 `-d` 目录下）。

## 项目结构

```
.
├── main.go                 # 入口、装配与优雅关闭
├── embed.go                # 将前端打包进二进制
├── Makefile
├── internal/
│   ├── api/                # REST 处理器 + 接入示例
│   ├── config/             # 参数与默认值
│   ├── hub/                # WebSocket 中枢
│   ├── ingest/             # TCP/UDP 服务器与帧解析
│   ├── logger/             # slog 配置（控制台 + 文件）
│   ├── model/              # 共享实体
│   ├── server/             # TLS HTTP 服务器 + SPA 托管
│   ├── service/            # 操作系统服务集成（Windows SCM）
│   ├── session/            # 客户端/会话注册表
│   ├── state/              # 暂停开关
│   ├── store/
│   │   ├── buffer/         # 内存缓冲 -> LevelDB 落盘
│   │   ├── leveldb/        # 消息归档
│   │   └── sqlite/         # 元数据与设置
│   └── tlsutil/            # 自签名证书生成
├── packaging/
│   ├── linux/              # systemd 单元 + nfpm（deb/rpm）+ .run 构建器
│   ├── macos/              # launchd plist + pkgbuilder 脚本
│   └── windows/            # NSIS 安装脚本
├── skills/                 # 双语 AI 代理技能（查询 + 日志写入）
└── views/                  # React + MUI + ECharts 前端（pnpm）
```

## 开发

```bash
# 后端
go test ./...

# 前端（热重载）
cd views && pnpm install && pnpm dev

# 完整构建
make build
```

## 参与贡献

欢迎贡献！开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，社区规范见
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)，漏洞上报方式见 [SECURITY.md](SECURITY.md)。

## AI 技能

[skills](skills) 目录包含双语（English / 中文）`SKILL.md` 文件，用于教会一个配备了
`https_request` 工具的 AI 代理如何查询与写入日志。触发词使用「魔镜魔镜告诉我」
（Magic mirror, magic mirror, tell me）人格。

## 许可证

[MIT](LICENSE)
