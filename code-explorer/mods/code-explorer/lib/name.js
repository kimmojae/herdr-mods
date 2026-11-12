// The mod's name: its folder under mods/, its panes' `mod`, and the prefix of what it stores.
// scripts/sync.mjs rewrites this line to install a working copy beside a released one.
export const NAME = "code-explorer";

export const DIR = `mods/${NAME}`;
export const key = (k) => `${NAME}:${k}`;
