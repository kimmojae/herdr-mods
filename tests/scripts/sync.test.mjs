import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const script = fileURLToPath(new URL("../../scripts/sync.mjs", import.meta.url));
const run = (...args) => promisify(execFile)(process.execPath, [script, ...args]);
const exists = (p) => access(p).then(() => true, () => false);
const json = async (p) => JSON.parse(await readFile(p, "utf8"));

const OWN_KEYS = { global: { "cmd-q": "app.quit", "cmd-alt-l": "code-explorer.toggle-appearance" }, terminal: { "alt-left": "send:\u001bb" } };

async function home() {
  const dir = await mkdtemp(join(tmpdir(), "herdr-home-"));
  const dev = join(dir, "mods/code-explorer-test");
  await mkdir(join(dev, "cache/apps"), { recursive: true });
  await writeFile(join(dev, "stale.js"), "old");
  await writeFile(join(dev, "cache/apps/x.png"), "png");
  await writeFile(join(dev, "jsconfig.json"), "{}");
  // A released copy installed from GitHub: sync never touches it.
  await mkdir(join(dir, "mods/code-explorer"), { recursive: true });
  await writeFile(join(dir, "mods/code-explorer/main.js"), "released");
  await mkdir(join(dir, "themes"), { recursive: true });
  await writeFile(join(dir, "themes/naps.json"), "released");
  await writeFile(join(dir, "keys.json"), JSON.stringify(OWN_KEYS, null, 2));
  return dir;
}

test("sync installs the mod as code-explorer-test and leaves the released one alone", async () => {
  const dir = await home();
  const { stdout } = await run("--home", dir, "--no-check");
  assert.match(stdout, /code-explorer-test/);
  assert.ok(await exists(join(dir, "mods/code-explorer-test/icons.json")));
  assert.equal(await readFile(join(dir, "mods/code-explorer/main.js"), "utf8"), "released");
});

test("the installed copy knows its own name", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  const name = await readFile(join(dir, "mods/code-explorer-test/lib/name.js"), "utf8");
  assert.match(name, /NAME = "code-explorer-test"/);
});

const LAYOUT = "layouts/herdr-mods-test.json";

test("sync builds one herdr-mods-test layout with every working copy in it", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  assert.ok(await exists(join(dir, "themes/naps-dusk-gold-test.json")));
  assert.equal(await exists(join(dir, "themes/naps-dusk-gold.json")), false);
  assert.equal(await readFile(join(dir, "themes/naps.json"), "utf8"), "released");
  const layout = await readFile(join(dir, LAYOUT), "utf8");
  assert.match(layout, /"mod": "code-explorer-test"/);
  assert.doesNotMatch(layout, /"mod": "files"/);
  assert.match(layout, /"mod": "agent-limits-test"/);
  assert.match(layout, /"mod": "workspace-status"/);
  assert.equal(JSON.parse(layout).theme.dark, "naps-dusk-gold-test");
  for (const old of ["naps-test", "code-explorer-test", "usage-test", "naps"]) assert.equal(await exists(join(dir, `layouts/${old}.json`)), false);
});

test("the layout takes what is installed: built-in Files, released themes, a released agent-limits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "herdr-home-"));
  await mkdir(join(dir, "mods/agent-limits"), { recursive: true });
  await run("--home", dir, "--no-check", "naps");
  const layout = await readFile(join(dir, LAYOUT), "utf8");
  assert.match(layout, /"mod": "files"/);
  assert.match(layout, /"mod": "agent-limits"/);
  assert.equal(JSON.parse(layout).theme.dark, "naps-dusk-gold-test");
  const only = await home();
  await run("--home", only, "--no-check", "agent-limits");
  const alone = await json(join(only, LAYOUT));
  assert.equal(alone.theme.dark, "naps-dusk-gold");
  assert.match(JSON.stringify(alone), /"mod":"agent-limits-test"/);
});

test("sync removes the old per-package test layouts", async () => {
  const dir = await home();
  await mkdir(join(dir, "layouts"), { recursive: true });
  for (const old of ["naps-test", "code-explorer-test", "usage-test"]) await writeFile(join(dir, `layouts/${old}.json`), "{}");
  await run("--home", dir, "--no-check", "agent-limits");
  for (const old of ["naps-test", "code-explorer-test", "usage-test"]) assert.equal(await exists(join(dir, `layouts/${old}.json`)), false);
});

test("sync code-explorer installs only the mod, its keys and its layout", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check", "code-explorer");
  assert.ok(await exists(join(dir, "mods/code-explorer-test/icons.json")));
  assert.match(await readFile(join(dir, LAYOUT), "utf8"), /"mod": "code-explorer-test"/);
  assert.ok((await json(join(dir, "keys.json")))["mod:code-explorer-test"]);
  assert.equal(await exists(join(dir, "themes/naps-dusk-gold-test.json")), false);
});

