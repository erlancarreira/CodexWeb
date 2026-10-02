import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  adoptTrustedBrowserLoginStorageState,
  type BrowserLoginResult,
  type BrowserLoginStorageState,
} from "./browser-login";
import { getConfigDir, saveConfig, type AppConfig } from "./config";
import { findInstalledLauncherExecutable } from "./dev-chat/profile";
import {
  exportLauncherBrowserStorageState,
  inspectLauncherBrowserHost,
  inspectLauncherBrowserHostLiveness,
  readLauncherBrowserHostDescriptor,
  type LauncherBrowserHostDescriptor,
} from "./launcher-browser-host";

const DEFAULT_RECOVERY_TIMEOUT_MS = 30_000;
const RECOVERY_POLL_MS = 100;

export interface NativeSessionRecoveryDependencies {
  platform: NodeJS.Platform;
  environment: NodeJS.ProcessEnv;
  configDir(): string;
  findInstalledLauncherExecutable(): string;
  inspectLauncherBrowserHostLiveness(
    descriptorPath: string,
    options?: { expectedProfile?: "production" | "development"; timeoutMs?: number },
  ): Promise<LauncherBrowserHostDescriptor>;
  readLauncherBrowserHostDescriptor(path: string): LauncherBrowserHostDescriptor;
  inspectLauncherBrowserHost(
    descriptorPath: string,
    options?: {
      detectCapabilities?: boolean;
      expectedProfile?: "production" | "development";
      timeoutMs?: number;
    },
  ): Promise<{ solAvailable?: boolean; extraHighAvailable?: boolean; proAvailable?: boolean; url: string }>;
  exportLauncherBrowserStorageState(path: string): Promise<BrowserLoginStorageState>;
  adoptTrustedBrowserLoginStorageState(config: AppConfig, state: BrowserLoginStorageState): BrowserLoginResult;
  saveConfig(config: AppConfig): void;
  spawnLauncher(executable: string, args: string[], environment: NodeJS.ProcessEnv): ChildProcess;
  terminateOwnedLauncher(pid: number): void;
  sleep(ms: number): Promise<void>;
  removeStaleDescriptor(path: string): void;
  resetManagedBrowserProfile(storageStatePath: string): void;
}

const defaultDependencies: NativeSessionRecoveryDependencies = {
  platform: process.platform,
  environment: process.env,
  configDir: getConfigDir,
  findInstalledLauncherExecutable,
  inspectLauncherBrowserHost,
  inspectLauncherBrowserHostLiveness,
  readLauncherBrowserHostDescriptor,
  exportLauncherBrowserStorageState,
  adoptTrustedBrowserLoginStorageState,
  saveConfig,
  spawnLauncher(executable, args, environment) {
    return spawn(executable, args, {
      detached: process.platform !== "win32",
      env: environment,
      stdio: "ignore",
      windowsHide: true,
    });
  },
  terminateOwnedLauncher(pid) {
    if (!Number.isInteger(pid) || pid < 1) {
      throw new Error(`Owned Codex Web GPT launcher pid is invalid: ${String(pid)}`);
    }

    const processRunning = (): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException)?.code === "EPERM";
      }
    };

    const waitForExit = (timeoutMs = 5_000): boolean => {
      const deadline = Date.now() + timeoutMs;
      const waiter = new Int32Array(new SharedArrayBuffer(4));
      while (processRunning() && Date.now() < deadline) {
        Atomics.wait(waiter, 0, 0, 50);
      }
      return !processRunning();
    };

    if (process.platform === "win32") {
      const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || "C:\Windows";
      const taskkill = join(systemRoot, "System32", "taskkill.exe");
      const result = spawnSync(taskkill, ["/PID", String(pid), "/T", "/F"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
      });
      if (!waitForExit()) {
        const detail = result.error?.message
          || result.stderr?.trim()
          || `taskkill exited with status ${result.status ?? "unknown"}`;
        throw new Error(`Could not terminate owned Codex Web GPT launcher process tree ${pid}: ${detail}`);
      }
      return;
    }

    try {
      process.kill(-pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ESRCH") return;
      throw error;
    }
    if (!waitForExit()) {
      throw new Error(`Owned Codex Web GPT launcher process group ${pid} did not exit after SIGTERM`);
    }
  },
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  removeStaleDescriptor(path) {
    rmSync(path, { force: true });
  },
  resetManagedBrowserProfile(storageStatePath) {
    const profileDir = join(dirname(storageStatePath), "runtime-profile");
    rmSync(profileDir, { recursive: true, force: true });
  },
};

let activeRecovery: Promise<BrowserLoginResult> | undefined;

function launcherEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment = { ...source };
  // Electron executables become Node runtimes when this leaks from the parent process.
  delete environment.ELECTRON_RUN_AS_NODE;
  // The production launcher owns its own config/profile. Never inherit a native Codex home.
  delete environment.CODEX_HOME;
  return environment;
}

