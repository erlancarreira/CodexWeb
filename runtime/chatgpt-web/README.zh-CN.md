# CodexNative Web

CodexNative Web 将 ChatGPT Web 模型集成到原生 Codex 工作流，并保留流式输出、上下文、MCP、本地工具和上下文压缩。本项目仅使用 Web 模式，不要求 OpenAI API key。

官方仓库：`erlancarreira/codex-chatgpt-web`

## 快速安装

Windows：

```powershell
irm https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.ps1 | iex
```

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.sh | sh
```

## 从源代码运行

需要 Bun 1.4.2。

```bash
git clone https://github.com/erlancarreira/codex-chatgpt-web.git
cd codex-chatgpt-web

bun install --frozen-lockfile
bun run app
```

验证：

```bash
bun run typecheck
bun test
bun run build
```

## 运行模式

- **Browser-only**：仅使用 ChatGPT Web，不需要 tunnel。
- **Full Harness**：通过 MCP/tunnel 使用 terminal、filesystem 和 tools。
- **Zero Risk**：手动发送 Web turn，并使用独立 tunnel。

每个用户都应使用自己的 ChatGPT 登录、Tunnel ID 和具有 **Tunnels Read + Use** 权限的 API key。不要共享浏览器配置文件、runtime 目录或密钥。

## 操作与诊断

```bash
codex-chatgpt-web route status
codex-chatgpt-web route connect
codex-chatgpt-web route disconnect

codex-chatgpt-web doctor
codex-chatgpt-web browser check

codex-chatgpt-web tunnel status
codex-chatgpt-web tunnel start
codex-chatgpt-web tunnel restart
codex-chatgpt-web tunnel stop
```

最小健康检查：

```bash
codex-chatgpt-web doctor
codex-chatgpt-web route status
codex-chatgpt-web tunnel status
```

## 更新

Windows：

```powershell
irm https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.ps1 | iex
```

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.sh | sh
```

## 开发

需要 Bun 1.4.2。

```bash
git clone https://github.com/erlancarreira/codex-chatgpt-web.git
cd codex-chatgpt-web

bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
```

启动 launcher：

```bash
bun run app
```

<!--
Version sync:
  /releases/download/v6.2.0/codex-web-gpt-6.2.0-win-x64.exe
  /releases/download/v6.2.0/codex-web-gpt-6.2.0-mac-arm64.dmg
  /releases/download/v6.2.0/codex-web-gpt-6.2.0-mac-x64.dmg
  /releases/download/v6.2.0/codex-web-gpt-6.2.0-linux-x64.AppImage
-->

## 文档

- [Installation and operations](docs/codexnative-web.md)
- [Architecture](docs/architecture.md)
- [Security](docs/security-model.md)
- [Release validation](docs/release-validation.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [License](LICENSE)
- [Third-party licenses](LICENSES)
