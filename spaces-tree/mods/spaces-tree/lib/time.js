// Titles, durations and "when did this agent last change state".

const DAY = 86400000;

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it.
export const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

/** "<1m", "Nm" (under an hour), "Nh" (under a day), "Nd". Floors. */
export function age(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/**
 * Stamps agents and sub-agents whose state changed. Done and idle count as one: looking at a
 * finished agent turns done into idle, and looking isn't the agent doing anything.
 * Never mutates `changed`; returns the same object when nothing changed.
 * @param {Record<string,{s:string,at:number}>} changed
 * @returns {{changed: Record<string,{s:string,at:number}>, dirty: boolean}}
 */
export function track(changed, agents, subs, now) {
  const list = [...agents, ...subs];
  let next = null;
  for (const a of list) {
    const s = a.status === "done" ? "idle" : a.status;
    if ((next ?? changed)[a.address]?.s === s) continue;
    next ??= { ...changed };
    next[a.address] = { s, at: now };
  }
  if (!next) return { changed, dirty: false };
  // Gone and old: the list alone is empty right after a start.
  const listed = new Set(list.map((a) => a.address));
  for (const [k, c] of Object.entries(next)) if (!listed.has(k) && now - c.at > 30 * DAY) delete next[k];
  return { changed: next, dirty: true };
}

/**
 * The title of an agent row. A tab someone named shows its name when the agent is the only one
 * drawn in it; the agent's own cleaned title then goes to `tip` (the row's tooltip). Otherwise
 * the agent's own title, no tip. Pinned and band rows pass no tab.
 */
export function rowTitle(title, tab, alone) {
  if (tab?.named && alone && tab.name) return { title: tab.name, tip: clean(title) };
  return { title };
}
