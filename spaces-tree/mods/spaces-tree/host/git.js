// Git per place, looked at only when the refs could have changed. Port of the shipped
// spaces mod's scheduler (S:105-153, 209-286): at most AT_ONCE places at once, each once
// however often it was asked for; re-checked on a new place, a pane going busy → not busy
// (its whole repo), a machine whose layout is back, a local repo's .git changing, and a
// FALLBACK while the window is in front and the machine isn't folded.
// Never keeps a cx: every method that starts work takes the caller's.
import { exec, watchFolder } from "herdr";
import { gitKey, parseGit } from "../lib/git.js";
import { STATUS_ARGS } from "../lib/gitstatus.js";

// Changes made outside Herdr (an editor's save, a commit in another app).
const FALLBACK = 60000;
// Places looked at together (at most two git runs each at a time: rev-parse ×2, then
// symbolic-ref + status): all at once, a few hundred spaces run out of
// open files or past a machine core's 16 running execs. 6 × 2 = 12.
const AT_ONCE = 6;

// The status read may take a while on a big checkout; it never fails the place.
const STATUS_TIMEOUT = 60000;

// Both runs, finished: a place isn't done while one of its runs still holds a slot.
async function both(a, b) {
  const done = await Promise.allSettled([a, b]);
  const failed = done.find((d) => d.status === "rejected");
  if (failed) throw failed.reason;
  return done.map((d) => d.value);
}

export class GitWatch {
  /** @param {(machine: string|null) => boolean} folded a machine group folded in the list */
  constructor(folded) {
    this.folded = folded;
    this.git = {}; // key -> Git, null: not a repo (or unsure with nothing known before)
    this.checked = {}; // key -> when it was last looked at
    this.unsure = new Set(); // keys git couldn't answer for (a machine away)
    this.pending = new Set(); // keys to look at next
    this.refreshing = false;
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its key at the last look
    this.watching = new Map(); // local repos' pending folder watches
  }

  /** Git for a key: a Git, null (no repo / can't tell), undefined (not looked at yet). */
  get(key) {
    return this.git[key];
  }

  /**
   * Starts looks at the places whose git could have changed (S:105-147).
   * @param {object} cx the caller's (a timer's) cx
   * @param {object[]} sp spaces()
   * @param {object[]} ps panes(), read once by the caller
   * @param {{name:string|null, layout:string}[]} ms machines()
   * @param {boolean} active window().active
   */
  due(cx, sp, ps, ms, active) {
    const now = Date.now();
    const at = {};
    for (const s of sp) at[s.id] = gitKey(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    // Moved away: what it knew of that place may be old.
    for (const k of Object.keys(this.git)) if (!keys.has(k)) {
      delete this.git[k];
      delete this.checked[k];
      this.unsure.delete(k);
    }
    const repos = new Set(Object.values(this.git).filter(Boolean).map((g) => g.repo));
    for (const [repo, pending] of this.watching) if (!repos.has(JSON.stringify([null, repo]))) {
      this.watching.delete(repo);
      pending.cancel();
    }
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of ms) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    if (due.size) this.refresh(due, cx);
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refresh(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      try {
        while (this.pending.size) {
          const list = [...this.pending];
          this.pending.clear();
          let next = 0;
          await Promise.all(Array.from({ length: Math.min(AT_ONCE, list.length) }, async () => {
            while (next < list.length) await this.check(list[next++], cx);
          }));
        }
      } finally {
        this.refreshing = false;
      }
      cx.notify();
    });
  }

  // One place's git: branch, its repo, and its state as the terminal shows it (lib/gitstatus.js:
  // the status line's `status --porcelain=v2 --branch`, with `--show-stash`). The
  // status read takes no optional locks, so it never rewrites the index and so never wakes the
  // .git watch below. Two git runs per place at a time at most.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // Two reads: a folder name may itself contain a newline.
      const [top, common] = await both(
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
        exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
      );
      let head, status;
      if (top.code === 0 && common.code === 0) {
        // The status may take a while on a big checkout, and failing it never fails the place:
        // branch stays, and the last state stands (below).
        const [h, st] = await Promise.allSettled([
          exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }),
          exec("git", STATUS_ARGS, { cwd, on, timeout: STATUS_TIMEOUT }),
        ]);
        if (h.status === "rejected") throw h.reason;
        head = h.value;
        if (st.status === "fulfilled") status = st.value;
      }
      const info = parseGit({ top, common, head, status }, on);
      // A status that failed keeps what was known.
      if (info && info.state === null) info.state = this.git[key]?.state ?? null;
      if (info === undefined) {
        // Not git's own "no": keep what it showed, ask again later.
        this.unsure.add(key);
        this.git[key] ??= null;
        return;
      }
      this.git[key] = info;
      if (info && !on) this.watch(JSON.parse(info.repo)[1], cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  // A local repo's .git folder: a commit, checkout or fetch there re-checks its places.
  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    const pending = watchFolder(repo);
    this.watching.set(repo, pending);
    cx.spawn(async (cx) => {
      let current = pending;
      try {
        for (;;) {
          await current;
          if (this.watching.get(repo) !== current) return;
          const mine = JSON.stringify([null, repo]);
          const keys = Object.keys(this.git).filter((k) => this.git[k]?.repo === mine);
          if (!keys.length) break;
          this.refresh(keys, cx);
          current = watchFolder(repo);
          this.watching.set(repo, current);
        }
      } catch {}
      if (this.watching.get(repo) === current) this.watching.delete(repo);
    });
  }
}
