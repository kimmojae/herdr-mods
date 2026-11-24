// The sidebar's rows: machine → repo heading → checkout (one per space: ⌂ main, ⑂ worktree)
// → agent → sub-agent, plus the pinned group and the settled shelf. A space not in git is a
// folder heading with its rows right under it. Pure: the host reads Herdr once per pass and
// passes it in. Sub-agents and their statuses are the shipped agents mod's (A:55-58, 171-180, 233).
import { rowTitle, clean } from "./time.js";
import { repoFolder } from "./git.js";
import { arrangeGroups, showHeaders, groupKey, groupMarks } from "./groups.js";

/** @typedef {{name:string, branch:string, state:import("./gitstatus.js").GitState|null, repo:string, linked:boolean}} Git */
/** @typedef {{address:string, parent:string, status:"working"|"blocked"|"done"|"idle", title:string, program:object, kept:boolean}} Sub */
/** @typedef {{rules:{name:string, path:string}[], homes?:Map<string|null, string|null>, places?:Map<string, string>, orders?:Map<string|null, string[]>}} Groups
 *  rules (lib/groups.js), each machine's home (null: `~` rules don't match there), where each space is (folder headings),
 *  each machine's dragged group order (lib/groups.js readGroupOrder). */
/** @typedef {{kind:"machine"|"group"|"repo"|"folder"|"main"|"worktree"|"agent"|"sub"|"tab", key:string, depth:number,
 *   space?:string, spaces?:string[], heading?:string, path?:string|null, machine?:string|null, name?:string, git?:Git|null, mark?:string|null, folded?:boolean,
 *   address?:string, pane?:string, tab?:string, status?:string, title?:string, program?:object, subs?:number, level?:number}} Row */

// Idle has no rank: a folded row shows a mark only when there's something to look at.
const RANK = { blocked: 3, done: 2, working: 1 };

/** The most urgent status among rows and the marks of folded ones (blocked > done > working; idle shows none), else null. */
const urgent = (rows) => {
  let best = null;
  for (const r of rows) {
    for (const s of [r.status, r.mark]) if (RANK[s] && (!best || RANK[s] > RANK[best])) best = s;
  }
  return best;
};

/** Rows that stand for one space: checkout rows and folder headings. */
export const isSpaceRow = (r) => r.kind === "main" || r.kind === "worktree" || r.kind === "folder";

/** A space's heading: its repo (Git.repo, which names the machine too), else the space itself. */
export const headingKey = (sp, g) => (g ? `repo:${g.repo}` : `space:${sp.id}`);

/**
 * Spaces under their headings, each heading where its first space is in spaces() order; under
 * a repo, the main checkouts first, then the linked worktrees, each in spaces() order. A space
 * whose git is null or not known yet is a folder heading of its own.
 * @param {{id:string, name?:string, machine?:string|null}[]} spaces
 * @param {Map<string, Git|null|undefined>} git
 * @returns {{key:string, kind:"repo"|"folder", name:string, machine:string|null, path:string|null, lead:string,
 *   checkouts:{sp:object, g:Git|null|undefined}[]}[]}
 */
export function groupSpaces(spaces, git) {
  const groups = new Map();
  for (const sp of spaces) {
    const g = git.get(sp.id);
    const key = headingKey(sp, g);
    if (!groups.has(key)) groups.set(key, { key, kind: g ? "repo" : "folder", name: g ? g.name : sp.name, machine: sp.machine ?? null, path: repoFolder(g), mains: [], linked: [] });
    const grp = groups.get(key);
    (g?.linked ? grp.linked : grp.mains).push({ sp, g });
  }
  return [...groups.values()].map(({ mains, linked, ...grp }) => {
    const checkouts = [...mains, ...linked];
    return { ...grp, lead: checkouts[0].sp.id, checkouts };
  });
}

// A heading's folder for its group: a repo's own folder (the main checkout), a folder
// heading's place (where the space is now), else the folder it was made in.
const headPath = (grp, places) => (grp.kind === "repo" ? grp.path : (places?.get(grp.lead) ?? grp.checkouts[0].sp.folder));

/**
 * One machine's headings (groupSpaces) under their groups (lib/groups.js), or null when no
 * header would show (no rules, or a single group).
 * @param {ReturnType<typeof groupSpaces>} heads
 * @param {Groups|null|undefined} groups
 * @param {string|null} machine
 */
