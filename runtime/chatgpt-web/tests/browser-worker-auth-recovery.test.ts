import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChatGptBrowserWorker,
  closeChatGptBrowserWorkers,
} from "../src/adapters/chatgpt-web/browser-worker";
import { ChatGptAuthenticationRequiredError } from "../src/chatgpt-session";

test("managed browser classifies missing storage state as recoverable authentication", async () => {
  const root = mkdtempSync(join(tmpdir(), "missing-chatgpt-state-"));
  const missing = join(root, "storage-state.json");
  const worker: any = ChatGptBrowserWorker.forProvider({
    adapter: "chatgpt-web",
    baseUrl: "browser://missing-state-" + Date.now() + "-" + Math.random(),
    chatgptWeb: {
      browserHost: "managed-chrome",
      storageStatePath: missing,
      headed: false,
    },
  });

  try {
    await expect(worker.ensurePage()).rejects.toBeInstanceOf(ChatGptAuthenticationRequiredError);
  } finally {
    await closeChatGptBrowserWorkers();
  }
});
