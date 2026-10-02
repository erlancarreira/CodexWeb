# CodexNative Web

**CodexNative Web** integra modelos do ChatGPT Web ao fluxo nativo do Codex, mantendo a experiência do Codex com streaming, contexto, ferramentas locais, MCP e compactação de contexto.

O projeto executa uma bridge Responses local, usa uma sessão autenticada do ChatGPT no navegador incorporado e, no modo **Full Harness**, conecta as ferramentas do task atual por meio de um tunnel MCP.

> **Repositório oficial deste projeto:** `erlancarreira/codex-chatgpt-web`

## Recursos

- modelos do ChatGPT Web disponíveis para a conta autenticada;
- integração com o seletor de modelos do Codex;
- bridge Responses local em `127.0.0.1:17841`;
- browser incorporado com sessão persistente;
- streaming de respostas;
- compactação de contexto compatível com o fluxo do Codex;
- Full Harness com terminal, filesystem e tools via MCP;
- gerenciamento do `tunnel-client` pelo próprio launcher;
- recuperação automática do tunnel/runtime;
- acompanhamento do turno por DOM + Network/CDP;
- diagnósticos detalhados por turno;
- suporte a Browser-only, Full Harness e Zero Risk.

## Instalação rápida

### Windows

Feche qualquer instalação anterior antes de atualizar.

```powershell
irm https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.ps1 | iex
```

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.sh | sh
```

Os instaladores usam as releases publicadas em:

```text
https://github.com/erlancarreira/codex-chatgpt-web/releases
```

Se ainda não houver um artefato binário publicado para a versão desejada, use a instalação por código-fonte.

<!-- source install requires Bun 1.4.2. -->

<!-- version-sync:
  /releases/download/v6.2.0/codex-web-gpt-6.2.0-win-x64.exe
  /releases/download/v6.2.0/codex-web-gpt-6.2.0-mac-arm64.dmg
  /releases/download/v6.2.0/codex-web-gpt-6.2.0-mac-x64.dmg
  /releases/download/v6.2.0/codex-web-gpt-6.2.0-linux-x64.AppImage
-->

## Instalação por código-fonte

Requisitos:

- Git;
- Bun **1.4.2**;
- Codex instalado;
- uma conta ChatGPT válida.

```bash
git clone https://github.com/erlancarreira/codex-chatgpt-web.git
cd codex-chatgpt-web

