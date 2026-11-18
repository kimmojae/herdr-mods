// `git status --porcelain=v1 -z --no-renames` as one letter per file, keyed by absolute path in
// NFC: macOS folder listings often give NFD names, git gives NFC; callers look up NFC keys.

const LIMIT = 5000;

// Letters as Cursor shows them: U untracked, A added, M modified, D deleted, ! merge conflict.
const CONFLICTS = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** @returns {Record<string, "U"|"A"|"M"|"D"|"!">} */
export function parseStatus(stdout, top) {
  const marks = {};
  for (const entry of stdout.split("\0").filter(Boolean).slice(0, LIMIT)) {
    const xy = entry.slice(0, 2);
    marks[`${top}/${entry.slice(3)}`.normalize("NFC")] = xy === "??" ? "U" : CONFLICTS.has(xy) ? "!" : xy[0] === "A" ? "A" : xy.includes("D") ? "D" : "M";
  }
  return marks;
}

// Paths in Cursor's order: segment by segment, ignoring case (as on macOS), a folder before what's in it.
function byPath(a, b) {
  const x = a.toLowerCase().split("/"), y = b.toLowerCase().split("/");
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return x.length - y.length;
}

/** Folders under `top` holding a change, each with the letter of its first changed path, as Cursor
 *  colours them: no letter outranks another, and a deleted file (gone from the tree) marks no
 *  folder. An untracked folder marks itself. */
export function folderMarks(marks, top) {
  const folders = new Map();
  const put = (dir, mark) => { if (!folders.has(dir)) folders.set(dir, mark); };
  const entries = Object.entries(marks).filter(([, mark]) => mark !== "D");
  entries.sort(([a], [b]) => byPath(a.replace(/\/$/, ""), b.replace(/\/$/, "")));
  for (const [key, mark] of entries) {
    let dir = key.endsWith("/") ? key.slice(0, -1) : key.slice(0, key.lastIndexOf("/"));
    while (dir.length > top.length && dir.startsWith(`${top}/`)) {
      put(dir, mark);
      dir = dir.slice(0, dir.lastIndexOf("/"));
    }
  }
  return folders;
}

/** The letter for a row: its own, its folder's, or "U" inside an untracked folder (git lists only the folder). */
export function markOf(marks, folders, abs, dir) {
  if (dir) return folders.get(abs);
  if (marks[abs]) return marks[abs];
  for (let i = abs.lastIndexOf("/"); i > 0; i = abs.lastIndexOf("/", i - 1)) {
    if (marks[`${abs.slice(0, i)}/`] === "U") return "U";
  }
  return undefined;
}
