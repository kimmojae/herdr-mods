import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, leadPanes, subAgents, groupSpaces, coreOrder, headingKey, litRow, isSpaceRow } from "../mods/spaces-tree/lib/tree.js";

const prog = (key = "claude") => ({ key, name: key, icon: null, tint: false, tile: null, color: null, shell: key === "shell", agent: key !== "shell" });
const tab = (id, o = {}) => ({ id, index: 1, name: id, named: false, active: false, status: null, panes: 1, zoomed: false, settled: false, settled_at: null, changed_at: null, working_since: null, ...o });
const space = (id, tabs, o = {}) => ({ id, index: 1, name: id, named: false, folder: `/f/${id}`, machine: null, branch: null, active: false, status: null, tabs, ...o });
const agent = (address, space, tab, o = {}) => ({
  address, pane: `p-${address}`, space, space_name: space, tab, tab_index: 1, tab_name: tab,
  status: "idle", app: null, program: prog(), title: `t-${address}`, seq: 0, pinned: false, focused: false, ...o,
});
const git = (repo, o = {}) => ({ name: repo, branch: "main", ahead: 0, behind: 0, repo: JSON.stringify([null, `/r/${repo}/.git`]), linked: false, ...o });
const sub = (address, parent, o = {}) => ({ address, parent, status: "working", title: `s-${address}`, program: prog(), kept: false, ...o });

const build = (o) => buildTree({ spaces: [], agents: [], subs: [], leads: new Map(), git: new Map(), folded: new Set(), foldedAgents: new Set(), multiMachine: false, ...o });
const id = (r) => ({ machine: r.machine, repo: r.name, folder: r.space, main: r.space, worktree: r.space, agent: r.address, sub: r.address, tab: r.tab })[r.kind];
const shape = (rows) => rows.map((r) => `${r.depth}:${r.kind}:${id(r)}`);

test("leadPanes keeps the first pane per tab", () => {
  const m = leadPanes([{ pane: "a", tab: "t1" }, { pane: "b", tab: "t1" }, { pane: "c", tab: "t2" }]);
  assert.equal(m.get("t1").pane, "a");
  assert.equal(m.get("t2").pane, "c");
  assert.equal(m.size, 2);
});

test("subAgents: live terminals with a parent, statuses mapped, kept when listed", () => {
  const terms = [
    { address: "a", parent: null, state: "live", status: "working" },
    { address: "k1", parent: "a", state: "live", status: "error", name: "scan", title: "", program: prog() },
    { address: "k2", parent: "a", state: "live", status: "done", template: "tpl", program: prog() },
    { address: "k3", parent: "a", state: "exited", status: "working" },
    { address: "k4", parent: "a", state: "live", status: "working", program: prog("codex") },
  ];
  const listed = [agent("a", "s", "t"), agent("k4", "s", "t", { status: "blocked" })];
  const out = subAgents(terms, listed);
  assert.deepEqual(out.map((s) => [s.address, s.parent, s.status, s.kept]), [
    ["k1", "a", "blocked", false],
    ["k2", "a", "idle", false],
    ["k4", "a", "blocked", true],
  ]);
  assert.equal(out[0].title, "scan");
  assert.equal(out[1].title, "tpl");
  assert.equal(out[2].title, "codex");
});

test("subAgents: a sub's title is the terminal's own title (cleaned) before its name", () => {
  const out = subAgents([{ address: "k", parent: "a", state: "live", status: "working", title: "✳ Explore: Modal", name: "explore", program: prog() }], []);
  assert.equal(out[0].title, "Explore: Modal");
});

