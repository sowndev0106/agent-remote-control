import type { ActionDescriptor } from "../IProviderAdapter.js";

interface AgyAction extends ActionDescriptor {
  input: string;
}

export const AGY_FIXED_ACTIONS: AgyAction[] = [
  { actionId: "agy.send", label: "Send", kind: "button", enabled: true, input: "\r" },
  { actionId: "agy.cancel", label: "Cancel / Esc", kind: "button", enabled: true, input: "\x1b" },
  { actionId: "agy.up", label: "Up", kind: "button", enabled: true, input: "\x1b[A" },
  { actionId: "agy.down", label: "Down", kind: "button", enabled: true, input: "\x1b[B" },
  { actionId: "agy.right", label: "Right", kind: "button", enabled: true, input: "\x1b[C" },
  { actionId: "agy.left", label: "Left", kind: "button", enabled: true, input: "\x1b[D" },
  { actionId: "agy.tab", label: "Tab", kind: "button", enabled: true, input: "\t" },
  { actionId: "agy.ctrl_c", label: "Ctrl-C", kind: "button", enabled: true, input: "\x03" },
  { actionId: "agy.slash", label: "Slash", kind: "button", enabled: true, input: "/" },
];

const APPROVE_ONLY: RegExp[] = [
  /\[[Yy]\/[Nn]\]/,
  /^\s*Approve\??\s*\([Yy]\/[Nn]\)\s*$/m,
  /Press y to approve/i,
];

const APPROVE_DENY = /\(a\)pprove\s*\(d\)eny/i;

const stripAnsi = (str: string) =>
  str.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><])/g, "");

export function detectApprovalActions(text: string): ActionDescriptor[] {
  const cleanText = stripAnsi(text);
  const lastLines = cleanText.split(/\r?\n/).slice(-30).join("\n");
  if (APPROVE_DENY.test(lastLines)) {
    return [
      { actionId: "agy.approve", label: "Approve", kind: "approval", enabled: true },
      { actionId: "agy.deny", label: "Deny", kind: "approval", enabled: true },
    ];
  }
  if (APPROVE_ONLY.some((r) => r.test(lastLines))) {
    return [
      { actionId: "agy.approve", label: "Approve", kind: "approval", enabled: true },
    ];
  }
  return [];
}

export function getAgyActions(args: {
  running: boolean;
  text: string;
}): ActionDescriptor[] {
  const fixed = AGY_FIXED_ACTIONS.map(({ input: _input, ...a }) => ({
    ...a,
    enabled: args.running,
  }));
  const approvals = detectApprovalActions(args.text).map((a) => ({
    ...a,
    enabled: args.running,
  }));
  return [...fixed, ...approvals];
}

export function inputForAgyAction(actionId: string): string | undefined {
  if (actionId === "agy.approve") return "y\n";
  if (actionId === "agy.deny") return "n\n";
  return AGY_FIXED_ACTIONS.find((a) => a.actionId === actionId)?.input;
}
