// Space colours: one palette entry per space, shared by every mod that draws avatars.

export const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];

// What a stored colour name looks like on an avatar: one strong colour per hue, light and dark alike.
export const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

/**
 * Drop colours of spaces that are gone; give each uncoloured space (except "~") the
 * least-used palette entry, ties to the earliest. Null when nothing changed.
 * @param {Record<string,string>} current
 * @param {{id: string, name: string}[]} spaces
 * @returns {Record<string,string>|null}
 */
export function assignColors(current, spaces) {
  const ids = new Set(spaces.map((s) => s.id));
  const kept = Object.fromEntries(Object.entries(current ?? {}).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(current ?? {}).length;
  for (const s of spaces) {
    if (kept[s.id] || s.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[s.id] = PALETTE.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  return changed ? kept : null;
}
