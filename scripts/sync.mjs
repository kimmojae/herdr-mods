#!/usr/bin/env node
// Installs a working copy of this repo's packages into a Herdr home, beside the released ones
// people get from GitHub, which it never touches:
//   code-explorer  the mod as code-explorer-test (with its keys)
//   naps           the themes as <name>-test
//   agent-usage   the mod as agent-usage-test (with its ⌘⌥U key)
// All when none is named. Then one layout, herdr-mods-test, puts together whatever is installed:
// naps, in its -test themes if they're there, with code-explorer-test in Files and agent-usage-test
// (or a released agent-usage) beside workspace-status. Copies, not links: Herdr won't load icons
// through a link. Runs `herdr-app check` on each mod's copy. --clean removes the named
// packages' copies again, and the layout follows.
// Usage: node scripts/sync.mjs [--home <dir>] [--no-check] [--dry-run] [--clean] [code-explorer] [naps] [agent-usage]
import { readdir, readFile, writeFile, mkdir, cp, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const copyOf = (mod) => `${mod}-test`;

// naps's status block, replaced by a row: workspace-status and the mod beside it.
function withStatusRow(node, mod) {
  if (node?.id === "status") return { id: "status-row", type: "row", size: { px: 28 }, resizable: false, children: [
    { id: "status", type: "block", size: { weight: 1 }, content: { mod: "workspace-status" } },
    { id: "agent-usage", type: "block", size: { px: 160 }, content: { mod } }] };
  return node?.children ? { ...node, children: node.children.map((c) => withStatusRow(c, mod)) } : node;
}

// The mod packages, and whether a copy's global keys come along (code-explorer's stay with the
// released mod).
const MODS = { "code-explorer": { globals: false }, "agent-usage": { globals: true } };
const LAYOUT = "herdr-mods-test";
// The per-package test layouts this script made before there was one.
const OLD_LAYOUTS = ["code-explorer-test", "usage-test", "naps-test"];
const PACKAGES = ["code-explorer", "naps", "agent-usage"];
const test = (n) => n.replace(/\.json$/, "-test.json");
// Herdr writes these into a mod folder itself; the cache is the mod's runtime state.
const KEEP = (rel) => /^\.?cache(\/|$)/.test(rel) || rel.endsWith(".d.ts") || rel === "jsconfig.json";

function args(argv) {
  const out = { home: process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app"), check: true, dry: false, clean: false, packages: new Set() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--home") out.home = argv[++i];
    else if (argv[i] === "--no-check") out.check = false;
    else if (argv[i] === "--dry-run") out.dry = true;
    else if (argv[i] === "--clean") out.clean = true;
    else if (PACKAGES.includes(argv[i])) out.packages.add(argv[i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!out.packages.size) out.packages = new Set(PACKAGES);
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

async function syncMod(home, dry, MOD) {
  const COPY = copyOf(MOD);
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

const napsFiles = async (sub) => (await exists(join(ROOT, "naps", sub))) ? (await readdir(join(ROOT, "naps", sub))).filter((n) => !n.startsWith(".")) : [];

// naps's themes as <name>-test.
async function syncNaps(home, dry) {
  const themes = await napsFiles("themes");
  if (!dry) {
    await mkdir(join(home, "themes"), { recursive: true });
    for (const n of themes) await cp(join(ROOT, "naps/themes", n), join(home, "themes", test(n)), { force: true });
  }
  console.log(`naps/themes: ${themes.map(test).join(", ")}`);
}

// One layout with every working copy that is installed: naps, its Naps themes as their -test
// copies, code-explorer-test in Files, agent-usage-test (else a released agent-usage) in the status row.
// With no copy and no -test theme left, there is nothing to try out: the layout goes.
async function testLayout(home, dry) {
  const file = join(home, "layouts", `${LAYOUT}.json`);
  for (const old of OLD_LAYOUTS) {
    if (!(await exists(join(home, "layouts", `${old}.json`)))) continue;
    if (!dry) await rm(join(home, "layouts", `${old}.json`));
    console.log(`removed layouts/${old}.json`);
  }
  const has = (rel) => exists(join(home, rel));
  const files = await has(`mods/${copyOf("code-explorer")}`);
  const usage = (await has(`mods/${copyOf("agent-usage")}`)) ? copyOf("agent-usage") : (await has("mods/agent-usage")) ? "agent-usage" : null;
  const layout = JSON.parse(await readFile(join(ROOT, "naps/layouts/naps.json"), "utf8"));
  let themed = false;
  for (const mode of ["light", "dark"]) {
    const name = layout.theme?.[mode];
    if (name && (await has(`themes/${name}-test.json`))) { layout.theme[mode] = `${name}-test`; themed = true; }
  }
  if (!files && usage !== copyOf("agent-usage") && !themed) {
    if (await exists(file)) { if (!dry) await rm(file); console.log(`removed layouts/${LAYOUT}.json`); }
    return;
  }
  let text = JSON.stringify(usage ? withStatusRow(layout, usage) : layout, null, 2) + "\n";
  if (files) text = text.replace(/"mod": "files"/g, `"mod": "${copyOf("code-explorer")}"`);
  if (!dry) {
    await mkdir(join(home, "layouts"), { recursive: true });
    await writeFile(file, text);
  }
  console.log(`layout: ${LAYOUT}.json`);
}

// The copy's own keys (mod:<copy>, and for agent-usage its global ⌘⌥U) in the person's keys.json.
// `add` false takes them out again; a global key is removed only while it still points at the copy.
async function devKeys(home, dry, add, MOD) {
  const COPY = copyOf(MOD);
  const file = join(home, "keys.json");
  const keys = (await exists(file)) ? JSON.parse(await readFile(file, "utf8")) : {};
  const own = JSON.parse(await readFile(join(ROOT, MOD, "keys.json"), "utf8"));
  const rename = (a) => a.replace(`${MOD}.`, `${COPY}.`);
  const section = `mod:${COPY}`;
  const globals = MODS[MOD].globals ? Object.entries(own.global ?? {}).map(([k, a]) => [k, rename(a)]) : [];
  let changed = false;
  if (add) {
    if (own[`mod:${MOD}`]) { keys[section] = Object.fromEntries(Object.entries(own[`mod:${MOD}`]).map(([k, a]) => [k, rename(a)])); changed = true; }
    // A chord the person already uses for something else (the released mod too) stays theirs.
    for (const [k, a] of globals) {
      const now = keys.global?.[k];
      if (now === a) continue;
      if (now !== undefined) { console.log(`keys.json: ${k} is taken (${now}); ${a} gets no key`); continue; }
      keys.global = { ...keys.global, [k]: a };
      changed = true;
    }
  } else {
    if (section in keys) { delete keys[section]; changed = true; }
    for (const [k, a] of globals) if (keys.global?.[k] === a) { delete keys.global[k]; changed = true; }
  }
  if (!changed) return;
  if (!dry) await writeFile(file, JSON.stringify(keys, null, 2) + "\n");
  console.log(`keys.json: ${add ? "added" : "removed"} ${COPY}'s keys`);
}

async function clean(home, dry, packages) {
  const gone = [];
  for (const MOD of Object.keys(MODS)) if (packages.has(MOD)) gone.push(join("mods", copyOf(MOD)));
  if (packages.has("naps")) for (const n of await napsFiles("themes")) gone.push(join("themes", test(n)));
  for (const rel of gone) {
    if (!(await exists(join(home, rel)))) continue;
    if (!dry) await rm(join(home, rel), { recursive: true });
    console.log(`removed ${rel}`);
  }
  for (const MOD of Object.keys(MODS)) if (packages.has(MOD)) await devKeys(home, dry, false, MOD);
  await testLayout(home, dry);
}

const opts = args(process.argv.slice(2));
if (opts.dry) console.log("(dry run: nothing is written)");
if (opts.clean) {
  await clean(opts.home, opts.dry, opts.packages);
  process.exit(0);
}
if (opts.packages.has("naps")) await syncNaps(opts.home, opts.dry);
for (const MOD of Object.keys(MODS)) {
  if (!opts.packages.has(MOD)) continue;
  const modDir = await syncMod(opts.home, opts.dry, MOD);
  await devKeys(opts.home, opts.dry, true, MOD);
  if (!opts.check || opts.dry) continue;
  try {
    const { stdout } = await promisify(execFile)("herdr-app", ["check", modDir]);
    console.log(stdout.trim());
  } catch (e) {
    console.error((e.stdout || "") + (e.stderr || e.message));
    process.exit(1);
  }
}
await testLayout(opts.home, opts.dry);