test("a repo is a heading; every space of it is a checkout row under it, mains first", () => {
  const spaces = [
    space("main1", [tab("t1")]),
    space("other", [tab("t2")]),
    space("wt1", [tab("t3")]),
    space("main2", [tab("t4")]),
    space("wt2", [tab("t5")]),
  ];
  const g = new Map([
    ["main1", git("acme")],
    ["other", git("zed", { branch: "dev" })],
    ["wt1", git("acme", { linked: true, branch: "fix/a" })],
    ["main2", git("acme")],
    ["wt2", git("acme", { linked: true, branch: "feat/b" })],
  ]);
  const agents = [agent("a1", "main1", "t1"), agent("a3", "wt1", "t3"), agent("a5", "wt2", "t5")];
  const leads = leadPanes([{ pane: "p2", tab: "t2", title: "zsh", program: prog("shell") }, { pane: "p4", tab: "t4", title: "zsh", program: prog("shell") }]);
  const { tree } = build({ spaces, agents, git: g, leads });
  assert.deepEqual(shape(tree), [
    "0:repo:acme",
    "1:main:main1", "2:agent:a1",
    "1:main:main2", "2:tab:t4",
    "1:worktree:wt1", "2:agent:a3",
    "1:worktree:wt2", "2:agent:a5",
    "0:repo:zed",
    "1:main:other", "2:tab:t2",
  ]);
  const head = tree[0];
  assert.equal(head.key, `repo:${g.get("main1").repo}`);
  assert.equal(head.space, "main1");
  assert.deepEqual(head.spaces, ["main1", "main2", "wt1", "wt2"]);
  assert.equal(head.git, null);
  assert.equal(tree[1].key, "space:main1");
  assert.equal(tree[1].heading, head.key);
  assert.equal(tree[1].name, "main");
  assert.equal(tree[5].name, "fix/a");
  assert.equal(tree[5].git.branch, "fix/a");
  assert.equal(tree[10].name, "dev");
  assert.equal(new Set(tree.map((r) => r.key)).size, tree.length);
});

test("a worktree whose main checkout isn't open still sits under its repo heading", () => {
  const spaces = [space("wt", [tab("t1")]), space("other", [tab("t2")])];
  const g = new Map([["wt", git("acme", { linked: true, branch: "feat/x" })], ["other", null]]);
  const { tree } = build({ spaces, git: g });
  assert.deepEqual(shape(tree.filter((r) => r.kind !== "tab")), ["0:repo:acme", "1:worktree:wt", "0:folder:other"]);
  assert.equal(tree[0].space, "wt");
  assert.equal(tree[1].name, "feat/x");
});

test("a detached checkout is named (detached)", () => {
  const { tree } = build({ spaces: [space("m", [tab("t1")])], git: new Map([["m", git("acme", { branch: "(detached)" })]]) });
  assert.equal(tree[1].kind, "main");
  assert.equal(tree[1].name, "(detached)");
});

test("a space not in git, or not known yet, is a folder heading with its rows under it", () => {
  const spaces = [space("new", [tab("t2")]), space("plain", [tab("t3")], { name: "Notes" }), space("main", [tab("t4")])];
  const g = new Map([["plain", null], ["main", git("zed")]]);
  const { tree, hidden } = build({ spaces, git: g });
  assert.deepEqual(shape(tree), ["0:folder:new", "1:tab:t2", "0:folder:plain", "1:tab:t3", "0:repo:zed", "1:main:main", "2:tab:t4"]);
  assert.deepEqual(hidden, ["new"]);
  assert.equal(tree[0].git, undefined);
  assert.equal(tree[2].key, "space:plain");
  assert.equal(tree[2].name, "Notes");
  assert.deepEqual(tree.filter(isSpaceRow).map((r) => r.space), ["new", "plain", "main"]);
});

test("checkout rows carry their own git (for chips); headings carry none", () => {
  const spaces = [space("m", [tab("t1")]), space("w", [tab("t2")])];
  const g = new Map([["m", git("acme", { ahead: 2, changed: 3 })], ["w", git("acme", { linked: true, branch: "b", behind: 1 })]]);
  const { tree } = build({ spaces, git: g });
  assert.equal(tree[0].git, null);
  assert.equal(tree.find((r) => r.space === "m" && r.kind === "main").git.ahead, 2);
  assert.equal(tree.find((r) => r.space === "w" && r.kind === "worktree").git.behind, 1);
});

test("groupSpaces / coreOrder: each repo at its first space, mains first, machines kept apart", () => {
  const spaces = [space("w1", []), space("x", []), space("m", []), space("r", [], { machine: "box" }), space("w2", [])];
  const g = new Map([
    ["w1", git("acme", { linked: true })], ["x", null], ["m", git("acme")],
    ["r", { ...git("acme"), repo: JSON.stringify(["box", "/r/acme/.git"]) }], ["w2", git("acme", { linked: true })],
  ]);
  const groups = groupSpaces(spaces, g);
  assert.deepEqual(groups.map((x) => [x.kind, x.name, x.lead, x.checkouts.map((c) => c.sp.id)]), [
    ["repo", "acme", "m", ["m", "w1", "w2"]],
    ["folder", "x", "x", ["x"]],
    ["repo", "acme", "r", ["r"]],
  ]);
  assert.equal(groups[2].machine, "box");
  assert.deepEqual(coreOrder(spaces, g), ["m", "w1", "w2", "x", "r"]);
  assert.equal(headingKey(spaces[1], null), "space:x");
  assert.equal(headingKey(spaces[1], undefined), "space:x");
});

