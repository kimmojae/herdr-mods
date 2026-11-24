import { test } from "node:test";
import assert from "node:assert/strict";
import { expand, within, parseRules, groupOf, arrangeGroups, showHeaders, groupKey, groupMarks, OTHER } from "../mods/spaces-tree/lib/groups.js";
import { buildTree, coreOrder, groupKeys } from "../mods/spaces-tree/lib/tree.js";
import { pruneFolds } from "../mods/spaces-tree/lib/folds.js";
import { dropOk } from "../mods/spaces-tree/lib/order.js";

const HOME = "/Users/me";
const RULES = [{ name: "Work", path: "~/code/work" }, { name: "Personal", path: "~/code/personal/" }];

test("expand: ~ with the home, trailing and doubled slashes, relative and homeless ~ are null", () => {
  assert.equal(expand("~/code/work/", HOME), "/Users/me/code/work");
  assert.equal(expand("~", HOME + "/"), "/Users/me");
  assert.equal(expand("/a//b///", HOME), "/a/b");
  assert.equal(expand("/", HOME), "/");
  assert.equal(expand("~/x", null), null);
  assert.equal(expand("code/x", HOME), null);
  assert.equal(expand("", HOME), null);
});

test("within is segment-aware", () => {
  assert.ok(within("/a/b", "/a"));
  assert.ok(within("/a", "/a"));
  assert.ok(!within("/ab", "/a"));
  assert.ok(within("/anything", "/"));
});

test("groupOf: the longest prefix wins, by whole segments; unmatched is Other", () => {
  const rules = [{ name: "Dev", path: "~/Dev" }, { name: "BSG", path: "~/Dev/BSG" }];
  assert.equal(groupOf("/Users/me/Dev/BSG/api", rules, HOME), "BSG");
  assert.equal(groupOf("/Users/me/Dev/BSGx/api", rules, HOME), "Dev");
  assert.equal(groupOf("/Users/me/Dev/BSG", rules, HOME), "BSG");
  assert.equal(groupOf("/Users/me/Dev/BSG/", rules, HOME), "BSG");
  assert.equal(groupOf("/opt/x", rules, HOME), OTHER);
  assert.equal(groupOf(null, rules, HOME), OTHER);
  // Rule order doesn't decide, the length does.
  assert.equal(groupOf("/Users/me/Dev/BSG/api", [...rules].reverse(), HOME), "BSG");
});

test("groupOf: without a home only absolute rules match", () => {
  const rules = [{ name: "Work", path: "~/code/work" }, { name: "Srv", path: "/srv" }];
  assert.equal(groupOf("/home/u/code/work/a", rules, null), OTHER);
  assert.equal(groupOf("/srv/app", rules, null), "Srv");
});

test("parseRules: the shape, skipping bad entries; bad JSON is not ok; no file is ok", () => {
  assert.deepEqual(parseRules(JSON.stringify({ groups: [{ name: " Work ", path: "~/w" }, { name: "", path: "/x" }, { path: "/y" }, null] })), { rules: [{ name: "Work", path: "~/w" }], ok: true });
  assert.equal(parseRules("{ nope").ok, false);
  assert.deepEqual(parseRules("{ nope").rules, []);
  assert.equal(parseRules("[]").ok, false);
  assert.deepEqual(parseRules(null), { rules: [], ok: true });
});

test("arrangeGroups: rule order, Other last, empty groups out, a name used twice is one group", () => {
  const items = ["/opt/z", "/Users/me/code/personal/b", "/Users/me/code/work/a", "/Users/me/code/work2/c"];
  const out = arrangeGroups(items, (p) => p, RULES, HOME);
  assert.deepEqual(out, [
    { name: "Work", items: ["/Users/me/code/work/a"] },
    { name: "Personal", items: ["/Users/me/code/personal/b"] },
    { name: OTHER, items: ["/opt/z", "/Users/me/code/work2/c"] },
  ]);
  const twice = arrangeGroups(["/b", "/a"], (p) => p, [{ name: "X", path: "/a" }, { name: "Y", path: "/c" }, { name: "X", path: "/b" }], HOME);
  assert.deepEqual(twice, [{ name: "X", items: ["/b", "/a"] }]);
  assert.ok(!showHeaders(twice));
  assert.ok(!showHeaders(arrangeGroups(["/opt"], (p) => p, RULES, HOME)));
  assert.ok(showHeaders(out));
});

