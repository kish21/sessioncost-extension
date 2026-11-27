// `sessioncost editor --json`: its answer, and how the status bar says it. No vscode import (tested in plain Node).

export const SCHEMA = 1;
/** Context fullness (%) at which the status bar turns amber and suggests a handover. */
export const CONTEXT_WARN_PCT = 75;

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
  /** Latest main-call context size in tokens, handover limit, and fullness %. Older SessionCost: omitted. */
  context?: number;
  context_limit?: number;
  context_pct?: number;
  guard: { checked: number; blocked: number; asked: number; intact: boolean } | null;
  last_stop: Stop | null;
  last_tip: string;
}

export interface Setup {
  ok: boolean;
  detected: string[];
  missing: string[];
  outdated: string[];
}

export interface Answer {
  schema: number;
  version: string;
  project: string;
  guard: { on: boolean; strict: boolean; dir: string };
  tips: { on: boolean };
  /** Agent setup status (missing skills/hooks or outdated skill versions). Older SessionCost: omitted. */
  setup?: Setup;
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

/** Copilot and Cursor drop prompt-hook context, so mid-chat tips surface here in the status bar instead of in chat. */
export function isStatusBarTipAgent(agent: string): boolean {
  return agent === "cursor" || agent === "copilot" || agent === "copilot-vscode";
}

/** What the status bar shows. unseen: a stop the user has not looked at yet (the item turns amber).
 * unseenTip: a new token tip the user has not seen yet (adds a 💡 indicator without turning the bar amber). */
export function look(a: Answer, unseen: boolean, unseenTip = false): Look {
  const guard = a.guard.on ? `Guard on${a.guard.strict ? " (strict)" : ""}` : "Guard off";
  const c = a.chat;
  const name = c ? shortTitle(c.title) : "";
  const tip = c?.last_tip?.trim() ?? "";
  const hasUnseenTip = Boolean(unseenTip && tip);
  const ctxPct = c?.context_pct && c.context_pct > 0 ? Math.min(100, Math.round(c.context_pct)) : 0;
  const contextWarn = ctxPct >= CONTEXT_WARN_PCT;
  const missing = a.setup?.missing ?? [];
  const outdated = a.setup?.outdated ?? [];
  const needsSetup = Boolean(a.setup && !a.setup.ok);
  const text = needsSetup
    ? missing.length > 0
      ? "$(warning) SessionCost: Setup incomplete"
      : "$(warning) SessionCost: Update setup"
    : `$(shield) ${guard} · ${c ? `${name ? `${name} · ` : ""}${tokens(c.sent)} tokens · ${money(c.usd)}${ctxPct > 0 ? ` · context ${ctxPct}%` : ""}` : "no chat yet"}${hasUnseenTip ? " · 💡" : ""}`;
  const lines = [`SessionCost ${a.version}`, ""];
  if (needsSetup) {
    if (missing.length > 0) lines.push(`Setup incomplete (missing skills or hooks): ${missing.join(", ")}`);
    if (outdated.length > 0) lines.push(`Outdated skills (update needed): ${outdated.join(", ")}`);
    lines.push("Run 'Set up your agents' from the menu to fix.", "");
  }
  if (c) {
    lines.push(`Newest chat here (${c.agent_label}): ${c.title}`);
    lines.push(
      `${tokens(c.sent)} tokens sent${c.tokens_exact ? "" : " (estimated)"} · about ${money(c.usd)} at API prices, not your bill`,
    );
    if (ctxPct > 0) {
      const span =
        c.context && c.context_limit
          ? `${tokens(c.context)} / ${tokens(c.context_limit)} (${ctxPct}%)`
          : `${ctxPct}%`;
      lines.push(
        contextWarn
          ? `Context: ${span} — near handover limit; write a handover and start a fresh chat`
          : `Context: ${span}`,
      );
    }
    if (c.guard)
      lines.push(
        `Guard in this chat: ${c.guard.checked} steps checked, ${c.guard.blocked} stopped, ${c.guard.asked} asked you` +
          (c.guard.intact ? "" : " · its log was changed or cut off"),
      );
    if (c.last_stop)
      lines.push(`Last ${c.last_stop.decision === "blocked" ? "stop" : "question"}: ${c.last_stop.why}`);
    if (tip) {
      lines.push(`${hasUnseenTip ? "💡 New token tip" : "💡 Token tip"}: ${tip}`);
      if (isStatusBarTipAgent(c.agent)) {
        lines.push(
          `Mid-chat tips for ${c.agent_label || "Copilot/Cursor"} appear here in the status bar. Open the menu and run Fix token waste to apply.`,
        );
      } else {
        lines.push("Open the menu and run Fix token waste to apply.");
      }
    }
  } else {
    lines.push("No chat of Claude Code, Codex, Copilot, Antigravity or Cursor in this folder yet.");
  }
  lines.push(`Guard: ${a.guard.on ? "on" : "off"} · Token tips: ${a.tips.on ? "on" : "off"}`);
  if (a.error) lines.push(`Note: ${a.error}`);
  lines.push(
    "",
    needsSetup
      ? "Click to set up your agents"
      : hasUnseenTip
        ? "Click to open the menu and run Fix token waste"
        : "Click for the menu",
  );
  return { text, tooltip: lines.join("\n"), warn: unseen || needsSetup || contextWarn };
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

/** The token tip to highlight: the chat's newest one, when it was not seen before. */
export function newTip(seen: readonly string[], a: Answer): string | null {
  const t = a.chat?.last_tip?.trim();
  if (!t) return null;
  return seen.includes(tipKey(a) ?? "") ? null : t;
}

/** seen, with this answer's tip added; the newest 100 are kept. */
export function rememberTip(seen: readonly string[], a: Answer): string[] {
  const k = tipKey(a);
  return k && !seen.includes(k) ? [...seen, k].slice(-100) : [...seen];
}

export function tipKey(a: Answer | null): string | undefined {
  const t = a?.chat?.last_tip?.trim();
  return t && a?.chat ? `${a.chat.id} ${t}` : undefined;
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
