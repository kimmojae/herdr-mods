// The right-click menus, as data: groups of items, in Cursor's explorer order. The view fills
// the submenus ("editorList", "browserList", "agents", "newAgents") and runs the items by id.
import { isWeb } from "./openwith.js";

const item = (id, label, extra = {}) => ({ id, label, ...extra });

/**
 * @param {{path: string, rel: string, root: string, dir: boolean, on: string|null, open?: boolean, isRoot?: boolean, changed?: boolean, editor?: string}} target
 *   `editor`: the default editor's name, for Open in <editor>; `editors`, `browsers`: how many are
 *   installed (a list item only when there is more than one). `viewer`: the menu is a viewer's ⋯,
 *   whose header already has the app buttons and which is already a tab.
 * @returns {{id: string, label: string, shortcut?: string, submenu?: string}[][]}
 */
export function menuGroups(target) {
  const local = !target.on;
  const what = target.dir ? "Folder" : "File";
  const open = [];
  const apps = local && !target.viewer;
  if (apps && target.editor) {
    open.push(item("open-in-editor", `Open in ${target.editor}`));
    if (target.editors > 1) open.push(item("editor-list", "Open in Other Editor", { submenu: "editorList" }));
  }
  if (apps && !target.dir && isWeb(target.path ?? "") && target.browsers > 0) {
    open.push(item("open-in-browser", "Open in Browser"));
    if (target.browsers > 1) open.push(item("browser-list", "Open in Other Browser", { submenu: "browserList" }));
  }
  if (!target.dir) {
    open.push(item("open-side", "Open to the Side", { shortcut: "⌃↩" }));
    if (!target.viewer) open.push(item("open-tab", "Open in New Tab"));
    if (target.changed) open.push(item("open-changes", "Open Changes"));
  }
  if (local) open.push(item("reveal", "Reveal in Finder", { shortcut: "⌥⌘R" }));
  open.push(item("terminal", "Open in Terminal"));

  return [
    open,
    [item("add-agent", `Add ${what} to Agent`, { submenu: "agents" }), item("add-new-agent", `Add ${what} to New Agent`, { submenu: "newAgents" })],
    [item("copy-path", "Copy Path", { shortcut: "⌥⌘C" }), item("copy-rel", "Copy Relative Path", { shortcut: "⌥⇧⌘C" }), item("copy-name", "Copy Name")],
  ];
}

/** The header's ⋯ menu: the panel's settings, then light/dark for the whole window (`dark`: now). */
export function headerGroups(prefs, { dark = true } = {}) {
  const check = (on) => (on ? "✓" : "");
  return [[
    item("click-opens", "Click Opens", { submenu: "clickOpens" }),
    item("pref:hideDots", "Hide Dotfiles", { shortcut: check(prefs.hideDots) }),
    item("pref:hideIgnored", "Hide Ignored Files", { shortcut: check(prefs.hideIgnored) }),
    item("pref:followActive", "Follow Active File", { shortcut: check(prefs.followActive) }),
  ], [item("appearance", dark ? "Light Mode" : "Dark Mode", { shortcut: "⌥⌘L" })]];
}
