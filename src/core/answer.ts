// `sessioncost editor --json`: its answer, and how the status bar says it. No vscode import (tested in plain Node).

export const SCHEMA = 1;

export interface Stop {
  ts: string;
  decision: "blocked" | "asked";
  what: string;
  why: string;
}

export interface Chat {
  id: string;
  agent: string;
  agent_label: string;
  title: string;
  log: string;
  sent: number;
  usd: number;
  tokens_exact: boolean;
  guard: { checked: number; blocked: number; asked: number; intact: boolean } | null;
  last_stop: Stop | null;
  last_tip: string;
}

export interface Answer {
  schema: number;
  version: string;
  project: string;
  guard: { on: boolean; strict: boolean; dir: string };
  tips: { on: boolean };
  chat: Chat | null;
  handover: string | null;
  watch: string[];
  error?: string;
}

/** The answer, or an Error that says in plain words what was wrong with it. */
export function parseAnswer(text: string): Answer {
  const line = text
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  if (!line)
    throw new Error(`SessionCost gave no answer${text.trim() ? `: ${text.trim().slice(0, 300)}` : ""}`);
  let a: Answer;
  try {
    a = JSON.parse(line) as Answer;
  } catch {
    throw new Error(`SessionCost's answer could not be read: ${line.slice(0, 200)}`);
  }
  if (a.schema !== SCHEMA)
    throw new Error(
      `This SessionCost (${a.version ?? "unknown"}) answers in another form than this extension reads; update both.`,
    );
  return a;
}

export function tokens(n: number): string {
  if (n >= 999_500) return `${(n / 1e6).toFixed(1)}M`;
  return n >= 1000 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`;
}

export function money(x: number): string {
  return x >= 0.995 || x === 0 ? `$${x.toFixed(2)}` : `$${x.toFixed(3)}`;
}

export interface Look {
  text: string;
  tooltip: string;
  warn: boolean;
}

/** What the status bar shows. unseen: a stop the user has not looked at yet (the item turns amber). */
export function look(a: Answer, unseen: boolean): Look {
  const guard = a.guard.on ? `Guard on${a.guard.strict ? " (strict)" : ""}` : "Guard off";
  const c = a.chat;
  const text = `$(shield) ${guard} · ${c ? `${tokens(c.sent)} tokens · ${money(c.usd)}` : "no chat yet"}`;
  const lines = [`SessionCost ${a.version}`, ""];
  if (c) {
    lines.push(`Newest chat here (${c.agent_label}): ${c.title}`);
    lines.push(
      `${tokens(c.sent)} tokens sent${c.tokens_exact ? "" : " (estimated)"} · about ${money(c.usd)} at API prices, not your bill`,
    );
    if (c.guard)
      lines.push(
        `Guard in this chat: ${c.guard.checked} steps checked, ${c.guard.blocked} stopped, ${c.guard.asked} asked you` +
          (c.guard.intact ? "" : " · its log was changed or cut off"),
      );
    if (c.last_stop)
      lines.push(`Last ${c.last_stop.decision === "blocked" ? "stop" : "question"}: ${c.last_stop.why}`);
    if (c.last_tip) lines.push(`Last token tip: ${c.last_tip}`);
  } else {
    lines.push("No chat of Claude Code, Codex, Copilot, Antigravity or Cursor in this folder yet.");
  }
  lines.push(`Guard: ${a.guard.on ? "on" : "off"} · Token tips: ${a.tips.on ? "on" : "off"}`);
  if (a.error) lines.push(`Note: ${a.error}`);
  lines.push("", "Click for the menu");
  return { text, tooltip: lines.join("\n"), warn: unseen };
}

/** The stop to tell the user about: the chat's newest one, when it is not the one seen before. */
export function newStop(seen: string | undefined, a: Answer): Stop | null {
  const s = a.chat?.last_stop;
  if (!s) return null;
  return stopKey(a) === seen ? null : s;
}

export function stopKey(a: Answer | null): string | undefined {
  const s = a?.chat?.last_stop;
  return s && a?.chat ? `${a.chat.id} ${s.ts} ${s.decision}` : undefined;
}

export function stopMessage(s: Stop): string {
  const what = s.what.length > 80 ? `${s.what.slice(0, 79)}…` : s.what;
  return s.decision === "blocked"
    ? `SessionCost guard stopped a step: ${s.why}${what ? ` (${what})` : ""}`
    : `SessionCost guard asked you about a step: ${s.why}${what ? ` (${what})` : ""}`;
}

/** The report's path from `sessioncost last --brief` (its "Report: <path>" line), or null. */
export function reportPath(out: string): string | null {
  const line = out
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith("Report: "));
  return line ? line.slice("Report: ".length).trim() : null;
}

/** The file path that ends the last line, alone (`fix --handover`) or after ": " (`guard report`), or null. */
export function lastPath(out: string): string | null {
  const line = out.trim().split(/\r?\n/).pop()?.trim() ?? "";
  return line.match(/(?:^|: )((?:[A-Za-z]:[\\/]|\/)[^\n]*)$/)?.[1] ?? null;
}
