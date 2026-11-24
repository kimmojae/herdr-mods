// Rows that come and go with a short native animation (the band, PINNED, and those sections
// themselves). This only keeps the books: which rows are entering (drawn once at zero, so the
// next draw at full size is a change a `transition` animates), shown, or leaving (kept with
// their last content until the collapse has run, then dropped). host/rows.js draws the phases.

/** @typedef {"enter"|"shown"|"leave"} Phase */

/** A tracker's state, kept on the view between renders. */
export const presenceState = () => ({ started: false, rows: new Map(), order: [] });

/**
 * One render's rows with their phases. The first call shows what is there without entering
 * (nothing grows in when the app starts). A row back before its leave ran out shows again.
 * Leaving rows keep their place among the others; a reorder of the current rows isn't animated.
 * @template T
 * @param {{started:boolean, rows:Map<string,{item:T, phase:Phase, at:number}>, order:string[]}} state  mutated
 * @param {T[]} items  this render's rows, in order
 * @param {(item:T) => string} keyOf
 * @param {number} now  ms
 * @param {number} ms  how long a leave runs
 * @returns {{list:{key:string, item:T, phase:Phase}[], wake:number|null, moving:boolean}}
 *   `wake`: ms until a render is needed (an entering row's second draw, a finished leave's drop);
 *   `moving`: something entered, left or came back in this call, or is still entering or leaving.
 */
export function presence(state, items, keyOf, now, ms) {
  const first = !state.started;
  state.started = true;
  let moving = false;
  // Drawn once at zero last time: now at full size.
  for (const r of state.rows.values()) if (r.phase === "enter") { r.phase = "shown"; moving = true; }
  const current = items.map(keyOf);
  const here = new Set(current);
  items.forEach((item, i) => {
    const k = current[i];
    const r = state.rows.get(k);
    if (!r) {
      state.rows.set(k, { item, phase: first ? "shown" : "enter", at: now });
      if (!first) moving = true;
      return;
    }
    r.item = item;
    if (r.phase === "leave") { r.phase = "shown"; r.at = now; moving = true; }
  });
  for (const [k, r] of state.rows) {
    if (here.has(k)) continue;
    if (r.phase !== "leave") { r.phase = "leave"; r.at = now; moving = true; }
    else if (now - r.at >= ms) { state.rows.delete(k); moving = true; }
  }
  // Current order, each leaving row put back at its old index (or the end).
  const order = [...current];
  state.order.forEach((k, i) => {
    if (here.has(k) || !state.rows.has(k)) return;
    order.splice(Math.min(i, order.length), 0, k);
  });
  state.order = order;
  let wake = null;
  const list = order.map((k) => {
    const r = state.rows.get(k);
    if (r.phase === "enter") wake = 16;
    else if (r.phase === "leave") {
      moving = true;
      const left = Math.max(0, ms - (now - r.at));
      wake = wake === null ? left : Math.min(wake, left);
    }
    if (r.phase === "enter") moving = true;
    return { key: k, item: r.item, phase: r.phase };
  });
  return { list, wake, moving };
}
