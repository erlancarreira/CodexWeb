import { expect, test } from "bun:test";
import { ChatGptWebAdapterError } from "../src/adapters/chatgpt-web/adapter-error";
import { ChatGptWebTurnRetryPolicy } from "../src/adapters/chatgpt-web/retry-policy";

test("tracks overload retries independently from other retryable failures", () => {
  const policy = new ChatGptWebTurnRetryPolicy();
  const overload = new ChatGptWebAdapterError("capacity", {
    status: 503,
    errorType: "server_error",
    code: "server_is_overloaded",
    retryable: true,
  });
  const transient = new ChatGptWebAdapterError("transient", {
    status: 502,
    errorType: "server_error",
    code: "upstream_server_error",
    retryable: true,
  });

  expect(policy.overloadRetryCount("turn")).toBe(0);
  policy.recordRetryableFailure("turn", transient);
  expect(policy.overloadRetryCount("turn")).toBe(0);
  policy.recordRetryableFailure("turn", overload);
  expect(policy.overloadRetryCount("turn")).toBe(1);
  policy.recordRetryableFailure("turn", overload);
  expect(policy.overloadRetryCount("turn")).toBe(2);
  policy.clear("turn");
  expect(policy.overloadRetryCount("turn")).toBe(0);
});


test("limits capacity overload to one automatic retry", () => {
  const policy = new ChatGptWebTurnRetryPolicy();
  const overload = new ChatGptWebAdapterError("Selected model is at capacity.", {
    status: 503,
    errorType: "server_error",
    code: "server_is_overloaded",
    retryable: true,
  });

  const first = policy.recordRetryableFailure("turn", overload);
  expect(first.retryable).toBeTrue();

  const second = policy.recordRetryableFailure("turn", overload);
  expect(second.retryable).toBeFalse();
  expect(second.code).toBe("server_is_overloaded");
  expect(second.message).toContain("retry budget was exhausted");
});
