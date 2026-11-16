// Which accounts there are and what to call them. An Account is
// { id, provider: "claude" | "codex", dir: CLAUDE_CONFIG_DIR or null, label, plan }.

/** Every CLAUDE_CONFIG_DIR in `ps -axeww -o command=` output, once, in order. */
export function configDirsFromPs(psText) {
  const dirs = [];
  for (const m of psText.matchAll(/(?:^|\s)CLAUDE_CONFIG_DIR=(\S+)/g)) if (!dirs.includes(m[1])) dirs.push(m[1]);
  return dirs;
}

const TEAM = /team|enterprise/;

/** From a .claude.json (`~/.claude.json` for the default account, `<dir>/.claude.json` otherwise). */
export function claudeAccount(claudeJson, dir, names) {
  const a = claudeJson?.oauthAccount;
  if (!a?.accountUuid) return null;
  const type = String(a.organizationType ?? "");
  const org = a.organizationName && !/'s Organization$/.test(a.organizationName) ? a.organizationName : null;
  const label = names[a.accountUuid] ?? ((TEAM.test(type) && org) || a.emailAddress || org || "Claude");
  return { id: a.accountUuid, provider: "claude", dir, label, plan: type.replace(/^claude_/, "") || null };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// A JWT payload is base64url JSON; decoded by hand (the mod runtime has no Buffer).
function jwtPayload(token) {
  const part = String(token ?? "").split(".")[1];
  if (!part) return null;
  let bits = 0, acc = 0, hex = "";
  for (const ch of part.replace(/=+$/, "")) {
    const v = B64.indexOf(ch === "+" ? "-" : ch === "/" ? "_" : ch);
    if (v < 0) return null;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; hex += "%" + ((acc >> bits) & 255).toString(16).padStart(2, "0"); }
  }
  try { return JSON.parse(decodeURIComponent(hex)); } catch { return null; }
}

/** From Codex's auth.json: the ChatGPT account's email and plan. */
export function codexAccount(authJson, names) {
  const p = jwtPayload(authJson?.tokens?.id_token);
  if (!p) return null;
  const id = `codex:${p.sub ?? p.email ?? "default"}`;
  const plan = p["https://api.openai.com/auth"]?.chatgpt_plan_type ?? null;
  return { id, provider: "codex", dir: null, label: names[id] ?? p.email ?? "Codex", plan };
}

/** One account per id (the same login in two folders); the first wins. */
export function uniqueAccounts(list) {
  const seen = new Set();
  return list.filter((a) => a && !seen.has(a.id) && seen.add(a.id));
}
