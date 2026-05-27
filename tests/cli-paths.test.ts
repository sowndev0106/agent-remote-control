import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configDir,
  configFile,
  projectsFile,
  secretFile,
  sessionsFile,
  systemdUserDir,
} from "../src/cli/paths.js";

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...savedEnv };
  delete process.env.XDG_CONFIG_HOME;
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("cli paths", () => {
  it("honors XDG_CONFIG_HOME when set", () => {
    process.env.XDG_CONFIG_HOME = "/custom/xdg";
    expect(configDir()).toBe("/custom/xdg/agent-remote-control");
    expect(configFile()).toBe("/custom/xdg/agent-remote-control/config.json");
    expect(secretFile()).toBe("/custom/xdg/agent-remote-control/secret.key");
    expect(sessionsFile()).toBe("/custom/xdg/agent-remote-control/sessions.json");
    expect(projectsFile()).toBe("/custom/xdg/agent-remote-control/projects.json");
    expect(systemdUserDir()).toBe("/custom/xdg/systemd/user");
  });

  it("falls back to ~/.config when XDG_CONFIG_HOME is unset", () => {
    expect(configDir()).toMatch(/\/\.config\/agent-remote-control$/);
  });
});
