import {
  adoptTrustedBrowserLoginStorageState,
  browserLoginStateExists,
  type BrowserLoginResult,
  type BrowserLoginStorageState,
} from "./browser-login";
import { saveConfig, type AppConfig } from "./config";
import { exportLauncherBrowserStorageState } from "./launcher-browser-host";
import { connectTunnel, tunnelStatus, waitForTunnelReady, type TunnelRuntimeStatus } from "./tunnel";

export interface NativeRuntimeDependencies {
  browserLoginStateExists(config: AppConfig): boolean;
  exportLauncherBrowserStorageState(path: string): Promise<BrowserLoginStorageState>;
  adoptTrustedBrowserLoginStorageState(
    config: AppConfig,
    storageState: BrowserLoginStorageState,
  ): BrowserLoginResult;
  saveConfig(config: AppConfig): void;
  platform: NodeJS.Platform;
  tunnelStatus(config: AppConfig): TunnelRuntimeStatus;
  connectTunnel(config: AppConfig): void;
  waitForTunnelReady(config: AppConfig): Promise<TunnelRuntimeStatus>;
}

const defaultDependencies: NativeRuntimeDependencies = {
  browserLoginStateExists,
  exportLauncherBrowserStorageState,
  adoptTrustedBrowserLoginStorageState,
  saveConfig,
  platform: process.platform,
  tunnelStatus,
  connectTunnel,
  waitForTunnelReady,
};

async function ensureNativeFullTunnel(
  config: AppConfig,
  dependencies: NativeRuntimeDependencies,
): Promise<void> {
  if (config.mode !== "full" || dependencies.platform !== "win32") return;
  if (dependencies.tunnelStatus(config).ok) return;
  dependencies.connectTunnel(config);
  const status = await dependencies.waitForTunnelReady(config);
  if (!status.ok) {
    throw new Error(`Native Codex tunnel did not become ready: ${status.detail}`);
  }
}

export async function prepareNativeRuntime(
  config: AppConfig,
  dependencies: NativeRuntimeDependencies = defaultDependencies,
): Promise<AppConfig> {
  if (config.browserInteractionMode !== "automatic") {
    throw new Error("Native Codex runtime currently requires automatic browser interaction.");
  }

  if (config.browserHost === "managed-chrome") {
    if (!dependencies.browserLoginStateExists(config)) {
      throw new Error(
        "Native Codex runtime requires a stored ChatGPT browser session. Run codex-chatgpt-web login once.",
      );
    }
    await ensureNativeFullTunnel(config, dependencies);
    return config;
  }

  const descriptorPath = config.browserHostDescriptorPath;
  if (!descriptorPath) {
    throw new Error("Launcher browser descriptor is missing; cannot migrate its ChatGPT session.");
  }

  const storageState = await dependencies.exportLauncherBrowserStorageState(descriptorPath);

  const migrated = structuredClone(config);
  migrated.browserHost = "managed-chrome";
  delete migrated.browserHostDescriptorPath;

  const login = dependencies.adoptTrustedBrowserLoginStorageState(migrated, storageState);
  migrated.solAvailable = login.solAvailable;
  migrated.extraHighAvailable = login.extraHighAvailable;
  migrated.proAvailable = login.proAvailable;
  dependencies.saveConfig(migrated);
  await ensureNativeFullTunnel(migrated, dependencies);
  return migrated;
}
