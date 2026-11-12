import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MOD = fileURLToPath(new URL("../mods/code-explorer/", import.meta.url));

// sync installs a working copy under another name by rewriting lib/name.js alone.
test("the mod's name is written only in lib/name.js", async () => {
  const found = [];
  for (const dir of ["", "host", "lib"]) {
    for (const f of await readdir(join(MOD, dir))) {
      if (!/\.(js|jxa)$/.test(f) || f === "name.js" && dir === "lib") continue;
      const lines = (await readFile(join(MOD, dir, f), "utf8")).split("\n");
      lines.forEach((l, i) => {
        if (/^\s*\/\//.test(l)) return;
        if (/["'`/]code-explorer[:/"'`]/.test(l)) found.push(`${join(dir, f)}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(found, []);
});