test("litRow: the focused terminal's agent or sub, else the pane's agent, else the active tab's row", () => {
  const spaces = [space("s", [tab("t1"), tab("t2", { active: true })], { active: true }), space("o", [tab("t3")])];
  const agents = [agent("a", "s", "t1"), agent("b", "o", "t3")];
  const subs = [sub("k", "a")];
  const { tree: rows } = build({ spaces, agents, subs, git: new Map([["s", null], ["o", null]]) });
  const lit = (focused) => litRow({ focused, agents, subs, spaces, rows });
  // focused().agent names an agent elsewhere: never used.
  assert.deepEqual(lit({ space: "s", tab: "t2", pane: "p-zsh", terminal: "tz", agent: "b" }), { tab: "t2" });
  assert.deepEqual(lit({ space: "s", tab: "t1", pane: "p-a", terminal: "a", agent: "b" }), { address: "a" });
  assert.deepEqual(lit({ space: "s", tab: "t1", pane: "p-a", terminal: null, agent: null }), { address: "a" });
  assert.deepEqual(lit({ space: "s", tab: "t1", pane: null, terminal: "k", agent: null }), { address: "k" });
  assert.deepEqual(lit({ space: "s", tab: null, pane: null, terminal: null, agent: null }), { tab: "t2" });
  assert.equal(litRow({ focused: null, agents, subs, spaces, rows }), null);
});

test("litRow: a shell focused beside an agent lights the tab's first drawn agent row; nothing drawn, nothing lit", () => {
  const spaces = [space("s", [tab("t1", { active: true })], { active: true })];
  const agents = [agent("a", "s", "t1"), agent("b", "s", "t1")];
  const focused = { space: "s", tab: "t1", pane: "p-shell", terminal: "tsh", agent: null };
  const rows = build({ spaces, agents, git: new Map([["s", null]]) }).tree;
  assert.deepEqual(litRow({ focused, agents, subs: [], spaces, rows }), { address: "a" });
  // Its only agent pinned (drawn in PINNED, not here): no tab row, no agent row in the tab.
  const pinnedAgents = [agent("a", "s", "t1", { pinned: true })];
  const built = build({ spaces, agents: pinnedAgents, git: new Map([["s", null]]) });
  assert.equal(litRow({ focused, agents: pinnedAgents, subs: [], spaces, rows: built.tree }), null);
  // A focused agent folded away under its heading: nothing lit.
  const folded = build({ spaces, agents, git: new Map([["s", null]]), folded: new Set(["space:s"]) }).tree;
  assert.equal(litRow({ focused: { ...focused, pane: "p-a", terminal: "a" }, agents, subs: [], spaces, rows: folded }), null);
});

