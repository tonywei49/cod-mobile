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
- 补强双端消息可见性：手机端发出的消息要尽量让桌面端可发现，桌面端后续发出的消息也要让手机端在前台持续对齐。
- 先完成基础界面 i18n：至少覆盖设定、登录/配对、主要连接状态等界面的英文和繁体中文。
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
- `gogodex up` 启动时明确设置了 `REMODEX_RELAY`，并指向我们自己的 relay URL。
- bridge 打印出来的配对 QR 里包含我们自己的 relay URL。
- iPhone App 扫 QR 后能完成 secure pairing。
- 手机端发出的 prompt 能到达 Mac bridge，并启动 Codex turn。
- Codex 输出能流式返回到手机端。
- 关闭并重新打开 iPhone App 后，可以通过 trusted session resolve 自动重连，不需要重新扫码。
- 手机端发出的 prompt 会写入 `~/.codex/sessions` 里对应的 JSONL rollout 文件。
- Codex.app 桌面端能通过明确启用的 refresh workaround 跳到或刷新对应 thread。
- 手机端发出的 prompt 会同步写入 Codex Desktop session index，桌面端至少能在刷新/重开后看到对应 thread。
- 当手机端停留在一个已加载的会话里，桌面端后续发出的消息不需要重开手机 App，也应在前台低频刷新后对齐。
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
gogodex up
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

- `gogodex up` 在 macOS 上会写入 `~/Library/LaunchAgents/com.remodex.bridge.plist`，并通过 `launchd` 启动后台 bridge。
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
PHODEX_DEFAULT_RELAY_URL = wss:/$()/owner-relay.example.com/relay
```

这个配置应该放在 `CodexMobile/BuildSupport/PrivateOverrides.xcconfig`，不要写进公开默认配置。

注意：`.xcconfig` 里不能直接写 `wss://...`，因为 `//` 可能被 Xcode 当成注释开头。私有配置要用 `wss:/$()/...` 这种写法，Xcode 最终会展开成正常的 `wss://...`。

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

### 当前 Phase 1 实测状态模板

完成本阶段时，私有验收记录应该确认下面这些状态。真实域名、服务器 IP 和账号不要写进公开仓库：

- 自有 relay URL：`wss://your-relay.example.com/relay`
- relay 进程：服务器 `remodex-relay.service`
- relay 状态：`active` / `enabled`
- relay health：`GET https://your-relay.example.com/health` 返回 `{"ok":true}`
- WebSocket：`wss://your-relay.example.com/relay/{sessionId}` 可以正常 upgrade
- Mac bridge：macOS `launchd` 服务 `com.remodex.bridge`
- Mac bridge 状态：`installed=true`、`launchdLoaded=true`、`connectionStatus=connected`
- Mac bridge relay URL：指向自己的 relay URL
- 桌面刷新模式：`REMODEX_REFRESH_ENABLED=true`、`REMODEX_REFRESH_MODE=completion`
- 手机端消息：已确认能写入 `~/.codex/sessions` 对应 JSONL rollout 文件
- trusted reconnect：已确认 Mac bridge 重启后，iPhone 不重新扫码也能通过 `trusted_reconnect` 重新连上

已确认的限制：

- Codex.app GUI 不是实时 mirror。手机端消息能进 session 文件，也能通过本线程响应，但桌面图形界面不保证立刻显示。
- 这个限制不是 relay 问题。第一阶段不强改 Codex.app GUI 实时同步，后续要把它作为独立产品功能点评估。

后台服务重启命令：

```bash
cd phodex-bridge
node ./bin/remodex.js restart --json
```

`restart` 会沿用已经保存到 `~/.remodex/daemon-config.json` 的 relay 和 refresh 配置。第一次启用后台服务时仍然要显式设置 `REMODEX_RELAY`。

验收命令：

```bash
cd phodex-bridge
node ./bin/remodex.js status --json
```

服务器验收命令：

