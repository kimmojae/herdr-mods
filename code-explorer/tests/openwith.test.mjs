import { test } from "node:test";
import assert from "node:assert/strict";
import { editorChoices, browserChoices, isWeb } from "../mods/code-explorer/lib/openwith.js";

const app = (id, name) => ({ id, name, path: `/Applications/${name}.app` });
const cursor = app("com.todesktop.230313mzl4w4u92", "Cursor"), code = app("com.microsoft.VSCode", "Visual Studio Code");
const aside = app("com.aside", "Aside"), chrome = app("com.google.Chrome", "Google Chrome");
const shape = (items) => items.map((i) => i.name + (i.detail ? ` (${i.detail})` : ""));

test("editorChoices lists the editors, the default one marked", () => {
  assert.deepEqual(shape(editorChoices([cursor, code], code)), ["Cursor", "Visual Studio Code (✓ default)"]);
});

test("browserChoices lists the browsers, the macOS default one marked", () => {
  assert.deepEqual(shape(browserChoices([aside, chrome], chrome)), ["Aside", "Google Chrome (macOS default)"]);
});

test("isWeb is true for HTML only", () => {
  assert.equal(isWeb("index.HTML"), true);
  assert.equal(isWeb("a.htm"), true);
  assert.equal(isWeb("logo.svg"), false);
  assert.equal(isWeb("README.md"), false);
});
