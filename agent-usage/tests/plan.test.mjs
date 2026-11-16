import { test } from "node:test";
import assert from "node:assert/strict";
import { claudeCommand, rememberDirs } from "../mods/agent-usage/lib/plan.js";

test("the default Claude account runs with CLAUDE_CONFIG_DIR unset, not set to ~/.claude", () => {
  assert.deepEqual(claudeCommand(null, "/x.sh"), { cmd: "env", args: ["-u", "CLAUDE_CONFIG_DIR", "sh", "/x.sh"] });
});

test("another Claude account runs with its folder", () => {
  assert.deepEqual(claudeCommand("/h/.claude-second", "/x.sh"), { cmd: "env", args: ["CLAUDE_CONFIG_DIR=/h/.claude-second", "sh", "/x.sh"] });
});

test("rememberDirs keeps folders seen before and adds new ones", () => {
  assert.deepEqual(rememberDirs(["/a"], ["/b", "/a"]), ["/a", "/b"]);
});