```bash
ssh <server-user>@<server-host> \
  'systemctl is-active remodex-relay && systemctl is-enabled remodex-relay && curl --silent --fail http://127.0.0.1:9000/health'
```

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
- 确认手机端发出的消息会写入 `~/.codex/session_index.jsonl`，桌面端能在会话索引里发现对应 thread。
- 确认同一个会话里，先连续用手机端发消息，再切到桌面端发消息，手机端在前台不用重开 App 也能低频刷新并对齐桌面端新内容。
- 把 bridge 设置成 macOS `launchd` 开机自启动。
- 如果 relay 运行在 Mac 或自有服务器上，把 relay 也设置成开机自启动。

### 已完成优化补录

这些内容已经进入当前代码分支，但之前没有完整写进 PRD。后续验收和回归测试要把它们当作 Phase 1 的实际范围。

#### 自有 Relay / Bridge 运行链路

- 已补齐自托管 relay 代码和文档入口，公开源码不内置作者私有 relay。
- bridge 支持通过 `REMODEX_RELAY` 指向自有 relay。
- bridge restart 会复用已经保存的 daemon 配置，避免每次重启都重新手动输入 relay 和 refresh 参数。
- macOS 后台服务仍然是 Phase 1 的标准运行方式，临时终端只用于调试。

验收重点：

- `remodex status --json` 能看到 daemon 使用的是自有 relay。
- `remodex restart --json` 后 relay URL 和 refresh 配置不丢失。
- 不允许出现自有 relay 不通后自动退回作者 relay 的隐藏路径。

#### 手机端到桌面端可见性优化

- bridge 已增加 Codex Desktop session index 同步：手机端发出的 `thread/start`、`turn/start` 会写入 `~/.codex/session_index.jsonl`。
- 新增索引标题使用 `手机：<首段文字>`，并保留桌面端已经手动改过的标题。
- 这个优化不改变原本 remodexd / app-server 协议，只是在 bridge 侧补齐桌面端发现 thread 所需的索引。

验收重点：

- 手机端发送新消息后，`~/.codex/session_index.jsonl` 有对应 thread 记录。
- Codex.app 桌面端刷新或重新打开后，能找到手机端创建或继续的会话。
- 不把这个能力描述成真正实时双向 mirror；它是桌面端发现能力增强。

#### 桌面端到手机端对齐优化

- 手机端同步层已增加“前台当前关闭会话低频刷新”。
- 原问题是：已加载过的关闭会话会直接跳过 `thread/read`，所以桌面端后来发的新内容，手机端只能重开 App 才对齐。
- 现在手机端在前台、连接正常、停留当前 thread 时，每 10 秒最多放行一次历史刷新，用来拉取桌面端后续写入的消息。
- 大型延迟加载会话仍保留原来的轻量路径，不把高频强制历史读取打满。

验收重点：

- 同一会话里，连续从手机端发送几次消息后，切到桌面端发送消息。
- 手机 App 不重启，保持前台停在该会话。
- 预期手机端在约 10 秒级别内刷新到桌面端新内容。
- 如果 Codex.app 本身不把内容写入 app-server 可读历史，这个优化不能伪装成成功，必须明确记录上游限制。

#### i18n 基础界面

- 已增加 App 语言模型和本地化资源。
- 已在 Settings 增加语言切换入口。
- 第一版覆盖目标是英文和繁体中文，优先覆盖设定、登录/配对、连接状态、常用按钮和错误提示。

验收重点：

- Settings 可以切换系统语言、英文、繁体中文。
- 切换后主要界面文案立即或重新进入页面后显示正确语言。
- 新增 UI 文案后必须同步补英文和繁体中文 key，不能只写死英文。

### Phase 2：写入自有默认配置

只有 Phase 1 成功后再做：

