// Repo groups: headers between a machine's header and its repo headings, decided only by
// folder rules the person writes in ~/.config/herdr-app/spaces-tree.json:
//   { "groups": [ { "name": "Work", "path": "~/code/work" }, ... ] }
// A heading goes to the group whose path is the longest prefix of its folder (whole path
// segments only); the rest go to `Other`, always last. Pure: the host reads the file.

/** The rules' file, in Herdr's app folder (appHome(), ~/.config/herdr-app): the same file for
 *  every copy of the mod, outside the mod's folder, which an install replaces. */
export const CONFIG_FILE = "spaces-tree.json";

/** The unmatched group's name. */
export const OTHER = "Other";

const trim = (p) => (p.length > 1 ? p.replace(/\/+$/, "") || "/" : p);

/**
 * A rule's or a folder's path made absolute: `~` and `~/…` with `home`. null when it can't be
 * (a `~` path without a home, not absolute, empty).
 * @param {string} path
 * @param {string|null|undefined} home
 */
export function expand(path, home) {
  if (typeof path !== "string" || !path) return null;
  let p = path;
  if (p === "~" || p.startsWith("~/")) {
    if (!home) return null;
    p = trim(home) + p.slice(1);
  }
  if (!p.startsWith("/")) return null;
  return trim(p.replace(/\/{2,}/g, "/"));
}

/** Is `path` `base` or inside it, by whole segments (`/a/b` is in `/a`, `/a/bc` is not)? */
export const within = (path, base) => path === base || base === "/" || path.startsWith(`${base}/`);

/**
 * The rules from the file's text. `ok` false: the text isn't the shape (bad JSON, no `groups`
 * list); the rules are then empty. Entries without a name or a path are skipped. null text
 * (no file): no rules, ok.
 * @param {string|null} text
 * @returns {{rules:{name:string, path:string}[], ok:boolean, error?:string}}
 */
export function parseRules(text) {
  if (text == null) return { rules: [], ok: true };
  let data;
  try { data = JSON.parse(text); } catch (e) { return { rules: [], ok: false, error: String(e?.message ?? e) }; }
  if (!data || typeof data !== "object" || !Array.isArray(data.groups)) return { rules: [], ok: false, error: "no \"groups\" list" };
  const rules = [];
  for (const g of data.groups) {
    const name = typeof g?.name === "string" ? g.name.trim() : "";
    const path = typeof g?.path === "string" ? g.path.trim() : "";
    if (name && path) rules.push({ name, path });
  }
  return { rules, ok: true };
}

/**
 * The group a folder belongs to: the rule whose path is its longest prefix, else OTHER.
 * @param {string|null|undefined} path
 * @param {{name:string, path:string}[]} rules
 * @param {string|null|undefined} home the folder's machine's home (null: `~` rules don't match)
 * @returns {string}
 */
export function groupOf(path, rules, home) {
  const p = expand(path ?? "", home);
  if (!p) return OTHER;
  let best = null;
  let len = -1;
  for (const r of rules) {
    const base = expand(r.path, home);
    if (base && within(p, base) && base.length > len) { best = r.name; len = base.length; }
  }
  return best ?? OTHER;
}

/** The rules' group names in rule order, each once (where it first appears), without OTHER. */
export const ruleNames = (rules) => [...new Set(rules.map((r) => r.name).filter((n) => n !== OTHER))];

/**
 * Group names in their shown order: the stored ones (lib/groups.js readGroupOrder, one
 * machine's) that are still rule names first, in stored order, then the rest in rule order.
 * OTHER is never in it: it always goes last.
 * @param {string[]} names ruleNames
 * @param {string[]|null|undefined} stored
 */
export function orderNames(names, stored) {
  const known = new Set(names);
  const first = [...new Set((stored ?? []).filter((n) => known.has(n)))];
  const taken = new Set(first);
  return [...first, ...names.filter((n) => !taken.has(n))];
}

