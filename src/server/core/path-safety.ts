import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { homedir } from "node:os";
import { AppError } from "./errors.js";

/**
 * Expand `~` and `~/sub` to the user's home directory.
 */
export function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return resolve(homedir(), input.slice(2));
  return input;
}

/**
 * Resolve `input` to a canonical absolute realpath that must live under at
 * least one of `allowedRoots`. Throws `AppError(path_outside_roots)` when the
 * resolved path escapes every root via `..` or symlink.
 *
 * Used for project browse (allowedRoots = config.projects.roots) and project
 * file APIs (allowedRoots = [project.path]).
 */
export async function resolveSafe(
  input: string,
  allowedRoots: string[],
  opts: { code?: string; operation?: string } = {},
): Promise<string> {
  if (allowedRoots.length === 0) {
    throw new AppError({
      code: opts.code ?? "path_outside_roots",
      operation: opts.operation ?? "resolveSafe",
      message: "No allowed roots are configured.",
      httpStatus: 400,
    });
  }
  const expanded = expandHome(input);
  const absolute = resolve(expanded);
  let canonical: string;
  try {
    canonical = await realpath(absolute);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new AppError({
        code: "path_not_found",
        operation: opts.operation ?? "resolveSafe",
        message: `Path not found: ${input}`,
        httpStatus: 404,
      });
    }
    throw err;
  }
  for (const root of allowedRoots) {
    const expandedRoot = expandHome(root);
    let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(expandedRoot);
    } catch {
      continue;
    }
    if (canonical === canonicalRoot) return canonical;
    if (canonical.startsWith(canonicalRoot + sep)) return canonical;
  }
  throw new AppError({
    code: opts.code ?? "path_outside_roots",
    operation: opts.operation ?? "resolveSafe",
    message: `Path "${input}" is outside the allowed roots.`,
    recoveryAction:
      "Set `confirmManual: true` to register a project outside the configured roots.",
    httpStatus: 403,
  });
}

export async function isReadableDir(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
