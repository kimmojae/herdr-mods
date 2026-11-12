#!/usr/bin/env node
// Installs a working copy of this repo's packages into a Herdr home, beside the released ones
// people get from GitHub: the mod as code-explorer-test (with its keys), layouts as <name>-test,
// and a code-explorer-test layout (naps with the copy in its Files panel). Copies, not links:
// Herdr won't load icons through a link. Runs `herdr-app check` on the copy.
// --clean removes all of that again; themes stay, as the released naps uses them too.
// Usage: node scripts/sync.mjs [--home <dir>] [--no-check] [--dry-run] [--clean]
import { readdir, readFile, writeFile, mkdir, cp, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MOD = "code-explorer", COPY = `${MOD}-test`;
const test = (n) => n.replace(/\.json$/, "-test.json");
// Herdr writes these into a mod folder itself; the cache is the mod's runtime state.
const KEEP = (rel) => /^\.?cache(\/|$)/.test(rel) || rel.endsWith(".d.ts") || rel === "jsconfig.json";

function args(argv) {
  const out = { home: process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app"), check: true, dry: false, clean: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--home") out.home = argv[++i];
    else if (argv[i] === "--no-check") out.check = false;
    else if (argv[i] === "--dry-run") out.dry = true;
    else if (argv[i] === "--clean") out.clean = true;
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
  const from = join(ROOT, MOD, "mods", MOD), to = join(home, "mods", COPY);
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
    const name = join(to, "lib/name.js");
    await writeFile(name, (await readFile(name, "utf8")).replace(`NAME = "${MOD}"`, `NAME = "${COPY}"`));
  }
  console.log(`${COPY}: ${wanted.size} files${removed ? `, ${removed} removed` : ""} → ${to}`);
  return to;
}

// `rename` maps a repo file name to the installed one.
async function syncFolder(home, sub, dry, rename = (n) => n) {
  const from = join(ROOT, "naps", sub);
  if (!(await exists(from))) return [];
  const names = (await readdir(from)).filter((n) => !n.startsWith("."));
  if (!dry) {
    await mkdir(join(home, sub), { recursive: true });
    for (const n of names) await cp(join(from, n), join(home, sub, rename(n)), { force: true });
  }
  console.log(`naps/${sub}: ${names.map(rename).join(", ")}`);
  return names;
}

// naps with the copy in its Files panel, where the mod is tried out.
async function devLayout(home, dry) {
  const text = await readFile(join(ROOT, "naps/layouts/naps.json"), "utf8");
  if (!dry) await writeFile(join(home, "layouts", `${COPY}.json`), text.replace(/"mod": "files"/g, `"mod": "${COPY}"`));
  console.log(`layout: ${COPY}.json`);
}

// The copy's own keys (mod:code-explorer-test) in the person's keys.json; global keys stay with the
// released mod. `add` false takes them out again.
async function devKeys(home, dry, add) {
  const file = join(home, "keys.json");
  const keys = (await exists(file)) ? JSON.parse(await readFile(file, "utf8")) : {};
  const section = `mod:${COPY}`;
  if (add) {
    const own = JSON.parse(await readFile(join(ROOT, MOD, "keys.json"), "utf8"))[`mod:${MOD}`] ?? {};
    keys[section] = Object.fromEntries(Object.entries(own).map(([k, a]) => [k, a.replace(`${MOD}.`, `${COPY}.`)]));
  } else if (section in keys) delete keys[section];
  else return;
  if (!dry) await writeFile(file, JSON.stringify(keys, null, 2) + "\n");
  console.log(`keys.json: ${add ? "added" : "removed"} ${section}`);
}

async function clean(home, dry) {
  const layouts = (await exists(join(ROOT, "naps/layouts"))) ? await readdir(join(ROOT, "naps/layouts")) : [];
  const gone = [join("mods", COPY), join("layouts", `${COPY}.json`), ...layouts.map((n) => join("layouts", test(n)))];
  for (const rel of gone) {
    if (!(await exists(join(home, rel)))) continue;
    if (!dry) await rm(join(home, rel), { recursive: true });
    console.log(`removed ${rel}`);
  }
  await devKeys(home, dry, false);
}

const opts = args(process.argv.slice(2));
if (opts.dry) console.log("(dry run: nothing is written)");
if (opts.clean) {
  await clean(opts.home, opts.dry);
  process.exit(0);
}
const modDir = await syncMod(opts.home, opts.dry);
await syncFolder(opts.home, "themes", opts.dry);
await syncFolder(opts.home, "layouts", opts.dry, test);
await devLayout(opts.home, opts.dry);
await devKeys(opts.home, opts.dry, true);
if (opts.check && !opts.dry) {
  try {
    const { stdout } = await promisify(execFile)("herdr-app", ["check", modDir]);
    console.log(stdout.trim());
  } catch (e) {
    console.error((e.stdout || "") + (e.stderr || e.message));
    process.exit(1);
  }
}
