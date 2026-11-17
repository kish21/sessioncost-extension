// SessionCost in the editor: a status bar item and a menu. Every number and every change comes from the installed
// SessionCost (run as a separate process); this file only shows its answers and asks before anything changes.
import { existsSync, type FSWatcher, readFileSync, statSync, watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  type Answer,
  lastPath,
  look,
  newStop,
  notReady,
  parseAnswer,
  remember,
  reportPath,
  stopMessage,
} from "./core/answer";
import { menu } from "./core/menu";
import { fixArgs, launch, type Result, run } from "./core/run";
import { newEnough } from "./core/stamp";

const QUICK_MS = 120_000; // a status answer or a switch
const LONG_MS = 900_000; // installing, updating, setup
const EVERY_MS = 60_000; // ask again at least this often while focused (a new chat starts a new log)

let out: vscode.OutputChannel;
let bar: vscode.StatusBarItem;
let ctx: vscode.ExtensionContext;
let answer: Answer | null = null;
let busy = false;
let lastAsk = 0;
let lastSig = "";
let unseen = false;
let again = false; // a new chat showed up while SessionCost was busy answering: ask once more after
const watchers: FSWatcher[] = [];
let watched = "";
const soonTimers: NodeJS.Timeout[] = [];
let installing: Promise<boolean> | null = null;

/** npm/bin/sessioncost.js, shipped in dist/npm: the part of it used here (it also installs SessionCost). */
interface Wrapper {
  where(env?: NodeJS.ProcessEnv): { dir: string; py: string; stamp: string };
  installed(env?: NodeJS.ProcessEnv): boolean;
  VERSION: string;
}
let wrapper: Wrapper;

function env(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SESSIONCOST_NPM_HOME: process.env.SESSIONCOST_NPM_HOME || join(homedir(), ".sessioncost", "editor"),
  };
}

function wrapperFile(): string {
  return join(ctx.extensionPath, "dist", "npm", "bin", "sessioncost.js");
}

function isInstalled(): boolean {
  if (wrapper.installed(env())) return true;
  const w = wrapper.where(env()); // another editor's newer copy is fine: never put an older one back
  try {
    return existsSync(w.py) && newEnough(readFileSync(w.stamp, "utf8"), wrapper.VERSION);
  } catch {
    return false;
  }
}

function folder(): string | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  const f = (active && vscode.workspace.getWorkspaceFolder(active)) || vscode.workspace.workspaceFolders?.[0];
  return f?.uri.scheme === "file" ? f.uri.fsPath : undefined;
}

/** Runs `sessioncost <args>` in this folder; the output goes to the SessionCost output channel. */
async function sc(args: string[], timeoutMs = QUICK_MS, quiet = false): Promise<Result> {
  const w = wrapper.where(env());
  const l = launch(
    { installed: isInstalled(), py: w.py, wrapper: wrapperFile(), node: process.execPath },
    args,
    env(),
  );
  const r = await run(l, folder() ?? homedir(), timeoutMs);
  if (!quiet || r.code !== 0) {
    out.appendLine(`> sessioncost ${args.join(" ")}`);
    if (r.out.trim()) out.appendLine(r.out.trimEnd());
    if (r.err.trim()) out.appendLine(r.err.trimEnd());
    out.appendLine("");
  }
  return r;
}

async function ensureInstalled(ask: boolean): Promise<boolean> {
  if (isInstalled()) return true;
  if (installing) return installing;
  const w = wrapper.where(env());
  const older = existsSync(w.stamp); // an older version from this extension: update it without asking
  if (!older && ask && process.env.SESSIONCOST_EDITOR_AUTO_INSTALL !== "1") {
    const pick = await vscode.window.showInformationMessage(
      `SessionCost ${wrapper.VERSION} is not installed yet. Install it now? It goes into ${w.dir} and needs the internet once.`,
      "Install",
      "Not now",
    );
    if (pick !== "Install") return false;
  }
  installing = (async () => {
    const title = older
      ? `Updating SessionCost to ${wrapper.VERSION}…`
      : `Installing SessionCost ${wrapper.VERSION}…`;
    const r = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title },
      () => sc(["version"], LONG_MS),
    );
    if (r.code !== 0 || !isInstalled()) {
      out.show(true);
      void vscode.window.showErrorMessage(
        "SessionCost could not be installed. The SessionCost output shows why.",
      );
      return false;
    }
    if (!older && process.env.SESSIONCOST_EDITOR_AUTO_INSTALL !== "1") {
      const pick = await vscode.window.showInformationMessage(
        "SessionCost is installed. Set up your agents now? This adds /sessioncost and the guard's hooks to the agents found on this computer.",
        "Set up",
        "Later",
      );
      if (pick === "Set up") await showRun(["setup"], LONG_MS);
    }
    return true;
  })();
  waitBar(); // says "Updating…" / "Installing…" at once, not "Install"
  try {
    return await installing;
  } finally {
    installing = null;
  }
}

