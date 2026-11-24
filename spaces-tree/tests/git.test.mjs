import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGit, placeOf, gitKey } from "../mods/spaces-tree/lib/git.js";
import { repoFolder } from "../mods/spaces-tree/lib/git.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr) => ({ code, stdout: "", stderr });
const main = () => ({ top: ok("/r/acme\n"), common: ok("/r/acme/.git\n"), head: ok("refs/heads/main\n"),
  status: ok("# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -0\n") });

test("parseGit reads a main checkout", () => {
  assert.deepEqual(parseGit(main(), null), {
    name: "acme", branch: "main", repo: JSON.stringify([null, "/r/acme/.git"]), linked: false,
    state: { ahead: 2, behind: 0, conflicted: 0, stashed: 0, deleted: 0, renamed: 0, modified: 0, staged: 0, untracked: 0 },
  });
});

test("parseGit marks a linked worktree", () => {
  const g = parseGit({ ...main(), top: ok("/w/acme/fix\n") }, null);
  assert.equal(g.linked, true);
  assert.equal(g.name, "acme");
});

test("parseGit names a bare repo without .git", () => {
  const g = parseGit({ ...main(), common: ok("/r/acme.git\n") }, null);
  assert.equal(g.name, "acme");
});

test("parseGit puts the machine in repo", () => {
  assert.equal(parseGit(main(), "box").repo, JSON.stringify(["box", "/r/acme/.git"]));
});

test("parseGit: detached head; no upstream is 0/0; a failed status is a null state", () => {
  const g = parseGit({ ...main(), head: fail(1, ""), status: ok("# branch.oid abc\n# branch.head (detached)\n") }, null);
  assert.equal(g.branch, "(detached)");
  assert.deepEqual([g.state.ahead, g.state.behind], [0, 0]);
  assert.equal(parseGit({ ...main(), status: fail(128, "x") }, null).state, null);
  assert.equal(parseGit({ ...main(), status: undefined }, null).state, null);
});

test("parseGit: not a repo is null, anything else is undefined", () => {
  assert.equal(parseGit({ top: fail(128, "fatal: not a git repository"), common: fail(128, "fatal: not a git repository") }, null), null);
  assert.equal(parseGit({ top: fail(1, "timeout"), common: fail(1, "timeout") }, null), undefined);
  assert.equal(parseGit({ top: ok("/r/acme\n"), common: fail(128, "fatal: Not a git repository") }, null), null);
});

test("placeOf is the first pane's cwd in the space, else its folder", () => {
  const space = { id: "s", folder: "/f", tabs: [{ id: "t1" }] };
  assert.equal(placeOf(space, [{ tab: "t9", cwd: "/x" }]), "/f");
  assert.equal(placeOf(space, [{ tab: "t9", cwd: "/x" }, { tab: "t1", cwd: "/y" }]), "/y");
  assert.equal(placeOf(space, [{ tab: "t1", cwd: "" }]), "/f");
});

test("gitKey pairs machine and place", () => {
  const space = { folder: "/f", tabs: [] };
  assert.equal(gitKey(space, []), JSON.stringify([null, "/f"]));
  assert.equal(gitKey({ ...space, machine: "m" }, []), JSON.stringify(["m", "/f"]));
});

test("repoFolder: the common dir's parent, a bare repo's dir, null without git", () => {
  assert.equal(repoFolder({ repo: JSON.stringify([null, "/r/acme/.git"]) }), "/r/acme");
  assert.equal(repoFolder({ repo: JSON.stringify(["box", "/srv/acme.git"]) }), "/srv/acme.git");
  assert.equal(repoFolder(null), null);
  assert.equal(repoFolder({ repo: "junk" }), null);
});
