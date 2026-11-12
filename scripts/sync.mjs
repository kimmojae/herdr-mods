#!/usr/bin/env node
// Installs this repo's packages into a Herdr home (copies, not links: Herdr won't load icons
// through a link) and runs `herdr-app check` on the mod.
// Usage: node scripts/sync.mjs [--home <dir>] [--no-check] [--dry-run]
import { readdir, mkdir, cp, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MOD = "code-explorer";
// Herdr writes these into a mod folder itself; the cache is the mod's runtime state.
const KEEP = (rel) => /^\.?cache(\/|$)/.test(rel) || rel.endsWith(".d.ts") || rel === "jsconfig.json";

function args(argv) {
  const out = { home: process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app"), check: true, dry: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--home") out.home = argv[++i];
    else if (argv[i] === "--no-check") out.check = false;
    else if (argv[i] === "--dry-run") out.dry = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

const exists = (p) => stat(p).then(() => true, () => false);

async function files(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(p, base)));
    else out.push(relative(base, p));
  }
  return out;
}

async function syncMod(home, dry) {
  const from = join(ROOT, MOD, "mods", MOD), to = join(home, "mods", MOD);
  const wanted = new Set(await files(from));
  let removed = 0;
  if (await exists(to)) {
    for (const rel of await files(to)) {
      if (wanted.has(rel) || KEEP(rel)) continue;
      removed++;
      if (!dry) await rm(join(to, rel));
    }
  }
  if (!dry) {
    await mkdir(to, { recursive: true });
    await cp(from, to, { recursive: true, force: true });
  }
  console.log(`${MOD}: ${wanted.size} files${removed ? `, ${removed} removed` : ""} → ${to}`);
  return to;
}

// `rename` maps a repo file name to the installed one.
async function syncFolder(home, sub, dry, rename = (n) => n) {
  const from = join(ROOT, "naps", sub);
  if (!(await exists(from))) return;
  const names = (await readdir(from)).filter((n) => !n.startsWith("."));
  if (!dry) {
    await mkdir(join(home, sub), { recursive: true });
    for (const n of names) await cp(join(from, n), join(home, sub, rename(n)), { force: true });
  }
  console.log(`naps/${sub}: ${names.map(rename).join(", ")}`);
}

const opts = args(process.argv.slice(2));
if (opts.dry) console.log("(dry run: nothing is written)");
const modDir = await syncMod(opts.home, opts.dry);
await syncFolder(opts.home, "themes", opts.dry);
// Layouts go in as <name>-test: the working copy, beside a released <name> installed from GitHub.
await syncFolder(opts.home, "layouts", opts.dry, (n) => n.replace(/\.json$/, "-test.json"));
if (opts.check && !opts.dry) {
  try {
    const { stdout } = await promisify(execFile)("herdr-app", ["check", modDir]);
    console.log(stdout.trim());
  } catch (e) {
    console.error((e.stdout || "") + (e.stderr || e.message));
    process.exit(1);
  }
}
