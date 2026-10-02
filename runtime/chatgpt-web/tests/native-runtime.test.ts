import { describe, expect, test } from "bun:test";
import { defaultConfig, type AppConfig } from "../src/config";
import {
  prepareNativeRuntime,
  type NativeRuntimeDependencies,
} from "../src/native-runtime";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...defaultConfig("full"),
    browserInteractionMode: "automatic",
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<NativeRuntimeDependencies> = {},
): NativeRuntimeDependencies {
  return {
    browserLoginStateExists: () => true,
    exportLauncherBrowserStorageState: async () => {
      throw new Error("unexpected launcher storage export");
    },
    adoptTrustedBrowserLoginStorageState: migrated => ({
      storageStatePath: migrated.storageStatePath,
      accountSurfaceUrl: "https://chatgpt.com/",
      solAvailable: true,
      extraHighAvailable: true,
      proAvailable: true,
    }),
    saveConfig: () => {},
    platform: "linux",
    tunnelStatus: () => ({ ok: true, processRunning: true, healthy: true, ready: true, state: "ready", detail: "ready" }),
    connectTunnel: () => {},
    waitForTunnelReady: async () => ({ ok: true, processRunning: true, healthy: true, ready: true, state: "ready", detail: "ready" }),
    ...overrides,
  };
}

describe("native Codex runtime preparation", () => {
  test("reuses an already migrated managed Chrome session", async () => {
    const original = config({ browserHost: "managed-chrome" });
    const prepared = await prepareNativeRuntime(original, dependencies());

    expect(prepared).toBe(original);
  });


  test("reconnects the full-mode tunnel on Windows before releasing the native runtime", async () => {
    const original = config({ browserHost: "managed-chrome" });
    let connected = 0;
    let waited = 0;
    const deps = dependencies({
      platform: "win32",
      tunnelStatus: () => ({ ok: false, processRunning: false, healthy: false, ready: false, state: "stopped", detail: "stopped" }),
      connectTunnel: () => { connected += 1; },
      waitForTunnelReady: async () => {
        waited += 1;
        return { ok: true, processRunning: true, healthy: true, ready: true, state: "ready", detail: "ready" };
      },
    });

    await expect(prepareNativeRuntime(original, deps)).resolves.toBe(original);
    expect(connected).toBe(1);
    expect(waited).toBe(1);
  });

  test("does not reconnect an already-ready Windows tunnel", async () => {
    const original = config({ browserHost: "managed-chrome" });
    let connected = 0;
    const deps = dependencies({
      platform: "win32",
      connectTunnel: () => { connected += 1; },
    });

    await expect(prepareNativeRuntime(original, deps)).resolves.toBe(original);
    expect(connected).toBe(0);
  });

  test("does not require a tunnel for browser-only native runtime", async () => {
    const original = config({ mode: "browser-only", browserHost: "managed-chrome" });
    let connected = 0;
    const deps = dependencies({
      platform: "win32",
      tunnelStatus: () => ({ ok: false, processRunning: false, healthy: false, ready: false, state: "stopped", detail: "stopped" }),
      connectTunnel: () => { connected += 1; },
    });

    await expect(prepareNativeRuntime(original, deps)).resolves.toBe(original);
    expect(connected).toBe(0);
  });

  test("fails closed when the managed Chrome session is missing", async () => {
    const original = config({ browserHost: "managed-chrome" });
    const deps = dependencies({ browserLoginStateExists: () => false });

    await expect(prepareNativeRuntime(original, deps)).rejects.toThrow(
      "requires a stored ChatGPT browser session",
    );
  });

  test("migrates a launcher-owned session and persists managed Chrome capabilities", async () => {
    const original = config({
      browserHost: "launcher",
      browserHostDescriptorPath: "C:\\runtime\\launcher-browser.json",
      solAvailable: false,
      extraHighAvailable: false,
      proAvailable: false,
    });
    const storageState = { cookies: [], origins: [] };
    let importedConfig: AppConfig | undefined;
    let savedConfig: AppConfig | undefined;

    const deps = dependencies({
      exportLauncherBrowserStorageState: async path => {
        expect(path).toBe("C:\\runtime\\launcher-browser.json");
        return storageState;
      },
      adoptTrustedBrowserLoginStorageState: (migrated, imported) => {
        importedConfig = structuredClone(migrated);
        expect(imported).toEqual(storageState);
        return {
          storageStatePath: migrated.storageStatePath,
          accountSurfaceUrl: "https://chatgpt.com/",
          solAvailable: true,
          extraHighAvailable: true,
          proAvailable: true,
        };
      },
      saveConfig: migrated => {
        savedConfig = structuredClone(migrated);
      },
    });

    const prepared = await prepareNativeRuntime(original, deps);

    expect(original.browserHost).toBe("launcher");
    expect(prepared.browserHost).toBe("managed-chrome");
    expect(prepared.browserHostDescriptorPath).toBeUndefined();
    expect(prepared.solAvailable).toBe(true);
    expect(prepared.extraHighAvailable).toBe(true);
    expect(prepared.proAvailable).toBe(true);
    expect(importedConfig?.browserHost).toBe("managed-chrome");
    expect(savedConfig).toEqual(prepared);
  });
});
