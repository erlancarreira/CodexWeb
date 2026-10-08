param(
  [Parameter(Position = 0)]
  [string]$Uri,
  [switch]$SkipAppLaunch
)

$ErrorActionPreference = 'Stop'

# Serialize cold starts: simultaneous shortcuts must not spawn competing app-servers.
$bootstrapMutex = New-Object System.Threading.Mutex($false, 'Local\CodexWebStartup')
$bootstrapLocked = $false
try {
  try {
    $bootstrapLocked = $bootstrapMutex.WaitOne([TimeSpan]::FromSeconds(120))
  } catch [System.Threading.AbandonedMutexException] {
    $bootstrapLocked = $true
  }
  if (-not $bootstrapLocked) { throw 'Timed out waiting for Codex Web startup.' }

$root = $PSScriptRoot
$statePath = Join-Path $root 'install.json'
if (!(Test-Path $statePath)) { throw "Codex Web install state not found: $statePath" }
$state = Get-Content $statePath -Raw | ConvertFrom-Json

$appExe = [string]$state.appExecutable
$launcherExe = [string]$state.launcherExecutable
$codexCli = Join-Path $root 'bin\codex-native.exe'
$coreHome = Join-Path $HOME '.codex-chatgpt-web'
$codexHome = Join-Path $coreHome 'codex-home'
$runtimeConfigPath = Join-Path $coreHome 'config.json'
$desktopProfile = Join-Path $coreHome 'desktop-profile'
$logDir = Join-Path $coreHome 'logs'
$proxyWatcher = Join-Path $root 'watch-codex-web-proxy.ps1'

foreach ($required in @($appExe, $codexCli)) {
  if (!(Test-Path $required)) { throw "Required Codex Web component not found: $required" }
}
New-Item -ItemType Directory -Force $codexHome, $desktopProfile, $logDir | Out-Null

# Electron must never inherit the Node compatibility switch from shells/tooling.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

if (!(Test-Path $runtimeConfigPath)) {
  if (!(Test-Path $launcherExe)) { throw "Codex Web launcher not found for first-time setup: $launcherExe" }
  Start-Process -FilePath $launcherExe | Out-Null
  throw 'Codex Web needs first-time setup. Complete ChatGPT login/setup in the Codex Web window, then reopen Codex Web.'
}

$runtimeConfig = Get-Content $runtimeConfigPath -Raw | ConvertFrom-Json
if (-not $runtimeConfig.runtimeCommand -or $runtimeConfig.runtimeCommand.Count -lt 2) {
  throw "Invalid runtimeCommand in $runtimeConfigPath"
}

$codexConfig = Join-Path $codexHome 'config.toml'
if (!(Test-Path $codexConfig)) {
  Set-Content -Path $codexConfig -Encoding utf8 -Value @(
    'model = "chatgpt-web/high"',
    'model_reasoning_effort = "high"',
    'openai_base_url = "http://127.0.0.1:17841/v1"'
  )
} else {
  $text = [IO.File]::ReadAllText($codexConfig)
  if ($text -match '(?m)^model\s*=') { $text = [regex]::Replace($text, '(?m)^model\s*=.*$', 'model = "chatgpt-web/high"', 1) }
  else { $text = 'model = "chatgpt-web/high"' + [Environment]::NewLine + $text }
  if ($text -match '(?m)^model_reasoning_effort\s*=') { $text = [regex]::Replace($text, '(?m)^model_reasoning_effort\s*=.*$', 'model_reasoning_effort = "high"', 1) }
  else { $text = 'model_reasoning_effort = "high"' + [Environment]::NewLine + $text }
  [IO.File]::WriteAllText($codexConfig, $text, [Text.UTF8Encoding]::new($false))
}


$runtimeEntry = [string]$runtimeConfig.runtimeCommand[1]
$runtimeRoot = Split-Path (Split-Path $runtimeEntry -Parent) -Parent
$webLauncher = Join-Path $runtimeRoot 'bin\codex-chatgpt-web.cmd'

$env:CODEX_CLI_PATH = $codexCli
$env:CODEX_HOME = $codexHome
$env:CODEX_CHATGPT_WEB_NATIVE = '1'
$env:CODEX_CHATGPT_WEB_LAUNCHER = $webLauncher
$env:CODEX_APP_SERVER_DEV_OPEN_APP_URL = 'codexweb://open'
$env:CODEX_SPARKLE_ENABLED = 'false'

if ([string]$runtimeConfig.browserHost -eq 'launcher') {
  if (!(Test-Path $launcherExe)) { throw "Codex Web launcher required by browserHost=launcher but not found: $launcherExe" }
  $launcherProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -eq $launcherExe } | Select-Object -First 1
  if (-not $launcherProcess) {
    Start-Process -FilePath $launcherExe -ArgumentList '--hidden' | Out-Null
  }
}

$port = [int]$runtimeConfig.port
$healthUrl = "http://127.0.0.1:$port/healthz"
$proxyReady = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.status -eq 'ok' -and $health.accepting_turns -eq $true) { $proxyReady = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 250
}
if (-not $proxyReady) {
  $runtimeExe = [string]$runtimeConfig.runtimeCommand[0]
  $runtimeCli = [string]$runtimeConfig.runtimeCommand[1]
  Start-Process -FilePath $runtimeExe -ArgumentList @($runtimeCli, '--home', $coreHome, 'serve') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'serve.out.log') -RedirectStandardError (Join-Path $logDir 'serve.err.log') | Out-Null
  for ($i = 0; $i -lt 80; $i++) {
    try {
      $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
      if ($health.status -eq 'ok' -and $health.accepting_turns -eq $true) { $proxyReady = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
}
if (-not $proxyReady) { throw "ChatGPT Web proxy did not become healthy on 127.0.0.1:$port" }

$watcherRunning = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -match '(?i)-File\s+.*watch-codex-web-proxy\.ps1(?:\s|"|$)' } |
  Select-Object -First 1
if (-not $watcherRunning -and (Test-Path $proxyWatcher)) {
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$proxyWatcher) -WindowStyle Hidden | Out-Null
}

