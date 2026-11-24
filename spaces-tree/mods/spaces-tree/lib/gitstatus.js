// A checkout's git status with the person's terminal's symbols (starship `[git_status]` and the
// Claude status line's git_status_line), each with its count: `=1 $2 ✘2 »1 !9 +3 ?3 ⇡1 ⇣3`.
// Read from `git --no-optional-locks status --porcelain=v2 --branch --show-stash
// --untracked-files=all` (the status line's read, plus `--show-stash`, which gives the stash
// count in the same run, and every untracked file listed, so `?N` counts files as starship
// does, not untracked folders). Pure: the
// host runs git and passes the result in.

/** The status command, args separate (cwd and machine go in exec's options). */
export const STATUS_ARGS = ["--no-optional-locks", "status", "--porcelain=v2", "--branch", "--show-stash", "--untracked-files=all"];

/** @typedef {{ahead:number, behind:number, conflicted:number, stashed:number, deleted:number,
 *   renamed:number, modified:number, staged:number, untracked:number}} GitState */

/**
 * Parses porcelain v2 the way git_status_line does: `# branch.ab +A -B` gives ahead and
 * behind; `# stash N` the stash entries; `u ` is a conflict; `? ` an untracked file; on `1 ` /
 * `2 ` lines the XY's first letter A, M or T is staged, its second M or T modified, any D
 * deleted, and a `2 ` line is a rename. A staged delete counts as deleted only, a rename as
 * renamed only, like starship. Each count is lines (files). null when git didn't answer: the
 * host keeps the last state.
 * @param {{code:number, stdout:string}|null|undefined} result ExecResult of STATUS_ARGS
 * @returns {GitState|null}
 */
export function parseStatus(result) {
  if (!result || result.code !== 0 || typeof result.stdout !== "string") return null;
  const s = { ahead: 0, behind: 0, conflicted: 0, stashed: 0, deleted: 0, renamed: 0, modified: 0, staged: 0, untracked: 0 };
  const n = (x) => Math.max(0, Number(x) || 0);
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("# branch.ab ")) {
      const [, , a, b] = line.split(" ");
      s.ahead = n(String(a).replace(/^\+/, ""));
      s.behind = n(String(b).replace(/^-/, ""));
    } else if (line.startsWith("# stash ")) s.stashed = n(line.slice(8));
    else if (line.startsWith("u ")) s.conflicted++;
    else if (line.startsWith("? ")) s.untracked++;
    else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const xy = line.slice(2, 4);
      if (xy[0] && "AMT".includes(xy[0])) s.staged++;
      if (xy[1] === "M" || xy[1] === "T") s.modified++;
      if (xy.includes("D")) s.deleted++;
      if (line[0] === "2") s.renamed++;
    }
  }
  return s;
}

// Starship's symbols in starship's order, then ahead and behind (each its own, both when both).
const MARKS = [
  ["conflicted", "=", "conflicted"],
  ["stashed", "$", "stashed"],
  ["deleted", "✘", "deleted"],
  ["renamed", "»", "renamed"],
  ["modified", "!", "modified"],
  ["staged", "+", "staged"],
  ["untracked", "?", "untracked"],
  ["ahead", "⇡", "ahead"],
  ["behind", "⇣", "behind"],
];

/**
 * The marks after a checkout's branch, each symbol with its count, in starship's order:
 * `=1 $2 ✘2 »1 !9 +3 ?3 ⇡1 ⇣3` (only the non-zero ones).
 * @param {GitState|null|undefined} st
 * @returns {string[]}
 */
export function gitMarks(st) {
  if (!st) return [];
  return MARKS.filter(([k]) => st[k] > 0).map(([k, sym]) => `${sym}${st[k]}`);
}

/** The marks as one string, space-separated ("" when clean). */
export const gitLine = (st) => gitMarks(st).join(" ");

/** The same counts in words, for the tooltip: "2 deleted · 9 modified · 3 untracked · 1 ahead". */
export function gitWords(st) {
  if (!st) return "";
  return MARKS.filter(([k]) => st[k] > 0).map(([k, , word]) => `${st[k]} ${word}`).join(" · ");
}