async function existingProductionLauncher(
  descriptorPath: string,
  dependencies: NativeSessionRecoveryDependencies,
  timeoutMs: number,
): Promise<LauncherBrowserHostDescriptor | undefined> {
  try {
    return await dependencies.inspectLauncherBrowserHostLiveness(descriptorPath, {
      expectedProfile: "production",
      timeoutMs: 2_000,
    });
  } catch {
    let descriptor: LauncherBrowserHostDescriptor;
    try {
      descriptor = dependencies.readLauncherBrowserHostDescriptor(descriptorPath);
    } catch {
      return undefined;
    }
    if (descriptor.profile !== "production") {
      throw new Error(`Launcher browser belongs to ${descriptor.profile}, but production was required`);
    }
    // A live owner may publish its descriptor before CDP is ready. Wait for that exact owner
    // instead of deleting the descriptor and racing Electron's single-instance lock.
    return waitForProductionLauncher(descriptorPath, dependencies, timeoutMs);
  }
}

async function waitForProductionLauncher(
  descriptorPath: string,
  dependencies: NativeSessionRecoveryDependencies,
  timeoutMs: number,
): Promise<LauncherBrowserHostDescriptor> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "launcher descriptor is not ready";
  while (Date.now() < deadline) {
    try {
      return await dependencies.inspectLauncherBrowserHostLiveness(descriptorPath, {
        expectedProfile: "production",
        timeoutMs: 2_000,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await dependencies.sleep(RECOVERY_POLL_MS);
  }
  throw new Error(`Codex Web GPT launcher did not become ready within ${timeoutMs}ms: ${lastError}`);
}

async function recoverOnce(
  config: AppConfig,
  dependencies: NativeSessionRecoveryDependencies,
  timeoutMs: number,
): Promise<BrowserLoginResult> {
  if (config.browserHost !== "managed-chrome" || config.browserInteractionMode !== "automatic") {
    throw new Error("Automatic ChatGPT session recovery requires managed-chrome automatic mode.");
  }

  const descriptorPath = join(dependencies.configDir(), "runtime", "launcher-browser.json");
  let ownedLauncher: ChildProcess | undefined;
  let ownsPublishedDescriptor = false;
  let descriptor = await existingProductionLauncher(descriptorPath, dependencies, timeoutMs);

  if (!descriptor) {
    // readLauncherBrowserHostDescriptor could not prove a live owner, so any leftover descriptor
    // is stale and can be removed before the new launcher publishes its replacement atomically.
    if (existsSync(descriptorPath)) dependencies.removeStaleDescriptor(descriptorPath);

    const executable = dependencies.findInstalledLauncherExecutable();
    ownedLauncher = dependencies.spawnLauncher(executable, ["--hidden"], launcherEnvironment(dependencies.environment));
    descriptor = await waitForProductionLauncher(descriptorPath, dependencies, timeoutMs);
    ownsPublishedDescriptor = descriptor.pid === ownedLauncher.pid;
  }

  try {
    const inspected = await dependencies.inspectLauncherBrowserHost(descriptorPath, {
      detectCapabilities: true,
      expectedProfile: "production",
      timeoutMs,
    });
    const state = await dependencies.exportLauncherBrowserStorageState(descriptorPath);

    config.solAvailable = inspected.solAvailable === true;
    config.extraHighAvailable = inspected.extraHighAvailable === true;
    config.proAvailable = inspected.proAvailable === true;

    const result = dependencies.adoptTrustedBrowserLoginStorageState(config, state);
    // Managed Chrome keeps a persistent profile after its first storage-state seed. Once the
    // trusted launcher refreshes cookies, that profile must be recreated or it can continue using
    // stale credentials forever despite a fresh storage-state.json.
    dependencies.resetManagedBrowserProfile(result.storageStatePath);
    dependencies.saveConfig(config);
    return {
      ...result,
      accountSurfaceUrl: inspected.url,
    };
  } finally {
    if (ownedLauncher && ownsPublishedDescriptor) {
      try {
        dependencies.terminateOwnedLauncher(descriptor.pid);
      } catch (error) {
        console.warn(
          `[chatgpt-web] automatic_session_recovery_cleanup_failed ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      // Owned launcher termination can leave its descriptor behind if the process is killed before
      // Electron's shutdown hook. It is stale by ownership definition after the tree is gone.
      try {
        dependencies.removeStaleDescriptor(descriptorPath);
      } catch {
        // Cleanup is best-effort and must not erase a successfully adopted browser session.
      }
    }
  }
}

export async function recoverNativeBrowserSession(
  config: AppConfig,
  dependencies: NativeSessionRecoveryDependencies = defaultDependencies,
  options: { timeoutMs?: number } = {},
): Promise<BrowserLoginResult> {
  if (activeRecovery) return activeRecovery;
  const recovery = recoverOnce(config, dependencies, options.timeoutMs ?? DEFAULT_RECOVERY_TIMEOUT_MS);
  activeRecovery = recovery;
  try {
    return await recovery;
  } finally {
    if (activeRecovery === recovery) activeRecovery = undefined;
  }
}