test("groupMarks: distinct states, most urgent first, at most 3, idle left out", () => {
  assert.deepEqual(groupMarks([{ status: "working" }, { status: "idle" }, { mark: "blocked" }, { status: "working" }]), ["blocked", "working"]);
  assert.deepEqual(groupMarks([{ status: "idle" }]), []);
  assert.deepEqual(groupMarks([{ status: "idle" }, { status: "done" }, { status: "working" }, { status: "blocked" }]), ["blocked", "done", "working"]);
  assert.deepEqual(groupMarks([{ kind: "tab" }]), []);
});

// The tree with groups.
const tab = (id) => ({ id, index: 1, name: id, named: false, active: false, settled: false });
const space = (id, o = {}) => ({ id, name: id, folder: `/f/${id}`, machine: null, active: false, tabs: [tab(`t-${id}`)], ...o });
const agent = (address, sp, status = "idle") => ({ address, pane: `p-${address}`, space: sp, tab: `t-${sp}`, status, program: null, title: address, pinned: false });
const git = (dir, o = {}) => ({ name: dir.split("/").pop(), branch: "main", state: null, repo: JSON.stringify([null, `${dir}/.git`]), linked: false, ...o });
const groupsFor = (sp) => ({ rules: RULES, homes: new Map([[null, HOME]]), places: new Map(sp.map((s) => [s.id, s.folder])) });
const build = (o) => buildTree({ agents: [], subs: [], leads: new Map(), folded: new Set(), foldedAgents: new Set(), multiMachine: false, ...o });
const label = (r) => `${r.kind}:${r.kind === "group" ? `${r.name}/${r.count}` : r.name ?? r.address ?? r.space}`;

const W = "/Users/me/code/work";
const P = "/Users/me/code/personal";
const sample = () => {
  const sp = [space("o1", { folder: "/opt/o1" }), space("w1"), space("p1"), space("w1-wt"), space("w2")];
  const g = new Map([
    ["o1", null],
    ["w1", git(`${W}/api`)],
    ["p1", git(`${P}/blog`)],
    // A worktree elsewhere follows its repo's main folder.
    ["w1-wt", git(`${W}/api`, { linked: true, branch: "feat" })],
    ["w2", git(`${W}/web`)],
  ]);
  return { sp, g };
};

test("group headers sit between the machine and the headings, rule order, Other last, no indent", () => {
  const { sp, g } = sample();
  const { tree } = build({ spaces: sp, git: g, agents: [agent("a1", "w1", "working")], groups: groupsFor(sp) });
  assert.deepEqual(tree.filter((r) => r.kind === "group" || r.kind === "repo" || r.kind === "folder").map(label), [
    "group:Work/2", "repo:api", "repo:web",
    "group:Personal/1", "repo:blog",
    "group:Other/1", "folder:o1",
  ]);
  // Same depths as without groups.
  const plain = build({ spaces: sp, git: g, agents: [agent("a1", "w1", "working")] }).tree;
  const depth = (rows) => Object.fromEntries(rows.filter((r) => r.kind !== "group").map((r) => [r.key, r.depth]));
  assert.deepEqual(depth(tree), depth(plain));
  assert.ok(tree.filter((r) => r.kind === "group").every((r) => r.depth === 0));
  assert.deepEqual(tree.find((r) => r.name === "Work").spaces, ["w1", "w1-wt", "w2"]);
  // Herdr's order follows: Work's spaces, then Personal's, then Other's.
  assert.deepEqual(coreOrder(sp, g, groupsFor(sp)), ["w1", "w1-wt", "w2", "p1", "o1"]);
  assert.deepEqual(coreOrder(sp, g), ["o1", "w1", "w1-wt", "p1", "w2"]);
});

test("one group on a machine (Other included): no headers, the tree as without rules", () => {
  const { sp, g } = sample();
  const only = sp.filter((s) => s.id.startsWith("w"));
  const a = build({ spaces: only, git: g, groups: groupsFor(only) }).tree;
  assert.deepEqual(a, build({ spaces: only, git: g }).tree);
  const other = [space("x", { folder: "/opt/x" })];
  assert.deepEqual(build({ spaces: other, git: new Map([["x", null]]), groups: groupsFor(other) }).tree.map((r) => r.kind), ["folder", "tab"]);
  assert.deepEqual(coreOrder(only, g, groupsFor(only)), coreOrder(only, g));
});