/**
 * Items under their groups: in rule order (a name used twice is one group, where it first
 * appears) or the person's dragged order (`stored`, orderNames), OTHER last, empty groups left
 * out, each group's items in the order given.
 * @template T
 * @param {T[]} items
 * @param {(item:T) => string|null|undefined} pathOf
 * @param {{name:string, path:string}[]} rules
 * @param {string|null|undefined} home
 * @param {string[]|null} [stored]
 * @returns {{name:string, items:T[]}[]}
 */
export function arrangeGroups(items, pathOf, rules, home, stored = null) {
  const names = [...orderNames(ruleNames(rules), stored), OTHER];
  const by = new Map(names.map((n) => [n, []]));
  for (const it of items) by.get(groupOf(pathOf(it), rules, home)).push(it);
  return names.filter((n) => by.get(n).length).map((name) => ({ name, items: by.get(name) }));
}

/** Headers show only when a machine has two groups or more. */
export const showHeaders = (groups) => groups.length > 1;

/** A group header's key (its fold), per machine. */
export const groupKey = (machine, name) => `group:${JSON.stringify([machine ?? null, name])}`;

/**
 * The group order the person dragged, per machine, as stored: [[machine, [name, ...]], ...]
 * (machine null: this computer). Anything else reads as no order.
 * @param {string|null|undefined} raw
 * @returns {Map<string|null, string[]>}
 */
export function readGroupOrder(raw) {
  const out = new Map();
  let list;
  try { list = JSON.parse(raw ?? "[]"); } catch { return out; }
  if (!Array.isArray(list)) return out;
  for (const e of list) {
    if (!Array.isArray(e) || !(e[0] === null || typeof e[0] === "string") || !Array.isArray(e[1])) continue;
    const names = e[1].filter((n) => typeof n === "string" && n && n !== OTHER);
    if (names.length) out.set(e[0], [...new Set(names)]);
  }
  return out;
}

/** The group order as stored. */
export const writeGroupOrder = (orders) => JSON.stringify([...orders].filter(([, n]) => n.length));

/**
 * A group header dropped on another: the names (orderNames, one machine's) with `src` moved
 * right after `dst` when moving down, right before it when moving up (as a heading drop does).
 * null when it can't: either is OTHER or not in `names`, or they're the same.
 * @param {string[]} names
 * @param {string} src
 * @param {string} dst
 */
export function moveGroup(names, src, dst) {
  if (src === dst || src === OTHER || dst === OTHER) return null;
  const from = names.indexOf(src);
  const to = names.indexOf(dst);
  if (from < 0 || to < 0) return null;
  const rest = names.filter((n) => n !== src);
  const at = rest.indexOf(dst) + (from < to ? 1 : 0);
  return [...rest.slice(0, at), src, ...rest.slice(at)];
}

/**
 * Drops stored names that are no longer rules, only on machines whose layout is `ready` (one
 * still loading or away keeps its order) and only when the caller has read valid rules.
 * A machine left with no names goes. Mutates `orders`; true when it changed (store it then).
 * @param {Map<string|null, string[]>} orders
 * @param {{name:string, path:string}[]} rules
 * @param {{name:string|null, layout:string}[]} machines
 */
export function pruneGroupOrder(orders, rules, machines) {
  const known = new Set(ruleNames(rules));
  const ready = new Set(machines.filter((m) => m.layout === "ready").map((m) => m.name));
  let changed = false;
  for (const [m, names] of [...orders]) {
    if (!ready.has(m)) continue;
    const kept = names.filter((n) => known.has(n));
    if (kept.length === names.length) continue;
    changed = true;
    if (kept.length) orders.set(m, kept);
    else orders.delete(m);
  }
  return changed;
}

// Idle has no rank: a folded group shows only what there is to look at.
const RANK = { blocked: 3, done: 2, working: 1 };

/**
 * A folded group's marks: the distinct states among its rows' statuses and folded marks, most
 * urgent first (blocked, done, working, idle), at most `max`.
 * @param {{status?:string, mark?:string|null}[]} rows
 */
export function groupMarks(rows, max = 3) {
  const seen = new Set();
  for (const r of rows) for (const s of [r.status, r.mark]) if (RANK[s]) seen.add(s);
  return [...seen].sort((a, b) => RANK[b] - RANK[a]).slice(0, max);
}
