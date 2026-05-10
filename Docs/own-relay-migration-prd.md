# 自有 Relay 改造 PRD

## 目标

先让当前 Remodex 项目接入我们自己控制的 relay 服务，并完整跑通手机端远程控制 Codex 的链路。这个阶段先不做品牌、订阅、App Store 包装等工作。

第一阶段的成功标准很明确：iPhone App 能通过我们的 relay 和 Mac bridge 配对，发送 Codex 指令，流式收到回复，断开后还能通过 trusted reconnect 恢复连接。

## 背景

Remodex 现在的架构本来就是 local-first：

- iOS App 只是手机端远程客户端。
- Mac bridge 在本机通过 `codex app-server` 运行 Codex。
- relay 负责转发 WebSocket 消息，以及处理 trusted reconnect 的 HTTP 请求。
- 安全配对完成后，relay 不应该看到解密后的 prompt、Codex 输出、git 输出或 workspace RPC 内容。

公开源码版没有内置作者的私有 relay 地址。bridge 已经支持通过 `REMODEX_RELAY` 指向自定义 relay，iOS App 也可以从配对 QR 里拿到 relay URL。所以第一阶段不应该改协议，也不应该加隐藏 fallback。

## 范围

### 第一阶段要做

- 部署或启动一个我们自己控制的 relay endpoint。
- 让 Mac bridge 通过 `REMODEX_RELAY` 指向这个 relay。
- 用 Xcode 构建一个可安装到真实 iPhone 的开发版 App。
- 验证通过这个 relay 扫 QR 配对。
- 验证通过这个 relay 进行 trusted reconnect。
- 验证手机端发出的消息能落盘到 Codex session，并能让桌面端 Codex.app 通过刷新机制看到。
- 在 Phase 1 末尾把 bridge 和 relay 的运行方式固化成开机自启动，避免 Mac 重启或终端关闭后手机端显示 offline。
- 补充最小必要文档，说明本地、隧道、VPS 三种 relay 搭建方式。
- 只有在运行链路跑通后，才考虑给 iOS 或 npm 包加我们自己的默认 relay 配置。

### 第一阶段不做

- 不改 App 品牌。
- 不改 App 名称、图标、bundle ID、App Store metadata。
- 不替换 RevenueCat，也不改付费 entitlement 逻辑。
- 不启用 APNs push notification。
- 不把 relay 协议重写到 Ably、Pusher、Supabase Realtime 这类 pub/sub 服务上。
- 不改 Codex runtime 行为。
- 不加“我们自己的 relay 失败后自动退回作者 relay”的隐藏 fallback。

## 验收标准

第一阶段只有全部满足下面条件，才算完成：

- 我们的 relay 上 `GET /health` 返回 `{"ok":true}`。
- `remodex up` 启动时明确设置了 `REMODEX_RELAY`，并指向我们自己的 relay URL。
- bridge 打印出来的配对 QR 里包含我们自己的 relay URL。
- iPhone App 扫 QR 后能完成 secure pairing。
- 手机端发出的 prompt 能到达 Mac bridge，并启动 Codex turn。
- Codex 输出能流式返回到手机端。
- 关闭并重新打开 iPhone App 后，可以通过 trusted session resolve 自动重连，不需要重新扫码。
- 手机端发出的 prompt 会写入 `~/.codex/sessions` 里对应的 JSONL rollout 文件。
- Codex.app 桌面端能通过明确启用的 refresh workaround 跳到或刷新对应 thread。
- Mac 重启后，relay 和 bridge 会自动启动；手机端不应该因为终端关闭而长期 offline。
- relay 日志不打印 live `sessionId`，也不打印明文 prompt。
- 没有任何代码路径会偷偷退回作者控制的 relay。

## 推荐架构

### 运行链路

```text
iPhone App
  |
  | wss://owner-relay.example.com/relay/{sessionId}
  v
我们自己的 Relay
  |
  | 转发加密后的应用 payload
  v
Mac Bridge
  |
  | stdin/stdout JSON-RPC
  v
codex app-server
```

### 自有 Relay