export function groupHeadings(heads, groups, machine) {
  if (!groups?.rules?.length || !heads.length) return null;
  const out = arrangeGroups(heads, (h) => headPath(h, groups.places), groups.rules, groups.homes?.get(machine ?? null) ?? null,
    groups.orders?.get(machine ?? null) ?? null);
  return showHeaders(out) ? out : null;
}

/** Every group key a heading falls in (headers shown or not), with its machine: what a group fold may keep. */
export function groupKeys(spaces, git, groups) {
  const out = new Map();
  if (!groups?.rules?.length) return out;
  for (const h of groupSpaces(spaces, git)) {
    for (const g of arrangeGroups([h], (x) => headPath(x, groups.places), groups.rules, groups.homes?.get(h.machine) ?? null)) out.set(groupKey(h.machine, g.name), h.machine);
  }
  return out;
}

/**
 * Herdr's own space order to keep: the displayed one (each repo's spaces together; with group
 * headers on a machine, its headings in group order (rules, or the dragged order), in the slots its headings had, so
 * machines stay interleaved as they were).
 * @param {Groups|null} [groups]
 */
export function coreOrder(spaces, git, groups = null) {
  const heads = groupSpaces(spaces, git);
  if (groups?.rules?.length) {
    for (const m of new Set(heads.map((h) => h.machine))) {
      const slots = heads.map((h, i) => (h.machine === m ? i : -1)).filter((i) => i >= 0);
      const sorted = groupHeadings(slots.map((i) => heads[i]), groups, m)?.flatMap((g) => g.items);
      if (sorted) slots.forEach((at, i) => { heads[at] = sorted[i]; });
    }
  }
  return heads.flatMap((g) => g.checkouts.map((c) => c.sp.id));
}

/**
 * The one lit row among the drawn rows (PINNED and the tree as built): the agent or sub-agent
 * row of the focused terminal (focused().terminal), else of the agent in the focused pane.
 * Focus not on an agent (a shell beside an agent, a tool): the shown tab's tab row, else that
 * tab's first drawn agent row. Nothing when the row it would be isn't drawn (folded away,
 * pinned or settled elsewhere). focused().agent is not used: it is the agent an agent block
 * shows, not what has focus.
 * @param {{focused:object|null, agents:object[], subs:object[], spaces:object[], rows:Row[]}} a
 * @returns {{address:string}|{tab:string}|null}
 */
export function litRow({ focused, agents, subs, spaces, rows }) {
  if (!focused) return null;
  const drawn = (addr) => rows.some((r) => (r.kind === "agent" || r.kind === "sub") && r.address === addr);
  const t = focused.terminal;
  let target = t && (agents.some((a) => a.address === t) || subs.some((s) => s.address === t)) ? t : null;
  if (!target && focused.pane) target = agents.find((x) => x.pane === focused.pane)?.address ?? null;
  if (target) return drawn(target) ? { address: target } : null;
  const sp = spaces.find((s) => s.id === focused.space) ?? spaces.find((s) => s.active);
  const tab = focused.tab ?? (sp?.tabs ?? []).find((x) => x.active)?.id ?? null;
  if (!tab) return null;
  if (rows.some((r) => r.kind === "tab" && r.tab === tab)) return { tab };
  const first = rows.find((r) => r.kind === "agent" && r.tab === tab);
  return first ? { address: first.address } : null;
}

/** First pane of each tab: what a tab row shows. */
export function leadPanes(panes) {
  const out = new Map();
  for (const p of panes) if (!out.has(p.tab)) out.set(p.tab, p);
  return out;
}

/**
 * Live terminals with a parent. A sub without a pane isn't in agents(): its raw word,
 * error counting as blocked, done as idle (it reports to its parent).
 * @returns {Sub[]}
 */
export function subAgents(terminals, agents) {
  const listed = new Map(agents.map((a) => [a.address, a.status]));
  return terminals
    .filter((k) => k.parent && k.state === "live")
    .map((k) => {
      const s = listed.get(k.address) ?? k.status;
      return {
        address: k.address,
        parent: k.parent,
        status: s === "error" ? "blocked" : s === "done" ? "idle" : s,
        // The terminal's own title first (what the program set), then as the agents mod.
        title: clean(k.title) || k.name || k.template || k.program?.name || k.address,
        program: k.program ?? null,
        kept: listed.has(k.address),
      };
    });
}

