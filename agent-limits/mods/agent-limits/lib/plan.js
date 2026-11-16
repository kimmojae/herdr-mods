// What to run for each account, decided without touching Herdr.

/** The default account must run with CLAUDE_CONFIG_DIR unset: set to ~/.claude, it isn't signed in. */
export function claudeCommand(dir, script) {
  return dir === null
    ? { cmd: "env", args: ["-u", "CLAUDE_CONFIG_DIR", "sh", script] }
    : { cmd: "env", args: [`CLAUDE_CONFIG_DIR=${dir}`, "sh", script] };
}

/** Config folders seen before stay, so an account stays listed after its sessions close. */
export function rememberDirs(stored, seen) {
  return [...stored, ...seen.filter((d) => !stored.includes(d))];
}
