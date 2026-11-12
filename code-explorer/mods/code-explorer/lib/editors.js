// Editors: their order, the default editor, and the command that opens a file in one.
// host/apps.jxa finds what is installed; this decides the rest.

// Shown first, in this order (by bundle id or, where that isn't fixed, name); every other editor
// follows by name.
const FIRST = [
  "com.todesktop.230313mzl4w4u92", // Cursor
  "com.microsoft.VSCode",
  "com.microsoft.VSCodeInsiders",
  "Antigravity",
  "com.exafunction.windsurf",
  "dev.zed.Zed",
];

export function sortEditors(editors) {
  const rank = (a) => { const i = FIRST.findIndex((f) => f === a.id || f === a.name); return i < 0 ? FIRST.length : i; };
  return [...editors].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The user's chosen editor while it is installed, else the first one; null with none. */
export function pickDefaultEditor(editors, chosenId) {
  return editors.find((e) => e.id === chosenId) ?? editors[0] ?? null;
}

// $1 cli, $2 path, $3 line (or ""), $4 app, $5 kind. Given only a file, these editors use the
// last active window, often another repo's; given the repo's folder too, they bring up that
// repo's window (or open one) with the file in it.
const IN_REPO = `[ -x "$1" ] || exec open -a "$4" "$2"
if [ -d "$2" ]; then exec "$1" "$2"; fi
dir=$(git -C "\${2%/*}" rev-parse --show-toplevel 2>/dev/null) || dir=\${2%/*}
if [ -z "$3" ]; then exec "$1" "$dir" "$2"; fi
if [ "$5" = jetbrains ]; then exec "$1" "$dir" --line "$3" "$2"; fi
exec "$1" "$dir" --goto "$2:$3"`;

/**
 * The one command that opens `path` (at `line`) in `app`: VS Code-family and JetBrains editors
 * through their CLI in the repo's window, anything else with `open -a`.
 * @param {{path: string, kind?: "vscode"|"jetbrains", cli?: string}} app
 */
export function openCommand(app, path, line = null) {
  if (app.cli && (app.kind === "vscode" || app.kind === "jetbrains")) {
    return { cmd: "sh", args: ["-c", IN_REPO, "open-with", app.cli, path, line ? String(line) : "", app.path, app.kind] };
  }
  return { cmd: "open", args: ["-a", app.path, path] };
}

