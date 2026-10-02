import { expect, test } from "bun:test";
import { ChatGptCompactionProjection } from "../src/adapters/chatgpt-web/compaction-projection";
import type { ChatGptMarkdownSegment } from "../src/adapters/chatgpt-web/markdown";

test("compaction projection never emits provisional text and serializes only the final renderer", () => {
  const projection = new ChatGptCompactionProjection();
  const first: ChatGptMarkdownSegment[] = [{
    key: "summary",
    tag: "p",
    text: "Provisional checkpoint",
    html: "<p>Provisional checkpoint</p>",
    sourceStart: 0,
    sourceEnd: 22,
    streamable: true,
  }];
  const final: ChatGptMarkdownSegment[] = [{
    ...first[0]!,
    text: "Final checkpoint",
    html: "<p>Final checkpoint</p>",
    sourceEnd: 16,
  }];

  expect(projection.observe(first)).toBe("");
  expect(projection.observe(final)).toBe("");
  expect(projection.currentSnapshotIsConsistent()).toBeTrue();
  expect(projection.finish()).toEqual({
    markdown: "Final checkpoint",
    delta: "Final checkpoint",
  });
});


test("compaction remount discards only provisional renderer state", () => {
  const projection = new ChatGptCompactionProjection();
  const provisional: ChatGptMarkdownSegment[] = [{
    key: "old",
    tag: "p",
    text: "Old provisional checkpoint",
    html: "<p>Old provisional checkpoint</p>",
    sourceStart: 0,
    sourceEnd: 26,
    streamable: true,
  }];
  const remounted: ChatGptMarkdownSegment[] = [{
    key: "new",
    tag: "p",
    text: "Final remounted checkpoint",
    html: "<p>Final remounted checkpoint</p>",
    sourceStart: 0,
    sourceEnd: 25,
    streamable: true,
  }];

  expect(projection.observe(provisional)).toBe("");
  projection.remount();
  expect(projection.observe(remounted)).toBe("");
  expect(projection.finish()).toEqual({
    markdown: "Final remounted checkpoint",
    delta: "Final remounted checkpoint",
  });
});
