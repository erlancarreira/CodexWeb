# CodexNative Web — Guia de instalação e operação

Este documento descreve o fluxo operacional do **CodexNative Web**: instalação, configuração do Codex, login no ChatGPT, Full Harness, tunnel, atualização, validação e diagnóstico.

Repositório oficial:

```text
https://github.com/erlancarreira/codex-chatgpt-web
```

## 1. Componentes

Uma instalação completa pode envolver:

- launcher desktop;
- runtime local;
- bridge Responses em `127.0.0.1:17841`;
- browser incorporado autenticado no ChatGPT;
- integração do Codex;
- `tunnel-client` gerenciado pelo launcher;
- OpenAI Tunnel;
- conector ChatGPT **Codex Native2**;
- MCP broker para tools locais.

O usuário não deve copiar credenciais ou perfis de outra pessoa.

## 2. Estrutura local

Os identificadores internos atuais são mantidos estáveis para preservar compatibilidade entre atualizações.

Diretórios principais:

```text
~/.codex-chatgpt-web/
~/.codex-chatgpt-web/versions/
~/.codex-chatgpt-web/config.json
~/.codex-chatgpt-web/diagnostics/browser-turns/
~/.codex/config.toml
```

Windows:

```text
%USERPROFILE%\.codex-chatgpt-web
%USERPROFILE%\.codex\config.toml
```

Não use duas distribuições diferentes que controlem esses mesmos diretórios no mesmo usuário do sistema operacional.

## 3. Instalação

### Windows

```powershell
irm https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.ps1 | iex
```

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.sh | sh
```

O canal de release é:

```text
erlancarreira/codex-chatgpt-web
```

As variáveis de repository override existem apenas para desenvolvimento, mirrors e testes controlados. Uma instalação normal não precisa defini-las.

### Código-fonte

```bash
git clone https://github.com/erlancarreira/codex-chatgpt-web.git
cd codex-chatgpt-web

bun install --frozen-lockfile
bun run app
```

Requisito para desenvolvimento: Bun **1.4.2**.

## 4. Setup inicial

1. abra o launcher;
2. faça login no ChatGPT no browser incorporado;
3. confirme o browser smoke test;
4. escolha Browser-only ou Full Harness;
5. instale os modelos pelo launcher;
6. reinicie o Codex uma vez;
7. aguarde o catálogo de modelos ser validado;
8. escolha um modelo **(Web)** no Codex.

## 5. Browser-only

Use Browser-only quando o objetivo for apenas enviar turns para o ChatGPT Web.

Não precisa de:

- Tunnel ID;
- API key de tunnel;
- conector MCP.

O browser autenticado e a bridge local são suficientes.

## 6. Full Harness

Full Harness adiciona ferramentas locais ao fluxo.

Ele exige:

- modelos instalados no Codex;
- OpenAI Tunnel;
- API key com **Tunnels Read + Use**;
- `tunnel-client`;
- conector **Codex Native2** no ChatGPT.

### O tunnel-client é automático

Não peça para o usuário instalar o binário manualmente.

O setup do CodexNative Web instala uma versão fixada do `openai/tunnel-client`, valida integridade/versão e usa o binário gerenciado pelo runtime.

O usuário fornece somente o Tunnel ID e a API key.

## 7. Criar o OpenAI Tunnel

No launcher:

1. abra **MCP**;
2. clique em **Open Tunnels**;
3. crie um tunnel;
4. copie o **Tunnel ID**.

O tunnel precisa pertencer à conta OpenAI usada para o conector do ChatGPT.

## 8. Criar a API key

Crie uma API key comum com:

```text
Tunnels: Read + Use
```

Não use Admin key se ela não for necessária.

A chave:

- fica armazenada localmente;
- não deve ir para logs;
- não deve ser commitada;
- não deve ser compartilhada entre usuários.

## 9. Connect harness

No launcher:

1. informe o Tunnel ID;
2. informe a API key;
3. clique em **Connect harness**.

Durante esse processo o launcher prepara o runtime, instala/verifica o tunnel-client e inicia a conexão.

Se **Connect harness** estiver indisponível, primeiro conclua **Install models**, reinicie o Codex e aguarde a validação do catálogo.

## 10. Criar o conector ChatGPT

Depois que o tunnel estiver conectado:

1. abra ChatGPT **Settings**;
2. habilite **Developer Mode**;
3. abra **Plugins / Connectors**;
4. crie um conector;
5. escolha **Tunnel**;
6. selecione o tunnel correto;
7. use **Authentication: None**;
8. defina o nome exato:

```text
Codex Native2
```

9. abra **Permissions**;
10. selecione **Allow all actions**.

Depois volte ao launcher e execute **Verify runtime**.

## 11. O que o Verify runtime deve provar

A instalação Full Harness deve confirmar:

- proxy Responses saudável;
- tunnel-client instalado e íntegro;
- runtime key armazenada;
- launcher/runtime com ownership correto;
- tunnel saudável;
- tunnel ready;
- conector **Codex Native2** disponível.

## 12. Instalação para outra pessoa

Nunca envie um diretório `.codex-chatgpt-web` já configurado.

Cada usuário precisa criar sua própria instalação e suas próprias credenciais.

Checklist:

```text
[ ] instalar CodexNative Web
[ ] login próprio no ChatGPT
[ ] browser smoke OK
[ ] instalar modelos
[ ] reiniciar Codex
[ ] modelo (Web) disponível
[ ] criar Tunnel ID próprio
[ ] criar API key própria: Tunnels Read + Use
[ ] Connect harness
[ ] Developer Mode no ChatGPT
[ ] criar Codex Native2
[ ] Authentication: None
[ ] Allow all actions
[ ] Verify runtime
[ ] testar turno simples
[ ] testar uma tool local
```

Se a pessoa não precisa de tools locais, pare no Browser-only e não configure tunnel.

## 13. Integração do Codex

O launcher gerencia a rota.

A configuração usa o provider nativo:

```toml
model_provider = "openai"
openai_base_url = "http://127.0.0.1:17841/v1"
```

Exemplo de modelo:

```toml
model = "chatgpt-web/gpt-5.6-sol"
model_reasoning_effort = "high"
```

Comandos:

```bash
codex-chatgpt-web route status
codex-chatgpt-web route connect
codex-chatgpt-web route disconnect
```

## 14. Runtime e tunnel

```bash
codex-chatgpt-web doctor
codex-chatgpt-web browser check

