import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveIcon } from "../mods/code-explorer/lib/icons.js";

const map = JSON.parse(await readFile(new URL("../mods/code-explorer/icons.json", import.meta.url), "utf8"));
const P = "mods/code-explorer/";

test("resolveIcon uses the exact file name first", () => {
  assert.equal(resolveIcon(map, "package.json", false), P + map.names["package.json"]);
  assert.ok(resolveIcon(map, "Package.JSON", false).endsWith("node.svg"));
});

test("resolveIcon prefers the longest compound extension", () => {
  assert.equal(resolveIcon(map, "types.d.ts", false), P + map.exts["d.ts"]);
  assert.ok(resolveIcon(map, "App.tsx", false).endsWith("react-ts.svg"));
});

test("resolveIcon falls back to the language id for an extension the theme only maps by language", () => {
  assert.equal(map.exts.php, undefined);
  assert.equal(resolveIcon(map, "index.php", false), P + map.langs.php);
});

test("resolveIcon uses the default file icon for unknown names", () => {
  assert.equal(resolveIcon(map, "Makefile.unknownext", false), P + map.file);
});

test("resolveIcon maps folders by name, else the default folder icon", () => {
  assert.ok(resolveIcon(map, "src", true).endsWith("folder-orange-code.svg"));
  assert.equal(resolveIcon(map, "zzz-nothing", true), P + map.folder);
});

test("resolveIcon returns null without a map", () => {
  assert.equal(resolveIcon(null, "a.ts", false), null);
});