test("sync naps installs only the naps themes, and the layout", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check", "naps");
  assert.ok(await exists(join(dir, LAYOUT)));
  assert.ok(await exists(join(dir, "themes/naps-test.json")));
  assert.equal(await exists(join(dir, "mods/agent-limits-test")), false);
  assert.equal(await readFile(join(dir, "mods/code-explorer-test/stale.js"), "utf8"), "old");
  assert.deepEqual(await json(join(dir, "keys.json")), OWN_KEYS);
});

test("sync --clean naps removes only naps's -test themes; the layout goes back to the released ones", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  await run("--home", dir, "--clean", "naps");
  assert.equal(await exists(join(dir, "themes/naps-dusk-gold-test.json")), false);
  assert.equal(await readFile(join(dir, "themes/naps.json"), "utf8"), "released");
  assert.ok(await exists(join(dir, "mods/code-explorer-test")));
  const layout = await json(join(dir, LAYOUT));
  assert.equal(layout.theme.dark, "naps-dusk-gold");
  assert.match(JSON.stringify(layout), /"mod":"code-explorer-test"/);
});

test("sync agent-limits installs agent-limits-test, its layout and its global key", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check", "agent-limits");
  assert.match(await readFile(join(dir, "mods/agent-limits-test/lib/name.js"), "utf8"), /NAME = "agent-limits-test"/);
  const layout = await readFile(join(dir, LAYOUT), "utf8");
  assert.match(layout, /"mod": "agent-limits-test"/);
  assert.match(layout, /"mod": "workspace-status"/);
  const keys = await json(join(dir, "keys.json"));
  assert.equal(keys.global["cmd-alt-u"], "agent-limits-test.toggle");
  assert.equal(keys.global["cmd-q"], "app.quit");
  assert.equal(await exists(join(dir, "mods/code-explorer-test/icons.json")), false);
});

test("sync --clean agent-limits removes agent-limits-test and its key, and nothing else", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  await run("--home", dir, "--clean", "agent-limits");
  assert.equal(await exists(join(dir, "mods/agent-limits-test")), false);
  assert.doesNotMatch(await readFile(join(dir, LAYOUT), "utf8"), /agent-limits-test/);
  const keys = await json(join(dir, "keys.json"));
  assert.equal("cmd-alt-u" in keys.global, false);
  assert.ok(keys["mod:code-explorer-test"]);
  assert.ok(await exists(join(dir, "mods/code-explorer-test")));
});

test("sync agent-limits never takes ⌘⌥U from a key the person already uses", async () => {
  const dir = await home();
  const keys = { ...OWN_KEYS, global: { ...OWN_KEYS.global, "cmd-alt-u": "agent-limits.toggle" } };
  await writeFile(join(dir, "keys.json"), JSON.stringify(keys, null, 2));
  const { stdout } = await run("--home", dir, "--no-check", "agent-limits");
  assert.equal((await json(join(dir, "keys.json"))).global["cmd-alt-u"], "agent-limits.toggle");
  assert.match(stdout, /cmd-alt-u is taken/);
  await run("--home", dir, "--clean", "agent-limits");
  assert.equal((await json(join(dir, "keys.json"))).global["cmd-alt-u"], "agent-limits.toggle");
});

test("sync code-explorer leaves agent-limits alone", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check", "code-explorer");
  assert.equal(await exists(join(dir, "mods/agent-limits-test")), false);
  assert.equal("cmd-alt-u" in (await json(join(dir, "keys.json"))).global, false);
});

test("sync rejects a package it does not know", async () => {
  const dir = await home();
  await assert.rejects(run("--home", dir, "--no-check", "nope"), /unknown argument: nope/);
});

test("sync adds the copy's keys and keeps the person's own", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  const keys = await json(join(dir, "keys.json"));
  assert.equal(keys["mod:code-explorer-test"]["cmd-alt-c"], "code-explorer-test.copy-path");
  assert.deepEqual(keys.global, { ...OWN_KEYS.global, "cmd-alt-u": "agent-limits-test.toggle" });
  assert.equal(keys.terminal["alt-left"], "send:\u001bb");
});

test("sync removes files the repo no longer has but keeps cache and Herdr's own files", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  assert.equal(await exists(join(dir, "mods/code-explorer-test/stale.js")), false);
  assert.ok(await exists(join(dir, "mods/code-explorer-test/cache/apps/x.png")));
  assert.ok(await exists(join(dir, "mods/code-explorer-test/jsconfig.json")));
});

test("sync --clean removes the -test copy, layouts and keys, and nothing else", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  await run("--home", dir, "--clean");
  assert.equal(await exists(join(dir, "mods/code-explorer-test")), false);
  assert.equal(await exists(join(dir, "themes/naps-test.json")), false);
  assert.equal(await exists(join(dir, LAYOUT)), false);
  assert.deepEqual(await json(join(dir, "keys.json")), OWN_KEYS);
  assert.ok(await exists(join(dir, "mods/code-explorer/main.js")));
  assert.equal(await readFile(join(dir, "themes/naps.json"), "utf8"), "released");
});

test("sync --dry-run writes nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "herdr-home-"));
  await run("--home", dir, "--no-check", "--dry-run");
  assert.deepEqual(await readdir(dir), []);
});
