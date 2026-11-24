import { test } from "node:test";
import assert from "node:assert/strict";
import { railTiles } from "../mods/spaces-tree/lib/rail.js";

const spaces = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }));
const agent = (space, status) => ({ space, status });

test("active-agent spaces plus the shown one, in spaces order; more is the rest", () => {
  const r = railTiles({
    spaces,
    agents: [agent("s7", "working"), agent("s2", "blocked"), agent("s4", "idle"), agent("s2", "idle")],
    active: "s5",
    waiting: 1,
  });
  assert.deepEqual(r, { waiting: 1, tiles: ["s2", "s5", "s7"], more: 7 });
});

test("shown space that already has an agent counts once; null active is fine", () => {
  assert.deepEqual(railTiles({ spaces, agents: [agent("s1", "done")], active: "s1", waiting: 0 }), { waiting: 0, tiles: ["s1"], more: 9 });
  assert.deepEqual(railTiles({ spaces, agents: [], active: null, waiting: 3 }), { waiting: 3, tiles: [], more: 10 });
});

test("agents and active outside spaces are ignored", () => {
  assert.deepEqual(railTiles({ spaces: spaces.slice(0, 2), agents: [agent("zz", "working")], active: "gone", waiting: 0 }), { waiting: 0, tiles: [], more: 2 });
});
