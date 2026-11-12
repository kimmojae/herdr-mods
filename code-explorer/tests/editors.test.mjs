import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sortEditors, pickDefaultEditor, openCommand } from "../mods/code-explorer/lib/editors.js";

const app = (id, name, extra = {}) => ({ id, name, path: `/Applications/${name}.app`, ...extra });
const cursor = app("com.todesktop.230313mzl4w4u92", "Cursor"), code = app("com.microsoft.VSCode", "Visual Studio Code");
const idea = app("com.jetbrains.intellij", "IntelliJ IDEA"), anti = app("com.google.antigravity", "Antigravity");

test("sortEditors puts the well-known editors first, the rest by name", () => {
  const zed = app("dev.zed.Zed", "Zed"), sublime = app("com.sublimetext.4", "Sublime Text");
  assert.deepEqual(sortEditors([sublime, idea, zed, code, anti, cursor]).map((a) => a.name),
    ["Cursor", "Visual Studio Code", "Antigravity", "Zed", "IntelliJ IDEA", "Sublime Text"]);
});

test("Antigravity ranks by name too, whatever its bundle id", () => {
  assert.equal(sortEditors([idea, app("some.other.id", "Antigravity")])[0].name, "Antigravity");
});

test("pickDefaultEditor keeps the user's choice while it is installed, else the first", () => {
  assert.equal(pickDefaultEditor([cursor, code], code.id), code);
  assert.equal(pickDefaultEditor([cursor, code], "gone.app"), cursor);
  assert.equal(pickDefaultEditor([cursor, code], null), cursor);
  assert.equal(pickDefaultEditor([], code.id), null);
});

// Runs the command with a fake editor CLI that prints its arguments.
async function run(kind, path, line) {
  const dir = await mkdtemp(join(tmpdir(), "editors-"));
  const cli = join(dir, "cli");
  await writeFile(cli, '#!/bin/sh\nfor a; do printf "[%s]" "$a"; done\n');
  await chmod(cli, 0o755);
  const { cmd, args } = openCommand({ kind, cli, path: "/Applications/X.app", name: "X" }, path, line);
  return (await promisify(execFile)(cmd, args)).stdout;
}

test("openCommand opens VS Code-family editors in the file's repo window, at the line", async () => {
  const repo = await mkdtemp(join(tmpdir(), "repo-"));
  await promisify(execFile)("git", ["init", "-q", repo]);
  await mkdir(join(repo, "src"));
  const top = (await promisify(execFile)("git", ["-C", repo, "rev-parse", "--show-toplevel"])).stdout.trim();
  assert.equal(await run("vscode", `${top}/src/a.ts`, 12), `[${top}][--goto][${top}/src/a.ts:12]`);
  assert.equal(await run("vscode", `${top}/src/a.ts`, null), `[${top}][${top}/src/a.ts]`);
  assert.equal(await run("vscode", `${top}/src`, null), `[${top}/src]`);
});

test("openCommand opens JetBrains IDEs on the repo with --line", async () => {
  const repo = await mkdtemp(join(tmpdir(), "repo-"));
  await promisify(execFile)("git", ["init", "-q", repo]);
  const top = (await promisify(execFile)("git", ["-C", repo, "rev-parse", "--show-toplevel"])).stdout.trim();
  assert.equal(await run("jetbrains", `${top}/a.kt`, 3), `[${top}][--line][3][${top}/a.kt]`);
  assert.equal(await run("jetbrains", `${top}/a.kt`, null), `[${top}][${top}/a.kt]`);
});

test("openCommand falls back to open -a for other apps", () => {
  assert.deepEqual(openCommand({ path: "/Applications/Obsidian.app", name: "Obsidian" }, "/n/a.md", null), { cmd: "open", args: ["-a", "/Applications/Obsidian.app", "/n/a.md"] });
});

