// Bundles the extension, and puts next to it the npm wrapper that installs and starts SessionCost (npm/ in this
// repo, unchanged), the app icon and the license. Usage: node scripts/build.mjs [--watch] [--tests]
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { glob } from "node:fs/promises";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const tests = process.argv.includes("--tests");
const common = {
  bundle: true,
  minify: !watch && !tests,
  sourcemap: watch || tests,
  logLevel: "info",
  target: "es2022",
  platform: "node",
  format: "cjs",
};

const builds = [
  { ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", external: ["vscode"] },
];
if (tests) {
  const entryPoints = [];
  for await (const f of glob("tests/integration/**/*.test.ts")) entryPoints.push(f);
  builds.push({
    ...common,
    entryPoints,
    outdir: "dist/tests",
    outbase: "tests/integration",
    external: ["vscode", "mocha"],
  });
}

// Inside the SessionCost repo the wrapper, icon and license are taken from it; the public extension repo
// (tools/publish_editor.py) carries copies of them: npm/, media/icon.png, LICENSE.
const inTree = existsSync("../npm/bin/sessioncost.js");
const npm = inTree ? "../npm" : "npm";
if (inTree) {
  mkdirSync("media", { recursive: true });
  copyFileSync("../.claude-plugin/icon.png", "media/icon.png");
  copyFileSync("../LICENSE", "LICENSE");
}
// the wrapper runs as its own process (installing can take minutes); it reads its version from ../package.json
mkdirSync("dist/npm/bin", { recursive: true });
copyFileSync(`${npm}/bin/sessioncost.js`, "dist/npm/bin/sessioncost.js");
copyFileSync(`${npm}/package.json`, "dist/npm/package.json");

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
