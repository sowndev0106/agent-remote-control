import { readPersisted, writePersisted } from "./persistence.js";

export type HashAlgo = "argon2id" | "bcrypt" | "pbkdf2";

export interface AppConfig {
  server: {
    host: string;
    port: number;
    passwordHash: string;
    https: boolean;
    sessionIdleTimeoutMs: number;
  };
  security: {
    passwordHashAlgorithm: HashAlgo;
    loginRateLimit: { maxFailures: number; windowMs: number };
  };
  projects: { roots: string[]; recentLimit: number };
  fileExplorer: {
    enabled: boolean;
    showHidden: boolean;
    maxPreviewBytes: number;
    ignore: string[];
  };
  terminal: {
    enabled: boolean;
    shell: string;
    maxTabs: number;
    scrollback: number;
    idleTimeoutMs: number;
  };
  providers: {
    antigravity: {
      enabled: boolean;
      adapter: string;
      command: string;
      wrapperCommands: string[];
      controlSurfaces: string[];
      debugPort: number;
      debugPortRange: number[];
      launchTimeoutMs: number;
      snapshotPollMs: number;
      tmuxTargets: TmuxScreenTarget[];
      screenTargets: TmuxScreenTarget[];
    };
    agy: {
      enabled: boolean;
      command: string;
      wrapperCommands: string[];
      controlSurfaces: string[];
      snapshotPollMs: number;
      scrollback: number;
      conversationsDir: string;
    };
  };
}

export interface TmuxScreenTarget {
  name: string;
  project?: string;
  sessionId?: string;
  windowOrPane?: string;
}

export function defaultConfig(): AppConfig {
  return {
    server: {
      host: "127.0.0.1",
      port: 4096,
      passwordHash: "",
      https: false,
      sessionIdleTimeoutMs: 86_400_000,
    },
    security: {
      passwordHashAlgorithm: "argon2id",
      loginRateLimit: { maxFailures: 10, windowMs: 300_000 },
    },
    projects: { roots: ["~"], recentLimit: 50 },
    fileExplorer: {
      enabled: true,
      showHidden: false,
      maxPreviewBytes: 524_288,
      ignore: [".git", "node_modules", "dist", "build", ".next", ".cache"],
    },
    terminal: {
      enabled: true,
      shell: "",
      maxTabs: 8,
      scrollback: 10_000,
      idleTimeoutMs: 3_600_000,
    },
    providers: {
      antigravity: {
        enabled: true,
        adapter: "cdp",
        command: "antigravity",
        wrapperCommands: ["agy", "antigravity"],
        controlSurfaces: ["cdp", "managed-pty", "wrapper", "tmux", "screen"],
        debugPort: 9000,
        debugPortRange: [9000, 9001, 9002, 9003],
        launchTimeoutMs: 30_000,
        snapshotPollMs: 1000,
        tmuxTargets: [],
        screenTargets: [],
      },
      agy: {
        enabled: true,
        command: "agy",
        wrapperCommands: ["agy"],
        controlSurfaces: ["agy-pty", "agy-wrapper"],
        snapshotPollMs: 500,
        scrollback: 4000,
        conversationsDir: "~/.gemini/antigravity-cli/conversations",
      },
    },
  };
}

export async function loadConfig(path: string): Promise<AppConfig> {
  const existing = await readPersisted<Partial<AppConfig>>(path);
  if (existing) return mergeWithDefaults(existing);
  const c = defaultConfig();
  await writePersisted(path, c);
  return c;
}

export async function saveConfig(path: string, c: AppConfig): Promise<void> {
  await writePersisted(path, c);
}

function mergeWithDefaults(loaded: Partial<AppConfig>): AppConfig {
  const d = defaultConfig();
  return {
    server: { ...d.server, ...(loaded.server ?? {}) },
    security: {
      ...d.security,
      ...(loaded.security ?? {}),
      loginRateLimit: {
        ...d.security.loginRateLimit,
        ...((loaded.security ?? {}).loginRateLimit ?? {}),
      },
    },
    projects: { ...d.projects, ...(loaded.projects ?? {}) },
    fileExplorer: { ...d.fileExplorer, ...(loaded.fileExplorer ?? {}) },
    terminal: { ...d.terminal, ...(loaded.terminal ?? {}) },
    providers: {
      antigravity: {
        ...d.providers.antigravity,
        ...((loaded.providers ?? {}).antigravity ?? {}),
      },
      agy: {
        ...d.providers.agy,
        ...((loaded.providers ?? {}).agy ?? {}),
      },
    },
  };
}
