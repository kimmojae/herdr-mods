import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pickPalette, pickGit } from "../mods/code-explorer/lib/palette.js";

const load = async (n) => JSON.parse(await readFile(new URL(`../mods/code-explorer/syntax/${n}.json`, import.meta.url), "utf8"));
const palettes = [await load("naps"), await load("naps-dusk-gold")];

test("pickPalette matches the active theme by background, case-insensitively", () => {
  const p = pickPalette({ background: "#1E2629" }, palettes);
  assert.equal(p.string.color, "#d4b87a");
  assert.equal(pickPalette({ background: "#242e33" }, palettes).string.color, "#b5bd68");
});

test("another theme gets a palette built from its ANSI colours", () => {
  const t = { background: "#000000", ansi1: "#ff0000", ansi2: "#00ff00", ansi3: "#ffff00", ansi4: "#0000ff", ansi5: "#ff00ff", ansi6: "#00ffff", dim: "#555555", muted: "#999999" };
  const p = pickPalette(t, palettes);
  assert.equal(p.string.color, "#00ff00");
  assert.equal(p.keyword.color, "#ff00ff");
  assert.equal(p.comment.color, "#555555");
  assert.equal(p.comment.italic, true);
});

test("pickGit takes the palette's git colours, else the theme's ANSI ones", () => {
  const t = { background: "#1E2629", ansi1: "#a54242", ansi2: "#8c9440", ansi3: "#de935f" };
  const git = { U: "#73c991", A: "#81b88b", M: "#e2c08d", D: "#c74e39", "!": "#e4676b" };
  assert.deepEqual(pickGit(t, [{ theme: { background: "#1e2629" }, kinds: {}, git }]), git);
  assert.deepEqual(pickGit(t, []), { U: "#8c9440", A: "#8c9440", M: "#de935f", D: "#a54242", "!": "#a54242" });
});