/**
 * @param {{spaces:object[], agents:object[], subs:Sub[], leads:Map<string,object>,
 *   git:Map<string,Git|null|undefined>, folded:Set<string>, foldedMachines?:Set<string|null>,
 *   foldedAgents:Set<string>, multiMachine:boolean, groups?:Groups|null}} a  folded: heading keys (headingKey) and group keys (lib/groups.js groupKey)
 * @returns {{pinned:Row[], tree:Row[], settled:Row[], hidden:string[]}}
 */
export function buildTree({ spaces, agents, subs, leads, git, folded, foldedMachines = new Set(), foldedAgents, multiMachine, groups = null }) {
  const kids = new Map();
  const parentOf = new Map();
  for (const s of subs) {
    if (!kids.has(s.parent)) kids.set(s.parent, []);
    kids.get(s.parent).push(s);
    parentOf.set(s.address, s.parent);
  }
  const byAddress = new Map(agents.map((a) => [a.address, a]));
  const pinnedSet = new Set(agents.filter((a) => a.pinned).map((a) => a.address));
  // Sub rows under addr, depth-first, each terminal once. A pinned agent shows only in
  // PINNED, as its own row: it (and what's under it) is skipped here.
  // `level`: steps below the agent row they hang from (its first sub is 1).
  const below = (addr, depth, seen, level = 1) =>
    (kids.get(addr) ?? []).flatMap((s) => {
      if (seen.has(s.address) || pinnedSet.has(s.address)) return [];
      seen.add(s.address);
      return [
        { kind: "sub", key: `sub:${s.address}`, depth, level, address: s.address, status: s.status, title: s.title, program: s.program },
        ...below(s.address, depth + 1, seen, level + 1),
      ];
    });

  // Where an agent row would go before nesting: pinned, or its space listed and its tab not settled.
  const spaceById = new Map(spaces.map((sp) => [sp.id, sp]));
  const placeable = (a) => {
    if (a.pinned) return true;
    const sp = spaceById.get(a.space);
    return Boolean(sp) && !(sp.tabs ?? []).some((t) => t.id === a.tab && t.settled);
  };
  // Is this terminal drawn (folds count as drawn): pinned, under a drawn parent, or placeable.
  const memo = new Map();
  const drawn = (addr) => {
    if (memo.has(addr)) return memo.get(addr);
    memo.set(addr, false); // cycle guard
    const a = byAddress.get(addr);
    const p = parentOf.get(addr);
    const r = a?.pinned ? true : p !== undefined && drawn(p) ? true : a ? placeable(a) : false;
    memo.set(addr, r);
    return r;
  };
  // A kept sub (one with a pane) is in agents() too: it gets a row only under its parent,
  // when that parent is drawn; otherwise it's an agent row in its own tab.
  const nested = new Set();
  for (const a of agents) if (!a.pinned && parentOf.has(a.address) && drawn(parentOf.get(a.address))) nested.add(a.address);

  const agentRows = (a, depth, tab = null, alone = false) => {
    const rest = below(a.address, depth + 1, new Set([a.address]));
    const fold = rest.length > 0 && foldedAgents.has(a.address);
    const row = {
      kind: "agent", key: `agent:${a.address}`, depth, address: a.address, pane: a.pane, tab: a.tab, space: a.space,
      status: a.status, ...rowTitle(a.title, tab, alone), program: a.program, subs: rest.length, folded: fold, mark: fold ? urgent(rest) : null,
    };
    return fold ? [row] : [row, ...rest];
  };

  const pinned = agents.filter((a) => a.pinned).flatMap((a) => agentRows(a, 0));
  const settled = [];

  // A space's own rows: per tab in order, its agents (agents() order) or one tab row.
  const own = (sp, depth) => {
    const mine = agents.filter((a) => a.space === sp.id);
    const tabs = sp.tabs ?? [];
    const known = new Set(tabs.map((t) => t.id));
    const out = [];
    for (const t of tabs) {
      if (t.settled) {
        settled.push({ kind: "tab", key: `settled:${t.id}`, space: sp.id, tab: t.id, name: t.name, title: sp.name });
        continue;
      }
      const here = mine.filter((a) => a.tab === t.id);
      if (here.length) {
        const shown = here.filter((a) => !a.pinned && !nested.has(a.address));
        for (const a of shown) out.push(...agentRows(a, depth, t, shown.length === 1));
      } else {
        const p = leads.get(t.id);
        out.push({ kind: "tab", key: `tab:${t.id}`, depth, space: sp.id, tab: t.id, pane: p?.pane, title: p?.title ?? t.name, program: p?.program ?? null });
      }
    }
    // An agent whose tab isn't listed yet (a pass between updates) still shows.
    for (const a of mine) if (!known.has(a.tab) && !a.pinned && !nested.has(a.address)) out.push(...agentRows(a, depth));
    return out;
  };

  // A heading: folded, it has no children and carries their most urgent mark. `all`, when
  // given, collects the heading with its children as if open (a folded group's marks).
  const headed = (row, children, all = null) => {
    const fold = folded.has(row.key);
    const r = { ...row, folded: fold, mark: fold ? urgent(children) : null };
    all?.push(r, ...children);
    return fold ? [r] : [r, ...children];
  };

  // Spaces of one machine under their headings: a repo heading with one checkout row per
  // space, or a folder heading for a space not in git (its rows right under it).
  const heading = (grp, depth, all = null, band = null) => {
    const ids = grp.checkouts.map((c) => c.sp.id);
    if (grp.kind === "folder") {
      const { sp, g } = grp.checkouts[0];
      return headed({ kind: "folder", key: grp.key, depth, space: sp.id, spaces: ids, machine: grp.machine, name: sp.name, git: g, group: band }, own(sp, depth + 1), all);
    }
    const children = grp.checkouts.flatMap(({ sp, g }) => [
      { kind: g.linked ? "worktree" : "main", key: `space:${sp.id}`, depth: depth + 1, space: sp.id, machine: grp.machine, name: g.branch, git: g, heading: grp.key },
      ...own(sp, depth + 2),
    ]);
    return headed({ kind: "repo", key: grp.key, depth, space: grp.lead, spaces: ids, machine: grp.machine, name: grp.name, path: grp.path, git: null, group: band }, children, all);
  };
  // One machine's headings; with group headers (two groups or more, lib/groups.js) a header
  // row before each group's headings, at the headings' own depth (no indent). A folded group
  // keeps only its header, with the distinct marks of what's inside, most urgent first.
  const group = (list, depth, machine = null) => {
    const heads = groupSpaces(list, git);
    const bands = groupHeadings(heads, groups, machine);
    if (!bands) return heads.flatMap((grp) => heading(grp, depth));
    return bands.flatMap((b) => {
      const key = groupKey(machine, b.name);
      const all = [];
      const rows = b.items.flatMap((grp) => heading(grp, depth, all, key));
      const fold = folded.has(key);
      const row = {
        kind: "group", key, depth, machine, name: b.name, count: b.items.length,
        spaces: b.items.flatMap((grp) => grp.checkouts.map((c) => c.sp.id)),
        // `mark` (the most urgent) is what a folded machine above it reads.
        folded: fold, mark: fold ? urgent(all) : null, marks: fold ? groupMarks(all) : [],
      };
      return fold ? [row] : [row, ...rows];
    });
  };

  let tree;
  if (!multiMachine) tree = group(spaces, 0);
  else {
    const names = [null];
    for (const sp of spaces) if (!names.includes(sp.machine ?? null)) names.push(sp.machine ?? null);
    tree = names.flatMap((m) => {
      const children = group(spaces.filter((sp) => (sp.machine ?? null) === m), 1, m);
      const fold = foldedMachines.has(m);
      const row = { kind: "machine", key: `machine:${JSON.stringify(m)}`, depth: 0, machine: m, name: m ?? "This computer", folded: fold, mark: fold ? urgent(children) : null };
      return fold ? [row] : [row, ...children];
    });
  }

  const hidden = spaces.filter((sp) => git.get(sp.id) === undefined).map((sp) => sp.id);
  return { pinned, tree, settled, hidden };
}
