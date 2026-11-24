// Agent order (for ⌥-number jumps and the like) and the space.move calls that
// make Herdr's own space order match the displayed one.
import { OTHER } from "./groups.js";

/**
 * Addresses of agent rows and kept sub rows: pinned first, then the tree, each once.
 * A sub row is kept when it says `kept` or its address is in `agentAddresses`
 * (the terminals agents() lists); sub rows built by buildTree don't carry `kept`.
 * @param {{pinned: object[], tree: object[]}} rows
 * @param {Set<string>} [agentAddresses]
 * @returns {string[]}
 */
export function agentOrder({ pinned, tree }, agentAddresses = new Set()) {
  const out = [];
  const seen = new Set();
  for (const r of [...pinned, ...tree]) {
    if (r.kind !== "agent" && !(r.kind === "sub" && (r.kept === true || agentAddresses.has(r.address)))) continue;
    if (seen.has(r.address)) continue;
    seen.add(r.address);
    out.push(r.address);
  }
  return out;
}

/**
 * The space.move calls (1-based index) turning `core` into `display`, one machine's ids.
 * Each splice is simulated so later indexes include earlier moves. Ids not in both are ignored.
 * @param {string[]} core
 * @param {string[]} display
 * @returns {{id: string, index: number}[]}
 */
export function spaceMoves(core, display) {
  const inDisplay = new Set(display);
  const inCore = new Set(core);
  const order = core.filter((id) => inDisplay.has(id));
  const target = display.filter((id) => inCore.has(id));
  const moves = [];
  for (let i = 0; i < target.length; i++) {
    const from = order.indexOf(target[i]);
    if (from === i) continue;
    moves.push({ id: target[i], index: i + 1 });
    order.splice(i, 0, order.splice(from, 1)[0]);
  }
  return moves;
}

/**
 * May a dragged row drop on another? A checkout row reorders only among its heading's checkout
 * rows, main checkouts among mains and worktrees among worktrees (mains stay first). A heading
 * (a repo, or a space not in git) drops only on another heading of its repo group (`band`, a
 * group header's key; lib/groups.js decides groups, not drags). A repo group's header (`header`)
 * drops only on another group header; OTHER neither drags nor takes a drop (it stays last).
 * Never across machines.
 * @typedef {{key:string, ids:string[], group:string, machine:string|null, main:boolean, heading:boolean, band?:string|null,
 *   header?:boolean, name?:string}} Drag
 * @param {Drag|null} src
 * @param {Drag|null} dst
 */
export function dropOk(src, dst) {
  if (!src || !dst || src.key === dst.key || src.machine !== dst.machine) return false;
  if (src.header || dst.header) return Boolean(src.header && dst.header) && src.name !== OTHER && dst.name !== OTHER;
  if (src.heading || dst.heading) return src.heading && dst.heading && (src.band ?? null) === (dst.band ?? null);
  return src.group === dst.group && src.main === dst.main;
}

/**
 * The space.move calls for a drop: the source's spaces (one checkout, or a heading's whole
 * group, in `order`'s order) go right after the target's last space when moving down, else
 * right before its first.
 * @param {string[]} order spaces() ids
 * @param {Drag} src
 * @param {Drag} dst
 */
export function dropMoves(order, src, dst) {
  const moving = new Set(src.ids);
  const ids = order.filter((id) => moving.has(id));
  const rest = order.filter((id) => !moving.has(id));
  const to = dst.ids.filter((id) => rest.includes(id));
  if (!ids.length || !to.length) return [];
  const down = order.indexOf(ids[0]) < order.indexOf(to[0]);
  const at = down ? rest.indexOf(to.at(-1)) + 1 : rest.indexOf(to[0]);
  return spaceMoves(order, [...rest.slice(0, at), ...ids, ...rest.slice(at)]);
}