test("agents under their space in agents() order, not by urgency", () => {
  const spaces = [space("s", [tab("t1"), tab("t2")])];
  const agents = [agent("a", "s", "t1", { status: "idle" }), agent("b", "s", "t1", { status: "blocked" }), agent("c", "s", "t2", { status: "done" })];
  const { tree } = build({ spaces, agents, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:a", "1:agent:b", "1:agent:c"]);
  const b = tree[2];
  assert.equal(b.key, "agent:b");
  assert.equal(b.status, "blocked");
  assert.equal(b.pane, "p-b");
  assert.equal(b.tab, "t1");
  assert.equal(b.space, "s");
  assert.equal(b.title, "t-b");
});

test("a tab without agents gets one tab row from its lead pane; a tab with agents none", () => {
  const spaces = [space("s", [tab("t1"), tab("t2")])];
  const leads = leadPanes([{ pane: "p1", tab: "t1", title: "zsh ~/acme", program: prog("shell") }, { pane: "p1b", tab: "t1", title: "vim", program: prog("nvim") }, { pane: "p2", tab: "t2", title: "x", program: prog() }]);
  const { tree } = build({ spaces, agents: [agent("a", "s", "t2")], leads, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:tab:t1", "1:agent:a"]);
  const t = tree[1];
  assert.equal(t.key, "tab:t1");
  assert.equal(t.pane, "p1");
  assert.equal(t.title, "zsh ~/acme");
  assert.equal(t.program.key, "shell");
  assert.equal(t.space, "s");
});

test("a pinned agent is only in pinned, even when blocked", () => {
  const spaces = [space("s", [tab("t1")])];
  const agents = [agent("a", "s", "t1", { pinned: true, status: "blocked" }), agent("b", "s", "t1")];
  const { tree, pinned } = build({ spaces, agents, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:b"]);
  assert.deepEqual(shape(pinned), ["0:agent:a"]);
  assert.equal(pinned[0].status, "blocked");
});

test("a settled tab leaves the tree and goes to the settled shelf", () => {
  const spaces = [space("s", [tab("t1", { settled: true, name: "build" }), tab("t2", { settled: true, name: "logs" }), tab("t3")], { name: "acme" })];
  const agents = [agent("a", "s", "t1"), agent("c", "s", "t3")];
  const { tree, settled } = build({ spaces, agents, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:c"]);
  assert.equal(settled.length, 2);
  assert.deepEqual(settled[0], { kind: "tab", key: "settled:t1", space: "s", tab: "t1", name: "build", title: "acme" });
  assert.equal(settled[1].tab, "t2");
});

test("sub-agents follow their parent one step in; a kept sub is listed once", () => {
  const spaces = [space("s", [tab("t1"), tab("t2")])];
  const agents = [agent("a", "s", "t1"), agent("k", "s", "t2", { status: "blocked" })];
  const subs = [sub("x", "a"), sub("k", "a", { kept: true, status: "blocked" }), sub("y", "x", { status: "idle" })];
  const { tree } = build({ spaces, agents, subs, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:a", "2:sub:x", "3:sub:y", "2:sub:k"]);
  assert.equal(tree[1].subs, 3);
  assert.equal(tree[2].key, "sub:x");
  assert.equal(tree[4].status, "blocked");
  assert.equal(new Set(tree.map((r) => r.key)).size, tree.length);
});

test("a sub row's level counts the steps below its agent, wherever the agent sits", () => {
  const spaces = [space("s", [tab("t1")])];
  const agents = [agent("a", "s", "t1")];
  const subs = [sub("x", "a"), sub("y", "x")];
  const { tree } = build({ spaces, agents, subs, git: new Map([["s", null]]) });
  assert.deepEqual(tree.filter((r) => r.kind === "sub").map((r) => [r.depth, r.level]), [[2, 1], [3, 2]]);
  const { pinned } = build({ spaces, agents: [agent("a", "s", "t1", { pinned: true })], subs, git: new Map([["s", null]]) });
  assert.deepEqual(pinned.filter((r) => r.kind === "sub").map((r) => [r.depth, r.level]), [[1, 1], [2, 2]]);
});

test("a pinned kept sub shows only in pinned, once, when its parent is unpinned", () => {
  const spaces = [space("s", [tab("t1"), tab("t2")])];
  const agents = [agent("a", "s", "t1"), agent("k", "s", "t2", { pinned: true })];
  const subs = [sub("k", "a", { kept: true }), sub("y", "k")];
  const { tree, pinned } = build({ spaces, agents, subs, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:a"]);
  assert.equal(tree[1].subs, 0);
  assert.deepEqual(shape(pinned), ["0:agent:k", "1:sub:y"]);
});

test("a pinned kept sub shows once in pinned when its parent is pinned too", () => {
  const spaces = [space("s", [tab("t1"), tab("t2")])];
  const agents = [agent("a", "s", "t1", { pinned: true }), agent("k", "s", "t2", { pinned: true })];
  const subs = [sub("k", "a", { kept: true }), sub("x", "a")];
  const { tree, pinned } = build({ spaces, agents, subs, git: new Map([["s", null]]) });
  assert.deepEqual(shape(pinned), ["0:agent:a", "1:sub:x", "0:agent:k"]);
  assert.equal(pinned.filter((r) => r.address === "k").length, 1);
  assert.deepEqual(shape(tree), ["0:folder:s"]);
});

test("a kept sub whose parent sits in a settled tab is an agent row in its own tab", () => {
  const spaces = [space("s", [tab("t1", { settled: true }), tab("t2")])];
  const agents = [agent("a", "s", "t1"), agent("k", "s", "t2")];
  const subs = [sub("k", "a", { kept: true })];
  const { tree, settled } = build({ spaces, agents, subs, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:k"]);
  assert.equal(settled.length, 1);
});

test("a kept sub whose parent's space isn't listed is an agent row in its own tab", () => {
  const spaces = [space("s", [tab("t2")])];
  const agents = [agent("a", "gone", "t9"), agent("k", "s", "t2")];
  const subs = [sub("k", "a", { kept: true })];
  const { tree } = build({ spaces, agents, subs, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:k"]);
});

test("a kept sub under a folded parent stays hidden (folds count as drawn)", () => {
  const spaces = [space("s", [tab("t1"), tab("t2")])];
  const agents = [agent("a", "s", "t1"), agent("k", "s", "t2")];
  const subs = [sub("k", "a", { kept: true })];
  const { tree } = build({ spaces, agents, subs, git: new Map([["s", null]]), foldedAgents: new Set(["a"]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:a"]);
  assert.equal(tree[1].subs, 1);
});

test("a pinned agent in a settled tab shows only in pinned; the tab is still settled", () => {
  const spaces = [space("s", [tab("t1", { settled: true }), tab("t2")])];
  const agents = [agent("a", "s", "t1", { pinned: true }), agent("b", "s", "t1")];
  const { tree, pinned, settled } = build({ spaces, agents, git: new Map([["s", null]]), leads: leadPanes([{ pane: "p2", tab: "t2", title: "zsh", program: prog("shell") }]) });
  assert.deepEqual(shape(pinned), ["0:agent:a"]);
  assert.deepEqual(shape(tree), ["0:folder:s", "1:tab:t2"]);
  assert.deepEqual(settled.map((r) => r.tab), ["t1"]);
});

test("an agent whose tab isn't in space.tabs yet is appended after the tabs", () => {
  const spaces = [space("s", [tab("t1")])];
  const agents = [agent("late", "s", "t-new"), agent("a", "s", "t1")];
  const { tree } = build({ spaces, agents, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:a", "1:agent:late"]);
});

test("a tab row without a lead pane falls back to the tab name and no program", () => {
  const spaces = [space("s", [tab("t1", { name: "build" })])];
  const { tree } = build({ spaces, git: new Map([["s", null]]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:tab:t1"]);
  assert.equal(tree[1].title, "build");
  assert.equal(tree[1].program, null);
  assert.equal(tree[1].pane, undefined);
});

test("a folded agent hides its subs and shows their count and most urgent status", () => {
  const spaces = [space("s", [tab("t1")])];
  const agents = [agent("a", "s", "t1", { status: "working" })];
  const subs = [sub("x", "a", { status: "working" }), sub("y", "a", { status: "blocked" }), sub("z", "x", { status: "idle" })];
  const { tree } = build({ spaces, agents, subs, git: new Map([["s", null]]), foldedAgents: new Set(["a"]) });
  assert.deepEqual(shape(tree), ["0:folder:s", "1:agent:a"]);
  assert.equal(tree[1].subs, 3);
  assert.equal(tree[1].folded, true);
  assert.equal(tree[1].mark, "blocked");
});

test("a folded heading has no children; its mark is the most urgent of all its checkouts", () => {
  const spaces = [space("m", [tab("t1")]), space("w", [tab("t2")]), space("q", [tab("t3")])];
  const g = new Map([["m", git("acme")], ["w", git("acme", { linked: true })], ["q", git("zed")]]);
  const agents = [agent("a", "m", "t1", { status: "working" }), agent("b", "w", "t2", { status: "done" })];
  const folded = new Set([headingKey(spaces[0], g.get("m")), headingKey(spaces[2], g.get("q"))]);
  const { tree } = build({ spaces, agents, git: g, folded });
  assert.deepEqual(shape(tree), ["0:repo:acme", "0:repo:zed"]);
  assert.equal(tree[0].folded, true);
  assert.equal(tree[0].mark, "done");
  assert.equal(tree[1].mark, null);
  // A space id is not a heading key: nothing folds.
  assert.equal(build({ spaces, agents, git: g, folded: new Set(["m"]) }).tree[0].folded, false);
});

test("a folded folder heading hides its rows", () => {
  const { tree } = build({ spaces: [space("s", [tab("t1")])], agents: [agent("a", "s", "t1", { status: "blocked" })], git: new Map([["s", null]]), folded: new Set(["space:s"]) });
  assert.deepEqual(shape(tree), ["0:folder:s"]);
  assert.equal(tree[0].mark, "blocked");
});

test("a folded repo counts a folded agent's own status as well as its subs'", () => {
  const spaces = [space("m", [tab("t1")])];
  const agents = [agent("a", "m", "t1", { status: "blocked" })];
  const subs = [sub("x", "a", { status: "idle" })];
  const { tree } = build({ spaces, agents, subs, git: new Map([["m", null]]), folded: new Set(["space:m"]), foldedAgents: new Set(["a"]) });
  assert.equal(tree[0].mark, "blocked");
});

test("an unfolded repo has no mark", () => {
  const spaces = [space("m", [tab("t1")])];
  const { tree } = build({ spaces, agents: [agent("a", "m", "t1", { status: "blocked" })], git: new Map([["m", null]]) });
  assert.equal(tree[0].folded, false);
  assert.equal(tree[0].mark, null);
});

test("no machine rows on one machine; with several, this computer first then first-seen order", () => {
  const spaces = [space("r1", [tab("t1")], { machine: "box" }), space("l1", [tab("t2")]), space("r2", [tab("t3")], { machine: "arm" }), space("r3", [tab("t4")], { machine: "box" })];
  const g = new Map(spaces.map((s) => [s.id, null]));
  const leads = new Map();
  const one = build({ spaces: [spaces[1]], git: g, leads }).tree;
  assert.equal(one.some((r) => r.kind === "machine"), false);
  const { tree } = build({ spaces, git: g, leads, multiMachine: true });
  assert.deepEqual(tree.filter((r) => r.kind !== "tab").map((r) => `${r.depth}:${r.kind}:${r.kind === "machine" ? r.machine : r.space}`), [
    "0:machine:null", "1:folder:l1",
    "0:machine:box", "1:folder:r1", "1:folder:r3",
    "0:machine:arm", "1:folder:r2",
  ]);
  assert.equal(tree.find((r) => r.kind === "tab" && r.tab === "t2").depth, 2);
  assert.equal(new Set(tree.map((r) => r.key)).size, tree.length);
});

test("a folded machine has no children", () => {
  const spaces = [space("l1", [tab("t1")]), space("r1", [tab("t2")], { machine: "box" })];
  const g = new Map(spaces.map((s) => [s.id, null]));
  const agents = [agent("a", "r1", "t2", { status: "blocked" })];
  const { tree } = build({ spaces, agents, git: g, multiMachine: true, foldedMachines: new Set(["box"]) });
  assert.deepEqual(shape(tree.filter((r) => r.kind !== "tab")), ["0:machine:null", "1:folder:l1", "0:machine:box"]);
  assert.equal(tree.at(-1).folded, true);
  assert.equal(tree.at(-1).mark, "blocked");
});

test("named tab: one agent shows the tab name (own title to tip); several, unnamed, pinned keep theirs", () => {
  const one = build({ spaces: [space("s", [tab("t", { name: "api", named: true })])], agents: [agent("a", "s", "t", { title: "✦ Fixing bug" })] }).tree;
  const r = one.find((x) => x.kind === "agent");
  assert.equal(r.title, "api");
  assert.equal(r.tip, "Fixing bug");
  const many = build({ spaces: [space("s", [tab("t", { name: "api", named: true })])], agents: [agent("a", "s", "t"), agent("b", "s", "t")] }).tree;
  assert.deepEqual(many.filter((x) => x.kind === "agent").map((x) => [x.title, x.tip]), [["t-a", undefined], ["t-b", undefined]]);
  const plain = build({ spaces: [space("s", [tab("t")])], agents: [agent("a", "s", "t")] }).tree;
  assert.equal(plain.find((x) => x.kind === "agent").title, "t-a");
  const noAgent = build({ spaces: [space("s", [tab("t", { name: "api", named: true })])] }).tree;
  assert.equal(noAgent.find((x) => x.kind === "tab").title, "api");
});

test("a folded heading whose agents are all idle carries no mark", () => {
  const { tree } = build({ spaces: [space("s", [tab("t1")])], agents: [agent("a", "s", "t1", { status: "idle" })], git: new Map([["s", null]]), folded: new Set(["space:s"]) });
  assert.equal(tree[0].folded, true);
  assert.equal(tree[0].mark, null);
});
