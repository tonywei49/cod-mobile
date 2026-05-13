# Gogodex Cloudflare Relay

这个目录是 Gogodex relay 的 Cloudflare Workers + Durable Objects 版本。

目标：

- 不再依赖单台 VPS、systemd、Caddy 或手动运维。
- 保持现有外部接口不变，方便 iOS App 和 `gogodex` bridge 迁移。
- 每个 relay session 由一个 `RelaySession` Durable Object 管理。
- pairing code 和 trusted reconnect 索引由一个 `RelayRegistry` Durable Object 管理。

保留的接口：

- `GET /health`
- `GET /relay/{sessionId}` with WebSocket upgrade
- `POST /v1/pairing/code/resolve`
- `POST /v1/trusted/session/resolve`

本地测试：

```bash
cd relay-cloudflare
npm install
npm test
```

本地开发：

```bash
npm run dev
```

部署：

```bash
npm run deploy
```

正式切换域名前，先用 `workers.dev` 或测试子域名跑通：

1. Mac bridge 能连接 Cloudflare relay。
2. iPhone 能扫码配对。
3. pairing code resolve 正常。
4. trusted reconnect 正常。
5. relay 重部署后用户能重新配对或自动恢复到预期状态。
