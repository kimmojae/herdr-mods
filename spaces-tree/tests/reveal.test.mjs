import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree } from "../mods/spaces-tree/lib/tree.js";
import { groupKey } from "../mods/spaces-tree/lib/groups.js";
import { ancestors, revealKeys, nothing, moment } from "../mods/spaces-tree/lib/reveal.js";

const prog = { key: "claude", name: "claude", icon: null, tint: false, tile: null, color: null, shell: false, agent: true };
const tab = (id, o = {}) => ({ id, index: 1, name: id, named: false, active: false, status: null, panes: 1, zoomed: false, settled: false, changed_at: null, ...o });
const space = (id, tabs, o = {}) => ({ id, index: 1, name: id, named: false, folder: `/f/${id}`, machine: null, active: false, tabs, ...o });
const agent = (address, space, tab, o = {}) => ({ address, pane: `p-${address}`, space, tab, status: "idle", program: prog, title: `t-${address}`, pinned: false, ...o });
const git = (dir, o = {}) => ({ name: dir.split("/").pop(), branch: "main", state: null, repo: JSON.stringify([null, `${dir}/.git`]), linked: false, ...o });
const sub = (address, parent) => ({ address, parent, status: "working", title: address, program: prog, kept: false });

// Work: acme (a main m1, a worktree w1), zed; Personal: blog; a folder f1 (Other).
const HOME = "/Users/me";
const W = "/Users/me/code/work";
const RULES = [{ name: "Work", path: "~/code/work" }, { name: "Personal", path: "~/code/personal" }];
const spaces = [
  space("m1", [tab("t1")]), space("w1", [tab("t2")]), space("z1", [tab("t3")]),
  space("b1", [tab("t5")], { folder: "/Users/me/code/personal/blog" }), space("f1", [tab("t4")], { folder: "/opt/f1" }),
];
const g = new Map([
  ["m1", git(`${W}/acme`)], ["w1", git(`${W}/acme`, { linked: true, branch: "fix" })], ["z1", git(`${W}/zed`)],
  ["b1", git("/Users/me/code/personal/blog")], ["f1", null],
]);
const agents = [agent("a1", "m1", "t1"), agent("a2", "w1", "t2"), agent("a3", "z1", "t3"), agent("pin", "m1", "t1", { pinned: true })];
const subs = [sub("s1", "a2"), sub("s2", "s1")];
const groupsFor = { rules: RULES, homes: new Map([[null, HOME]]), places: new Map(spaces.map((s) => [s.id, s.folder])) };
const open = (o = {}) => buildTree({ spaces, agents, subs, leads: new Map(), git: g, folded: new Set(), foldedAgents: new Set(), multiMachine: false, ...o }).tree;
const ACME = `repo:${g.get("m1").repo}`;
const ZED = `repo:${g.get("z1").repo}`;
const WORK = groupKey(null, "Work");
const folds = (o = {}) => ({ headings: new Set(), machines: new Set(), agents: new Set(), ...o });

test("ancestors: a sub-agent's are its repo, checkout, agent and parent sub", () => {
  assert.deepEqual(ancestors(open(), { address: "s2" }).map((r) => r.key), [ACME, "space:w1", "agent:a2", "sub:s1"]);
  assert.deepEqual(ancestors(open(), { space: "m1" }).map((r) => r.key), [ACME]);
  assert.deepEqual(ancestors(open(), { tab: "t4" }).map((r) => r.key), ["space:f1"]);
  assert.deepEqual(ancestors(open(), null), []);
});

test("nothing folded: nothing to open", () => {
  assert.ok(nothing(revealKeys(open(), { address: "a1" }, folds())));
});

test("a folded repo opens; other folded repos stay folded", () => {
  const k = revealKeys(open(), { address: "a1" }, folds({ headings: new Set([ACME, ZED]) }));
  assert.deepEqual(k, { headings: [ACME], machines: [], agents: [] });
});

test("a folded folder heading opens for its tab", () => {
  const k = revealKeys(open(), { tab: "t4" }, folds({ headings: new Set(["space:f1"]) }));
  assert.deepEqual(k.headings, ["space:f1"]);
});

test("a folded group opens with the repo heading inside it", () => {
  const k = revealKeys(open({ groups: groupsFor }), { address: "a3" }, folds({ headings: new Set([WORK, ZED, ACME]) }));
  assert.deepEqual(k.headings, [WORK, ZED]);
});

test("a folded machine opens", () => {
  const sp = [space("l1", [tab("t1")]), space("r1", [tab("t2")], { machine: "box" })];
  const rows = buildTree({ spaces: sp, agents: [agent("a", "r1", "t2")], subs: [], leads: new Map(), git: new Map(sp.map((s) => [s.id, null])),
    folded: new Set(), foldedAgents: new Set(), multiMachine: true }).tree;
  const k = revealKeys(rows, { address: "a" }, folds({ machines: new Set(["box", null]) }));
  assert.deepEqual(k.machines, ["box"]);
});

test("a sub-agent under folded parents opens them", () => {
  const k = revealKeys(open(), { address: "s2" }, folds({ agents: new Set(["a2", "s1", "a1"]) }));
  assert.deepEqual(k.agents, ["a2", "s1"]);
});

test("a pinned agent opens nothing", () => {
  assert.ok(nothing(revealKeys(open(), { address: "pin" }, folds({ headings: new Set([ACME]) }))));
});

test("moment: changes with focus, the lit status, the shown tab's changed_at, a new tab or pane; not otherwise", () => {
  const sp = space("m1", [tab("t1", { active: true, changed_at: 10 }), tab("t9")]);
  const ps = [{ pane: "p1", tab: "t1" }, { pane: "q", tab: "elsewhere" }];
  const base = { focused: { space: "m1", tab: "t1", pane: "p1", terminal: "a1" }, target: { address: "a1" }, above: [ACME], status: "idle", space: sp, panes: ps };
  const m = moment(base);
  assert.equal(moment({ ...base }), m);
  assert.equal(moment({ ...base, panes: [...ps, { pane: "r", tab: "other" }] }), m);
  assert.notEqual(moment({ ...base, focused: { ...base.focused, pane: "p2" } }), m);
  assert.notEqual(moment({ ...base, status: "working" }), m);
  assert.notEqual(moment({ ...base, above: [ZED] }), m);
  assert.notEqual(moment({ ...base, space: space("m1", [tab("t1", { active: true, changed_at: 11 }), tab("t9")]) }), m);
  assert.notEqual(moment({ ...base, space: space("m1", [tab("t1", { active: true, changed_at: 10 }), tab("t9"), tab("t10")]) }), m);
  assert.notEqual(moment({ ...base, space: space("m1", [tab("t1", { active: true, changed_at: 10, panes: 2 }), tab("t9")]) }), m);
  assert.notEqual(moment({ ...base, panes: [...ps, { pane: "p3", tab: "t9" }] }), m);
});
