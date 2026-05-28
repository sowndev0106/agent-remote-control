# Backend Coverage Gaps

Initial audit generated from:

```bash
pnpm exec vitest run --coverage tests/*.test.ts --coverage.include='src/server/**'
```

Initial result: 43 test files passed, 183 tests passed. Server statement
coverage was 72.88% overall.

Final backend coverage after Task 5.4 fills:

```bash
pnpm exec vitest run --coverage tests/*.test.ts --coverage.include='src/server/**'
```

Result: 50 test files passed, 210 tests passed. Server statement coverage is
81.13% overall. The full mixed jsdom/node coverage command completes tests but
still crashes in `@vitest/coverage-v8` remapping, so the server coverage audit
uses the node-only backend run.

Files still under 70% statements after targeted fills:

| File | Stmts | Untested branch or reason |
|---|---:|---|
| `src/server/index.ts` | 0% | Process entrypoint/startup signal wiring; verified by build/E2E startup rather than unit coverage. Unit-loading this module risks process signal/exit side effects. |
| `src/server/adapters/antigravity/cdp.ts` | 19.59% | Live CDP WebSocket request/response, timeout, and protocol error paths. Requires a CDP endpoint or fake protocol server. |
| `src/server/adapters/antigravity/discover.ts` | 32.25% | Port probing and target discovery across real debug ports. Requires socket-level discovery harness. |
| `src/server/adapters/antigravity/index.ts` | 48.13% | Full Antigravity adapter orchestration across launch/attach/snapshot/action flows. Pure H9/snapshot pieces are covered; remaining branches need live/fake CDP integration. |
| `src/server/adapters/antigravity/launch.ts` | 33.73% | External Antigravity process launch, stderr, exit, and timeout paths. Requires process-level integration harness. |
| `src/server/adapters/antigravity/mux-exec.ts` | 34.69% | External command execution failures and timeout path. Requires child-process integration harness. |
| `src/server/adapters/antigravity/pty.ts` | 41.46% | Managed Antigravity PTY lifecycle and CDP readiness branches. Route-level PTY behavior is covered with mocks; remaining branches need PTY/CDP integration. |
| `src/server/adapters/antigravity/screen.ts` | 47.12% | `screen` command discovery/session parsing/send-key branches. Requires installed `screen` or command-level harness. |

Closed by Task 5.4 targeted tests:

- `src/server/adapters/stub/codex.ts` and `opencode.ts` now 100%.
- `src/server/core/realtime/ws.ts` now 94.73%.
- `src/server/core/realtime/terminal-ws.ts` now 89.74%.
- `src/server/domains/discovery.ts` now 100%.
- `src/server/http/*` route files are all above 70%.
- `src/server/ipc/nonce.ts` now 95.34%; `src/server/ipc/wire.ts` now 100%.
