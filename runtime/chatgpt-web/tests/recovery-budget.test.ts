import { expect, test } from "bun:test";
import {
  BoundedRecoveryBudget,
  RecoveryBudgetExceededError,
} from "../src/core/resilience/recovery-budget";

test("recovery budget is bounded, named and resettable", () => {
  const budget = new BoundedRecoveryBudget("assistant-observation", 2);
  expect(budget.consume()).toBe(1);
  expect(budget.consume()).toBe(2);
  expect(budget.remaining()).toBe(0);
  expect(() => budget.consume(new Error("DOM timeout"))).toThrow(RecoveryBudgetExceededError);
  budget.reset();
  expect(budget.consume()).toBe(1);
});

test("zero recovery budget fails closed immediately", () => {
  const budget = new BoundedRecoveryBudget("no-retry", 0);
  expect(() => budget.consume()).toThrow('Recovery budget "no-retry" exhausted');
});
