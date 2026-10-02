# CodexNative Web

CodexNative Web は ChatGPT Web モデルをネイティブ Codex ワークフローへ統合し、ストリーミング、コンテキスト、MCP、ローカルツール、コンテキスト圧縮を維持します。本プロジェクトは Web 専用で、OpenAI API key は不要です。

公式リポジトリ：`erlancarreira/codex-chatgpt-web`

## クイックインストール

Windows：

```powershell
irm https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.ps1 | iex
```

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.sh | sh
```

## ソースから実行

Bun 1.4.2 が必要です。

```bash
git clone https://github.com/erlancarreira/codex-chatgpt-web.git
cd codex-chatgpt-web

bun install --frozen-lockfile
bun run app
```

検証：

```bash
bun run typecheck
bun test
bun run build
```

## 実行モード

- **Browser-only**：ChatGPT Web のみ。tunnel は不要です。
- **Full Harness**：MCP/tunnel 経由で terminal、filesystem、tools を利用します。
- **Zero Risk**：Web turn を手動送信し、専用 tunnel を利用します。

各ユーザーは自分自身の ChatGPT ログイン、Tunnel ID、**Tunnels Read + Use** 権限の API key を使用してください。ブラウザープロファイル、runtime ディレクトリ、キーを共有しないでください。

## 操作と診断

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

最小ヘルスチェック：

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

## 開発

Bun 1.4.2 が必要です。

```bash
git clone https://github.com/erlancarreira/codex-chatgpt-web.git
cd codex-chatgpt-web

bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
```

launcher の起動：

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

## ドキュメント

- [Installation and operations](docs/codexnative-web.md)
- [Architecture](docs/architecture.md)
- [Security](docs/security-model.md)
- [Release validation](docs/release-validation.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [License](LICENSE)
- [Third-party licenses](LICENSES)
