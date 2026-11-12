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

const STRENGTH = { U: 1, A: 2, M: 3, D: 4, "!": 5 };

/** Folders under `top` holding a change, each with its strongest letter; an untracked folder marks itself. */
export function folderMarks(marks, top) {
  const folders = new Map();
  const put = (dir, mark) => { if ((STRENGTH[folders.get(dir)] ?? 0) < STRENGTH[mark]) folders.set(dir, mark); };
  for (const [key, mark] of Object.entries(marks)) {
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