codex-chatgpt-web tunnel status
codex-chatgpt-web tunnel start
codex-chatgpt-web tunnel restart
codex-chatgpt-web tunnel stop
```

No Windows, se o comando não estiver no PATH, use o executável da versão instalada dentro de:

```text
%USERPROFILE%\.codex-chatgpt-web\versions\
```

## 15. Comunicação do turno

```text
Codex
  |
  v
Responses bridge local
  |
  +--> browser ChatGPT
  |      +--> DOM
  |      +--> Network/CDP
  |
  +--> MCP broker
         |
         v
     tunnel-client
         |
         v
     OpenAI Tunnel
         |
         v
     Codex Native2
```

A implementação usa múltiplos sinais para o lifecycle do turno. DOM isolado não é considerado evidência suficiente para todos os estados.

## 16. Compactação

Na compactação:

1. o Codex solicita um checkpoint;
2. o runtime cria um turn de compactação;
3. o renderer pode reescrever conteúdo provisório;
4. o runtime mantém a projeção atual;
5. somente o resultado final entra no checkpoint;
6. o Codex continua com o contexto compactado.

Isso evita que re-renderizações provisórias sejam interpretadas como alteração de texto já entregue ao cliente.

### Perfil de modelo validado

O perfil operacional recomendado e validado é:

```toml
model = "chatgpt-web/gpt-5.6-sol"
model_reasoning_effort = "high"
```

A validação exige duas evidências: a configuração persistida em `~/.codex/config.toml` (Windows: `%USERPROFILE%\.codex\config.toml`) e os turns recentes em `~/.codex-chatgpt-web/diagnostics/browser-turns/`.

Aprovação exige `chatgpt-web/gpt-5.6-sol` + `high` nas duas evidências. Outro perfil em turn recente é divergência. Se runtime ou diagnósticos não puderem ser lidos, o resultado é inconclusivo, não aprovado.

## 17. Diagnósticos

```text
~/.codex-chatgpt-web/diagnostics/browser-turns/
```

Fluxo normal:

```text
send-ready
send-accepted
response-visible
turn-completed
```

Falhas ficam registradas no mesmo diretório com traceId e checkpoint.

Endpoint de saúde:

```text
http://127.0.0.1:17841/healthz
```

## 18. Atualização

Atualize sempre pelo mesmo canal:

Windows:

```powershell
irm https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.ps1 | iex
```

macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.sh | sh
```

Após alterações de runtime/bridge:

1. reinicie o launcher/runtime quando solicitado;
2. rode doctor;
3. confira route status;
4. execute um turn curto;
5. valide Full Harness;
6. quando houver mudança de compactação, valide uma compactação real.

## 19. Validação para desenvolvimento

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
```

Mudanças em browser transport, streaming, tunnel ou compactação também precisam de prova funcional real no runtime instalado.

## 20. Segurança

- credenciais pertencem a um único usuário;
- não salve API keys no Git;
- não compartilhe browser profile;
- mantenha permissões do Full Harness sob controle;
- use apenas contas e recursos que o usuário está autorizado a acessar;
- exporte apenas logs sanitizados quando precisar compartilhar diagnóstico.
