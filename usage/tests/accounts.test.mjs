import { test } from "node:test";
import assert from "node:assert/strict";
import { configDirsFromPs, claudeAccount, codexAccount, uniqueAccounts } from "../mods/usage/lib/accounts.js";

const team = { oauthAccount: { accountUuid: "u1", organizationType: "claude_team", organizationName: "acme-cloud", emailAddress: "a@acme.dev" } };
const max = { oauthAccount: { accountUuid: "u2", organizationType: "claude_max", organizationName: "kim@studio.dev's Organization", emailAddress: "kim@studio.dev" } };

test("configDirsFromPs lists each CLAUDE_CONFIG_DIR once, in order", () => {
  const ps = "123 claude --x CLAUDE_CONFIG_DIR=/u/a/.claude-second HOME=/u/a\n456 claude HOME=/u/a\n789 claude CLAUDE_CONFIG_DIR=/u/a/.claude-second\n";
  assert.deepEqual(configDirsFromPs(ps), ["/u/a/.claude-second"]);
});

test("a Team account is named after its organization", () => {
  assert.deepEqual(claudeAccount(team, null, {}), { id: "u1", provider: "claude", dir: null, label: "acme-cloud", plan: "team" });
});

test("a personal plan is named by its email, never 'x's Organization'", () => {
  assert.deepEqual(claudeAccount(max, "/u/a/.claude-second", {}), { id: "u2", provider: "claude", dir: "/u/a/.claude-second", label: "kim@studio.dev", plan: "max" });
});

test("a name the person set wins", () => {
  assert.equal(claudeAccount(team, null, { u1: "work" }).label, "work");
});

test("no oauthAccount means no account", () => {
  assert.equal(claudeAccount({}, null, {}), null);
  assert.equal(claudeAccount(null, null, {}), null);
});

test("codexAccount reads email and plan from the id token", () => {
  const payload = Buffer.from(JSON.stringify({ sub: "s1", email: "kim.dev@gmail.com", "https://api.openai.com/auth": { chatgpt_plan_type: "plus" } })).toString("base64url");
  const auth = { tokens: { id_token: `h.${payload}.sig` } };
  assert.deepEqual(codexAccount(auth, {}), { id: "codex:s1", provider: "codex", dir: null, label: "kim.dev@gmail.com", plan: "plus" });
  assert.equal(codexAccount(null, {}), null);
});

test("uniqueAccounts keeps the first account per id", () => {
  const a = claudeAccount(team, null, {});
  const b = claudeAccount(team, "/u/a/.claude-copy", {});
  assert.deepEqual(uniqueAccounts([a, b]), [a]);
});
