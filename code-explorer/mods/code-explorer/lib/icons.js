// Picks a file or folder icon from icons.json the way VS Code resolves an icon theme: exact file
// name, then the longest extension ("a.d.ts" tries "d.ts" before "ts"), then the language the
// extension stands for, then the default.

const BASE = "mods/code-explorer/";

// Extensions VS Code knows by language id; Symbols maps many of these only through languageIds.
const LANGUAGE_IDS = {
  ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact", py: "python",
  rb: "ruby", go: "go", rs: "rust", c: "c", cpp: "cpp", cs: "csharp", java: "java", php: "php",
  swift: "swift", kt: "kotlin", vue: "vue", svelte: "svelte", scss: "scss", sass: "sass", less: "less",
  css: "css", html: "html", sql: "sql", sh: "shellscript", md: "markdown", yaml: "yaml", yml: "yaml",
  json: "json",
};

/** @returns {string | null} a path under ~/.config/herdr-app, or null without a map */
export function resolveIcon(map, name, dir) {
  if (!map) return null;
  const lower = name.toLowerCase();
  if (dir) return BASE + (map.folders[lower] ?? map.folder);
  const exact = map.names[lower];
  if (exact) return BASE + exact;
  const parts = lower.split(".");
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join(".");
    const hit = map.exts[ext] ?? map.langs[LANGUAGE_IDS[ext]];
    if (hit) return BASE + hit;
  }
  return BASE + map.file;
}