第一版直接使用项目已有的 `relay/` Node 服务，不额外重写 relay。

必须公开的路径：

- `GET /health`
- `GET/Upgrade /relay/{sessionId}`
- `POST /v1/trusted/session/resolve`
- `POST /v1/pairing/code/resolve`

以后做 push 时才需要的可选路径：

- `POST /v1/push/session/register-device`
- `POST /v1/push/session/notify-completion`

第一阶段必须保持 push 关闭。

### Bridge

第一阶段 bridge 原则上不改协议代码，但要把启动方式改成稳定的 macOS 服务方式。

直接这样运行：

```bash
REMODEX_RELAY="wss://owner-relay.example.com/relay" \
REMODEX_REFRESH_ENABLED=true \
REMODEX_REFRESH_MODE=completion \
remodex up
```

如果从当前源码目录运行：

```bash
cd phodex-bridge
npm install
REMODEX_RELAY="wss://owner-relay.example.com/relay" \
REMODEX_REFRESH_ENABLED=true \
REMODEX_REFRESH_MODE=completion \
node ./bin/remodex.js up
```

注意：

- `remodex up` 在 macOS 上会写入 `~/Library/LaunchAgents/com.remodex.bridge.plist`，并通过 `launchd` 启动后台 bridge。
- 不要把 `node ./bin/remodex.js run` 当成最终方案；它只适合临时调试，终端或 Codex 会话结束后 bridge 会停，手机端就会 offline。
- `REMODEX_REFRESH_ENABLED=true` 必须显式开启。Codex.app 目前不会自动 live-reload 外部 app-server 写入的 session，Remodex 默认关闭刷新 workaround。
- `REMODEX_REFRESH_MODE=completion` 是第一阶段默认要求：手机端消息完成后再刷新桌面，避免 `live` 模式在手机刚发送时就反复 deep link 桌面，导致桌面端输入或输出被打断。
- 如果要调试实时刷新，可以临时设 `REMODEX_REFRESH_MODE=live`，但这不是第一阶段默认生产模式。

开机自启动验收命令：

```bash
cd phodex-bridge
node ./bin/remodex.js status --json
```

预期：

- `installed` 是 `true`。
- `launchdLoaded` 是 `true`。
- `launchdPid` 有值，或 `bridgeStatus.connectionStatus` 是 `connected`。
- `daemonConfig.relayUrl` 是我们自己的 relay URL。
- `daemonConfig.refreshEnabled` 是 `true`。
- `daemonConfig.refreshMode` 是 `completion`。

### iOS App

第一阶段 iOS App 应该从 QR 里获取 relay URL。

第一阶段需要用 Xcode 构建并安装到真实 iPhone，但这个构建只用于功能验证，不做 App Store packaging。

第一阶段 Xcode 构建要求：

- 使用开发者签名安装到真实 iPhone。
- 不改 App 名称、图标和 bundle ID，除非 Xcode 签名要求必须临时换成自己的 bundle ID。
- 不改 RevenueCat、订阅、push、品牌和 App Store metadata。
- 如果必须改 bundle ID 才能真机安装，这个改动只作为开发签名配置处理，不代表开始商用 rebranding。

只有在运行链路验证成功后，才给自己的 iOS build 加默认 relay：

```xcconfig
PHODEX_DEFAULT_RELAY_URL = wss://owner-relay.example.com/relay
```

这个配置应该放在 `CodexMobile/BuildSupport/PrivateOverrides.xcconfig`，不要写进公开默认配置。

## Relay 搭建方案

### 方案 A：VPS + 反向代理

推荐用于后续商用。

在 VPS 上运行 relay：

```bash
git clone https://github.com/Emanuele-web04/remodex.git
cd remodex/relay
npm install
PORT=9000 RELAY_BIND_HOST=127.0.0.1 npm start
```

然后用 Caddy、Nginx、Traefik 或其他反向代理暴露公网 HTTPS/WSS。

公网 endpoint 示例：

```text
wss://owner-relay.example.com/relay
```

反向代理必须支持 WebSocket upgrade，并且要把 `/v1/trusted/session/resolve` 这类 HTTP 请求也转发到 relay 服务。

