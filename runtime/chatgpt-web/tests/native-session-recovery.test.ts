import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { defaultConfig, type AppConfig } from "../src/config";
import {
  recoverNativeBrowserSession,
  type NativeSessionRecoveryDependencies,
} from "../src/native-session-recovery";

function config(): AppConfig {
  return {
    ...defaultConfig("full"),
    browserHost: "managed-chrome",
    browserInteractionMode: "automatic",
  };
}

function descriptor(): any {
  return {
    kind: "codex-web-gpt-launcher",
    version: 1,
    profile: "production",
    pid: 4321,
    endpoint: "http://127.0.0.1:55555",
    control: { endpoint: "http://127.0.0.1:55556", token: "x".repeat(64) },
    helper: { executable: "launcher.exe", script: "browser-helper.cjs" },
    partition: "persist:codex-web-gpt-chatgpt",
    idleUrl: "data:text/html,#host",
    surfaceId: "surface",
    surfaceTargets: { surface: "target" },
    createdAt: new Date().toISOString(),
  };
}

function child(pid = 4321): ChildProcess {
  return {
    pid,
    exitCode: null,
    signalCode: null,
    kill: () => true,
  } as unknown as ChildProcess;
}

function dependencies(
  overrides: Partial<NativeSessionRecoveryDependencies> = {},
): NativeSessionRecoveryDependencies {
  const root = mkdtempSync(join(tmpdir(), "codex-session-recovery-"));
  return {
    platform: "win32",
    environment: {
      LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
      ELECTRON_RUN_AS_NODE: "1",
      CODEX_HOME: "C:\\NativeCodexHome",
      CODEX_CHATGPT_WEB_HOME: root,
    },
    configDir: () => root,
    findInstalledLauncherExecutable: () => "C:\\Apps\\Codex Web GPT\\Codex Web GPT.exe",
    inspectLauncherBrowserHostLiveness: async () => descriptor(),
    readLauncherBrowserHostDescriptor: () => descriptor(),
    inspectLauncherBrowserHost: async () => ({
      url: "https://chatgpt.com/?temporary-chat=true",
      solAvailable: true,
      extraHighAvailable: false,
      proAvailable: false,
    }),
    exportLauncherBrowserStorageState: async () => ({ cookies: [{ name: "session", value: "x", domain: ".chatgpt.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" as const }], origins: [] }),
    adoptTrustedBrowserLoginStorageState: migrated => ({
      storageStatePath: migrated.storageStatePath,
      accountSurfaceUrl: "https://chatgpt.com/?temporary-chat=true",
      solAvailable: migrated.solAvailable === true,
      extraHighAvailable: migrated.extraHighAvailable === true,
      proAvailable: migrated.proAvailable === true,
    }),
    saveConfig: () => {},
    spawnLauncher: () => child(),
    terminateOwnedLauncher: () => {},
    sleep: async () => {},
    removeStaleDescriptor: () => {},
    resetManagedBrowserProfile: () => {},
    ...overrides,
  };
}