/** A new file or folder where chats appear: ask now, and again shortly (its first lines may not be written yet). */
function soon(): void {
  for (const t of soonTimers.splice(0)) clearTimeout(t);
  soonTimers.push(
    setTimeout(() => void refresh(true), 500),
    setTimeout(() => void refresh(true), 5_000),
  );
}

/** Watches the answer's chat folders for new entries, so a new chat shows at once instead of on the timer. */
function follow(a: Answer | null): void {
  const dirs = a?.watch_dirs ?? [];
  if (dirs.join("|") === watched) return;
  unfollow();
  watched = dirs.join("|");
  for (const d of dirs) {
    try {
      const w = watch(d, (event) => event === "rename" && soon()); // "rename": an entry was added or removed
      w.on("error", () => w.close()); // a folder that goes away: the timer still checks
      watchers.push(w);
    } catch {
      // cannot watch here (gone, or not allowed): the timer still checks
    }
  }
}

function unfollow(): void {
  for (const w of watchers.splice(0)) w.close();
  for (const t of soonTimers.splice(0)) clearTimeout(t);
  watched = "";
}

function signature(a: Answer | null): string {
  return [...(a?.watch ?? []), ...(a?.watch_dirs ?? [])]
    .map((f) => {
      try {
        const s = statSync(f);
        return `${s.mtimeMs}:${s.size}`;
      } catch {
        return "-";
      }
    })
    .join("|");
}

function paint(): void {
  if (!answer) return;
  const l = look(answer, unseen);
  bar.text = l.text;
  bar.tooltip = l.tooltip;
  bar.backgroundColor = l.warn ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
  bar.command = "sessioncost.menu";
  bar.show();
}

/** The status bar while SessionCost cannot answer yet: installing, updating, or not there. */
function waitBar(): void {
  const l = notReady(wrapper.VERSION, installing !== null, existsSync(wrapper.where(env()).stamp));
  bar.text = l.text;
  bar.tooltip = l.tooltip;
  bar.command = installing ? undefined : "sessioncost.install";
  bar.backgroundColor = undefined;
  bar.show();
}

/** Asks SessionCost for the status bar's answer. force: even when nothing changed. */
async function refresh(force = false): Promise<void> {
  const here = folder();
  if (busy && force) again = true;
  if (busy || !here) return;
  if (!isInstalled()) {
    waitBar();
    return;
  }
  const sig = signature(answer);
  if (!force && sig === lastSig && Date.now() - lastAsk < EVERY_MS) return;
  busy = true;
  try {
    const r = await sc(["editor", "--json", "--project", here], QUICK_MS, true);
    lastAsk = Date.now();
    let next: Answer;
    try {
      next = parseAnswer(r.out || r.err);
    } catch (e) {
      bar.text = "$(warning) SessionCost";
      bar.tooltip = `${(e as Error).message}\n\nClick for the menu`;
      bar.command = "sessioncost.menu";
      bar.show();
      return;
    }
    const seen = ctx.globalState.get<string[]>("seenStops") ?? [];
    const stop = newStop(seen, next);
    const first = answer === null;
    answer = next;
    lastSig = signature(answer);
    follow(answer);
    if (stop) {
      // read again: another window may have added its own stop meanwhile
      await ctx.globalState.update(
        "seenStops",
        remember(ctx.globalState.get<string[]>("seenStops") ?? [], next),
      );
      if (!first) {
        unseen = true;
        if (vscode.workspace.getConfiguration("sessioncost").get<boolean>("notifyGuard", true)) {
          void vscode.window.showWarningMessage(stopMessage(stop), "Show").then((p) => {
            if (p === "Show") void vscode.commands.executeCommand("sessioncost.guardReport");
          });
        }
      }
    }
    paint();
  } finally {
    busy = false;
    if (again) {
      again = false;
      void refresh(true);
    }
  }
}

