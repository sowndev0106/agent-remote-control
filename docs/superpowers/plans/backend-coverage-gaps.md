# Backend Coverage Gaps

Generated from:

```bash
pnpm exec vitest run --coverage tests/*.test.ts --coverage.include='src/server/**'
```

Result: 43 test files passed, 183 tests passed. Server statement coverage was
72.88% overall. The full mixed jsdom/node coverage command completed tests but
crashed in `@vitest/coverage-v8` remapping, so this backend audit uses the
node-only run required for server coverage triage.

Files under 70% statements:

| File | Stmts | Untested branch or reason |
|---|---:|---|
| `src/server/index.ts` | 0% | Process entrypoint/startup wiring; covered by build/E2E, not unit coverage. |
| `src/server/adapters/antigravity/cdp.ts` | 19.59% | Live CDP socket paths and pending-call timeout/error branches. |
| `src/server/adapters/antigravity/discover.ts` | 32.25% | CDP port probing and target discovery branches. |
| `src/server/adapters/antigravity/index.ts` | 48.13% | Full adapter orchestration across launch/attach/snapshot/action flows. |
| `src/server/adapters/antigravity/launch.ts` | 33.73% | Process launch and stderr/exit branches. |
| `src/server/adapters/antigravity/mux-exec.ts` | 34.69% | External command execution failures and timeout path. |
| `src/server/adapters/antigravity/pty.ts` | 39.83% | Managed PTY lifecycle error/close branches. |
| `src/server/adapters/antigravity/screen.ts` | 47.12% | Screen command discovery/session parsing/send-key branches. |
| `src/server/adapters/stub/codex.ts` | 0% | Thin disabled-provider factory, no direct import test yet. |
| `src/server/adapters/stub/opencode.ts` | 0% | Thin disabled-provider factory, no direct import test yet. |
| `src/server/core/realtime/terminal-ws.ts` | 36.95% | WebSocket stream open/message/close/error paths for terminal tabs. |
| `src/server/core/realtime/ws.ts` | 53.33% | Realtime WS auth rejection, subscriber cleanup, and close branches. |
| `src/server/domains/discovery.ts` | 66.66% | Aggregator merge/error behavior. |
| `src/server/http/adapter-routes.ts` | 36.44% | CDP provider command/action route variants and error envelopes. |
| `src/server/http/files-routes.ts` | 61.53% | File route validation and preview/search error branches. |
| `src/server/http/projects.ts` | 53.16% | Browse/select/remove edge cases and manual-confirm branches. |
| `src/server/http/pty-routes.ts` | 39.21% | PTY launch/attach/command route variants. |
| `src/server/http/terminal-routes.ts` | 58.16% | Terminal create/close/resize validation and foreground-job branches. |
| `src/server/ipc/nonce.ts` | 60.46% | Existing nonce read/write and malformed-file branches. |
| `src/server/ipc/wire.ts` | 69.84% | Wire parse failure and close-to-threshold framing branches. |
