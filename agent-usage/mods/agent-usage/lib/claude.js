// Claude Code's `get_usage` reply (helpers/claude-usage.sh prints it) as Limits:
// { plan, h5: { used, resetsAt } | null, d7: … | null }, or { error }.
// Only the 5-hour and 7-day windows; per-model limits are left out.

const toEpoch = (v) => (typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) / 1000 : null);

function win(used, resetsAt) {
  const at = toEpoch(resetsAt);
  return typeof used === "number" && Number.isFinite(at) ? { used, resetsAt: at } : null;
}

export function parseClaudeUsage(stdout) {
  const line = stdout.split("\n").find((l) => l.includes('"control_response"'));
  if (!line) return { error: "No reply from the claude CLI" };
  let res;
  try { res = JSON.parse(line).response ?? {}; } catch { return { error: "No reply from the claude CLI" }; }
  if (res.subtype !== "success") return { error: String(res.error ?? "The claude CLI could not read usage") };
  const body = res.response ?? {};
  const rl = body.rate_limits ?? {};
  let h5 = null, d7 = null;
  if (Array.isArray(rl.limits)) {
    for (const l of rl.limits) {
      if (l?.kind === "session") h5 = win(l.percent, l.resets_at);
      else if (l?.kind === "weekly_all") d7 = win(l.percent, l.resets_at);
    }
  } else {
    h5 = win(rl.five_hour?.utilization, rl.five_hour?.resets_at);
    d7 = win(rl.seven_day?.utilization, rl.seven_day?.resets_at);
  }
  if (!h5 && !d7) return { error: "No subscription limits" };
  return { plan: body.subscription_type ?? null, h5, d7 };
}