async function showRun(args: string[], timeoutMs = QUICK_MS): Promise<Result> {
  out.show(true);
  const r = await sc(args, timeoutMs);
  if (r.code !== 0)
    void vscode.window.showWarningMessage(`sessioncost ${args[0]} did not finish. The output shows why.`);
  return r;
}

function openFile(p: string | null, what: string): void {
  if (p && existsSync(p)) {
    if (p.endsWith(".html")) void vscode.env.openExternal(vscode.Uri.file(p));
    else void vscode.window.showTextDocument(vscode.Uri.file(p), { preview: true });
  } else {
    out.show(true);
    void vscode.window.showWarningMessage(`SessionCost found no ${what}. The output says why.`);
  }
}

function needFolder(): string | undefined {
  const f = folder();
  if (!f)
    void vscode.window.showInformationMessage(
      "SessionCost works on a folder: open your project's folder first.",
    );
  return f;
}

async function switchAndRefresh(args: string[]): Promise<void> {
  const r = await sc(args);
  const line = (r.out || r.err).trim().split(/\r?\n/)[0] ?? "";
  if (line) void vscode.window.showInformationMessage(line);
  await refresh(true);
}

/** Runs fn once SessionCost is installed (asking first, when it is not). */
async function thenRun(fn: () => Promise<unknown>): Promise<void> {
  if (await ensureInstalled(true)) await fn();
}

const commands: Record<string, () => Promise<unknown> | unknown> = {
  "sessioncost.menu": async () => {
    unseen = false;
    paint();
    // one titled line above each group; the hint once, beside the name (as `detail` it showed a second time below)
    const picks: (vscode.QuickPickItem & { command?: string })[] = [];
    let group = "";
    for (const i of menu(answer, vscode.workspace.isTrusted)) {
      if (i.group !== group) picks.push({ label: i.group, kind: vscode.QuickPickItemKind.Separator });
      group = i.group;
      picks.push({ label: i.label, description: i.detail ?? "", command: i.command });
    }
    const pick = await vscode.window.showQuickPick(picks, {
      title: "SessionCost",
      placeHolder: "What would you like to do?",
    });
    if (pick?.command) await vscode.commands.executeCommand(pick.command);
  },
  "sessioncost.install": () => ensureInstalled(false).then(() => refresh(true)),
  "sessioncost.refresh": () => refresh(true),
  "sessioncost.report": async () => {
    const f = needFolder();
    if (!f || !(await ensureInstalled(true))) return;
    const r = await sc(["last", "--project", f, "--brief", "--no-open"]);
    openFile(reportPath(r.out), "chat in this folder to report on");
  },
  "sessioncost.status": async () => {
    const f = needFolder();
    if (f && (await ensureInstalled(true))) await showRun(["last", "--project", f, "--brief", "--no-open"]);
  },
  "sessioncost.fix": async () => {
    const f = needFolder();
    if (!f || !(await ensureInstalled(true))) return;
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showInformationMessage(
        "Fix it changes files in this folder: trust the folder first.",
      );
      return;
    }
    const same = (p: string) => p.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
    const chat = answer && same(answer.project) === same(f) ? answer.chat?.id || undefined : undefined; // the bar's chat
    const preview = await showRun(fixArgs(f, chat, "preview"));
    if (preview.code !== 0) return;
    const pick = await vscode.window.showWarningMessage(
      "Apply the changes shown in the SessionCost output? A backup is kept; Undo puts it back.",
      { modal: true },
      "Apply",
    );
    if (pick === "Apply") await showRun(fixArgs(f, chat, "apply"));
    await refresh(true);
  },
  "sessioncost.undo": async () => {
    const f = needFolder();
    if (!f || !(await ensureInstalled(true)) || !vscode.workspace.isTrusted) return;
    const pick = await vscode.window.showWarningMessage(
      "Put back this folder's newest fix from its backup?",
      { modal: true },
      "Undo",
    );
    if (pick === "Undo") await showRun(["fix", "--project", f, "--undo"]);
  },
  "sessioncost.tipsOn": () => thenRun(() => switchAndRefresh(["fix", "auto", "on"])),
  "sessioncost.tipsOff": () => thenRun(() => switchAndRefresh(["fix", "auto", "off"])),
  "sessioncost.guardOn": () => thenRun(() => switchAndRefresh(["guard", "on"])),
  "sessioncost.guardStrict": () => thenRun(() => switchAndRefresh(["guard", "on", "strict"])),
  "sessioncost.guardOff": async () => {
    if (!(await ensureInstalled(true))) return;
    const pick = await vscode.window.showWarningMessage(
      "Turn the guard off for every chat? Steps are then not checked until you turn it on again.",
      { modal: true },
      "Turn off",
    );
    if (pick === "Turn off") await switchAndRefresh(["guard", "off"]);
  },
  "sessioncost.guardReport": async () => {
    unseen = false;
    paint();
    if (!(await ensureInstalled(true))) return;
    const r = await sc(["guard", "report"]);
    openFile(lastPath(r.out), "guard report");
  },
  "sessioncost.handover": async () => {
    const f = needFolder();
    if (!f || !(await ensureInstalled(true))) return;
    const r = await sc(["fix", "--project", f, "--handover"]);
    openFile(lastPath(r.out), "handover for this folder yet (a long chat gets one from Fix token waste)");
  },
  "sessioncost.prices": () => thenRun(() => showRun(["prices"])),
  "sessioncost.list": async () => {
    const f = needFolder();
    if (f && (await ensureInstalled(true))) await showRun(["list", "--project", f]);
  },
  "sessioncost.setup": () => thenRun(() => showRun(["setup"], LONG_MS)),
  "sessioncost.update": () => thenRun(() => showRun(["update"], LONG_MS)),
  "sessioncost.clean": () => thenRun(() => showRun(["clean"])),
  "sessioncost.serve": async () => {
    const f = needFolder();
    if (!f || !(await ensureInstalled(true))) return;
    const w = wrapper.where(env());
    const l = launch(
      { installed: true, py: w.py, wrapper: wrapperFile(), node: process.execPath },
      ["serve", "--project", f],
      env(),
    );
    const t = vscode.window.createTerminal({
      name: "SessionCost live report",
      shellPath: l.cmd,
      shellArgs: l.args,
      env: l.env,
      cwd: f,
    });
    t.show();
  },
};