- 增加 iOS 私有默认 relay 配置。
- 可选：用 `REMODEX_PACKAGE_DEFAULT_RELAY_URL` 准备自己的 npm bridge 默认配置。
- 记录准确的自有运行命令。
- 只给改过的配置行为补测试。

#### iOS 私有默认 Relay

iOS 的公开默认配置必须继续保持为空，真实自有 relay 只写在本机忽略文件：

```text
CodexMobile/BuildSupport/PrivateOverrides.xcconfig
```

本机开发版示例：

```xcconfig
PHODEX_DEFAULT_RELAY_URL = wss:/$()/codex.gotradetalk.com/relay
```

公开仓库只保留：

- `CodexMobile/BuildSupport/Base.xcconfig`：默认空值。
- `CodexMobile/BuildSupport/PrivateOverrides.xcconfig.example`：示例文件。
- `CodexMobile/BuildSupport/CodexMobile-Info.plist`：把 build setting 注入 Info.plist。
- `AppEnvironment.swift`：从 Info.plist 读取默认 relay。

这样做的目的：

- 开源仓库不暴露我们自己的域名和部署信息。
- 私有开发包不用每次扫码都重新指定 relay。
- 如果别人 fork 这个仓库，不会误连到我们的服务。

#### Bridge 私有默认 Relay

bridge 也不能把真实 relay 写进源码默认值。

当前 fork 的 npm 包身份使用 `gogodex`，CLI 新命令也使用 `gogodex up`。为了兼容旧脚本，npm `bin` 仍保留 `remodex` alias，但新用户界面和文档默认只展示 `gogodex`。

可选的私有 npm 包构建方式：

```bash
cd phodex-bridge
REMODEX_PACKAGE_DEFAULT_RELAY_URL="wss://codex.gotradetalk.com/relay" npm pack
```

这会通过 `scripts/prepare-private-defaults.js` 在打包前生成私有默认配置，并通过 `scripts/cleanup-private-defaults.js` 在打包后清理。`src/private-defaults.json` 不能提交进公开仓库。

如果只是本机运行，优先继续使用：

```bash
REMODEX_RELAY="wss://codex.gotradetalk.com/relay" gogodex up
```

验收重点：

- 公开源码里搜索不到真实 relay 域名。
- bridge `package.json` 的包名是 `gogodex`，手机端更新指令不再提示 `npm install -g remodex@latest`，启动指令默认显示 `gogodex up`。
- 本机 iOS Debug build 能读到 `PrivateOverrides.xcconfig` 的默认 relay。
- 私有 npm 包或本机 daemon 能明确指向自有 relay。
- 没有任何作者 relay 的隐藏 fallback。

### Phase 3：商用包装

只有 relay 功能验证成功后再做：

- 改 App 名称和 bundle ID。
- 替换图标和品牌图片。
- 替换 support email、legal links、privacy policy、terms。
- 替换 RevenueCat 配置，或者先关闭第一版私有构建里的订阅门槛。
- 检查 OpenAI / Codex 相关文案，不能让用户误以为这是 OpenAI 官方产品。

#### 付费墙和内部测试包边界

当前代码的付费墙集中在：

- `CodexMobile/CodexMobile/Services/Payments/SubscriptionService.swift`
- `CodexMobile/CodexMobile/ContentView.swift`
- `CodexMobile/CodexMobile/Views/Payments/SubscriptionGateView.swift`
- `CodexMobile/CodexMobile/Views/Payments/RevenueCatPaywallView.swift`
- `CodexMobile/CodexMobile/Views/Turn/TurnViewModel.swift`

当前 `DEBUG` 构建已经默认放行 `hasAppAccess`。如果真机仍看到 `Remodex Pro Required`，大概率是安装了 Release、TestFlight 或 App Store 类型的包，不是 Xcode Debug 包。

Phase 3 不建议偷偷绕过 Release 付费墙。正确做法是二选一：

