import { DisabledAdapter } from "./disabled-adapter.js";

export class CodexAdapter extends DisabledAdapter {
  constructor() {
    super("codex", "Codex", "Codex provider arrives after Antigravity (Phase 2).");
  }
}