只有在代理可信，并且代理会正确清洗 forwarded client IP headers 时，才设置：

```bash
REMODEX_TRUST_PROXY=true
```

生产部署时，relay 必须设置成服务器开机自启动：

- Linux VPS 推荐用 `systemd` 管理 `relay/server.js`。
- PaaS 推荐使用平台自己的 always-on service。
- 如果 relay 临时跑在 Mac 上，也要单独做 `launchd` 服务，不能依赖手动开的终端。

relay 开机自启动的验收标准：

- 服务器重启后 `GET /health` 仍返回 `{"ok":true}`。
- WebSocket `/relay/{sessionId}` 仍能 upgrade。
- 手机 trusted reconnect 能在 Mac bridge 重启后重新解析到 live session。

### 方案 B：Cloudflare Tunnel

推荐用于快速验证。

本地启动 relay：

```bash
cd relay
npm install
PORT=9000 RELAY_BIND_HOST=127.0.0.1 npm start
```

用 Cloudflare Tunnel 暴露：

```bash
cloudflared tunnel --url http://127.0.0.1:9000
```

拿到生成的 HTTPS URL 后，可以用本项目启动脚本自动转换成正确的 WebSocket relay URL：

```bash
./run-local-remodex.sh --relay-url https://generated-name.trycloudflare.com
```

### 方案 C：PaaS Node Host

如果长连接稳定，也可以用 Render、Fly.io、Railway 等 Node 托管平台。

平台必须满足：

- 支持 WebSocket upgrade。
- 活跃 session 期间不会自动休眠。
- 支持稳定自定义域名和 HTTPS/WSS。
- 能把 `PORT` 暴露给 Node 进程。
- 保留 `/relay/*` 和 `/v1/*` 路径。

第一阶段不建议使用普通 pub/sub 服务替代 relay。否则就不是配置自有 relay，而是要重新设计 Remodex transport protocol。

## 实施阶段

### Phase 0：前置检查

- 确认 relay host 有 Node.js 18+。
- 在 Mac 上先确认 Codex CLI 本身能正常工作。
- 确认 iPhone 能访问选定的 relay URL。
- 保持 APNs push 关闭。

### Phase 1：自有 Relay 跑通

- 启动 relay。
- 验证 `/health`。
- 验证反向代理或 tunnel 能正确处理 WebSocket upgrade。
- 用 `REMODEX_RELAY` 启动 bridge。
- 用 Xcode 把 iOS App 构建并安装到真实 iPhone。
- iPhone 扫 QR 配对。
- 发送一条 prompt，并确认流式返回。
- 重启 App，验证 trusted reconnect。
- 在 Mac 上确认手机 prompt 已写入 `~/.codex/sessions/YYYY/MM/DD/*.jsonl`。
- 启用 `REMODEX_REFRESH_ENABLED=true` 和 `REMODEX_REFRESH_MODE=completion` 后，确认 Codex.app 能在手机端回合完成后自动刷新到对应 thread。
- 把 bridge 设置成 macOS `launchd` 开机自启动。
- 如果 relay 运行在 Mac 或自有服务器上，把 relay 也设置成开机自启动。

### Phase 2：写入自有默认配置

只有 Phase 1 成功后再做：

- 增加 iOS 私有默认 relay 配置。
- 可选：用 `REMODEX_PACKAGE_DEFAULT_RELAY_URL` 准备自己的 npm bridge 默认配置。
- 记录准确的自有运行命令。
- 只给改过的配置行为补测试。

### Phase 3：商用包装

只有 relay 功能验证成功后再做：

- 改 App 名称和 bundle ID。
- 替换图标和品牌图片。
- 替换 support email、legal links、privacy policy、terms。
- 替换 RevenueCat 配置，或者先关闭第一版私有构建里的订阅门槛。
- 检查 OpenAI / Codex 相关文案，不能让用户误以为这是 OpenAI 官方产品。

## 测试要求

### Relay 测试

运行：

```bash
cd relay
npm install
npm test
```

