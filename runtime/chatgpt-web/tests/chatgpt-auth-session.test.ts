import { expect, test } from "bun:test";
import {
  assertAuthenticatedChatGptPage,
  ChatGptAuthenticationRequiredError,
  ChatGptSessionVerificationError,
} from "../src/chatgpt-session";

function visibleComposer() {
  return {
    count: async () => 1,
    nth: () => ({ isVisible: async () => true }),
  };
}

function pageFor(probe: unknown, url = "https://chatgpt.com/?temporary-chat=true") {
  return {
    url: () => url,
    locator: () => visibleComposer(),
    evaluate: async () => probe,
  } as never;
}

test("authenticated ChatGPT session is accepted", async () => {
  await expect(assertAuthenticatedChatGptPage(pageFor({ kind: "authenticated" }))).resolves.toBeUndefined();
});

test("anonymous composer cannot masquerade as an authenticated ChatGPT session", async () => {
  await expect(assertAuthenticatedChatGptPage(pageFor({ kind: "signed_out" })))
    .rejects.toBeInstanceOf(ChatGptAuthenticationRequiredError);
});

test("session endpoint failures do not get treated as authenticated", async () => {
  await expect(assertAuthenticatedChatGptPage(pageFor({ kind: "verification_failed", status: 403 })))
    .rejects.toBeInstanceOf(ChatGptSessionVerificationError);
});

test("session verification is limited to chatgpt.com", async () => {
  await expect(assertAuthenticatedChatGptPage(pageFor({ kind: "authenticated" }, "https://example.com/")))
    .rejects.toBeInstanceOf(ChatGptSessionVerificationError);
});
