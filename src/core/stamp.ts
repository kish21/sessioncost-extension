// Every editor shares one SessionCost copy (~/.sessioncost/editor). Its stamp starts with the version in it. An
// extension accepts that version or a newer one, so two editors with different extension versions never take turns
// re-installing it (and never put an older SessionCost back under the guard's hooks). No vscode import.

function parts(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** stamp: the text of installed.txt ("1.2.1 sessioncost==1.2.1"). True when it holds `version` or newer. */
export function newEnough(stamp: string, version: string): boolean {
  const have = parts(stamp.trim().split(/\s+/)[0] ?? "");
  const want = parts(version);
  if (!have || !want) return false;
  for (let i = 0; i < 3; i++) {
    const h = have[i] ?? 0;
    const w = want[i] ?? 0;
    if (h !== w) return h > w;
  }
  return true;
}
