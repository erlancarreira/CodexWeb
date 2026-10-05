param(
  [Parameter(Mandatory = $true)]
  [string]$NativeBinary,
  [Parameter(Mandatory = $true)]
  [string]$DesktopLauncherBinary
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $repo 'runtime\chatgpt-web'
$launcher = Join-Path $runtime 'launcher'
$nativeDir = Join-Path $launcher 'build\native'
$bootstrapDir = Join-Path $launcher 'build\bootstrap'
$bootstrapSource = Join-Path $repo 'packaging\windows'

if (!(Test-Path $NativeBinary)) { throw "CodexNative binary not found: $NativeBinary" }
if (!(Test-Path $DesktopLauncherBinary)) { throw "Codex Web desktop launcher not found: $DesktopLauncherBinary" }
if (!(Test-Path (Join-Path $bootstrapSource 'install-codex-web.ps1'))) { throw 'Windows bootstrap source is incomplete' }

Remove-Item $nativeDir, $bootstrapDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $nativeDir, $bootstrapDir | Out-Null

Copy-Item $NativeBinary (Join-Path $nativeDir 'codex-native.exe') -Force
Copy-Item (Join-Path $bootstrapSource '*.ps1') $bootstrapDir -Force
Copy-Item $DesktopLauncherBinary (Join-Path $bootstrapDir 'CodexWeb.exe') -Force
Copy-Item (Join-Path $launcher 'assets\icon.ico') (Join-Path $bootstrapDir 'icon.ico') -Force

$hash = (Get-FileHash (Join-Path $nativeDir 'codex-native.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
$metadata = [ordered]@{
  schemaVersion = 1
  nativeSha256 = $hash
  stagedAt = [DateTimeOffset]::UtcNow.ToString('o')
}
$metadata | ConvertTo-Json | Set-Content (Join-Path $nativeDir 'manifest.json') -Encoding utf8

Write-Host "Staged CodexNative SHA256=$hash"
Write-Host "Bootstrap=$bootstrapDir"