test("a folded group keeps its header with the distinct marks inside; its fold is per machine", () => {
  const { sp, g } = sample();
  const ag = [agent("a1", "w1", "working"), agent("a2", "w2", "blocked"), agent("a3", "p1", "done")];
  const key = groupKey(null, "Work");
  const { tree } = build({ spaces: sp, git: g, agents: ag, groups: groupsFor(sp), folded: new Set([key, "repo:" + g.get("w2").repo]) });
  const work = tree.find((r) => r.key === key);
  assert.equal(work.folded, true);
  assert.deepEqual(work.marks, ["blocked", "working"]);
  assert.equal(work.mark, "blocked");
  assert.ok(!tree.some((r) => r.space === "w1" || r.space === "w2"));
  assert.ok(tree.some((r) => r.address === "a3"));
  assert.notEqual(groupKey(null, "Work"), groupKey("box", "Work"));
});

test("multi-machine: groups per machine; a remote machine without a home matches only absolute rules", () => {
  const sp = [space("l1"), space("l2", { folder: "/opt/l2" }), space("r1", { machine: "box" }), space("r2", { machine: "box" })];
  const g = new Map([
    ["l1", git(`${W}/api`)], ["l2", null],
    ["r1", git("/home/u/code/work/api", { repo: JSON.stringify(["box", "/home/u/code/work/api/.git"]) })],
    ["r2", git("/srv/x", { repo: JSON.stringify(["box", "/srv/x/.git"]) })],
  ]);
  const groups = { rules: [...RULES, { name: "Srv", path: "/srv" }], homes: new Map([[null, HOME]]), places: new Map(sp.map((s) => [s.id, s.folder])) };
  const { tree } = build({ spaces: sp, git: g, groups, multiMachine: true });
  assert.deepEqual(tree.filter((r) => r.kind === "machine" || r.kind === "group").map((r) => `${r.kind}:${r.name}`), [
    "machine:This computer", "group:Work", "group:Other",
    "machine:box", "group:Srv", "group:Other",
  ]);
  assert.ok(tree.filter((r) => r.kind === "group").every((r) => r.depth === 1));
  // A folded machine reads a folded group's mark.
  const ag = [agent("a", "l1", "blocked")];
  const folded = build({ spaces: sp, git: g, groups, multiMachine: true, agents: ag, folded: new Set([groupKey(null, "Work")]), foldedMachines: new Set([null]) }).tree;
  assert.equal(folded.find((r) => r.kind === "machine" && r.machine === null).mark, "blocked");
});

test("group folds: kept while the rules aren't read, kept while a heading falls in the group, gone on a ready machine otherwise", () => {
  const { sp, g } = sample();
  const ready = [{ name: null, layout: "ready" }];
  const work = groupKey(null, "Work");
  const gone = groupKey(null, "Gone");
  const keys = groupKeys(sp, g, groupsFor(sp));
  assert.ok(keys.has(work) && keys.has(groupKey(null, OTHER)));
  let folds = new Map([[work, null], [gone, null]]);
  assert.equal(pruneFolds(folds, sp, ready, false, g, null), false);
  assert.equal(folds.size, 2);
  assert.equal(pruneFolds(folds, sp, ready, false, g, keys), true);
  assert.deepEqual([...folds.keys()], [work]);
  // A machine still loading keeps them.
  folds = new Map([[gone, null]]);
  assert.equal(pruneFolds(folds, sp, [{ name: null, layout: "loading" }], false, g, keys), false);
  // A space whose git isn't known yet keeps them too.
  const unknown = new Map(g);
  unknown.delete("p1");
  assert.equal(pruneFolds(folds, sp, ready, false, unknown, keys), false);
  // A repo heading's fold is still the repo heading's.
  folds = new Map([["repo:" + g.get("w1").repo, null]]);
  assert.equal(pruneFolds(folds, sp, ready, false, g, keys), false);
});

test("a heading drops only on a heading of its own group", () => {
  const h = (key, band) => ({ key, ids: [key], group: key, machine: null, main: false, heading: true, band });
  assert.ok(dropOk(h("a", "group:x"), h("b", "group:x")));
  assert.ok(!dropOk(h("a", "group:x"), h("b", "group:y")));
  assert.ok(dropOk(h("a"), h("b")));
});
