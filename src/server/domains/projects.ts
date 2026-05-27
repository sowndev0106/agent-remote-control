import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import { readPersisted, writePersisted } from "../core/persistence.js";
import {
  type ProjectInfo,
  type ProviderId,
  type RecommendationMarker,
} from "./types.js";
import {
  expandHome,
  isReadableDir,
  resolveSafe,
} from "../core/path-safety.js";
import { detectRecommendations } from "./recommendations.js";
import { AppError } from "../core/errors.js";

interface ProjectsData {
  projects: ProjectInfo[];
}

export interface BrowseEntry {
  name: string;
  path: string;
  isDir: boolean;
  hidden: boolean;
  recommendations: RecommendationMarker[];
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  roots: string[];
  entries: BrowseEntry[];
}

export class ProjectStore {
  private projects: ProjectInfo[] = [];
  constructor(
    private readonly opts: {
      path: string;
      recentLimit: number;
      configuredRoots: string[];
    },
  ) {}

  async load(): Promise<void> {
    const data = await readPersisted<ProjectsData>(this.opts.path);
    this.projects = data?.projects ?? [];
  }
  private async persist(): Promise<void> {
    await writePersisted<ProjectsData>(this.opts.path, { projects: this.projects });
  }

  list(): ProjectInfo[] {
    return [...this.projects].sort(
      (a, b) => b.lastSelectedAt - a.lastSelectedAt,
    );
  }
  recent(): ProjectInfo[] {
    return this.list().slice(0, this.opts.recentLimit);
  }
  get(id: string): ProjectInfo | undefined {
    return this.projects.find((p) => p.id === id);
  }

  async select(
    inputPath: string,
    confirmManual: boolean,
  ): Promise<ProjectInfo> {
    const expanded = expandHome(inputPath);
    let canonical: string;
    try {
      canonical = await resolveSafe(expanded, this.opts.configuredRoots, {
        code: "path_outside_roots",
        operation: "select project",
      });
    } catch (err) {
      if (err instanceof AppError && err.code === "path_outside_roots") {
        if (!confirmManual) {
          throw new AppError({
            code: "manual_confirm_required",
            operation: "select project",
            message:
              "This path is outside the configured roots. " +
              "Re-send with `confirmManual: true` to register it anyway.",
            recoveryAction: "Send the same request with `confirmManual: true`.",
            httpStatus: 409,
          });
        }
        // Manual confirmation: allow but still validate path exists and is dir.
        canonical = await resolveSafe(expanded, [expanded], {
          code: "path_not_found",
          operation: "select project",
        });
      } else {
        throw err;
      }
    }

    if (!(await isReadableDir(canonical))) {
      throw new AppError({
        code: "not_a_directory",
        operation: "select project",
        message: `Path is not a readable directory: ${canonical}`,
        httpStatus: 400,
      });
    }

    const existing = this.projects.find((p) => p.path === canonical);
    if (existing) {
      existing.lastSelectedAt = Date.now();
      existing.recommendations = await detectRecommendations(canonical);
      await this.persist();
      return existing;
    }

    const proj: ProjectInfo = {
      id: randomBytes(12).toString("hex"),
      path: canonical,
      name: basename(canonical),
      addedAt: Date.now(),
      lastSelectedAt: Date.now(),
      recommendations: await detectRecommendations(canonical),
    };
    this.projects.unshift(proj);
    // Cap stored projects so the file does not grow unboundedly.
    const cap = Math.max(this.opts.recentLimit, 1);
    if (this.projects.length > cap) {
      this.projects = this.projects.slice(0, cap);
    }
    await this.persist();
    return proj;
  }

  async remove(id: string): Promise<boolean> {
    const idx = this.projects.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    this.projects.splice(idx, 1);
    await this.persist();
    return true;
  }

  async setLastProvider(id: string, providerId: ProviderId): Promise<ProjectInfo> {
    const p = this.requireById(id);
    p.lastProviderId = providerId;
    await this.persist();
    return p;
  }

  async setLastSession(id: string, sessionId: string): Promise<ProjectInfo> {
    const p = this.requireById(id);
    p.lastSessionId = sessionId;
    await this.persist();
    return p;
  }

  private requireById(id: string): ProjectInfo {
    const p = this.get(id);
    if (!p) {
      throw new AppError({
        code: "project_not_found",
        operation: "project lookup",
        message: `No project with id ${id}`,
        httpStatus: 404,
      });
    }
    return p;
  }

  /**
   * List entries under `dir` (already validated by caller) with hidden filter
   * and recommendation detection per child.
   */
  static async browseDir(
    dir: string,
    showHidden: boolean,
  ): Promise<BrowseEntry[]> {
    const names = await readdir(dir).catch(() => []);
    const entries: BrowseEntry[] = [];
    await Promise.all(
      names.map(async (name) => {
        const hidden = name.startsWith(".");
        if (hidden && !showHidden) return;
        const childPath = join(dir, name);
        const isDir = await isReadableDir(childPath);
        const recommendations = isDir
          ? await detectRecommendations(childPath)
          : [];
        entries.push({
          name,
          path: childPath,
          isDir,
          hidden,
          recommendations,
        });
      }),
    );
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }
}
