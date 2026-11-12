#!/usr/bin/env node
// Regenerates what this repo takes from the Cursor extensions installed on this Mac:
// Symbols file icons for code-explorer (and, see below, Naps themes and code colours).
// Usage: node scripts/import-cursor.mjs [--extensions <dir>] [--out <repo root>]
import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findLatestExtension } from "./lib/extensions.mjs";
import { parseJsonc } from "./lib/jsonc.mjs";
import { buildIconMap } from "./lib/icon-theme.mjs";
import { toHerdrTheme, toSyntaxPalette, slugOf } from "./lib/color-theme.mjs";

const SYMBOLS = "miguelsolorio.symbols";
const NAPS = "kimmojae.naps-theme";

function args(argv) {
  const out = { extensions: join(homedir(), ".cursor/extensions"), out: fileURLToPath(new URL("..", import.meta.url)) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--extensions") out.extensions = argv[++i];
    else if (argv[i] === "--out") out.out = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

async function importIcons(extensions, root) {
  const ext = await findLatestExtension(extensions, SYMBOLS);
  if (!ext) throw new Error(`${SYMBOLS} is not installed in ${extensions}`);
  const pkg = JSON.parse(await readFile(join(ext.path, "package.json"), "utf8"));
  const themeFile = join(ext.path, pkg.contributes.iconThemes[0].path);
  const theme = parseJsonc(await readFile(themeFile, "utf8"));
  const { map, files } = buildIconMap(theme, { id: SYMBOLS, version: ext.version });

  const mod = join(root, "code-explorer/mods/code-explorer");
  await rm(join(mod, "icons"), { recursive: true, force: true });
  for (const file of files) {
    const to = join(mod, `icons/${file.replace(/^\.\//, "").split("/").slice(-2).join("/")}`);
    await mkdir(dirname(to), { recursive: true });
    await cp(join(dirname(themeFile), file), to);
  }
  await cp(join(ext.path, "LICENSE.txt"), join(mod, "icons/LICENSE-symbols.txt"));
  await writeFile(join(mod, "icons.json"), JSON.stringify(map, null, 1) + "\n");
  console.log(`symbols ${ext.version}: ${files.length} icons`);
}

async function importThemes(extensions, root) {
  const ext = await findLatestExtension(extensions, NAPS);
  if (!ext) throw new Error(`${NAPS} is not installed in ${extensions}`);
  const pkg = JSON.parse(await readFile(join(ext.path, "package.json"), "utf8"));
  const themes = pkg.contributes?.themes ?? [];
  const themeDir = join(root, "naps/themes");
  const syntaxDir = join(root, "code-explorer/mods/code-explorer/syntax");
  await mkdir(themeDir, { recursive: true });
  await mkdir(syntaxDir, { recursive: true });
  for (const entry of themes) {
    const vs = parseJsonc(await readFile(join(ext.path, entry.path), "utf8"));
    const slug = slugOf(entry.label);
    await writeFile(join(themeDir, `${slug}.json`), JSON.stringify(toHerdrTheme(vs), null, 2) + "\n");
    await writeFile(join(syntaxDir, `${slug}.json`), JSON.stringify(toSyntaxPalette(vs), null, 1) + "\n");
  }
  console.log(`naps: ${themes.length} themes (${themes.map((t) => slugOf(t.label)).join(", ")})`);
}

const opts = args(process.argv.slice(2));
await importIcons(opts.extensions, opts.out);
await importThemes(opts.extensions, opts.out);
