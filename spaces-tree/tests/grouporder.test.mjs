import { test } from "node:test";
import assert from "node:assert/strict";
import { orderNames, ruleNames, moveGroup, readGroupOrder, writeGroupOrder, pruneGroupOrder, arrangeGroups, OTHER } from "../mods/spaces-tree/lib/groups.js";
import { dropOk } from "../mods/spaces-tree/lib/order.js";
import { coreOrder, buildTree } from "../mods/spaces-tree/lib/tree.js";

const RULES = [{ name: "Work", path: "/w" }, { name: "Personal", path: "/p" }, { name: "Labs", path: "/l" }];

test("orderNames: stored first, the rest in rule order; gone names ignored; OTHER never in it", () => {
  const names = ruleNames(RULES);
  assert.deepEqual(orderNames(names, null), ["Work", "Personal", "Labs"]);
  assert.deepEqual(orderNames(names, ["Labs", "Work"]), ["Labs", "Work", "Personal"]);
  assert.deepEqual(orderNames(names, ["Gone", "Personal", OTHER, "Personal"]), ["Personal", "Work", "Labs"]);
});

test("arrangeGroups follows the stored order, OTHER still last", () => {
  const out = arrangeGroups(["/w/a", "/p/b", "/l/c", "/x/d"], (p) => p, RULES, null, ["Labs", "Personal"]);
  assert.deepEqual(out.map((g) => g.name), ["Labs", "Personal", "Work", OTHER]);
});

test("moveGroup: after the target moving down, before it moving up; never OTHER or itself", () => {
  const names = ["Work", "Personal", "Labs"];
  assert.deepEqual(moveGroup(names, "Work", "Personal"), ["Personal", "Work", "Labs"]);
  assert.deepEqual(moveGroup(names, "Work", "Labs"), ["Personal", "Labs", "Work"]);
  assert.deepEqual(moveGroup(names, "Labs", "Work"), ["Labs", "Work", "Personal"]);
  assert.equal(moveGroup(names, "Work", "Work"), null);
  assert.equal(moveGroup(names, "Work", OTHER), null);
  assert.equal(moveGroup(names, OTHER, "Work"), null);
  assert.equal(moveGroup(names, "Gone", "Work"), null);
});

test("readGroupOrder / writeGroupOrder round-trip per machine; junk reads as nothing", () => {
  const m = new Map([[null, ["Personal", "Work"]], ["vps", ["Labs"]]]);
  assert.deepEqual(readGroupOrder(writeGroupOrder(m)), m);
  assert.equal(readGroupOrder("not json").size, 0);
  assert.equal(readGroupOrder('{"a":1}').size, 0);
  assert.deepEqual([...readGroupOrder('[[null, ["A", 3, "Other", "A"]], [5, ["B"]], ["x", []]]')], [[null, ["A"]]]);
});

test("pruneGroupOrder drops gone names only on ready machines", () => {
  const orders = new Map([[null, ["Gone", "Work"]], ["vps", ["Gone"]], ["away", ["Gone"]]]);
  const machines = [{ name: null, layout: "ready" }, { name: "vps", layout: "ready" }, { name: "away", layout: "loading" }];
  assert.equal(pruneGroupOrder(orders, RULES, machines), true);
  assert.deepEqual([...orders], [[null, ["Work"]], ["away", ["Gone"]]]);
  assert.equal(pruneGroupOrder(orders, RULES, machines), false);
});

test("dropOk: group headers only among group headers of one machine, never OTHER", () => {
  const hdr = (name, machine = null) => ({ key: `group:${name}`, ids: [], group: `group:${name}`, machine, main: false, heading: false, header: true, name });
  const heading = { key: "repo:x", ids: ["s"], group: "repo:x", machine: null, main: false, heading: true, band: "group:Work" };
  assert.ok(dropOk(hdr("Work"), hdr("Personal")));
  assert.ok(!dropOk(hdr("Work"), hdr("Personal", "vps")));
  assert.ok(!dropOk(hdr("Work"), hdr(OTHER)));
  assert.ok(!dropOk(hdr(OTHER), hdr("Work")));
  assert.ok(!dropOk(hdr("Work"), heading));
  assert.ok(!dropOk(heading, hdr("Work")));
});

test("coreOrder and the tree follow a stored group order (Herdr's order follows the display)", () => {
  const spaces = [{ id: "w", machine: null }, { id: "p", machine: null }, { id: "o", machine: null }];
  const git = new Map([
    ["w", { name: "w", branch: "main", state: null, repo: JSON.stringify([null, "/w/w/.git"]), linked: false }],
    ["p", { name: "p", branch: "main", state: null, repo: JSON.stringify([null, "/p/p/.git"]), linked: false }],
    ["o", null],
  ]);
  const places = new Map([["w", "/w/w"], ["p", "/p/p"], ["o", "/x/o"]]);
  const base = { rules: RULES, homes: new Map([[null, "/home"]]), places };
  const pathed = git;
  assert.deepEqual(coreOrder(spaces, pathed, base).slice(-1), ["o"]);
  const moved = { ...base, orders: new Map([[null, ["Personal"]]]) };
  const order = coreOrder(spaces, pathed, moved);
  assert.ok(order.indexOf("p") < order.indexOf("w"));
  assert.equal(order.at(-1), "o");
  const tree = buildTree({ spaces, agents: [], subs: [], leads: new Map(), git: pathed, folded: new Set(), foldedAgents: new Set(), multiMachine: false, groups: moved }).tree;
  assert.deepEqual(tree.filter((r) => r.kind === "group").map((r) => r.name), ["Personal", "Work", OTHER]);
});
