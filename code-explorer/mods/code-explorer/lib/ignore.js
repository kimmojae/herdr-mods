// What git ignores, from `git ls-files --others --ignored --exclude-standard --directory -z`:
// paths relative to the repository's top, a wholly ignored folder as one "dir/" entry.

/** @returns {Set<string>} */
export const parseIgnored = (stdout) => new Set(stdout.split("\0").filter(Boolean).map((p) => p.normalize("NFC")));

/** Whether `rel` (relative to the repository's top) is ignored, itself or through a folder. */
export function isIgnored(set, rel, dir) {
  if (!set.size) return false;
  rel = rel.normalize("NFC"); // NFC on both sides, as parseIgnored stores it
  if (set.has(rel) || (dir && set.has(`${rel}/`))) return true;
  for (let i = rel.indexOf("/"); i >= 0; i = rel.indexOf("/", i + 1)) {
    if (set.has(rel.slice(0, i + 1))) return true;
  }
  return false;
}

// Cursor's default `files.exclude`: never listed.
const EXCLUDED = new Set([".git", ".svn", ".hg", "CVS", ".DS_Store", "Thumbs.db"]);

export const isExcluded = (name) => EXCLUDED.has(name);
