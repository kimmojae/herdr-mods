// Changes against HEAD, from `git diff -U0`, as marks on the file's lines (0-based, in the file
// as it is now), each with the old lines it replaced.

/** @returns {{kind: "added"|"changed"|"removed", line: number, count: number, oldStart: number, old: string[]}[]} */
export function parseHunks(diff) {
  const hunks = [];
  let current = null;
  for (const text of diff.split("\n")) {
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text);
    if (h) {
      const gone = h[2] === undefined ? 1 : Number(h[2]);
      const fresh = h[4] === undefined ? 1 : Number(h[4]);
      current = { kind: !fresh ? "removed" : gone ? "changed" : "added", line: fresh ? Number(h[3]) - 1 : Number(h[3]), count: fresh, oldStart: Number(h[1]), old: [] };
      hunks.push(current);
    } else if (current && text.startsWith("-") && !text.startsWith("---")) current.old.push(text.slice(1));
  }
  return hunks;
}

/** An untracked file: every line is new. */
export const allAdded = () => [{ kind: "added", line: 0, count: Infinity, oldStart: 0, old: [] }];

export const hunkKey = (hunk) => hunk.kind + "@" + hunk.oldStart;

/** Lines added and removed against HEAD; `total` is the file's line count, all added when untracked. */
export function lineCounts(hunks, total) {
  let added = 0, removed = 0;
  for (const h of hunks) {
    added += h.count === Infinity ? total : h.count;
    removed += h.old.length;
  }
  return { added, removed };
}

/** Rows to draw: the file's lines, a thin row where lines were removed, and the old lines of open hunks. */
export function buildRows(lines, hunks, open) {
  const rows = [];
  const line = (i, hunk) => rows.push({ key: `line-${i}`, type: "line", number: i + 1, text: lines[i], hunk });
  const olds = (h) => h.old.forEach((text, n) => rows.push({ key: `old-${h.oldStart + n}`, type: "old", number: h.oldStart + n, text, hunk: h }));
  // Hunks in file order; a removal comes before a hunk starting on the line that follows it.
  const at = (h) => (h.kind === "removed" ? Math.min(h.line, lines.length) : h.line);
  const ordered = [...hunks].sort((a, b) => at(a) - at(b) || (a.kind === "removed" ? -1 : b.kind === "removed" ? 1 : 0));
  let next = 0;
  for (const h of ordered) {
    while (next < Math.min(at(h), lines.length)) line(next++);
    if (h.kind === "removed") {
      if (open.has(hunkKey(h))) olds(h);
      else rows.push({ key: `removed-${at(h)}`, type: "removed", hunk: h });
      continue;
    }
    if (open.has(hunkKey(h))) olds(h);
    while (next < Math.min(h.line + h.count, lines.length)) line(next++, h);
  }
  while (next < lines.length) line(next++);
  return rows;
}

/**
 * Rows for HEAD and the file side by side: unchanged lines face each other, a changed hunk pairs
 * old and new lines in order, and a line on one side only faces a gap (null).
 * @returns {{key: string, kind: "same"|"changed"|"added"|"removed", left: {number: number, text: string}|null, right: {number: number, text: string}|null}[]}
 */
export function buildSideRows(lines, hunks) {
  const removedAt = new Map(), starting = new Map();
  for (const h of hunks) (h.kind === "removed" ? removedAt : starting).set(h.kind === "removed" ? Math.min(h.line, lines.length) : h.line, h);
  const rows = [];
  let old = 1;
  for (let i = 0; i <= lines.length;) {
    const removal = removedAt.get(i);
    if (removal) {
      old = removal.oldStart;
      for (const text of removal.old) rows.push({ key: `o${old}`, kind: "removed", left: { number: old++, text }, right: null });
    }
    if (i === lines.length) break;
    const h = starting.get(i);
    if (!h) {
      rows.push({ key: `n${i + 1}`, kind: "same", left: { number: old++, text: lines[i] }, right: { number: i + 1, text: lines[i] } });
      i++;
      continue;
    }
    // An added hunk's oldStart is the line it follows; a changed hunk's is its first old line.
    old = h.kind === "added" ? h.oldStart + 1 : h.oldStart;
    const count = Math.min(h.count, lines.length - i);
    for (let k = 0; k < Math.max(count, h.old.length); k++) {
      const left = k < h.old.length ? { number: old + k, text: h.old[k] } : null;
      const right = k < count ? { number: i + k + 1, text: lines[i + k] } : null;
      rows.push({ key: right ? `n${right.number}` : `o${left.number}`, kind: left && right ? "changed" : left ? "removed" : "added", left, right });
    }
    old += h.old.length;
    i += count;
  }
  return rows;
}

/** The differing middle of two lines (after their common start and end), or null when there is none to point at. */
export function wordRange(a, b) {
  if (a === b) return null;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  if (!start && !end) return null;
  return { left: [start, a.length - end], right: [start, b.length - end] };
}

/** Highlighted runs ([kind, text]) split at `range`; runs inside it get a third element, true. Empty runs go. */
export function markRuns(runs, range) {
  if (!range || range[0] >= range[1]) return runs.filter(([, text]) => text);
  const out = [];
  let at = 0;
  for (const [kind, text] of runs) {
    const cuts = [0, range[0] - at, range[1] - at, text.length].map((n) => Math.max(0, Math.min(text.length, n)));
    for (let k = 0; k < 3; k++) {
      if (cuts[k + 1] > cuts[k]) out.push(k === 1 ? [kind, text.slice(cuts[k], cuts[k + 1]), true] : [kind, text.slice(cuts[k], cuts[k + 1])]);
    }
    at += text.length;
  }
  return out;
}