export async function activate(context: vscode.ExtensionContext): Promise<{ answer: () => Answer | null }> {
  ctx = context;
  wrapper = require(wrapperFile()) as Wrapper; // the same file that installs and starts SessionCost
  out = vscode.window.createOutputChannel("SessionCost");
  bar = vscode.window.createStatusBarItem("sessioncost.status", vscode.StatusBarAlignment.Right, 100);
  bar.name = "SessionCost";
  context.subscriptions.push(out, bar);
  for (const [id, fn] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  }
  const seconds = () =>
    Math.max(3, vscode.workspace.getConfiguration("sessioncost").get<number>("refreshSeconds", 10));
  let timer = setInterval(() => vscode.window.state.focused && void refresh(), seconds() * 1000);
  context.subscriptions.push(
    { dispose: () => clearInterval(timer) },
    { dispose: unfollow },
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("sessioncost.refreshSeconds")) return;
      clearInterval(timer);
      timer = setInterval(() => vscode.window.state.focused && void refresh(), seconds() * 1000);
    }),
    vscode.window.onDidChangeWindowState((s) => s.focused && void refresh()),
    // several folders in one window: the bar shows the active file's folder, so a file in another folder asks at once
    vscode.window.onDidChangeActiveTextEditor(() => {
      const f = folder();
      if (
        f &&
        answer &&
        f.replace(/\\/g, "/").toLowerCase() !== answer.project.replace(/\\/g, "/").toLowerCase()
      )
        void refresh(true);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => refresh(true)),
  );
  void (async () => {
    if (folder()) await ensureInstalled(true); // asks first, unless an older version from here is updated
    await refresh(true);
  })();
  return { answer: () => answer }; // for the integration tests
}

export function deactivate(): void {}
