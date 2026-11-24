import { parseStatus } from "./gitstatus.js";

// A space's place and what git says about it. Pure: the host runs git and passes
// the results in. Port of the shipped spaces mod (place, where, check).

const base = (path) => path.replace(/\/+$/, "").split("/").pop();

/** Where a space is now: its first terminal's live folder, else where it was made. */
export function placeOf(space, panes) {
  const tabs = new Set((space.tabs ?? []).map((c) => c.id));
  return panes.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || space.folder;
}

/**
 * The repo's own folder, from its Git: the common dir's parent (`/r/acme/.git` → `/r/acme`),
 * a bare repo's dir as is. null without git.
 */
export function repoFolder(g) {
  if (!g) return null;
  let dir;
  try { dir = JSON.parse(g.repo)[1]; } catch { return null; }
  if (typeof dir !== "string") return null;
  return dir.endsWith("/.git") ? dir.slice(0, -5) || "/" : dir;
}

export function gitKey(space, panes) {
  return JSON.stringify([space.machine ?? null, placeOf(space, panes)]);
}

/**
 * @param {{top:object, common:object, head?:object, status?:object}} results ExecResults:
 *   rev-parse ×2, symbolic-ref, lib/gitstatus.js STATUS_ARGS. `state` is null when the status
 *   read failed: the host keeps the last one.
 * @param {string|null} on machine name, null for this one
 * @returns {import("./tree.js").Git|null|undefined} null: not a repo; undefined: unsure
 */
export function parseGit({ top, common, head, status }, on) {
  if (top.code !== 0 || common.code !== 0) {
    // Only git's own "no" means no repo; anything else is asked again.
    return /not a git repository/i.test(top.code !== 0 ? top.stderr : common.stderr) ? null : undefined;
  }
  const topDir = top.stdout.replace(/\n$/, "");
  const repo = common.stdout.replace(/\n$/, "");
  const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
  const st = parseStatus(status);
  return {
    name,
    branch: head?.code === 0 ? head.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)",
    state: st,
    repo: JSON.stringify([on, repo]),
    linked: repo !== `${topDir}/.git`,
  };
}
