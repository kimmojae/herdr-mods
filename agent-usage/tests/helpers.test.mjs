import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseClaudeUsage } from "../mods/agent-usage/lib/claude.js";
import { parseCodexLimits } from "../mods/agent-usage/lib/codex.js";

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const helper = (name) => path(`../mods/agent-usage/helpers/${name}`);

// Runs a helper with env overrides; resolves { code, stdout } whatever the exit status.
// A missing helper fails here, so its 127 can't pass for "CLI not found".
function run(name, env) {
  assert.ok(existsSync(helper(name)), `${name} exists`);
  return new Promise((resolve) => {
    execFile("sh", [helper(name)], { env: { ...process.env, ...env } }, (err, stdout) =>
      resolve({ code: err ? err.code : 0, stdout }));
  });
}

test("claude-usage.sh prints the get_usage reply", async () => {
  const { code, stdout } = await run("claude-usage.sh", { USAGE_CLAUDE_BIN: path("fake/claude") });
  assert.equal(code, 0);
  assert.equal(parseClaudeUsage(stdout).plan, "max");
});

test("claude-usage.sh exits 127 without the CLI", async () => {
  assert.equal((await run("claude-usage.sh", { USAGE_CLAUDE_BIN: "/nonexistent/claude" })).code, 127);
});

test("claude-usage.sh gives up on a CLI that never answers", async () => {
  const { code } = await run("claude-usage.sh", { USAGE_CLAUDE_BIN: path("fake/silent"), USAGE_WAIT_TICKS: "3" });
  assert.equal(code, 1);
});

test("codex-limits.sh prints the rate-limits reply", async () => {
  const { code, stdout } = await run("codex-limits.sh", { USAGE_CODEX_BIN: path("fake/codex") });
  assert.equal(code, 0);
  assert.equal(parseCodexLimits(stdout).d7.used, 29);
});

test("codex-limits.sh exits 127 without the CLI", async () => {
  assert.equal((await run("codex-limits.sh", { USAGE_CODEX_BIN: "/nonexistent/codex" })).code, 127);
});

test("codex-limits.sh gives up on a server that never answers", async () => {
  const { code } = await run("codex-limits.sh", { USAGE_CODEX_BIN: path("fake/silent"), USAGE_WAIT_TICKS: "3" });
  assert.equal(code, 1);
});
