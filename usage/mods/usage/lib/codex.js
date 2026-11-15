// `codex app-server`'s account/rateLimits/read reply (helpers/codex-limits.sh prints it) as
// Limits. The windows are told apart by length (300 min, 10080 min), not by primary/secondary.

const H5 = 300, D7 = 10080;

export function parseCodexLimits(stdout) {
  const line = stdout.split("\n").find((l) => l.includes('"id":2'));
  if (!line) return { error: "No reply from codex" };
  let msg;
  try { msg = JSON.parse(line); } catch { return { error: "No reply from codex" }; }
  if (msg.error) return { error: String(msg.error.message ?? "codex could not read its limits") };
  const rl = msg.result?.rateLimits ?? {};
  let h5 = null, d7 = null;
  for (const w of [rl.primary, rl.secondary]) {
    if (typeof w?.usedPercent !== "number" || typeof w?.resetsAt !== "number") continue;
    const win = { used: w.usedPercent, resetsAt: w.resetsAt };
    if (w.windowDurationMins === H5) h5 = win;
    else if (w.windowDurationMins === D7) d7 = win;
  }
  if (!h5 && !d7) return { error: "No subscription limits" };
  return { plan: rl.planType ?? null, h5, d7 };
}
