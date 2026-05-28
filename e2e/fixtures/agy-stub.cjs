#!/usr/bin/env node
// Minimal fake `agy` binary for e2e. The real agy makes network calls; this
// stub just proves the server-owned PTY surface: it prints a recognizable
// marker line, echoes any input back (so sendInput is observable), and stays
// alive so the session reads as "running".
process.stdout.write("AGY-STUB-ONLINE\r\n");
process.stdin.on("data", (chunk) => process.stdout.write(chunk));
process.stdin.resume();