预期：

- relay 单元测试通过。
- 除非明确启用 push，否则测试不应该依赖 push。

### Bridge 测试

运行：

```bash
cd phodex-bridge
npm install
npm test
```

预期：

- bridge 单元测试通过。
- 现有 `REMODEX_RELAY` 行为保持兼容。

### 手动端到端测试

启动 bridge：

```bash
REMODEX_RELAY="wss://owner-relay.example.com/relay" \
REMODEX_REFRESH_ENABLED=true \
REMODEX_REFRESH_MODE=completion \
remodex up
```

手动检查：

- QR 正常出现。
- QR 里的 relay URL 是我们自己的 URL。
- Xcode 开发版 App 能安装到真实 iPhone 并正常打开。
- iPhone 配对成功。
- 手机 prompt 能启动 Codex turn。
- 输出能流式返回手机。
- 手机 prompt 能在桌面端对应 session 文件中查到。
- Codex.app 能被 refresh workaround 自动带到或刷新对应 thread。
- 如果 Codex 请求权限，Stop / approval UI 仍然正常。
- App 重启后无需扫码即可重连。
- 重启 Mac 后 bridge 自动恢复连接。
- 如果 relay 由我们自己运行，重启 relay 所在机器后 relay 自动恢复 `/health`。
- bridge 日志没有显示退回其他 relay。

## 风险

### WebSocket 反代配置错误

如果反向代理没有正确转发 WebSocket upgrade，配对或实时通信会失败。这个问题应该在 proxy 层修，不要用另一个 relay fallback 掩盖。

### iOS 本地网络或可达性问题

LAN-only URL 在 iPhone 上可能不稳定，即使 Mac 自己能访问也不代表手机能访问。更可靠的测试方式是 Tailscale、Cloudflare Tunnel 或公网 WSS endpoint。

### 桌面端不同步问题

Codex.app 目前不会自动监听外部 `codex app-server` 写入的 session 文件。手机端消息能写入 `~/.codex/sessions` 不代表桌面 UI 会立刻显示。

处理方式：

- 第一阶段必须用 `REMODEX_REFRESH_ENABLED=true` 和 `REMODEX_REFRESH_MODE=completion` 启动 bridge。
- 这个刷新是 deep-link/AppleScript workaround，不是真正的实时双订阅。
- 手机端发起消息时，不应该在 `turn/start` 或 rollout 中途频繁刷新桌面，避免桌面端后续输入收不完整。
- 如果刷新失败，要明确显示或记录错误，不要假装桌面端已经实时同步。
- 长期产品化要把“手机消息同步到桌面端 UI”作为明确功能点继续做，不能只靠用户手动重开 Codex.app。

### 进程生命周期问题

临时终端启动的 bridge 会在终端关闭、Codex 会话结束或 Mac 重启后消失，手机端会变成 offline。

处理方式：

- Phase 1 结束前必须改用 macOS `launchd` bridge 服务。
- `remodex status --json` 必须纳入验收。
- relay 如果不是云端常驻服务，也必须有自己的自启动机制。

### Push Notification 复杂度

Push 需要 APNs credentials、bundle ID 对齐、device token、用户通知权限和隐私说明。第一阶段明确不做。

### 品牌和商标风险

Apache 2.0 允许商用代码使用，但 Remodex 名称和品牌不授权给 fork 使用。OpenAI 和 Codex 相关文案也不能暗示官方归属。

### 隐藏 Fallback 风险

不能实现“自有 relay 不通就偷偷退回作者 relay”。如果自有 relay 不可用，App 或 bridge 应该明确显示真实错误。

## 待定决策

- 第一轮使用哪种 relay host：VPS、Cloudflare Tunnel，还是 PaaS。
- 使用哪个自有 relay 域名。
- Phase 2 是否需要 npm package 默认 relay，还是只做 iOS 私有默认 relay。
- 第一版商用版本是否永久关闭 push。

## Phase 1 退出门槛

在真实 iPhone 通过自有 relay 完整跑通 Phase 1 之前，不开始 rebranding、订阅改造或 push notification 工作。
