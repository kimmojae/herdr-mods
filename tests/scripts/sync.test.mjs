import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const script = fileURLToPath(new URL("../../scripts/sync.mjs", import.meta.url));
const run = (...args) => promisify(execFile)(process.execPath, [script, ...args]);
const exists = (p) => access(p).then(() => true, () => false);

async function home() {
  const dir = await mkdtemp(join(tmpdir(), "herdr-home-"));
  const mod = join(dir, "mods/code-explorer");
  await mkdir(join(mod, "cache/apps"), { recursive: true });
  await writeFile(join(mod, "stale.js"), "old");
  await writeFile(join(mod, "cache/apps/x.png"), "png");
  await writeFile(join(mod, "jsconfig.json"), "{}");
  return dir;
}

test("sync copies the mod, themes and layouts into the Herdr home", async () => {
  const dir = await home();
  const { stdout } = await run("--home", dir, "--no-check");
  assert.match(stdout, /code-explorer/);
  assert.ok(await exists(join(dir, "mods/code-explorer/icons.json")));
  assert.ok(await exists(join(dir, "themes/naps-dusk-gold.json")));
});

test("sync installs layouts with -test, so the working copy sits beside a released one", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  assert.ok(await exists(join(dir, "layouts/naps-test.json")));
  assert.equal(await exists(join(dir, "layouts/naps.json")), false);
});

test("sync removes files the repo no longer has but keeps cache and Herdr's own files", async () => {
  const dir = await home();
  await run("--home", dir, "--no-check");
  assert.equal(await exists(join(dir, "mods/code-explorer/stale.js")), false);
  assert.ok(await exists(join(dir, "mods/code-explorer/cache/apps/x.png")));
  assert.ok(await exists(join(dir, "mods/code-explorer/jsconfig.json")));
});

test("sync --dry-run writes nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "herdr-home-"));
  await run("--home", dir, "--no-check", "--dry-run");
  assert.deepEqual(await readdir(dir), []);
});
