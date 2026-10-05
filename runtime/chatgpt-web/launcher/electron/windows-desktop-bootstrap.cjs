const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function startWindowsDesktopBootstrap({ app, logger }) {
  if (process.platform !== "win32" || !app.isPackaged) return null;

  const script = path.join(process.resourcesPath, "bootstrap", "install-codex-web.ps1");
  const nativeBinary = path.join(process.resourcesPath, "native", "codex-native.exe");
  const desktopLauncher = path.join(process.resourcesPath, "bootstrap", "CodexWeb.exe");
  const iconPath = path.join(process.resourcesPath, "bootstrap", "icon.ico");

  if (!fs.existsSync(script) || !fs.existsSync(nativeBinary) || !fs.existsSync(desktopLauncher)) {
    logger.warn("desktop.bootstrap_assets_missing", {
      scriptPresent: fs.existsSync(script),
      nativeBinaryPresent: fs.existsSync(nativeBinary),
      desktopLauncherPresent: fs.existsSync(desktopLauncher),
    });
    return null;
  }

  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", script,
    "-NativeBinary", nativeBinary,
    "-LauncherExecutable", process.execPath,
    "-DesktopLauncherBinary", desktopLauncher,
  ];
  if (fs.existsSync(iconPath)) args.push("-IconPath", iconPath);

  const child = spawn("powershell.exe", args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout = (stdout + chunk.toString("utf8")).slice(-8000); });
  child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString("utf8")).slice(-8000); });
  child.on("error", error => logger.error("desktop.bootstrap_spawn_failed", { message: error.message }));
  child.on("close", code => {
    const details = {
      code,
      stdout: stdout.trim().slice(-2000),
      stderr: stderr.trim().slice(-2000),
    };
    if (code === 0) logger.info("desktop.bootstrap_ready", details);
    else if (code === 20) logger.warn("desktop.official_codex_missing", details);
    else if (code === 21) logger.warn("desktop.bootstrap_refresh_deferred", details);
    else logger.error("desktop.bootstrap_failed", details);
  });

  return child;
}

module.exports = { startWindowsDesktopBootstrap };
