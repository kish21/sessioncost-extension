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
  /** Folders where a new chat of this folder appears; a new entry there means "ask again". Older SessionCost: none. */
  watch_dirs?: string[];
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

/** The chat's name for the status bar: at most 24 letters, cut at a word when it can be. */
export function shortTitle(title: string, max = 24): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
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
  const name = c ? shortTitle(c.title) : "";
  const text = `$(shield) ${guard} · ${c ? `${name ? `${name} · ` : ""}${tokens(c.sent)} tokens · ${money(c.usd)}` : "no chat yet"}`;
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

/** The status bar before SessionCost can answer. running: an install or update is under way now. older: an older
 * copy from this extension is there (so it is an update, not a first install). */
export function notReady(version: string, running: boolean, older: boolean): Look {
  if (running)
    return older
      ? {
          text: "$(sync~spin) Updating SessionCost…",
          tooltip: `SessionCost is updating to ${version}. Your chat's numbers come back when it is done.`,
          warn: false,
        }
      : {
          text: "$(sync~spin) Installing SessionCost…",
          tooltip: `SessionCost ${version} is being installed. The numbers show when it is done.`,
          warn: false,
        };
  return older
    ? {
        text: "$(cloud-download) Update SessionCost",
        tooltip: `An older SessionCost is here. Click to update it to ${version}.`,
        warn: false,
      }
    : {
        text: "$(cloud-download) Install SessionCost",
        tooltip: `SessionCost ${version} is not installed yet. Click to install it.`,
        warn: false,
      };
}

/** The stop to tell the user about: the chat's newest one, when it was not shown before. seen: the stops already
 * shown, in any window (they share it), so one window's stop never makes another's show again. */
export function newStop(seen: readonly string[], a: Answer): Stop | null {
  const s = a.chat?.last_stop;
  if (!s) return null;
  return seen.includes(stopKey(a) ?? "") ? null : s;
}

/** seen, with this answer's stop added; the newest 100 are kept. */
export function remember(seen: readonly string[], a: Answer): string[] {
  const k = stopKey(a);
  return k && !seen.includes(k) ? [...seen, k].slice(-100) : [...seen];
}

export function stopKey(a: Answer | null): string | undefined {
  const s = a?.chat?.last_stop;
  return s && a?.chat ? `${a.chat.id} ${s.ts} ${s.decision}` : undefined;
}

/** Told after the fact: the step already ran or did not; nothing is waiting for an answer here. An ask never claims
 * it was answered: another check (the project's own hook) can stop the step before the question reaches the user. */
export function stopMessage(s: Stop): string {
  const what = s.what.length > 80 ? `${s.what.slice(0, 79)}…` : s.what;
  const at = /T(\d\d:\d\d)/.exec(s.ts)?.[1];
  const step = `${s.why}${what ? ` (${what})` : ""}`;
  return s.decision === "blocked"
    ? `${at ? `At ${at} the` : "The"} SessionCost guard stopped a step; it did not run: ${step}`
    : `${at ? `At ${at} the` : "The"} SessionCost guard wanted your yes before a step: ${step}. ` +
        "If you saw no question, another check stopped the step first and it did not run.";
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