bun install --frozen-lockfile
bun run app
```

Para validar o projeto:

```bash
bun run typecheck
bun test
bun run build
```

## Primeiro uso

Depois de instalar:

1. abra o launcher;
2. faça login no ChatGPT pelo navegador incorporado;
3. execute o teste de browser;
4. escolha o modo de operação;
5. instale os modelos do Codex pelo launcher;
6. reinicie o Codex uma vez;
7. selecione um modelo terminado em **(Web)**.

## Modos de operação

| Modo | ChatGPT Web | Ferramentas locais | Tunnel |
| --- | --- | --- | --- |
| **Browser-only** | Sim | Não | Não |
| **Full Harness** | Sim | Sim | Sim |
| **Zero Risk** | Sim, envio manual | Sim | Sim, separado |

### Browser-only

Use este modo quando quiser apenas utilizar os modelos Web dentro do Codex.

Não precisa criar tunnel nem API key de tunnel.

### Full Harness

Use este modo para permitir que o modelo trabalhe com:

- terminal;
- filesystem;
- comandos;
- patches;
- ferramentas MCP;
- recursos autorizados do task atual.

O Full Harness precisa de um tunnel configurado na conta do usuário.

## Instalação em outro computador / novo usuário

Cada pessoa deve ter a própria configuração.

**Não compartilhe**:

- login do ChatGPT;
- Tunnel ID;
- API key;
- perfil do navegador;
- arquivos de configuração;
- diretório `.codex-chatgpt-web`.

Para instalar em outro computador:

1. instalar o CodexNative Web;
2. abrir o launcher;
3. entrar na própria conta ChatGPT;
4. instalar os modelos;
5. reiniciar o Codex;
6. para Browser-only, concluir aqui;
7. para Full Harness, seguir a configuração de tunnel abaixo.

## Full Harness: configuração completa do tunnel

O usuário **não precisa baixar nem instalar manualmente o `tunnel-client`**.

Durante o setup do Full Harness, o CodexNative Web instala e valida uma versão fixada do `openai/tunnel-client` compatível com o sistema operacional.

O usuário precisa criar apenas:

1. um **OpenAI Tunnel**;
2. uma **API key comum** com permissão **Tunnels Read + Use**;
3. o conector MCP no ChatGPT.

### 1. Criar o tunnel

No launcher, abra a seção **MCP** e clique em **Open Tunnels**, ou acesse a área de Tunnels da OpenAI Platform.

Crie um novo tunnel e copie o **Tunnel ID**.

O tunnel deve pertencer à mesma conta OpenAI usada para o conector do ChatGPT.

### 2. Criar a API key

Crie uma API key normal com:

```text
Tunnels: Read + Use
```

Não é necessário usar uma Admin key.

A chave é usada para executar o tunnel e é armazenada localmente pelo launcher em storage privado. Ela não deve ser enviada para outra pessoa nem commitada no Git.

### 3. Conectar o harness

No launcher:

1. abra **MCP**;
2. cole o **Tunnel ID**;
3. cole a **API key**;
4. clique em **Connect harness**.

O launcher então:

- instala/verifica o `tunnel-client`;
- salva as credenciais localmente;
- conecta o runtime;
- inicia/supervisiona o tunnel;
- verifica o estado de health/ready.

> O botão **Connect harness** só fica disponível depois que os modelos do Codex forem instalados e validados.

### 4. Criar o conector no ChatGPT

No ChatGPT:

1. abra **Settings**;
2. habilite **Developer Mode**;
3. abra **Plugins / Connectors**;
4. crie um novo conector;
5. escolha **Tunnel**;
6. selecione o tunnel criado;
7. defina **Authentication: None**;
8. use exatamente o nome:

```text
Codex Native2
```

9. abra **Permissions**;
10. escolha **Allow all actions**.

A opção de baixo risco não é suficiente para comandos e patches usados pelo Full Harness.

### 5. Verificar

Volte ao launcher e clique em **Verify runtime**.

O estado esperado inclui:

- Responses proxy saudável;
- `tunnel-client` instalado;
- runtime key armazenada;
- tunnel saudável e ready;
- conector **Codex Native2** disponível.

Depois disso, reinicie o Codex se o launcher solicitar.

## Checklist para entregar a um amigo

Antes de considerar a instalação pronta:

- [ ] CodexNative Web instalado;
- [ ] login próprio do ChatGPT realizado;
- [ ] browser smoke test aprovado;
- [ ] modelos Web instalados no Codex;
- [ ] Codex reiniciado;
- [ ] modelo **(Web)** aparece no seletor;
- [ ] Tunnel ID próprio criado, se usar Full Harness;
- [ ] API key própria com **Tunnels Read + Use**;
- [ ] **Connect harness** concluído;
- [ ] Developer Mode habilitado no ChatGPT;
- [ ] conector **Codex Native2** criado;
- [ ] **Authentication: None**;
- [ ] **Allow all actions** habilitado;
- [ ] **Verify runtime** aprovado;
- [ ] um turno simples concluído;
- [ ] uma tool local executada no Full Harness.

## Como a comunicação funciona

```text
Codex
  |
  | Responses protocol
  v
http://127.0.0.1:17841
  |
  v
CodexNative Web runtime
  |
  +--> ChatGPT Web autenticado
  |      |
  |      +--> DOM: conteúdo e controles
  |      +--> Network/CDP: lifecycle e progresso
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
     conector "Codex Native2"
         |
         v
 terminal / filesystem / tools do task
