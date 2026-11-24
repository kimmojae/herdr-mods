// The PR per checkout: `gh pr view` for each place with a git result and a branch, at most
// once a minute per checkout unless its branch changes (lib/pr.js prDue), AT_ONCE runs at a
// time, each checkout once. No PR / a closed one clears the tag; a failed look (no gh, not
// signed in, a machine away) keeps the last good tag of the same branch, or shows none, and
// never any text. Never keeps a cx: `due` takes the caller's.
import { exec } from "herdr";
import { PR_ARGS, prAnswer, prDue, prShown } from "../lib/pr.js";

const AT_ONCE = 2;

export class PrWatch {
  /** @param {(machine: string|null) => boolean} folded a machine group folded in the list */
  constructor(folded = () => false) {
    this.folded = folded;
    this.entries = {}; // key -> {branch, at, pr, sha}
    this.pending = new Map(); // key -> checkout waiting for a slot
    this.running = new Set(); // keys being asked right now
    this.workers = 0;
    this.now = 0; // the last pass's time
    this.branch = {}; // key -> its branch at the last pass
  }

  /** The PR for a key, or null (none, unknown, or a failed look). */
  get(key) {
    const e = this.entries[key];
    return e ? prShown(e.pr, e.sha) : null;
  }

  /**
   * Starts looks at the checkouts whose PR is due.
   * @param {object} cx the caller's (a timer's) cx
   * @param {{key:string, cwd:string, on:string|null, branch:string}[]} checkouts
   * @param {number} now
   * @param {boolean} active window().active: not asked in the background, nor for a folded
   *   machine, except at once when a checkout's branch changed
   */
  due(cx, checkouts, now, active = true) {
    const keys = new Set(checkouts.map((c) => c.key));
    this.now = now;
    this.branch = Object.fromEntries(checkouts.map((c) => [c.key, c.branch]));
    for (const k of Object.keys(this.entries)) if (!keys.has(k)) delete this.entries[k];
    for (const k of this.pending.keys()) if (!keys.has(k)) this.pending.delete(k);
    // Branch moved on: what it showed was for the other branch.
    const moved = new Set();
    for (const c of checkouts) {
      if (this.entries[c.key] && this.entries[c.key].branch !== c.branch) { delete this.entries[c.key]; moved.add(c.key); }
    }
    for (const c of checkouts) {
      if (this.running.has(c.key) || !prDue(this.entries[c.key], c.branch, now)) continue;
      if (!moved.has(c.key) && !(active && !this.folded(c.on))) continue;
      this.pending.set(c.key, c);
    }
    if (!this.pending.size || this.workers >= AT_ONCE) return;
    this.start(cx);
  }

  start(cx) {
    while (this.workers < Math.min(AT_ONCE, this.pending.size)) {
      this.workers++;
      cx.spawn(async (cx) => {
        try {
          while (this.pending.size) {
            const [key, c] = this.pending.entries().next().value;
            this.pending.delete(key);
            await this.check(c);
            cx.notify();
          }
        } finally {
          this.workers--;
        }
      });
    }
  }

  async check(c) {
    this.running.add(c.key);
    let answer;
    let sha = null; // HEAD of the checkout; null when git fails
    try {
      answer = prAnswer(await exec("gh", PR_ARGS, { cwd: c.cwd, on: c.on }));
      try {
        const r = await exec("git", ["rev-parse", "HEAD"], { cwd: c.cwd, on: c.on });
        const t = r && r.code === 0 ? String(r.stdout ?? "").trim() : "";
        if (/^[0-9a-f]{7,64}$/i.test(t)) sha = t;
      } catch {}
    } catch {
      answer = { failed: true };
    } finally {
      this.running.delete(c.key);
    }
    // A late answer for another branch (or a checkout that's gone) is dropped; the next
    // pass asks again.
    if (this.branch[c.key] !== c.branch) return;
    // A failed look keeps the last good tag (the branch is the same, else it was dropped) and
    // still moves `at`, so the next try waits a minute.
    const pr = answer.failed ? (this.entries[c.key]?.pr ?? null) : answer.pr;
    // The sha is this look's only: a failed `git rev-parse HEAD` stores null, never an older
    // HEAD (a merged tag then hides until HEAD is read again).
    this.entries[c.key] = { branch: c.branch, at: this.now, pr, sha };
  }
}