- 内部测试包：增加明确的 `PRIVATE_DEV_BUILD` 或独立 build configuration，只给自用包关闭订阅门槛。
- 商用包：替换成自己的 RevenueCat 项目、entitlement、商品、隐私政策、服务条款和品牌文案。

不能做的事：

- 不要在公开 Release 里静默绕过原作者 RevenueCat。
- 不要继续使用原作者的 RevenueCat key、entitlement 或商品。
- 不要把“开发自用绕过”和“商用发行策略”混在一起。

#### 内部测试包命名

当前内部 Debug 包和免费 TestFlight Release 包都使用 `Gogodex` 作为手机桌面显示名和主要入口品牌。Release 已切到自己的 bundle id，并通过 `PRIVATE_TESTFLIGHT_BUILD` 关闭订阅门槛，避免第一版测试包弹出原作者付费墙。

当前边界：

- Debug `APP_DISPLAY_NAME = Gogodex`。
- Release `APP_DISPLAY_NAME = Gogodex`。
- Release `PRODUCT_BUNDLE_IDENTIFIER = com.gotradetalk.gogodex`。
- Release `PRIVATE_TESTFLIGHT_BUILD = YES`，当前测试包不初始化 RevenueCat、不展示购买入口。
- 默认 relay 使用 `wss://codex.gotradetalk.com/relay`。
- iOS 入口页、侧边栏和空状态先显示 `Gogodex`。
- 图标和基础 Settings 文案已切到 `Gogodex`；完整 App Store metadata、legal links、截图、审核说明仍属于 Phase 3 发布准备。

## Phase 3A：免费 TestFlight 发布计划

目标不是直接上架 App Store，而是先产出一个可上传 App Store Connect、可给自己和少量测试者安装的 TestFlight 包。

这一步的成功标准：

- Release 包显示名统一为 `Gogodex`。
- Release bundle id 改成自有 bundle id，例如 `com.gotradetalk.gogodex`。
- Release 不再使用原作者 `com.emanueledipietro.Remodex`。
- App icon 使用自有图标，不能继续使用原 Remodex 图标。
- 权限说明、Settings、onboarding、pairing、paywall、错误提示中的主要可见文案使用 `Gogodex`。
- Legal links 指向自有公开页面或自有 GitHub 仓库中的 Privacy Policy / Terms。
- Support email 指向自有邮箱。
- 自有 relay / bridge / iPhone App 仍能完成配对、发送消息、流式返回和 trusted reconnect。
- TestFlight 包不使用原作者 RevenueCat 项目、商品或 entitlement。

### Phase 3A-1：Release 商用配置

需要修改：

- `CodexMobile/CodexMobile.xcodeproj/project.pbxproj`
- `CodexMobile/BuildSupport/CodexMobile-Info.plist`
- App icon asset catalog
- 可能的 entitlements / signing 设置

执行内容：

- Release `APP_DISPLAY_NAME` 从 `Remodex` 改成 `Gogodex`。
- Release `INFOPLIST_KEY_CFBundleDisplayName` 改成 `Gogodex`。
- Release `PRODUCT_BUNDLE_IDENTIFIER` 改成自有 bundle id。
- Debug bundle id 可以继续保留开发用 id，避免覆盖手机上已有 Debug 包。
- 确认 Release signing 使用自己的 Apple Developer Team。
- 权限文案用 `$(APP_DISPLAY_NAME)` 或明确的 `Gogodex`，不要残留 `CodexMobile` / `Remodex`。

验收：

```bash
xcodebuild build \
  -project CodexMobile/CodexMobile.xcodeproj \
  -scheme CodexMobile \
  -configuration Release \
  -destination 'generic/platform=iOS'
```

Release build 必须通过。

### Phase 3A-2：免费 TestFlight 付费策略

第一版建议先做免费 TestFlight，不要同时处理付费上线。

原因：

