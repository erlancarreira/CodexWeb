param(
  [Parameter(Position = 0)]
  [string]$Uri
)

$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
$statePath = Join-Path $root 'install.json'
$launcher = Join-Path $root 'start-codex-web.ps1'

if ($Uri) {
  $valid = $Uri.StartsWith('codexweb://', [StringComparison]::OrdinalIgnoreCase) -or
    $Uri.StartsWith('codexnative://', [StringComparison]::OrdinalIgnoreCase)
  if (-not $valid) { exit 2 }
}

if (Test-Path $statePath) {
  $state = Get-Content $statePath -Raw | ConvertFrom-Json
  $appExe = [string]$state.appExecutable
  $desktopProfile = Join-Path $HOME '.codex-chatgpt-web\desktop-profile'
  $rootProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq $appExe -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -like "*$desktopProfile*" } |
    Select-Object -First 1
  if ($rootProcess) {
    $process = Get-Process -Id $rootProcess.ProcessId -ErrorAction SilentlyContinue
    if ($process) {
      $process.Refresh()
      if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
        Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CodexWebProtocolWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
        [CodexWebProtocolWindow]::ShowWindowAsync($process.MainWindowHandle, 9) | Out-Null
        [CodexWebProtocolWindow]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
        exit 0
      }
    }
  }
}

if (Test-Path $launcher) {
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$launcher) -WindowStyle Hidden | Out-Null
  exit 0
}
exit 3