```

A implementação combina sinais do DOM, rede/CDP e MCP. O DOM não é a única fonte usada para decidir se um turno continua ativo.

## Integração com o Codex

A configuração normal é feita pelo launcher.

A rota atual usa o provider nativo do Codex:

```toml
model_provider = "openai"
openai_base_url = "http://127.0.0.1:17841/v1"
```

Um modelo pode aparecer, por exemplo, como:

```toml
model = "chatgpt-web/gpt-5.6-sol"
model_reasoning_effort = "high"
```

Comandos úteis:

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

## Compactação de contexto

O CodexNative Web suporta compactação do contexto do Codex.

Durante uma compactação:

1. o runtime solicita um checkpoint;
2. o ChatGPT gera o resumo;
3. blocos provisórios podem ser re-renderizados pelo ChatGPT;
4. o runtime mantém a projeção final consistente;
5. somente o checkpoint final é entregue ao fluxo de compactação;
6. a tarefa continua a partir desse estado.

Isso evita reconexões causadas apenas por reescritas provisórias do renderer.

## Modelo e reasoning recomendados

Perfil validado atualmente no `~/.codex/config.toml`:

```toml
model = "chatgpt-web/gpt-5.6-sol"
model_reasoning_effort = "high"
```

No Windows, use `%USERPROFILE%\.codex\config.toml`. A configuração persistida não prova sozinha o perfil efetivamente usado: valide também os turns recentes em `~/.codex-chatgpt-web/diagnostics/browser-turns/`.

A verificação só está aprovada quando configuração e turns observados usam `chatgpt-web/gpt-5.6-sol` com reasoning effort `high`. Outro perfil em turn recente é divergência. Runtime ou diagnósticos indisponíveis tornam a verificação inconclusiva; não presuma sucesso.

## Diagnóstico

Diretório principal:

```text
~/.codex-chatgpt-web/diagnostics/browser-turns/
```

No Windows:

```text
%USERPROFILE%\.codex-chatgpt-web\diagnostics\browser-turns
```

Um turno saudável normalmente passa por:

```text
send-ready
send-accepted
response-visible
turn-completed
```

Para diagnóstico geral:

```bash
codex-chatgpt-web doctor
codex-chatgpt-web route status
codex-chatgpt-web tunnel status
```

O endpoint local de saúde é:

```text
http://127.0.0.1:17841/healthz
```

## Atualização

Use sempre o canal deste repositório:

```text
erlancarreira/codex-chatgpt-web
```

Windows:

```powershell
irm https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.ps1 | iex
```

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/erlancarreira/codex-chatgpt-web/main/scripts/install-launcher.sh | sh
```

A atualização preserva o perfil e as configurações locais conforme o mecanismo do launcher.

## Diretórios importantes

```text
~/.codex-chatgpt-web/
~/.codex-chatgpt-web/versions/
~/.codex-chatgpt-web/config.json
~/.codex-chatgpt-web/diagnostics/browser-turns/
~/.codex/config.toml
```

No Windows:

```text
%USERPROFILE%\.codex-chatgpt-web
%USERPROFILE%\.codex\config.toml
```

## Desenvolvimento

```bash
git clone https://github.com/erlancarreira/codex-chatgpt-web.git
cd codex-chatgpt-web

bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
```

Para abrir o launcher em desenvolvimento:

```bash
bun run app
```

## Segurança

- use apenas sua própria conta;
- não compartilhe API keys, Tunnel IDs ou perfis autenticados;
- mantenha o diretório local do runtime protegido;
- revise as permissões do Full Harness antes de disponibilizar ferramentas;
- o listener Responses é local;
- ações continuam sujeitas aos controles e aprovações do ambiente Codex.

O projeto não remove autenticação nem permissões de serviços externos.

## Documentação adicional

- [Guia operacional e de instalação](docs/codexnative-web.md)
- [Arquitetura](docs/architecture.md)
- [Segurança](docs/security-model.md)
- [Validação de release](docs/release-validation.md)
- [Troubleshooting](TROUBLESHOOTING.md)

## Licença

Consulte [LICENSE](LICENSE) e [LICENSES](LICENSES).
