# 本地 Remodex 启动脚本

这个文件记录当前测试阶段怎么恢复手机端 offline。

正式后台 bridge 由 macOS `launchd` 管理，不依赖这个脚本常驻。这个脚本主要用于本地调试、临时恢复和快速检查。

## 什么时候用

手机显示 offline，或者点 reconnect 没反应时，在 Mac 上运行：

```sh
cd /Users/mac/Documents/github资源/remodex
./start-remodex-dev.sh
```

脚本会先检查本机 `9000` relay 是否健康：

- 如果 relay 已经正常，只启动 bridge。
- 如果 relay 没起来，调用仓库原来的 `run-local-remodex.sh` 同时启动 relay 和 bridge。
- 如果 bridge 已经在跑，脚本只提示状态，不会再启动第二个 bridge。
- 默认打开 `REMODEX_REFRESH_ENABLED=true` 和 `REMODEX_REFRESH_MODE=completion`，让手机端回复完成后 Codex Desktop 再跳到对应 thread。
- 默认不使用 live 刷新，因为手机刚发出 `turn/start` 就刷新桌面，容易打断桌面端正在输入或正在流式输出的内容。

## 固定自己的本地 relay

当前测试阶段可以把私有 relay 写进本地私有 env：

```sh
cat .env.remodex.local
```

示例：

```sh
REMODEX_RELAY=wss://your-relay.example.com/relay
RELAY_HOSTNAME=your-relay.example.com
RELAY_PORT=9000
REMODEX_REFRESH_ENABLED=true
REMODEX_REFRESH_MODE=completion
```

这个文件已被 `.gitignore` 忽略，不会提交。

## 当前网络不稳定时

如果手机扫出来的地址不对，手动指定 Mac 的局域网 IP：

```sh
./start-remodex-dev.sh --hostname 10.251.1.83
```

如果以后换成 Tailscale、VPS 或 Cloudflare Tunnel，用完整 relay 地址：

```sh
./start-remodex-dev.sh --relay-url wss://relay.example.com/relay
```

## 看状态

```sh
./start-remodex-dev.sh --status
```

正式后台服务状态用：

```sh
cd phodex-bridge
node ./bin/remodex.js status --json
```

正式后台服务重启：

```sh
cd phodex-bridge
node ./bin/remodex.js restart --json
```

`restart` 会沿用已经保存到 `~/.remodex/daemon-config.json` 的 relay 和 refresh 配置。第一次启用后台服务时仍然要显式设置 `REMODEX_RELAY`。

## 注意

这个脚本不是开机自启。它只是在需要时手动拉起本地 relay/bridge。终端窗口要保持打开，关掉后 bridge 会停止，手机端会再次 offline。

桌面刷新是一个 workaround：Codex Desktop 目前不会真正 live-reload 外部写入的 session，所以 bridge 会通过 deep link / AppleScript 让桌面端重新打开对应 thread。如果这一步在本机失败，bridge 会打印 `refresh failed`，不会假装已经同步。

刷新模式：

- `REMODEX_REFRESH_MODE=completion`：默认模式。手机端发出的内容会在 Codex 回合完成后同步刷新到桌面，比较不容易打断桌面端。
- `REMODEX_REFRESH_MODE=live`：旧的激进模式。手机端刚开始发送、rollout 中途增长时都会刷新桌面，能更快看到变化，但更容易造成桌面端输入/输出被切走。

临时打开 live 模式：

```sh
REMODEX_REFRESH_MODE=live ./start-remodex-dev.sh --hostname 10.251.1.83
```
