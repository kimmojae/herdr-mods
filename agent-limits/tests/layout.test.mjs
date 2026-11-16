import { test } from "node:test";
import assert from "node:assert/strict";
import { ownBlock, fitWidth } from "../mods/agent-limits/lib/layout.js";

const tree = { id: "root", type: "column", children: [
  { id: "main", type: "block", content: { terminal: "t1" } },
  { id: "status-row", type: "row", children: [
    { id: "status", type: "block", size: { weight: 1 }, content: { mod: "workspace-status" } },
    { id: "agent-limits", type: "block", size: { px: 200 }, content: { mod: "agent-limits-test" } }] }] };

test("ownBlock finds the block that shows the mod", () => {
  assert.equal(ownBlock(tree, "agent-limits-test").id, "agent-limits");
  assert.equal(ownBlock({ root: tree }, "agent-limits-test").id, "agent-limits");
  assert.equal(ownBlock(tree, "agent-limits"), null);
  assert.equal(ownBlock(null, "agent-limits"), null);
});

test("fitWidth is the button plus the block's side padding, or null when it already fits", () => {
  assert.equal(fitWidth({ id: "agent-limits", size: { px: 200 } }, 240.4), 257);
  assert.equal(fitWidth({ id: "agent-limits", size: { px: 257 } }, 240.4), null);
  assert.equal(fitWidth({ id: "agent-limits", size: { weight: 1.2 } }, 240.4), 257);
  assert.equal(fitWidth({ id: "agent-limits", size: { px: 200 } }, 0), null);
});
