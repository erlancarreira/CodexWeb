$ErrorActionPreference = 'Continue'

$mutex = New-Object Threading.Mutex($false, 'Local\CodexWebResponsesProxyWatchdog')
if (-not $mutex.WaitOne(0)) { exit 0 }

try {
    $webHome = Join-Path $HOME '.codex-chatgpt-web'
    $configPath = Join-Path $webHome 'config.json'
    $logDir = Join-Path $webHome 'logs'
    $watchLog = Join-Path $logDir 'proxy-watchdog.log'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null

    function Write-WatchLog([string]$message) {
        Add-Content -Path $watchLog -Value ("{0:o} {1}" -f [DateTimeOffset]::Now, $message) -Encoding UTF8
    }

    function Read-Runtime {
        if (!(Test-Path $configPath)) { return $null }
        try {
            $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
            if (-not $cfg.runtimeCommand -or $cfg.runtimeCommand.Count -lt 2) { return $null }
            return $cfg
        } catch {
            Write-WatchLog ("config_error " + $_.Exception.Message)
            return $null
        }
    }

    function Test-Proxy([int]$port) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/healthz" -TimeoutSec 2
            return ($health.status -eq 'ok')
        } catch {
            return $false
        }
    }

    function Start-Proxy($cfg) {
        $runtimeExe = [string]$cfg.runtimeCommand[0]
        $runtimeCli = [string]$cfg.runtimeCommand[1]
        if (!(Test-Path $runtimeExe) -or !(Test-Path $runtimeCli)) {
            Write-WatchLog "runtime_missing exe=$runtimeExe cli=$runtimeCli"
            return
        }
        $stdout = Join-Path $logDir 'serve.out.log'
        $stderr = Join-Path $logDir 'serve.err.log'
        try {
            Start-Process -FilePath $runtimeExe -ArgumentList @($runtimeCli,'--home',$webHome,'serve') -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
            Write-WatchLog "proxy_restart_requested port=$($cfg.port)"
        } catch {
            Write-WatchLog ("proxy_restart_failed " + $_.Exception.Message)
        }
    }

    Write-WatchLog "watchdog_started pid=$PID"
    $failures = 0
    while ($true) {
        $cfg = Read-Runtime
        if ($null -eq $cfg) { Start-Sleep -Seconds 2; continue }
        $port = [int]$cfg.port
        if (Test-Proxy $port) {
            $failures = 0
            Start-Sleep -Milliseconds 750
            continue
        }
        $failures++
        if ($failures -lt 2) { Start-Sleep -Milliseconds 500; continue }
        Start-Proxy $cfg
        $recovered = $false
        for ($i = 0; $i -lt 40; $i++) {
            Start-Sleep -Milliseconds 250
            if (Test-Proxy $port) { $recovered = $true; break }
        }
        if ($recovered) { Write-WatchLog "proxy_recovered port=$port" } else { Write-WatchLog "proxy_recovery_timeout port=$port" }
        $failures = 0
        Start-Sleep -Milliseconds 750
    }
}
finally {
    try { $mutex.ReleaseMutex() } catch {}
    $mutex.Dispose()
}