if ([string]$runtimeConfig.mode -eq 'full') {
  if (-not $runtimeConfig.tunnel) { throw 'Codex Web full mode requires tunnel configuration.' }
  $tunnelExe = [string]$runtimeConfig.tunnel.binaryPath
  $tunnelProfileDir = [string]$runtimeConfig.tunnel.profileDir
  $tunnelProfileName = [string]$runtimeConfig.tunnel.profileName
  if (!(Test-Path $tunnelExe)) { throw "Codex Web tunnel binary not found: $tunnelExe" }
  $tunnelMutex = New-Object System.Threading.Mutex($false, 'Local\CodexWebTunnelBootstrap')
  $tunnelMutexAcquired = $false
  try {
    try {
      $tunnelMutexAcquired = $tunnelMutex.WaitOne([TimeSpan]::FromSeconds(15))
    } catch [System.Threading.AbandonedMutexException] {
      $tunnelMutexAcquired = $true
    }
    if (-not $tunnelMutexAcquired) { throw 'Timed out waiting for the Codex Web tunnel bootstrap lock.' }

    $tunnelProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ExecutablePath -eq $tunnelExe } |
      Select-Object -First 1
    if (-not $tunnelProcess) {
      Start-Process -FilePath $tunnelExe -ArgumentList @('run','--profile-dir',$tunnelProfileDir,'--profile',$tunnelProfileName) -WindowStyle Hidden | Out-Null
    }
  } finally {
    if ($tunnelMutexAcquired) { $tunnelMutex.ReleaseMutex() | Out-Null }
    $tunnelMutex.Dispose()
  }

  $tunnelAlias = if ($runtimeConfig.tunnel.alias) { [string]$runtimeConfig.tunnel.alias } else { 'codex-chatgpt-web' }
  $tunnelHealthFile = Join-Path $HOME ".local\state\tunnel-client\health\$tunnelAlias.url"
  $tunnelReady = $false
  $tunnelReadyDetail = 'health endpoint not published yet'
  for ($i = 0; $i -lt 120; $i++) {
    try {
      if (Test-Path $tunnelHealthFile) {
        $tunnelBase = (Get-Content $tunnelHealthFile -Raw).Trim().TrimEnd('/')
        if ($tunnelBase -match '^http://127\.0\.0\.1:[0-9]+$') {
          $health = Invoke-WebRequest ($tunnelBase + '/healthz') -UseBasicParsing -TimeoutSec 2
          $ready = Invoke-WebRequest ($tunnelBase + '/readyz') -UseBasicParsing -TimeoutSec 2
          $logs = Invoke-RestMethod ($tunnelBase + '/api/logs?limit=250') -TimeoutSec 2
          $mainReady = $false
          foreach ($event in @($logs.events)) {
            if ($event.message -ne 'dispatcher channels registered') { continue }
            foreach ($channel in @($event.attrs.channels)) {
              if ($channel.name -eq 'main' -and $channel.routable_now -eq $true -and $channel.supports_mcp -eq $true) {
                $mainReady = $true
                break
              }
            }
            if ($mainReady) { break }
          }
          if ($health.StatusCode -eq 200 -and $ready.StatusCode -eq 200 -and $mainReady) {
            $tunnelReady = $true
            break
          }
          $tunnelReadyDetail = "health=$($health.StatusCode) ready=$($ready.StatusCode) main_routable=$mainReady"
        }
      }
    } catch {
      $tunnelReadyDetail = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $tunnelReady) {
    throw "Codex Web tunnel did not become MCP-routable before app-server startup: $tunnelReadyDetail"
  }
}


if (-not (Get-NetTCPConnection -State Listen -LocalPort 45891 -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $codexCli -ArgumentList @('app-server','--listen','ws://127.0.0.1:45891','--analytics-default-enabled') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'appserver.out.log') -RedirectStandardError (Join-Path $logDir 'appserver.err.log') | Out-Null
  for ($i = 0; $i -lt 80; $i++) {
    if (Get-NetTCPConnection -State Listen -LocalPort 45891 -ErrorAction SilentlyContinue) { break }
    Start-Sleep -Milliseconds 250
  }
}
$nativeListener = Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort 45891 -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $nativeListener) {
  throw 'Codex app-server did not start on 127.0.0.1:45891'
}

# A different process binding the port is not proof that our backend is ready.
$listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($nativeListener.OwningProcess)" -ErrorAction SilentlyContinue
if (-not $listenerProcess -or $listenerProcess.ExecutablePath -ne $codexCli) {
  throw "Port 45891 belongs to another process; Codex Web will not start against an unknown backend."
}

# The desktop must not connect until its own app-server is listening.
if (-not $SkipAppLaunch) {
  $rootProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq $appExe -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -like "*$desktopProfile*" } |
    Select-Object -First 1
  if (-not $rootProcess) {
    Start-Process -FilePath $appExe -ArgumentList @("--user-data-dir=$desktopProfile",'--no-first-run') | Out-Null
  }
}
} finally {
  if ($bootstrapLocked) { $bootstrapMutex.ReleaseMutex() | Out-Null }
  $bootstrapMutex.Dispose()
}
