import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { findLatestExtension } from "../../scripts/lib/extensions.mjs";
import { parseJsonc } from "../../scripts/lib/jsonc.mjs";

const fixtures = fileURLToPath(new URL("../fixtures/extensions", import.meta.url));

test("findLatestExtension picks the highest version, not the last in sort order", async () => {
  const found = await findLatestExtension(fixtures, "miguelsolorio.symbols");
  assert.equal(found.version, "0.0.26");
  assert.match(found.path, /miguelsolorio\.symbols-0\.0\.26-universal$/);
});

test("findLatestExtension returns null for an extension that is not installed", async () => {
  assert.equal(await findLatestExtension(fixtures, "nobody.nothing"), null);
});

test("parseJsonc ignores line comments and trailing commas", () => {
  assert.deepEqual(parseJsonc('{\n  // c\n  "a": [1, 2,],\n  "url": "http://x",\n}'), { a: [1, 2], url: "http://x" });
});