- RevenueCat、App Store IAP、商品审核、entitlement、退款/恢复购买和隐私披露会明显拉长周期。
- 当前核心风险是连接稳定度、同步体验、上架包装，不是收费。
- 用免费 TestFlight 可以先验证真实用户安装、配对、断线、后台恢复和长时间连接。

正确做法：

- 增加明确的 `PRIVATE_TESTFLIGHT_BUILD` 或独立 build configuration。
- 只在这个内部测试包里关闭订阅门槛。
- UI 可以显示“免费测试版”或直接隐藏 Pro 区块。
- 不要在公开 Release 里静默绕过原作者 RevenueCat。
- 不要继续使用原作者 RevenueCat key、entitlement 或商品。

如果决定直接做收费版，则本阶段必须改为：

- 建立自己的 RevenueCat project。
- 建立自己的 App Store IAP 商品。
- 配置自己的 entitlement。
- 更新 `REVENUECAT_PUBLIC_API_KEY`、`REVENUECAT_ENTITLEMENT_NAME`、`REVENUECAT_DEFAULT_OFFERING_ID`。
- 跑通购买、恢复购买、无网络、已订阅、未订阅状态。

### Phase 3A-3：Legal 和 App Store 基础材料

TestFlight 前必须具备：

- Privacy Policy。
- Terms of Use。
- Support email。
- 公开源码来源说明。
- 明确说明本 App 不是 OpenAI 官方产品。
- 明确说明需要用户自己的电脑运行 Codex CLI / bridge。
- 明确说明 relay 用于中继连接，消息内容按当前实现端到端加密。

正式 App Store 前还需要：

- App Store 名称。
- Subtitle。
- Description。
- Keywords。
- 截图。
- App Review notes。
- Export compliance / encryption 说明。
- 隐私问卷。
- 年龄分级。

### Phase 3A-4：TestFlight 上传

流程：

1. 在 Apple Developer / App Store Connect 建立自有 bundle id 和 App 记录。
2. Xcode 选择 Release scheme archive。
3. 上传 archive 到 App Store Connect。
4. 填 TestFlight 测试说明。
5. 先只邀请自己测试。
6. 第一轮通过后再邀请少量外部测试者。

TestFlight 测试说明必须写清楚：

- 需要在 Mac 上安装并启动 Gogodex bridge。
- 需要能访问自有 relay。
- 桌面 Codex UI 实时同步是 best-effort，不是当前承诺能力。
- 如果 offline，需要重新打开 App 或重新扫码的条件。

## Phase 3B：稳定度测试计划

这一步决定是否能从 TestFlight 进入正式 App Store。

当前状态（2026-05-13）：

- TestFlight build `1.5 (115)` 已安装到 iPhone。
- 用户目测确认：主界面 / onboarding、Settings i18n、简体中文补充、Gogodex 品牌替换基本正常。
- bridge 已切到自有 npm 包 `gogodex@1.5.0`，并保留 `remodex` 兼容命令。
- 当前 relay 使用 `wss://codex.gotradetalk.com/relay`。
- 腾讯轻量服务器上的 relay 服务已确认 `active / enabled`，本机健康检查正常。
- 公网 `https://codex.gotradetalk.com/health` 可访问。
- relay 服务重启后，Mac bridge 会断开并自动重连，最终状态为 `connected`。
- WebSocket relay 握手可建立；无效 role / session 会返回预期错误。
- 观察项：短压测中 `/health` 偶尔出现瞬时失败，bridge 日志也出现过 `heartbeat stalled`，但当前能自动恢复。正式上架前建议继续观察，必要时增加 uptime 监控。

必须测试：

