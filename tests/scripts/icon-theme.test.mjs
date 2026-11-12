import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseJsonc } from "../../scripts/lib/jsonc.mjs";
import { buildIconMap } from "../../scripts/lib/icon-theme.mjs";

const fixtures = fileURLToPath(new URL("../fixtures/extensions", import.meta.url));
const symbols = join(fixtures, "miguelsolorio.symbols-0.0.26-universal");
const script = fileURLToPath(new URL("../../scripts/import-cursor.mjs", import.meta.url));

async function fixtureMap() {
  const theme = parseJsonc(await readFile(join(symbols, "src/symbol-icon-theme.json"), "utf8"));
  return buildIconMap(theme, { id: "miguelsolorio.symbols", version: "0.0.26" });
}

test("buildIconMap maps extensions, names and folders to icon paths", async () => {
  const { map } = await fixtureMap();
  assert.equal(map.exts["d.ts"], "icons/files/ts-types.svg");
  assert.equal(map.exts.ts, "icons/files/ts.svg");
  assert.equal(map.names["package.json"], "icons/files/node.svg");
  assert.equal(map.langs.typescript, "icons/files/ts.svg");
  assert.equal(map.folders.src, "icons/folders/folder-src.svg");
  assert.equal(map.file, "icons/files/document.svg");
  assert.equal(map.folder, "icons/folders/folder.svg");
  assert.deepEqual(map.source, { id: "miguelsolorio.symbols", version: "0.0.26" });
});

test("buildIconMap drops entries whose definition is missing", async () => {
  const { map } = await fixtureMap();
  assert.equal("gone" in map.exts, false);
});

test("buildIconMap lists every icon file to copy, relative to the theme file", async () => {
  const { files } = await fixtureMap();
  assert.ok(files.includes("./icons/files/ts-types.svg"));
  assert.ok(files.includes("./icons/folders/folder-src.svg"));
});

test("import-cursor writes icons.json and the icons it points at", async () => {
  const out = await mkdtemp(join(tmpdir(), "herdr-import-"));
  const { stdout } = await promisify(execFile)(process.execPath, [script, "--extensions", fixtures, "--out", out]);
  assert.match(stdout, /symbols 0\.0\.26: 7 icons/);
  const mod = join(out, "code-explorer/mods/code-explorer");
  const map = JSON.parse(await readFile(join(mod, "icons.json"), "utf8"));
  assert.equal(map.source.version, "0.0.26");
  const paths = [map.file, map.folder, ...Object.values(map.exts), ...Object.values(map.names), ...Object.values(map.folders)];
  for (const p of paths) await access(join(mod, p));
  await access(join(mod, "icons/LICENSE-symbols.txt"));
});
