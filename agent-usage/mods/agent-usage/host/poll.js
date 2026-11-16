// Finds the accounts and asks each one for its limits. A reading is an account plus
// { limits, at, error }: a failed ask keeps the last good limits and says what failed.
import { exec, readTextFile, home, appHome, shared, setShared } from "herdr";
import { DIR, key } from "../lib/name.js";
import { parseClaudeUsage } from "../lib/claude.js";
import { parseCodexLimits } from "../lib/codex.js";
import { configDirsFromPs, claudeAccount, codexAccount, uniqueAccounts } from "../lib/accounts.js";
import { claudeCommand, rememberDirs } from "../lib/plan.js";

const TIMEOUT = 20000;

// Shared state, not localStorage: the bar and the panel are separate copies, and each copy
// has its own localStorage. Shared values persist and re-render every copy when set.
const load = (name, fallback) => shared(key(name)) ?? fallback;
const save = (name, value) => setShared(key(name), value);

const readJson = async (path) => {
  try { const t = await readTextFile(path); return t ? JSON.parse(t) : null; } catch { return null; }
};

/** The last readings, as kept between starts. */
export const loadReadings = () => load("readings", []);

async function accounts() {
  const names = load("names", {});
  // macOS ps prints each process's environment with -E (not -e).
  const ps = await exec("ps", ["-axwwE", "-o", "command="]).catch(() => null);
  const dirs = rememberDirs(load("dirs", []), ps?.code === 0 ? configDirsFromPs(ps.stdout) : []);
  save("dirs", dirs);
  const claude = await Promise.all([
    readJson(`${home()}/.claude.json`).then((j) => claudeAccount(j, null, names)),
    ...dirs.map((d) => readJson(`${d}/.claude.json`).then((j) => claudeAccount(j, d, names))),
  ]);
  const codex = codexAccount(await readJson(`${home()}/.codex/auth.json`), names);
  return uniqueAccounts([...claude, codex]);
}

const FAILED = { 127: (a) => `${a.provider} CLI not found`, 1: () => "No reply" };

async function ask(account) {
  const script = `${appHome()}/${DIR}/helpers/${account.provider === "claude" ? "claude-usage.sh" : "codex-limits.sh"}`;
  const { cmd, args } = account.provider === "claude" ? claudeCommand(account.dir, script) : { cmd: "sh", args: [script] };
  let r;
  try { r = await exec(cmd, args, { timeout: TIMEOUT }); } catch (e) { return { error: String(e) }; }
  if (r.code !== 0) return { error: FAILED[r.code]?.(account) ?? (r.stderr || `exit ${r.code}`) };
  return account.provider === "claude" ? parseClaudeUsage(r.stdout) : parseCodexLimits(r.stdout);
}

/** Finds the accounts, asks them all at once, keeps and returns the readings. */
export async function poll() {
  const before = new Map(loadReadings().map((r) => [r.id, r]));
  const list = await accounts();
  const readings = await Promise.all(list.map(async (a) => {
    const got = await ask(a);
    const old = before.get(a.id);
    if (got.error) return { ...a, limits: old?.limits ?? null, at: old?.at ?? null, error: got.error };
    return { ...a, plan: a.plan ?? got.plan, limits: got, at: Date.now(), error: null };
  }));
  save("readings", readings);
  return readings;
}
