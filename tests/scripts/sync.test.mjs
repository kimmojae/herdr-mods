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

test("sync installs layouts with -test, and a code-explorer-test layout that uses the copy", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  assert.ok(await exists(join(dir, "themes/naps-dusk-gold.json")));
  assert.ok(await exists(join(dir, "layouts/naps-test.json")));
  assert.equal(await exists(join(dir, "layouts/naps.json")), false);
  const dev = await readFile(join(dir, "layouts/code-explorer-test.json"), "utf8");
  assert.match(dev, /"mod": "code-explorer-test"/);
  assert.doesNotMatch(dev, /"mod": "files"/);
});

test("sync adds the copy's keys and keeps the person's own", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  const keys = await json(join(dir, "keys.json"));
  assert.equal(keys["mod:code-explorer-test"]["cmd-alt-c"], "code-explorer-test.copy-path");
  assert.deepEqual(keys.global, OWN_KEYS.global);
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
  assert.equal(await exists(join(dir, "layouts/naps-test.json")), false);
  assert.equal(await exists(join(dir, "layouts/code-explorer-test.json")), false);
  assert.deepEqual(await json(join(dir, "keys.json")), OWN_KEYS);
  assert.ok(await exists(join(dir, "mods/code-explorer/main.js")));
});

test("sync --dry-run writes nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "herdr-home-"));
  await run("--home", dir, "--no-check", "--dry-run");
  assert.deepEqual(await readdir(dir), []);
});
