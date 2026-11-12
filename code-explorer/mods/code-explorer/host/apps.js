// Installed editors (found by apps.jxa) and browsers, the default editor and browser, and app
// icons for the buttons and lists. The sidebar finds the apps once and shares them.
// macOS only: elsewhere every list is empty.
import { exec, appHome, shared, setShared, window, notify } from "herdr";
import { sortEditors, pickDefaultEditor, openCommand } from "../lib/editors.js";

const APPS = "code-explorer:apps", EDITOR = "code-explorer:editor";
const script = () => `${appHome()}/mods/code-explorer/host/apps.jxa`;
// The platform, or null while Herdr hasn't said yet (it can be, as a copy starts).
const platform = () => window()?.platform ?? null;
const NONE = { editors: [], browsers: [], defaultBrowser: null };

async function ask(...args) {
  const r = await exec("osascript", ["-l", "JavaScript", script(), ...args]).catch(() => null);
  if (r?.code !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return r.stdout.trim(); }
}

// 64 px, sharp at 18 px on a 2× screen; the size is in the name so older 32 px copies aren't reused.
export const iconPath = (app) => `mods/code-explorer/.cache/apps/${app.id || app.name}-64.png`;

// One PNG per app, made once from its .icns.
async function ensureIcon(app) {
  const icns = await ask("icon", app.path);
  if (!icns) return;
  const out = `${appHome()}/${iconPath(app)}`;
  // sips takes no "--"; both paths are absolute, so neither can be read as an option.
  await exec("sh", ["-c", '[ -f "$2" ] || { mkdir -p -- "$(dirname -- "$2")" && sips -s format png -Z 64 "$1" --out "$2" >/dev/null; }', "icon", icns, out]).catch(() => null);
}

/**
 * Finds editors and browsers (sidebar at start; menus when the list is stale). False when the
 * platform isn't known yet: the shared list stays as it was and the caller asks again.
 */
export async function loadApps() {
  const p = platform();
  if (!p) return false;
  if (p !== "macos") { setShared(APPS, { ...NONE, at: Date.now(), ready: true }); return true; }
  const [editors, web] = await Promise.all([ask("editors"), ask("browsers")]);
  const apps = {
    at: Date.now(), editors: sortEditors(editors ?? []), browsers: web?.browsers ?? [], defaultBrowser: web?.default ?? null, ready: true,
  };
  await Promise.all([...apps.editors, ...apps.browsers, FINDER].map(ensureIcon));
  setShared(APPS, apps);
  return true;
}

// Apps installed or removed since: looked for again when a menu opens and the list is this old.
const STALE_MS = 5 * 60 * 1000;
/** Finds the apps again when the shared list is over 5 minutes old; true if it did. */
export async function refreshAppsIfStale() {
  const at = shared(APPS)?.at ?? 0;
  if (Date.now() - at < STALE_MS) return false;
  await loadApps().catch(() => null);
  return true;
}

/** Finder, for the Files header's Open in Finder button (its icon is made with the others). */
export const FINDER = { id: "com.apple.finder", name: "Finder", path: "/System/Library/CoreServices/Finder.app" };

export const installedApps = () => ({ ...NONE, ready: false, ...(shared(APPS) ?? {}) });

/** The user's chosen editor while installed, else the first found; null with none. */
export const defaultEditor = () => pickDefaultEditor(installedApps().editors, shared(EDITOR) ?? null);
export const setDefaultEditor = (app) => setShared(EDITOR, app.id);
/** macOS's default browser if installed, else the first; null with none. */
export const defaultBrowser = () => { const a = installedApps(); return a.browsers.find((b) => b.id === a.defaultBrowser?.id) ?? a.browsers[0] ?? null; };

/** Opens `path` in `app`: editors with a CLI in the window of the file's repo, at `line` if given. */
export async function openWith(app, path, line = null) {
  // One exec, started before any await: menus call this as they close, and work queued after
  // an await never runs once the menu's view is gone.
  const { cmd, args } = openCommand(app, path, line);
  const r = await exec(cmd, args).catch((e) => ({ code: 1, stderr: String(e) }));
  if (r.code !== 0) notify({ title: `Couldn't open it in ${app.name}`, body: (r.stderr || "").trim(), level: "error" });
}