describe("native managed-browser session recovery", () => {
  test("reuses a healthy production launcher without taking ownership of it", async () => {
    let spawned = 0;
    let terminated = 0;
    let resets = 0;
    let saved: AppConfig | undefined;
    const deps = dependencies({
      spawnLauncher: () => { spawned += 1; return child(); },
      terminateOwnedLauncher: () => { terminated += 1; },
      resetManagedBrowserProfile: () => { resets += 1; },
      saveConfig: value => { saved = structuredClone(value); },
    });
    const target = config();

    const result = await recoverNativeBrowserSession(target, deps);

    expect(result.accountSurfaceUrl).toContain("chatgpt.com");
    expect(spawned).toBe(0);
    expect(terminated).toBe(0);
    expect(resets).toBe(1);
    expect(target.solAvailable).toBeTrue();
    expect(target.extraHighAvailable).toBeFalse();
    expect(saved?.solAvailable).toBeTrue();
  });

  test("starts a hidden production launcher with Electron node mode removed and cleans its tree", async () => {
    let inspectCalls = 0;
    let spawnedArgs: string[] | undefined;
    let spawnedEnvironment: NodeJS.ProcessEnv | undefined;
    let terminated = 0;
    let removed = 0;
    const deps = dependencies({
      inspectLauncherBrowserHostLiveness: async () => {
        inspectCalls += 1;
        if (inspectCalls === 1) throw new Error("descriptor missing");
        return { ...descriptor(), pid: 9876 };
      },
      readLauncherBrowserHostDescriptor: () => { throw new Error("descriptor missing"); },
      spawnLauncher: (_executable, args, environment) => {
        spawnedArgs = [...args];
        spawnedEnvironment = { ...environment };
        return child(9876);
      },
      terminateOwnedLauncher: pid => {
        expect(pid).toBe(9876);
        terminated += 1;
      },
      removeStaleDescriptor: () => { removed += 1; },
    });

    await recoverNativeBrowserSession(config(), deps);

    expect(spawnedArgs).toEqual(["--hidden"]);
    expect(spawnedEnvironment?.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(spawnedEnvironment?.CODEX_HOME).toBeUndefined();
    expect(spawnedEnvironment?.CODEX_CHATGPT_WEB_HOME).toBeTruthy();
    expect(terminated).toBe(1);
    expect(removed).toBe(1);
  });

  test("waits for an already-running production launcher instead of spawning a competing instance", async () => {
    let inspectCalls = 0;
    let spawned = 0;
    const deps = dependencies({
      inspectLauncherBrowserHostLiveness: async () => {
        inspectCalls += 1;
        if (inspectCalls < 3) throw new Error("CDP still booting");
        return descriptor();
      },
      readLauncherBrowserHostDescriptor: () => descriptor(),
      spawnLauncher: () => { spawned += 1; return child(); },
    });

    await recoverNativeBrowserSession(config(), deps, { timeoutMs: 1_000 });

    expect(inspectCalls).toBe(3);
    expect(spawned).toBe(0);
  });

  test("does not terminate a pre-existing single-instance owner that publishes the descriptor", async () => {
    let inspectCalls = 0;
    let terminated = 0;
    let removed = 0;
    const published = { ...descriptor(), pid: 5555 };
    const deps = dependencies({
      inspectLauncherBrowserHostLiveness: async () => {
        inspectCalls += 1;
        if (inspectCalls === 1) throw new Error("descriptor missing");
        return published;
      },
      readLauncherBrowserHostDescriptor: () => { throw new Error("descriptor missing"); },
      spawnLauncher: () => child(4444),
      terminateOwnedLauncher: () => { terminated += 1; },
      removeStaleDescriptor: () => { removed += 1; },
    });

    await recoverNativeBrowserSession(config(), deps);

    expect(terminated).toBe(0);
    // A descriptor owned by PID 5555 must remain available to its actual owner.
    expect(removed).toBe(0);
  });

  test("coalesces concurrent refreshes into a single launcher export", async () => {
    let exports = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const deps = dependencies({
      exportLauncherBrowserStorageState: async () => {
        exports += 1;
        await gate;
        return { cookies: [{ name: "session", value: "x", domain: ".chatgpt.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" as const }], origins: [] };
      },
    });
    const target = config();

    const first = recoverNativeBrowserSession(target, deps);
    const second = recoverNativeBrowserSession(target, deps);
    for (let attempt = 0; attempt < 20 && exports === 0; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(exports).toBe(1);
    release();

    const [a, b] = await Promise.all([first, second]);
    expect(exports).toBe(1);
    expect(a.storageStatePath).toBe(b.storageStatePath);
  });

  test("always cleans an owned launcher when validation of the exported session fails", async () => {
    let inspectCalls = 0;
    let terminated = 0;
    const deps = dependencies({
      inspectLauncherBrowserHostLiveness: async () => {
        inspectCalls += 1;
        if (inspectCalls === 1) throw new Error("not running");
        return { ...descriptor(), pid: 7654 };
      },
      readLauncherBrowserHostDescriptor: () => { throw new Error("not running"); },
      spawnLauncher: () => child(7654),
      inspectLauncherBrowserHost: async () => {
        throw new Error("exported launcher session is signed out");
      },
      terminateOwnedLauncher: () => { terminated += 1; },
    });

    await expect(recoverNativeBrowserSession(config(), deps)).rejects.toThrow("signed out");
    expect(terminated).toBe(1);
  });

  test("refuses to recover outside managed automatic mode", async () => {
    const target = config();
    target.browserHost = "launcher";
    await expect(recoverNativeBrowserSession(target, dependencies())).rejects.toThrow(
      "requires managed-chrome automatic mode",
    );
  });
});
