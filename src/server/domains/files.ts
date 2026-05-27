import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { resolveSafe } from "../core/path-safety.js";
import { AppError } from "../core/errors.js";

export interface FileTreeEntry {
  name: string;
  path: string;
  relPath: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
}

export type PreviewKind = "text" | "binary" | "oversized";

export interface PreviewResult {
  kind: PreviewKind;
  relPath: string;
  absPath: string;
  size: number;
  modifiedAt: number;
  content?: string;
}

export interface SearchResult {
  path: string;
  relPath: string;
  score: number;
}

export interface FilesConfig {
  ignore: string[];
  showHiddenDefault: boolean;
  maxPreviewBytes: number;
}

/**
 * Read-only project file APIs. Every path is resolved against the SINGLE
 * project root (H12 / REQ-087A) — configured browse roots do NOT widen access.
 */
export class FilesService {
  constructor(
    private readonly projectRoot: string,
    private readonly cfg: FilesConfig,
  ) {}

  private isIgnored(name: string): boolean {
    return this.cfg.ignore.includes(name);
  }

  async tree(inputPath: string, showHidden: boolean): Promise<{
    path: string;
    relPath: string;
    entries: FileTreeEntry[];
  }> {
    const dir = await resolveSafe(inputPath, [this.projectRoot], {
      code: "path_outside_project",
      operation: "files.tree",
    });
    const names = await readdir(dir).catch(() => {
      throw new AppError({
        code: "not_a_directory",
        operation: "files.tree",
        message: `Cannot list ${inputPath}`,
        httpStatus: 400,
      });
    });
    const entries: FileTreeEntry[] = [];
    await Promise.all(
      names.map(async (name) => {
        if (!showHidden && name.startsWith(".")) return;
        if (this.isIgnored(name)) return;
        const abs = join(dir, name);
        try {
          const s = await stat(abs);
          entries.push({
            name,
            path: abs,
            relPath: relative(this.projectRoot, abs),
            isDir: s.isDirectory(),
            size: s.size,
            modifiedAt: s.mtimeMs,
          });
        } catch {
          /* unreadable entry — skip */
        }
      }),
    );
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { path: dir, relPath: relative(this.projectRoot, dir), entries };
  }

  async preview(inputPath: string): Promise<PreviewResult> {
    const abs = await resolveSafe(inputPath, [this.projectRoot], {
      code: "path_outside_project",
      operation: "files.preview",
    });
    const s = await stat(abs);
    if (s.isDirectory()) {
      throw new AppError({
        code: "not_a_file",
        operation: "files.preview",
        message: "Path is a directory, not a file.",
        httpStatus: 400,
      });
    }
    const base = {
      relPath: relative(this.projectRoot, abs),
      absPath: abs,
      size: s.size,
      modifiedAt: s.mtimeMs,
    };
    if (s.size > this.cfg.maxPreviewBytes) {
      return { kind: "oversized", ...base };
    }
    const buf = await readFile(abs);
    if (isBinary(buf)) {
      return { kind: "binary", ...base };
    }
    return { kind: "text", ...base, content: buf.toString("utf8") };
  }

  async search(query: string, limit = 100): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const root = this.projectRoot;
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 12 || results.length >= limit * 4) return;
      const names = await readdir(dir).catch(() => []);
      for (const name of names) {
        if (this.isIgnored(name)) continue;
        if (name.startsWith(".")) continue;
        const abs = join(dir, name);
        let s;
        try {
          s = await stat(abs);
        } catch {
          continue;
        }
        if (s.isDirectory()) {
          await walk(abs, depth + 1);
        } else {
          const rel = relative(root, abs);
          const score = fuzzyScore(query.toLowerCase(), rel.toLowerCase());
          if (score > 0) {
            results.push({ path: abs, relPath: rel, score });
          }
        }
      }
    };
    await walk(root, 0);
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}

/** Detect binary content: null byte in the first 8KB, or invalid UTF-8. */
export function isBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8192);
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  // Reject if decoding then re-encoding changes byte length significantly
  // (heuristic for non-UTF8 binary).
  const decoded = sample.toString("utf8");
  if (decoded.includes("�")) return true;
  return false;
}

/**
 * Lightweight fzy-like scoring: returns 0 when not a subsequence match,
 * otherwise a positive score favoring contiguous + basename matches.
 */
export function fuzzyScore(needle: string, haystack: string): number {
  if (needle.length === 0) return 1;
  let hi = 0;
  let score = 0;
  let streak = 0;
  const base = haystack.slice(haystack.lastIndexOf(sep) + 1);
  for (let ni = 0; ni < needle.length; ni++) {
    const ch = needle[ni]!;
    const found = haystack.indexOf(ch, hi);
    if (found === -1) return 0;
    if (found === hi) {
      streak += 1;
      score += 2 + streak;
    } else {
      streak = 0;
      score += 1;
    }
    hi = found + 1;
  }
  // bonus when the match concentrates in the basename
  if (base.includes(needle)) score += 10;
  if (basename(haystack) === needle) score += 20;
  return score;
}
