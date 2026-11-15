// Refuses to continue when a store token is missing or still the .env.example placeholder. No override flag.
// Usage: node scripts/env-guard.mjs VAR [VAR...]   (reads process.env, then .env if present)
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const HOW_TO_GENERATE = {
  VSCE_PAT: "dev.azure.com → User settings → Personal access tokens → scope 'Marketplace (Manage)'",
  OVSX_PAT: "open-vsx.org → sign in with GitHub → Settings → Access Tokens",
};

export function placeholderFor(name) {
  return `CHANGE_ME__${name}__CHANGE_ME`;
}

export function parseDotenv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

/** A list of problems; empty means every variable is usable. */
export function checkEnv(names, env) {
  const problems = [];
  for (const name of names) {
    const value = env[name];
    const how = HOW_TO_GENERATE[name] ?? "see .env.example";
    if (!value) problems.push(`${name} is not set. Generate one: ${how}`);
    else if (value.includes("CHANGE_ME__"))
      problems.push(`${name} is still the .env.example placeholder. Generate a real one: ${how}`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const fileEnv = existsSync(".env") ? parseDotenv(readFileSync(".env", "utf8")) : {};
  const problems = checkEnv(process.argv.slice(2), { ...fileEnv, ...process.env });
  if (problems.length) {
    for (const p of problems) console.error(`env-guard: REFUSED — ${p}`);
    process.exit(1);
  }
  console.log(`env-guard: ok (${process.argv.slice(2).join(", ")})`);
}
