// Folded headings (lib/tree.js headingKey: `repo:<Git.repo>`, `space:<id>` for a space not in
// git; lib/groups.js groupKey: `group:[machine, name]` for a repo group's header), each with the machine it belongs to, so a machine still loading (or away) keeps its
// folds. Pure: the host reads spaces() and machines() and stores the result.
// In memory: Map key -> machine (null: this computer; undefined: not known yet, from the old
// stored format). Stored: [[key, machine], ...], or [key] when the machine isn't known.
// Folds stored before headings were space ids; migrateFolds maps them to their heading.
import { headingKey } from "./tree.js";

/** Reads the stored folds: the current [[id, machine]] list, or the old list of ids. */
export function readFolds(raw) {
  const out = new Map();
  let list;
  try { list = JSON.parse(raw ?? "[]"); } catch { return out; }
  if (!Array.isArray(list)) return out;
  for (const e of list) {
    if (typeof e === "string") out.set(e, undefined);
    else if (Array.isArray(e) && typeof e[0] === "string") {
      const m = e[1];
      out.set(e[0], e.length > 1 && (m === null || typeof m === "string") ? m : undefined);
    }
  }
  return out;
}

/** The folds as stored. */
export function writeFolds(folds) {
  return JSON.stringify([...folds].map(([id, m]) => (m === undefined ? [id] : [id, m])));
}

const isGroup = (k) => k.startsWith("group:");
const isHeading = (k) => k.startsWith("repo:") || k.startsWith("space:") || isGroup(k);

/**
 * Turns folds stored by space id (before headings) into their heading's key, once the space's
 * git is known: a main checkout's fold folds its repo heading (`repo:<Git.repo>`), a space not
 * in git its folder heading (`space:<id>`). An old worktree fold is dropped: it folded one
 * worktree, not the whole repo. One still unknown waits; one whose space is gone is left to
 * pruneFolds. Mutates `folds`; true when it changed.
 * @param {Map<string, string|null|undefined>} folds
 * @param {{id:string, machine?:string|null}[]} spaces
 * @param {Map<string, object|null|undefined>} git space id -> Git, null, or undefined (unknown)
 */
export function migrateFolds(folds, spaces, git) {
  let changed = false;
  for (const sp of spaces) {
    if (!folds.has(sp.id) || isHeading(sp.id)) continue;
    const g = git.get(sp.id);
    if (g === undefined) continue;
    folds.delete(sp.id);
    if (!g?.linked) folds.set(headingKey(sp, g), sp.machine ?? null);
    changed = true;
  }
  return changed;
}

/**
 * Drops folds of headings that are gone, only where their machine has said so: its layout is
 * `ready`, every space it lists has a known git (else a repo heading may just not be built
 * yet), and the key isn't any listed space's heading. A machine missing from `machines` or not
 * ready keeps its folds. A fold whose machine isn't known goes only when every machine is that
 * settled and nothing is still `waiting` (hc says connected, no layout yet). A fold still kept
 * by space id (migrateFolds) goes when its space is gone from a ready machine. A listed
 * heading's machine is filled in. Mutates `folds`; true when it changed (store it then).
 * @param {Map<string, string|null|undefined>} folds
 * @param {{id:string, machine?:string|null}[]} spaces
 * @param {{name:string|null, layout:string}[]} machines
 * @param {boolean} waiting
 * @param {Map<string, object|null|undefined>} git space id -> Git, null, or undefined (unknown)
 * @param {Map<string, string|null>|null} groups the group keys some heading falls in now, with
 *   their machine (lib/tree.js groupKeys); null while the rules aren't read: group folds stay.
 */
export function pruneFolds(folds, spaces, machines, waiting = false, git = new Map(), groups = null) {
  const heads = new Map();
  const unknown = new Set();
  for (const s of spaces) {
    const g = git.get(s.id);
    if (g === undefined) unknown.add(s.machine ?? null);
    heads.set(headingKey(s, g), s.machine ?? null);
  }
  const ids = new Map(spaces.map((s) => [s.id, s.machine ?? null]));
  const ready = new Set(machines.filter((m) => m.layout === "ready").map((m) => m.name));
  const settled = new Set([...ready].filter((m) => !unknown.has(m)));
  const all = !waiting && machines.every((m) => settled.has(m.name));
  let changed = false;
  for (const [k, m] of [...folds]) {
    if (!isHeading(k)) {
      // Not migrated yet: kept while its space is listed or its machine isn't ready.
      if (ids.has(k)) {
        if (m !== ids.get(k)) { folds.set(k, ids.get(k)); changed = true; }
      } else if (m === undefined ? !waiting && machines.every((x) => x.layout === "ready") : ready.has(m)) { folds.delete(k); changed = true; }
      continue;
    }
    if (isGroup(k) && !groups) continue;
    const here = isGroup(k) ? groups : heads;
    if (here.has(k)) {
      if (m !== here.get(k)) { folds.set(k, here.get(k)); changed = true; }
      continue;
    }
    if (m === undefined ? all : settled.has(m)) { folds.delete(k); changed = true; }
  }
  return changed;
}