- 新安装 App 后首次扫码配对：已通过 TestFlight 版本人工验证。
- App 重启后 trusted reconnect：已通过基础人工验证，仍需长时间观察。
- iPhone 锁屏 5 分钟后回前台：待测。
- App 切后台 5 分钟后回前台：待测。
- Mac bridge 重启：已通过。
- Mac 睡眠 / 唤醒：待测。
- relay 服务重启：已通过，bridge 可自动恢复。
- relay 服务器短暂断网后恢复：待测。
- 手机连续发送 5-10 条消息：待测。
- 桌面端发送消息后，手机端是否能在合理时间内刷新：用户已目测通过当前版本，但仍需长 session 回归。
- 图片选择和拍照附件：待测。
- 语音输入：待测。
- Git 基础操作入口：待测。
- 长 session 和旧 session：待测。
- 新建 session：待测。
- 配对码过期后的重新扫码：已遇到过过期提示，重新生成配对码可恢复；仍需按正式用例复测。

记录方式：

- 每个测试项记录 `通过 / 失败 / 不稳定 / 不适用`。
- 失败项必须记录复现步骤、日志位置和影响范围。
- 不稳定项不能写成通过。
- 如果是 Codex.app 上游限制，必须明确标成上游限制，不能用 UI 文案伪装成已支持。

退出标准：

- 配对、发送、回复、重连是稳定通过。
- bridge / relay 重启后可以恢复。
- 不存在会导致用户无法进入 App 的 Release 级阻塞。
- 付费墙策略明确，不能弹出原作者 RevenueCat 付费页。
- 主要可见 UI 不再残留 Remodex 品牌。

## Phase 3C：正式 App Store 发布计划

只有 Phase 3A 和 Phase 3B 完成后再做。

正式发布前必须确认：

- 是否收费。
- 如果收费，RevenueCat / IAP 全链路已经替换成自己的。
- 如果免费，所有 Pro / Paywall 文案已经下线或明确改成未来计划。
- App Store 文案不暗示 OpenAI 官方归属。
- 不承诺 Codex Desktop UI 实时双向同步。
- 公开说明需要用户自己的电脑运行 Codex CLI。
- relay、bridge、App 的隐私边界写清楚。

### Phase 3C-1：正式 relay 托管方案

正式上架目标是不运维 VPS，所以生产 relay 不建议继续依赖腾讯轻量服务器。

目标方案：

- 使用 Cloudflare Workers + Durable Objects。
- `RelaySession` Durable Object 负责单个 session 的 Mac / iPhone WebSocket 转发。
- `RelayRegistry` Durable Object 负责 pairing code 和 trusted reconnect 索引。
- 继续保留现有外部接口，减少 App 和 bridge 迁移成本：
  - `GET /health`
  - `GET /relay/{sessionId}` WebSocket upgrade
  - `POST /v1/pairing/code/resolve`
  - `POST /v1/trusted/session/resolve`
- 正式域名优先继续使用 `codex.gotradetalk.com`，避免 App 和 npm bridge 同时大范围改动。

当前 PoC 状态（2026-05-13）：

- 已新增 `relay-cloudflare/` 独立子项目。
- 已实现 Cloudflare Worker 入口和两个 Durable Object：
  - `RelaySession`
  - `RelayRegistry`
- 已通过本地单元测试：
  - pairing code normalization
  - mac registration normalization
  - trusted reconnect Ed25519 signature verification
- 已通过本地 Wrangler dry-run。
- 已通过本地真实 Worker relay 测试：
  - `/health`
  - Mac -> iPhone WebSocket 转发
  - iPhone -> Mac WebSocket 转发
  - `/v1/pairing/code/resolve`
- 已通过 Cloudflare API Token 部署到 `workers.dev`：
  - `https://gogodex-relay.tonywei49.workers.dev`
- 已通过线上 Cloudflare Worker smoke test：
  - `GET /health` 返回 `{"ok":true}`
  - Mac -> iPhone WebSocket 转发通过
  - iPhone -> Mac WebSocket 转发通过
  - `/v1/pairing/code/resolve` 通过
- 已在 `relay-cloudflare/wrangler.toml` 配置正式域名 route：
  - `codex.gotradetalk.com/*`

上架前必须完成：

