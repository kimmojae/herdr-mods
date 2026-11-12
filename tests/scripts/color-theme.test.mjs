import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseJsonc } from "../../scripts/lib/jsonc.mjs";
import { toHerdrTheme, toSyntaxPalette, resolveScope, slugOf } from "../../scripts/lib/color-theme.mjs";

const fixtures = fileURLToPath(new URL("../fixtures/extensions", import.meta.url));
const naps = join(fixtures, "kimmojae.naps-theme-0.1.0-universal");
const script = fileURLToPath(new URL("../../scripts/import-cursor.mjs", import.meta.url));
const dusk = async () => parseJsonc(await readFile(join(naps, "themes/naps-dusk-gold.json"), "utf8"));

test("toHerdrTheme maps editor, sidebar and list colours", async () => {
  const t = toHerdrTheme(await dusk());
  assert.equal(t.background, "#1e2629");
  assert.equal(t.foreground, "#c5c8c6");
  assert.equal(t.cursor, "#8abeb7");
  assert.equal(t.colors.chrome, "#1a2024");
  assert.equal(t.colors.canvas, "#161c1f");
  assert.equal(t.colors.popover, "#12171a");
  assert.equal(t.colors.selected, "#2a3b49");
  assert.equal(t.colors.hover, "#24303a");
  assert.equal(t.colors.accent, "#81a2be");
  assert.equal(t.colors.solid_foreground, "#ffffff");
});

test("toHerdrTheme takes the 16 terminal colours in ANSI order", async () => {
  const t = toHerdrTheme(await dusk());
  assert.equal(t.ansi.length, 16);
  assert.equal(t.ansi[0], "#242e33");
  assert.equal(t.ansi[3], "#de935f");
  assert.equal(t.ansi[13], "#b894c0");
});

test("resolveScope prefers the longest matching rule and a later rule on ties", () => {
  const rules = [
    { scope: "keyword", settings: { foreground: "#111111" } },
    { scope: ["keyword.operator", "x"], settings: { foreground: "#222222" } },
    { scope: "keyword.operator", settings: { foreground: "#333333" } },
  ];
  assert.equal(resolveScope(rules, "keyword.operator.new").color, "#333333");
  assert.equal(resolveScope(rules, "keyword.control").color, "#111111");
  assert.equal(resolveScope(rules, "keywordx"), null);
});

test("toSyntaxPalette resolves token kinds from Naps Dusk Gold", async () => {
  const p = toSyntaxPalette(await dusk());
  assert.deepEqual(p.theme, { background: "#1e2629", foreground: "#c5c8c6" });
  assert.deepEqual(p.kinds.comment, { color: "#6c7a80", italic: true });
  assert.equal(p.kinds.string.color, "#d4b87a");
  assert.equal(p.kinds.param.color, "#ab7651");
  assert.equal(p.kinds.funcKw.color, "#8abeb7");
  assert.equal(p.kinds.mdPunct.color, "#6c7a80");
  assert.equal(p.kinds.type.color, "#cc6666");
  assert.equal(p.kinds.keyword.color, "#de935f");
});

test("slugOf turns a theme label into a file name", () => {
  assert.equal(slugOf("Naps Dusk Gold"), "naps-dusk-gold");
});

test("import-cursor writes Herdr themes and syntax palettes", async () => {
  const out = await mkdtemp(join(tmpdir(), "herdr-import-"));
  const { stdout } = await promisify(execFile)(process.execPath, [script, "--extensions", fixtures, "--out", out]);
  assert.match(stdout, /naps: 1 themes?/);
  const theme = JSON.parse(await readFile(join(out, "naps/themes/naps-dusk-gold.json"), "utf8"));
  assert.equal(theme.background, "#1e2629");
  const syntax = JSON.parse(await readFile(join(out, "code-explorer/mods/code-explorer/syntax/naps-dusk-gold.json"), "utf8"));
  assert.equal(syntax.kinds.string.color, "#d4b87a");
});

test("toSyntaxPalette carries git colours, Cursor's defaults where the theme has none", async () => {
  assert.deepEqual(toSyntaxPalette(await dusk()).git, { U: "#73c991", A: "#81b88b", M: "#e2c08d", D: "#c74e39", "!": "#e4676b" });
  const own = toSyntaxPalette({ ...(await dusk()), colors: { ...(await dusk()).colors, "gitDecoration.modifiedResourceForeground": "#ABCDEF" } });
  assert.equal(own.git.M, "#abcdef");
});
