import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ConversationDescriptor } from "../IProviderAdapter.js";

export interface AgyConversationDescriptor extends ConversationDescriptor {
  projectPath?: string;
}

interface ProtoParsed {
  conversationId?: string;
  title?: string;
  startedAt?: number;
  projectPath?: string;
}

export function parseConversationProto(buf: Buffer): AgyConversationDescriptor {
  const parsed: ProtoParsed = {};
  let i = 0;
  while (i < buf.length) {
    const key = readVarint(buf, i);
    i = key.next;
    const fieldNo = Number(key.value >> 3n);
    const wire = Number(key.value & 0x07n);
    if (wire === 2) {
      const len = readVarint(buf, i);
      i = len.next;
      const end = i + Number(len.value);
      if (end > buf.length) throw new Error("length-delimited field exceeds buffer");
      const value = buf.subarray(i, end).toString("utf8").replace(/\0/g, "").trim();
      i = end;
      if (fieldNo === 1 && value) parsed.conversationId = value;
      else if (fieldNo === 2 && value) parsed.title = value;
      else if (fieldNo === 4 && value) parsed.projectPath = value;
      continue;
    }
    if (wire === 0) {
      const value = readVarint(buf, i);
      i = value.next;
      if (fieldNo === 3) parsed.startedAt = Number(value.value);
      continue;
    }
    if (wire === 1) {
      i += 8;
      continue;
    }
    if (wire === 5) {
      i += 4;
      continue;
    }
    throw new Error(`unsupported protobuf wire type ${wire}`);
  }
  if (!parsed.conversationId && !parsed.title) {
    throw new Error("no conversation fields found");
  }
  const startedAtVal = parsed.startedAt !== undefined ?
    (parsed.startedAt < 99999999999 ? parsed.startedAt * 1000 : parsed.startedAt) : undefined;

  const result: AgyConversationDescriptor = {
    conversationId: parsed.conversationId ?? parsed.title ?? "unknown",
    title: parsed.title ?? parsed.conversationId ?? "Untitled",
  };
  if (startedAtVal !== undefined) {
    result.startedAt = startedAtVal;
  }
  if (parsed.projectPath !== undefined) {
    result.projectPath = parsed.projectPath;
  }
  return result;
}

function readVarint(buf: Buffer, offset: number): { value: bigint; next: number } {
  let result = 0n;
  let shift = 0n;
  for (let i = offset; i < buf.length; i += 1) {
    const b = BigInt(buf[i]!);
    result |= (b & 0x7fn) << shift;
    if ((b & 0x80n) === 0n) return { value: result, next: i + 1 };
    shift += 7n;
    if (shift > 63n) throw new Error("varint too long");
  }
  throw new Error("truncated varint");
}

export async function listAgyConversations(dir: string): Promise<AgyConversationDescriptor[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: AgyConversationDescriptor[] = [];
  for (const name of entries.filter((n) => n.endsWith(".pb")).sort()) {
    const path = join(dir, name);
    const id = basename(name, ".pb");
    const s = await stat(path).catch(() => undefined);
    try {
      const parsed = parseConversationProto(await readFile(path));
      const descriptor: AgyConversationDescriptor = {
        conversationId: parsed.conversationId || id,
        title: parsed.title,
      };
      if (parsed.projectPath !== undefined) {
        descriptor.projectPath = parsed.projectPath;
      }
      const startedAt = parsed.startedAt ?? s?.mtimeMs;
      if (startedAt !== undefined) {
        descriptor.startedAt = startedAt;
      }
      out.push(descriptor);
    } catch {
      const descriptor: AgyConversationDescriptor = {
        conversationId: id,
        title: id,
      };
      if (s !== undefined) {
        descriptor.startedAt = s.mtimeMs;
      }
      out.push(descriptor);
    }
  }
  return out;
}
