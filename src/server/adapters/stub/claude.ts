import { DisabledAdapter } from "./disabled-adapter.js";

export class ClaudeAdapter extends DisabledAdapter {
  constructor() {
    super("claude", "Claude", "Claude provider arrives after Antigravity (Phase 2).");
  }
}
