param(
  [Parameter(Mandatory = $true)]
  [string]$NativeBinary,
  [Parameter(Mandatory = $true)]
  [string]$LauncherExecutable,
  [Parameter(Mandatory = $true)]
  [string]$DesktopLauncherBinary,
  [string]$IconPath
)

$ErrorActionPreference = 'Stop'
$managedRoot = Join-Path $env:LOCALAPPDATA 'CodexWeb'
$appRoot = Join-Path $managedRoot 'app'
$binRoot = Join-Path $managedRoot 'bin'
$assetsRoot = Join-Path $managedRoot 'assets'
$statePath = Join-Path $managedRoot 'install.json'
$coreHome = Join-Path $HOME '.codex-chatgpt-web'
$codexHome = Join-Path $coreHome 'codex-home'

if (!(Test-Path $NativeBinary)) { throw "Bundled CodexNative binary not found: $NativeBinary" }
if (!(Test-Path $LauncherExecutable)) { throw "Codex Web launcher not found: $LauncherExecutable" }
if (!(Test-Path $DesktopLauncherBinary)) { throw "Codex Web desktop launcher not found: $DesktopLauncherBinary" }

$package = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue |
  Sort-Object Version -Descending |
  Select-Object -First 1
if (-not $package) {
  Write-Error 'Official OpenAI Codex for Windows is required. Install it from the official Codex App page, then reopen Codex Web.'
  exit 20
}

$sourceRoot = Join-Path $package.InstallLocation 'app'
if (!(Test-Path $sourceRoot)) { $sourceRoot = $package.InstallLocation }
if (!(Test-Path $sourceRoot)) { throw "OpenAI Codex package location is unavailable: $($package.InstallLocation)" }

$existing = $null
if (Test-Path $statePath) {
  try { $existing = Get-Content $statePath -Raw | ConvertFrom-Json } catch {}
}
$needsDesktopRefresh = $true
if ($existing -and $existing.sourcePackage -eq $package.PackageFullName -and $existing.appExecutable -and (Test-Path ([string]$existing.appExecutable))) {
  $needsDesktopRefresh = $false
}

if ($needsDesktopRefresh) {
  $runningManaged = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($appRoot, [StringComparison]::OrdinalIgnoreCase) } |
    Select-Object -First 1
  if ($runningManaged) {
    Write-Error 'Codex Web desktop is running while an OpenAI Codex package refresh is required. Close Codex Web and reopen the launcher.'
    exit 21
  }
  New-Item -ItemType Directory -Force $appRoot | Out-Null
  & robocopy $sourceRoot $appRoot /MIR /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "Failed to stage the locally installed OpenAI Codex package (robocopy exit $LASTEXITCODE)" }
}

$appExe = @(
  (Join-Path $appRoot 'ChatGPT.exe'),
  (Join-Path $appRoot 'Codex.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $appExe) {
  $appExe = Get-ChildItem $appRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @('ChatGPT.exe','Codex.exe') } |
    Select-Object -ExpandProperty FullName -First 1
}
if (-not $appExe) { throw 'Could not locate the OpenAI Codex desktop executable in the locally staged package.' }

New-Item -ItemType Directory -Force $binRoot, $assetsRoot, $coreHome, $codexHome | Out-Null
Copy-Item $NativeBinary (Join-Path $binRoot 'codex-native.exe') -Force
$desktopLauncher = Join-Path $managedRoot 'CodexWeb.exe'
Copy-Item $DesktopLauncherBinary $desktopLauncher -Force
Copy-Item (Join-Path $PSScriptRoot 'start-codex-web.ps1') (Join-Path $managedRoot 'start-codex-web.ps1') -Force
Copy-Item (Join-Path $PSScriptRoot 'watch-codex-web-proxy.ps1') (Join-Path $managedRoot 'watch-codex-web-proxy.ps1') -Force
if ($IconPath -and (Test-Path $IconPath)) {
  Copy-Item $IconPath (Join-Path $assetsRoot 'icon.ico') -Force
}
$managedIcon = Join-Path $assetsRoot 'icon.ico'
if (!(Test-Path $managedIcon)) { $managedIcon = $appExe }

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
  if ($text -match '(?m)^openai_base_url\s*=') { $text = [regex]::Replace($text, '(?m)^openai_base_url\s*=.*$', 'openai_base_url = "http://127.0.0.1:17841/v1"', 1) }
  else { $text += [Environment]::NewLine + 'openai_base_url = "http://127.0.0.1:17841/v1"' + [Environment]::NewLine }
  [IO.File]::WriteAllText($codexConfig, $text, [Text.UTF8Encoding]::new($false))
}

$state = [ordered]@{
  schemaVersion = 1
  managedRoot = $managedRoot
  sourcePackage = $package.PackageFullName
  sourceVersion = [string]$package.Version
  appExecutable = $appExe
  launcherExecutable = (Resolve-Path $LauncherExecutable).Path
  nativeBinary = (Join-Path $binRoot 'codex-native.exe')
  desktopLauncher = $desktopLauncher
  installedAt = [DateTimeOffset]::UtcNow.ToString('o')
}
$state | ConvertTo-Json -Depth 5 | Set-Content $statePath -Encoding utf8

$protocolRoot = 'HKCU:\Software\Classes\codexweb'
$protocolCommand = Join-Path $protocolRoot 'shell\open\command'
New-Item -Path $protocolCommand -Force | Out-Null
Set-ItemProperty -Path $protocolRoot -Name '(default)' -Value 'URL:Codex Web Protocol'
New-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
$commandValue = '"' + $desktopLauncher + '" "%1"'
Set-ItemProperty -Path $protocolCommand -Name '(default)' -Value $commandValue

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$startMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Codex Web'
New-Item -ItemType Directory -Force $startMenuDir | Out-Null

function Write-Shortcut([string]$Path, [string]$Target, [string]$Arguments, [string]$WorkingDirectory, [string]$Icon) {
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $Target
  $shortcut.Arguments = $Arguments
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.IconLocation = $Icon
  $shortcut.Save()
}

Write-Shortcut (Join-Path $desktop 'Codex Web.lnk') $desktopLauncher '' $managedRoot $managedIcon
Write-Shortcut (Join-Path $startMenuDir 'Codex Web.lnk') $desktopLauncher '' $managedRoot $managedIcon
$legacyStartMenuShortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Codex Web.lnk'
Remove-Item $legacyStartMenuShortcut -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $managedRoot 'CodexWeb.vbs'), (Join-Path $managedRoot 'open-codex-web-protocol.ps1') -Force -ErrorAction SilentlyContinue
Write-Shortcut (Join-Path $startMenuDir 'Codex Web Settings.lnk') $LauncherExecutable '' (Split-Path $LauncherExecutable -Parent) $managedIcon

$state | ConvertTo-Json -Depth 5
