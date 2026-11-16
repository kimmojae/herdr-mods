import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCodexLimits } from "../mods/agent-limits/lib/codex.js";

const reply = (rateLimits) => JSON.stringify({ id: 2, result: { rateLimits } });

test("parseCodexLimits picks 5h and 7d by window length, not by name", () => {
  const out = parseCodexLimits(reply({
    primary: { usedPercent: 29, windowDurationMins: 10080, resetsAt: 1794817608 },
    secondary: { usedPercent: 8, windowDurationMins: 300, resetsAt: 1794596879 },
    planType: "plus",
  }));
  assert.deepEqual(out, { plan: "plus", h5: { used: 8, resetsAt: 1794596879 }, d7: { used: 29, resetsAt: 1794817608 } });
});

test("parseCodexLimits reports a JSON-RPC error", () => {
  assert.deepEqual(parseCodexLimits('{"id":2,"error":{"message":"not signed in"}}'), { error: "not signed in" });
});

test("parseCodexLimits reports no reply", () => {
  assert.deepEqual(parseCodexLimits(""), { error: "No reply from codex" });
});