- Mac bridge 改用 Cloudflare relay 测通。
- iPhone TestFlight 改用 Cloudflare relay 测通。
- 确认 pairing code、trusted reconnect、bridge 重启、App 重启都正常。
- 将 `codex.gotradetalk.com` 从 VPS relay 切到 Cloudflare Worker 后，立即复测 `/health`、WebSocket、pairing code 和 bridge reconnect。

正式上架不能做：

- 使用原作者 bundle id。
- 使用原作者品牌、图标或商标。
- 使用原作者 RevenueCat。
- 宣传未稳定的桌面端实时同步。
- 隐藏 relay 失败并偷偷 fallback 到第三方服务。

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
gogodex up
```

手动检查：

- QR 正常出现。
- QR 里的 relay URL 是我们自己的 URL。
- Xcode 开发版 App 能安装到真实 iPhone 并正常打开。
- iPhone 配对成功。
- 手机 prompt 能启动 Codex turn。
- 输出能流式返回手机。
- 手机 prompt 能在桌面端对应 session 文件中查到。
- 手机 prompt 能在桌面端 session index 中查到。
- Codex.app 能被 refresh workaround 自动带到或刷新对应 thread。
- 桌面端继续发送消息后，手机端保持前台不重开 App 也能刷新对齐。
- 如果 Codex 请求权限，Stop / approval UI 仍然正常。
- App 重启后无需扫码即可重连。
- 重启 Mac 后 bridge 自动恢复连接。
- 如果 relay 由我们自己运行，重启 relay 所在机器后 relay 自动恢复 `/health`。
- bridge 日志没有显示退回其他 relay。

### 当前已知测试状态

- `phodex-bridge` 相关 Node 测试已覆盖 session index 同步和 bridge 行为。
- iOS App target 的 Debug build 需要保持通过。
- iOS 测试 target 的 Swift 编译问题已修掉，`xcodebuild build-for-testing` 可以通过。
- 当前剩余问题是旧单测断言仍假设旧 RPC 顺序，例如直接期待 `turn/start` 或 `thread/read`，但现在真实流程会先出现 `thread/turns/list`、`thread/resume`、`workspace/checkpointCapture`、`workspace/checkpointCopy` 等请求。
- 这个问题不应该通过回退生产流程来隐藏。进入商用包装前，需要单独整理测试 helper，让测试显式处理新同步流程和 checkpoint 流程，再把 iOS 单测恢复为稳定回归门槛。

## 风险

### WebSocket 反代配置错误

如果反向代理没有正确转发 WebSocket upgrade，配对或实时通信会失败。这个问题应该在 proxy 层修，不要用另一个 relay fallback 掩盖。

### iOS 本地网络或可达性问题

LAN-only URL 在 iPhone 上可能不稳定，即使 Mac 自己能访问也不代表手机能访问。更可靠的测试方式是 Tailscale、Cloudflare Tunnel 或公网 WSS endpoint。

### 桌面端不同步问题

Codex.app 目前不会稳定监听外部 `codex app-server` 写入的 session 文件。手机端消息能写入 `~/.codex/sessions`，也能进入当前 Codex session 并返回手机，但这不代表桌面 UI 会立刻显示同一条手机消息。

处理方式：

- 第一阶段必须用 `REMODEX_REFRESH_ENABLED=true` 和 `REMODEX_REFRESH_MODE=completion` 启动 bridge。
- 这个刷新是 deep-link/AppleScript workaround，不是真正的实时双订阅。
- 当前桌面 UI 同步只能标记为实验性 best-effort；Phase 1 不再把“Codex Desktop UI 实时显示手机消息”作为硬退出门槛。
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

Phase 1 的退出标准调整为：真实 iPhone 通过自有 relay 能稳定配对、发送消息、收到 Codex 回复、写入本机 session 文件，并且 bridge / relay 能自启动恢复。Codex Desktop UI 实时显示手机消息只作为实验性 best-effort，不再阻塞内部测试包固化。
