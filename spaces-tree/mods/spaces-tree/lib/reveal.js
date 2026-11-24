// Reveal the focused place when something happens there: its folded machine, group, repo or
// folder heading and parent agents open, as a click on their chevrons would. Between events
// nothing is forced, so a fold made by hand stays. Pure: the host passes the tree as built with
// nothing folded (lib/tree.js buildTree), its fold sets, and what it read this pass.

/** @typedef {import("./tree.js").Row} Row */
/** @typedef {{address:string}|{tab:string}|{space:string}} Target */

/** Is `r` the target's row (an agent or sub-agent, a tab, or a space's own row). */
const hits = (r, target) => {
  if ("address" in target) return (r.kind === "agent" || r.kind === "sub") && r.address === target.address;
  if ("tab" in target) return r.kind === "tab" && r.tab === target.tab;
  return (r.kind === "main" || r.kind === "worktree" || r.kind === "folder") && r.space === target.space;
};

/**
 * The rows above the target's row, outermost first: its machine, group, repo or folder heading,
 * checkout, and the agents a sub-agent hangs from. A group header sits at its headings' own
 * depth, so it is found by the heading's `group` key, not by depth. Empty when the target isn't
 * in `rows` (a pinned agent, a settled tab, nothing focused).
 * @param {Row[]} rows the tree as built with nothing folded
 * @param {Target|null} target
 * @returns {Row[]}
 */
export function ancestors(rows, target) {
  if (!target) return [];
  const at = rows.findIndex((r) => hits(r, target));
  if (at < 0) return [];
  const out = [];
  let depth = rows[at].depth;
  for (let i = at - 1; i >= 0 && depth > 0; i--) {
    const r = rows[i];
    if (r.depth >= depth || r.kind === "group") continue;
    out.unshift(r);
    depth = r.depth;
    if ((r.kind === "repo" || r.kind === "folder") && r.group) {
      const g = rows.slice(0, i).findLast((x) => x.kind === "group" && x.key === r.group);
      if (g) out.unshift(g);
    }
  }
  return out;
}

/**
 * What to open so the target's row shows: its folded ancestors, by fold store. Siblings stay as
 * they are.
 * @param {Row[]} rows the tree as built with nothing folded
 * @param {Target|null} target
 * @param {{headings:{has(k:string):boolean}, machines:{has(m:string|null):boolean}, agents:{has(a:string):boolean}}} folds
 *   headings: repo, folder and group keys (lib/folds.js); machines: names (null: this computer);
 *   agents: addresses of folded agent rows
 * @returns {{headings:string[], machines:(string|null)[], agents:string[]}}
 */
export function revealKeys(rows, target, folds) {
  const out = { headings: [], machines: [], agents: [] };
  for (const r of ancestors(rows, target)) {
    if (r.kind === "machine") { if (folds.machines.has(r.machine ?? null)) out.machines.push(r.machine ?? null); }
    else if (r.kind === "agent" || r.kind === "sub") { if (folds.agents.has(r.address)) out.agents.push(r.address); }
    else if ((r.kind === "repo" || r.kind === "folder" || r.kind === "group") && folds.headings.has(r.key)) out.headings.push(r.key);
  }
  return out;
}

/** True when revealKeys found nothing to open. */
export const nothing = (k) => !k.headings.length && !k.machines.length && !k.agents.length;

/**
 * What happened in the focused place, as one string: a pass whose string differs from the last
 * one's is an event. The focused pane and terminal, the target and the rows above it (its git
 * came in, a rule moved it), the lit agent's status (a prompt sent: idle → working; working →
 * done), the shown tab's `changed_at` (something in it changed state), and the shown space's
 * tabs and panes (one opened or closed).
 * @param {{focused:{space?:string, tab?:string, pane?:string|null, terminal?:string|null}|null, target:Target|null,
 *   above:string[], status:string|null|undefined, space:{tabs?:{id:string, active?:boolean, panes?:number, changed_at?:number|null}[]}|null|undefined,
 *   panes:{pane:string, tab:string}[]}} a  panes: panes() (only the shown space's count)
 */
export function moment({ focused, target, above, status, space, panes }) {
  const f = focused ?? {};
  const tabs = space?.tabs ?? [];
  const mine = new Set(tabs.map((t) => t.id));
  const shownTab = tabs.find((t) => t.active);
  return JSON.stringify([
    f.space ?? null, f.tab ?? null, f.pane ?? null, f.terminal ?? null, target, above, status ?? null,
    shownTab?.changed_at ?? null,
    tabs.map((t) => [t.id, t.panes ?? null]),
    panes.filter((p) => mine.has(p.tab)).map((p) => p.pane).sort(),
  ]);
}
