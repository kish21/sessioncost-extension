// Starting SessionCost as a separate process: how (installed: its own Python; else the npm wrapper, which installs
// it first) and with a time limit. No vscode import.
import { spawn } from "node:child_process";

export interface Launch {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface Where {
  installed: boolean;
  py: string; // the private environment's Python
  wrapper: string; // npm/bin/sessioncost.js next to the extension
  node: string; // the editor's own Node (its executable, run as Node)
}

/** Installed: the environment's Python runs `-m sessioncost` (fast). Not yet: the wrapper installs, then runs it. */
export function launch(w: Where, args: string[], env: NodeJS.ProcessEnv): Launch {
  const base = { ...env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };
  if (w.installed) return { cmd: w.py, args: ["-m", "sessioncost", ...args], env: base };
  return { cmd: w.node, args: [w.wrapper, ...args], env: { ...base, ELECTRON_RUN_AS_NODE: "1" } };
}

/** `sessioncost fix` for the preview and for the apply. Both name the same chat (the one the status bar shows):
 * "the newest chat" twice could be two chats, and the second one's changes would be applied without being shown. */
export function fixArgs(project: string, chat: string | undefined, step: "preview" | "apply"): string[] {
  return ["fix", ...(chat ? [chat] : []), "--project", project, step === "preview" ? "--preview" : "--yes"];
}

/** What to do right after installing or upgrading the editor's SessionCost copy:
 * - upgrade (`older`): refresh already-configured agents in the background so skills and hooks match the new version
 * - fresh install: ask the user whether to run `setup` (unless auto-install is set for tests). */
export function postInstallAction(older: boolean, autoInstall: boolean): "refresh" | "ask-setup" | "none" {
  if (older) return "refresh";
  return autoInstall ? "none" : "ask-setup";
}

/** Refreshes existing agent skills and guard hooks without touching unconfigured agents. */
export function refreshArgs(): string[] {
  return ["setup", "--refresh"];
}

/** Runs `sessioncost uninstall --yes` after the editor's own modal confirmation. */
export function uninstallArgs(): string[] {
  return ["uninstall", "--yes"];
}

export interface Result {
  code: number; // -1: could not start, or stopped after the time limit
  out: string;
  err: string;
}

type Spawn = typeof spawn;

/** Runs it and collects its output; never throws. After timeoutMs it is stopped and the result says so. */
export function run(l: Launch, cwd: string, timeoutMs: number, start: Spawn = spawn): Promise<Result> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let done = false;
    const finish = (r: Result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    let child: ReturnType<Spawn>;
    try {
      child = start(l.cmd, l.args, { cwd, env: l.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      resolve({ code: -1, out: "", err: `SessionCost could not start: ${(e as Error).message}` });
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      finish({
        code: -1,
        out,
        err: `${err}\nSessionCost did not finish within ${Math.round(timeoutMs / 1000)} s.`.trim(),
      });
    }, timeoutMs);
    child.stdout?.setEncoding("utf8").on("data", (d: string) => {
      out += d;
    });
    child.stderr?.setEncoding("utf8").on("data", (d: string) => {
      err += d;
    });
    child.on("error", (e) => finish({ code: -1, out, err: `SessionCost could not start: ${e.message}` }));
    child.on("close", (code) => finish({ code: code ?? -1, out, err }));
  });
}
