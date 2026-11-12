import { test } from "node:test";
import assert from "node:assert/strict";
import { flipAppearance } from "../mods/code-explorer/lib/appearance.js";

const settings = '{\n  "zoom": 1,\n  "theme": "naps-dusk-gold",\n  "appearance": "dark"\n}\n';

test("flipAppearance switches to the other appearance and keeps every other setting", () => {
  const out = JSON.parse(flipAppearance(settings, true));
  assert.deepEqual(out, { zoom: 1, theme: "naps-dusk-gold", appearance: "light" });
  assert.equal(JSON.parse(flipAppearance(settings, false)).appearance, "dark");
});

test("flipAppearance follows what shows now, even when settings follow the system", () => {
  assert.equal(JSON.parse(flipAppearance('{"zoom": 1}', false)).appearance, "dark");
});

test("flipAppearance keeps the file readable: two-space JSON with a final newline", () => {
  assert.match(flipAppearance(settings, true), /^\{\n  "zoom": 1,[\s\S]*\n\}\n$/);
});

test("flipAppearance leaves broken settings alone", () => {
  assert.equal(flipAppearance("{ not json", true), null);
});
