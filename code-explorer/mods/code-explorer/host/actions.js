// What menu items do outside the tree: Finder, the clipboard, terminals. Paths always travel as
// separate arguments.
import { exec, run, notify, shared, setShared, settings, appHome } from "herdr";
import * as fs from "fs/promises";
import { flipAppearance } from "../lib/appearance.js";
import { key } from "../lib/name.js";

const MENU_KEY = key("menu");

async function program(cmd, args, what) {
  const r = await exec(cmd, args).catch((e) => ({ code: 1, stderr: String(e) }));
  if (r.code !== 0) notify({ title: `Couldn't ${what}`, body: (r.stderr || "").trim(), level: "error" });
  return r.code === 0;
}

export const revealInFinder = (path) => program("open", ["-R", path], "show it in Finder");
export const openInFinder = (folder) => program("open", [folder], "open it in Finder");

export const openInTerminal = (space, folder) => run("tab.new", { space, folder });

// Light ↔ dark (the viewer's ☀︎/☾ and ⌘⌥L). Every copy of the mod that sees the key calls this;
// the first within half a second flips, the rest would only flip it back.
const FLIPPED = key("appearance-at");
export async function toggleAppearance() {
  if (Date.now() - (shared(FLIPPED) ?? 0) < 500) return;
  setShared(FLIPPED, Date.now());
  const file = `${appHome()}/settings.json`;
  try {
    const next = flipAppearance(await fs.readFile(file, "utf8"), Boolean(settings().dark));
    if (next) await fs.writeFile(file, next);
  } catch (e) { notify({ title: "Couldn't switch light and dark", body: String(e), level: "error" }); }
}

export function copyText(cx, text) {
  try { cx.write_to_clipboard(text); }
  catch { exec("sh", ["-c", 'printf %s "$1" | pbcopy', "copy", text]); }
}

/** Hands an action that needs the tree's own state back to the sidebar copy. */
export function askSidebar(action, payload = {}) {
  setShared(MENU_KEY, { id: `${Date.now()}-${Math.random()}`, action, ...payload });
}

export const lastAsk = () => shared(MENU_KEY);
