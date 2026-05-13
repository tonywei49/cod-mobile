# Gogodex TestFlight / App Store 文案草稿

> 状态：草稿，供 App Store Connect / TestFlight 填写时复制改写。
> 当前定位：第一版免费 TestFlight，不接 RevenueCat，不做 App 内购买。

## 一句话说明

Gogodex 是一个 iPhone 端的 Codex companion app，用来连接你自己的 Mac，让你在手机上查看和控制 Mac 上运行的 Codex 工作流。

Gogodex 不是 OpenAI 官方 App，也不是 Codex 的官方移动客户端。用户需要自己拥有并运行可用的 Codex 环境。

## TestFlight 测试说明

欢迎测试 Gogodex。

这个版本用于验证 iPhone 到 Mac 的真实使用链路：

- 在 Mac 上启动 Gogodex bridge / Codex runtime。
- 用 iPhone 扫描 Mac 端显示的配对二维码。
- 在 iPhone 上发送 prompt。
- Codex 实际在你的 Mac 上运行，输出会流式返回到 iPhone。
- relay 只用于帮助 iPhone 和 Mac 建立连接，不替代你的 Mac 执行 Codex。

请重点测试：

- 首次二维码配对是否顺利。
- 发送消息后，Mac 上的 Codex 是否开始执行。
- iPhone 是否能稳定看到流式回复。
- iPhone 断网、切后台、重新打开后是否能恢复连接。
- Mac bridge 或 relay 重启后，是否能重新连接。
- Git / 文件相关操作是否能正确显示权限确认和结果。
- 语音输入、图片附件等功能在你的设备上是否正常。

已知边界：

- Gogodex 不是 OpenAI 官方产品。
- Codex 执行发生在你自己的 Mac 上，不在 Gogodex 的服务器上运行。
- 当前不承诺 Codex Desktop UI 与 iPhone 实时双向同步。手机端消息可以进入当前 Codex 会话并返回结果，但桌面图形界面是否立刻显示，取决于本机 Codex Desktop / app-server 的当前行为。
- 第一版 TestFlight 免费测试，不包含订阅、内购或 RevenueCat 付费墙。
- 如果 relay 或 bridge 不可用，App 应明确显示连接失败，不应该静默切到其他第三方 relay。

## App Review Notes 草稿

Gogodex is an iOS companion app for controlling a Codex runtime running on the user's own Mac.

The app is not an official OpenAI app and is not affiliated with or endorsed by OpenAI. It requires the tester to run a paired Mac bridge / Codex runtime. The iOS app connects to that Mac through a QR-code pairing flow and an encrypted session. A relay service may be used only as a transport layer so the phone can reach the paired Mac.

Core review flow:

1. Install Gogodex from TestFlight.
2. On a Mac, start the Gogodex bridge / Codex runtime.
3. Scan the QR code shown by the Mac bridge.
4. Send a test prompt from the iPhone.
5. Confirm that the Codex task runs on the Mac and streams the response back to the iPhone.

This TestFlight build is free. It does not use RevenueCat, subscriptions, or in-app purchases.

The app may request network access, camera access for QR pairing, microphone access for voice input, and photo access for attachments. These permissions are used only for the related user-triggered features.

Important limitation for review:

The iPhone app does not promise real-time two-way mirroring with the Codex Desktop UI. The phone can send prompts to the paired Codex session and receive streamed results, but immediate visual synchronization inside the desktop Codex UI is currently best-effort and depends on the desktop/runtime behavior.

## App Store 描述草稿

Gogodex lets you control your Mac-based Codex workflow from your iPhone.

Pair your phone with your Mac, send prompts from your iPhone, and watch Codex responses stream back while the actual coding runtime stays on your computer.

Key features:

- Secure QR-code pairing with your Mac.
- Send prompts to your Mac-based Codex runtime.
- View streaming responses on iPhone.
- Continue working from your phone when you are away from the keyboard.
- Use photo attachments and voice input when available.
- Review Codex actions and permission prompts from your mobile device.
- Reconnect to a trusted Mac after pairing.

Gogodex is built for users who already use Codex on their own machine and want a mobile control surface. It does not run Codex for you in the cloud.

Requirements:

- A Mac with a working Codex setup.
- Gogodex bridge running on the Mac.
- Network access between iPhone, relay, and Mac.
- A TestFlight build of the Gogodex iOS app.

Disclosure:

