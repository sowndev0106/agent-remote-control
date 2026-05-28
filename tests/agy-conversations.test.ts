import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listAgyConversations,
  parseConversationProto,
} from "../src/server/adapters/agy/conversations.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-agy-conv-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function field(tag: number, value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([tag << 3 | 2, body.length]), body]);
}

describe("agy conversation protobuf reader", () => {
  it("parses minimal length-delimited fields", () => {
    const buf = Buffer.concat([
      field(1, "conv-1"),
      field(2, "My conversation"),
      field(4, "/project"),
    ]);
    expect(parseConversationProto(buf)).toMatchObject({
      conversationId: "conv-1",
      title: "My conversation",
      projectPath: "/project",
    });
  });

  it("falls back to filename and mtime when parsing fails", async () => {
    await writeFile(join(dir, "broken.pb"), Buffer.from([0xff, 0xff]));
    const out = await listAgyConversations(dir);
    expect(out).toHaveLength(1);
    expect(out[0]!.conversationId).toBe("broken");
    expect(out[0]!.title).toBe("broken");
    expect(out[0]!.startedAt).toBeGreaterThan(0);
  });

  it("returns [] for missing directory", async () => {
    await expect(listAgyConversations(join(dir, "missing"))).resolves.toEqual([]);
  });

  it("ignores non-pb files", async () => {
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "notes.txt"), "x");
    expect(await listAgyConversations(dir)).toEqual([]);
  });

  it("parses varint fields (startedAt)", () => {
    // tag 3, wire type 0 -> (3 << 3) | 0 = 24
    // value 12345678n as varint: [0xce, 0xc2, 0xf1, 0x05]
    const buf = Buffer.concat([
      field(1, "conv-1"),
      Buffer.from([24, 0xce, 0xc2, 0xf1, 0x05])
    ]);
    expect(parseConversationProto(buf)).toMatchObject({
      conversationId: "conv-1",
      startedAt: 12345678 * 1000, // Normalized to ms
    });
  });

  it("skips unknown wire types 1 and 5 without crashing", () => {
    // tag 5, wire type 1 (64-bit) -> 5 << 3 | 1 = 41. Next 8 bytes skipped.
    // tag 6, wire type 5 (32-bit) -> 6 << 3 | 5 = 53. Next 4 bytes skipped.
    const buf = Buffer.concat([
      field(1, "conv-1"),
      Buffer.from([41]),
      Buffer.alloc(8, 0),
      Buffer.from([53]),
      Buffer.alloc(4, 0),
      field(2, "My conversation"),
    ]);
    expect(parseConversationProto(buf)).toMatchObject({
      conversationId: "conv-1",
      title: "My conversation",
    });
  });

  it("handles fallback edge case: empty files (0 bytes)", () => {
    expect(() => parseConversationProto(Buffer.alloc(0))).toThrow();
  });

  it("handles fallback edge case: only one of conversationId or title", () => {
    const onlyId = Buffer.concat([field(1, "conv-only")]);
    expect(parseConversationProto(onlyId)).toMatchObject({
      conversationId: "conv-only",
      title: "conv-only",
    });

    const onlyTitle = Buffer.concat([field(2, "title-only")]);
    expect(parseConversationProto(onlyTitle)).toMatchObject({
      conversationId: "title-only",
      title: "title-only",
    });
  });

  it("falls back to filename and mtime for empty pb files in lister", async () => {
    await writeFile(join(dir, "empty.pb"), Buffer.alloc(0));
    const out = await listAgyConversations(dir);
    expect(out).toHaveLength(1);
    expect(out[0]!.conversationId).toBe("empty");
    expect(out[0]!.title).toBe("empty");
    expect(out[0]!.startedAt).toBeGreaterThan(0);
  });
});
