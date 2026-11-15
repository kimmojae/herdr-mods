import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseClaudeUsage } from "../mods/usage/lib/claude.js";

const fixture = (name) => readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const reply = (response) => JSON.stringify({ type: "control_response", response });

test("parseClaudeUsage maps session to 5h and weekly_all to 7d, ignoring per-model limits", async () => {
  assert.deepEqual(parseClaudeUsage(await fixture("claude-max.jsonl")), {
    plan: "max",
    h5: { used: 8, resetsAt: Date.parse("2026-11-13T20:00:00Z") / 1000 },
    d7: { used: 2, resetsAt: 1794817608 },
  });
});

test("parseClaudeUsage reads the older five_hour/seven_day shape", () => {
  const out = parseClaudeUsage(reply({ subtype: "success", response: { subscription_type: "team",
    rate_limits: { five_hour: { utilization: 12, resets_at: 1794600000 }, seven_day: { utilization: 40, resets_at: 1794800000 } } } }));
  assert.deepEqual(out, { plan: "team", h5: { used: 12, resetsAt: 1794600000 }, d7: { used: 40, resetsAt: 1794800000 } });
});

test("parseClaudeUsage reports a failed request", () => {
  assert.deepEqual(parseClaudeUsage(reply({ subtype: "error", error: "Not logged in" })), { error: "Not logged in" });
});

test("parseClaudeUsage reports no reply", () => {
  assert.deepEqual(parseClaudeUsage('{"type":"system"}\n'), { error: "No reply from the claude CLI" });
});

test("parseClaudeUsage reports an account without limits", () => {
  assert.deepEqual(parseClaudeUsage(reply({ subtype: "success", response: { rate_limits: {} } })), { error: "No subscription limits" });
});