Gogodex is an independent companion app. It is not made by, endorsed by, or affiliated with OpenAI. OpenAI, Codex, and related marks belong to their respective owners.

## 隐私 / 非官方声明草稿

Gogodex 的设计原则是 local-first。

- 用户的 Codex runtime 在自己的 Mac 上运行。
- iPhone 发送的 prompt 会转发到已配对的 Mac。
- relay 只做连接中继和会话路由，不负责执行 Codex。
- 配对完成后的应用层消息按当前实现通过安全会话传输。
- Gogodex 不提供云端 Codex 执行环境。
- Gogodex 不提供集中式云端聊天历史数据库。
- Gogodex 不是 OpenAI 官方 App，也不是 Codex 官方移动端。

可能涉及的数据：

- 配对信息：用于识别和重新连接受信任的 Mac。
- 网络连接信息：relay 需要处理连接和路由所需的元数据。
- prompt 和 Codex 输出：在 iPhone 与已配对 Mac 之间传输，用于完成用户请求。
- 语音输入：用户主动使用语音功能时，音频可能会被发送到配置的转写服务。
- 图片附件：用户主动选择上传时，图片会发送到已配对 Mac 的工作流。

第一版 TestFlight 免费测试，不使用 RevenueCat，不收取订阅费用，也不处理 App 内购买。

## 测试步骤

### 测试前准备

1. 在 Mac 上确认 Codex CLI / Codex runtime 可正常使用。
2. 启动 Gogodex bridge。
3. 确认 bridge 使用的是预期 relay。
4. 确认 iPhone 能访问该 relay。
5. 安装 TestFlight 版 Gogodex。

### 首次配对

1. 打开 iPhone 上的 Gogodex。
2. 允许相机权限。
3. 扫描 Mac bridge 显示的二维码。
4. 确认 App 显示已连接或进入可发送状态。
5. 如果配对失败，记录错误提示，不要用其他 relay 自动绕过。

### 基础消息

1. 在 iPhone 输入一个简单 prompt，例如“请回复一句 hello”。
2. 发送后观察 Mac 端 Codex 是否开始执行。
3. 确认 iPhone 能收到流式回复。
4. 确认完成后状态回到可继续输入。

### 长任务

1. 发送一个需要多步执行的 prompt。
2. 观察 iPhone 是否持续显示进度和输出。
3. 测试过程中切到后台，再回到 App。
4. 确认连接状态和当前任务显示没有明显错乱。

### 断线恢复

1. 发送任务后短暂关闭 iPhone 网络，再恢复。
2. 或重启 Gogodex bridge。
3. 确认 App 是否明确显示断开、重连或失败状态。
4. 如果无法恢复，应显示真实错误，不应静默成功。

### 权限和危险操作

1. 发送一个可能触发文件或 Git 操作的 prompt。
2. 确认 iPhone 端能看到需要用户确认的操作。
3. 拒绝一次，确认 Codex 不继续执行该危险操作。
4. 同意一次，确认执行结果能返回。

### 附件和语音

1. 选择一张图片作为附件发送。
2. 确认权限说明清楚，图片能进入对应任务。
3. 使用语音输入发送一句短 prompt。
4. 确认转写文本可见，用户可以检查后发送。

### 桌面 UI 同步观察

1. 从 iPhone 发起一个新任务。
2. 观察 Mac 上 Codex runtime 是否实际执行。
3. 观察 Codex Desktop UI 是否刷新或显示该会话。
4. 记录结果，但不要把桌面 UI 立即同步作为当前版本通过条件。

## 未决项

- App Store Connect 里最终使用的测试账号 / 测试 Mac 环境说明。
- relay 域名目前使用 `codex.gotradetalk.com`；基础健康检查、WebSocket 握手、bridge 重启恢复、relay 服务重启恢复已通过。观察项是公网 `/health` 偶尔瞬时失败，正式上架前建议增加 uptime 监控。
- 隐私政策与服务条款已有仓库内草稿：`Legal/PRIVACY_POLICY.md`、`Legal/TERMS_OF_USE.md`。正式上架前仍需要公开 URL。
- App 名称、主要品牌、GitHub/Open source onboarding 按钮、Settings 主要 i18n 已替换为 Gogodex。仍需最终扫一遍截图、关键词和 App Store 元数据。
- App Review 是否需要提供演示视频，说明 Mac bridge 启动和二维码配对过程。
- 正式上架前是否接入自己的 RevenueCat / IAP；当前 TestFlight 第一版明确不接。
