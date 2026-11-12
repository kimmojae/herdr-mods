// Right-click and ⋯ menus: a popup copy of this mod (mode "menu") that draws its own panel
// (frame "none") at the pointer. A submenu replaces the menu in place under a back row.
// ↑ ↓ move, → or Enter opens a submenu, ← or Esc goes back, Enter runs. Items close the popup first.
import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, theme, settings } from "herdr";
import { menuGroups, headerGroups } from "../lib/menu.js";
import { editorChoices, browserChoices } from "../lib/openwith.js";
import { revealInFinder, openInTerminal, copyText, askSidebar, toggleAppearance } from "./actions.js";
import { installedApps, iconPath, openWith, defaultEditor, setDefaultEditor, defaultBrowser, refreshAppsIfStale } from "./apps.js";
import { agentChoices, newAgentChoices, insertIntoAgent, programIcon } from "./agents.js";
import { openFile } from "./viewer.js";

// "@path " for an agent's input; quoted when it has spaces, which would end the mention.
const mention = (t) => {
  const path = `${t.rel || "."}${t.dir && t.rel ? "/" : ""}`;
  return /\s/.test(path) ? `@"${path}" ` : `@${path} `;
};

const SUBMENUS = {
  // Opening with an editor from the list makes it the default editor.
  editorList(view) {
    const t = view.target;
    return editorChoices(installedApps().editors, defaultEditor()).map((app) => ({ id: app.id, label: app.name, detail: app.detail,
      icon: image(iconPath(app)).size(16).flex_none(), run: () => { setDefaultEditor(app); openWith(app, t.path, t.line ?? null); } }));
  },
  browserList(view) {
    const t = view.target, apps = installedApps();
    return browserChoices(apps.browsers, apps.defaultBrowser).map((app) => ({ id: app.id, label: app.name, detail: app.detail,
      icon: image(iconPath(app)).size(16).flex_none(), run: () => openWith(app, t.path) }));
  },
  agents(view) {
    return agentChoices(view.space).map((a) => ({ id: a.address, label: a.label, icon: a.icon, disabled: a.disabled, detail: a.detail,
      run: (cx) => insertIntoAgent(cx, a.address, mention(view.target)) }));
  },
  newAgents(view) {
    const t = view.target;
    const folder = t.dir ? t.path : t.path.slice(0, t.path.lastIndexOf("/")) || "/";
    return (view.newAgents ?? []).map((a) => ({ id: a.key, label: a.label, icon: programIcon(a.program),
      run: () => askSidebar("start-agent", { root: t.root, space: view.space, folder: t.top ?? t.root ?? folder, argv: a.run, text: mention(t) }) }));
  },
};

const ROW = 28, SEP = 9, PAD = 5, WIDTH = 236;

const groupsFor = (target) => {
  const apps = installedApps();
  return target.kind === "header"
    ? headerGroups(target.prefs ?? {}, { dark: Boolean(settings().dark) })
    : menuGroups({ ...target, editor: defaultEditor()?.name, editors: apps.editors.length, browsers: apps.browsers.length });
};

/**
 * Opens the menu for a tree row, the empty area (isRoot) or the header (kind "header") at the
 * pointer, sized to the menu itself so it opens where the click was. A submenu replaces the menu
 * in place (with a back row) rather than widening the popup.
 */
export function openMenu(target, space) {
  const groups = groupsFor(target), apps = installedApps();
  // A popup can't grow once open, so it is as tall as the menu or its longest submenu (a back
  // row, a separator, the items); the panel draws only what it shows. New agents load later:
  // room for six.
  const rows = { clickOpens: CLICK_OPENS.length, editorList: apps.editors.length, browserList: apps.browsers.length,
    agents: agentChoices(space).length, newAgents: 6 };
  const sub = (name) => PAD * 2 + 2 + ROW + SEP + Math.max(1, rows[name] ?? 6) * ROW;
  let height = Math.max(PAD * 2 + 2 + groups.flat().length * ROW + (groups.length - 1) * SEP,
    ...groups.flat().filter((it) => it.submenu).map((it) => sub(it.submenu)));
  // A viewer ▾: that list by itself.
  if (target.startIn) height = PAD * 2 + 2 + Math.max(1, rows[target.startIn]) * ROW;
  openOverlay({ mod: "code-explorer", kind: "popup", frame: "none", width: WIDTH, height, props: { mode: "menu", target, space, height } });
}

// Side (⌘-click) and editor (its buttons) have their own ways in, so a click only previews or pins.
const CLICK_OPENS = [["preview", "Preview Tab"], ["pinned", "Pinned Tab"]];

export const menuMethods = {
  initMenu(cx) {
    const p = props() ?? {};
    this.target = p.target ?? {};
    this.space = p.space;
    this.at = -1; // like Cursor: nothing highlighted until hover or a key
    this.sub = null;
    this.subAt = -1;
    if (this.target.startIn) { this.sub = this.target.startIn; this.subAt = 0; }
    this.focus = cx.focus_handle();
    this.focus.focus();
    this.submenus = { ...SUBMENUS, ...(this.extraSubmenus ?? {}) };
    if (this.target.path) cx.spawn(async (cx) => { this.newAgents = await newAgentChoices(this.target.on); cx.notify(); });
    if (this.target.path && !this.target.on) cx.spawn(async (cx) => { if (await refreshAppsIfStale()) cx.notify(); });
  },

  groups() {
    return groupsFor(this.target);
  },

  // Items of a submenu: [{id, label, detail?, icon?, disabled?, run(cx)}]. Filled by later tasks.
  submenuItems(name) {
    if (name === "clickOpens") {
      const now = this.target.prefs?.clickOpens === "pinned" ? "pinned" : "preview";
      return CLICK_OPENS.map(([value, label]) => ({ id: value, label, detail: value === now ? "✓" : "", run: () => askSidebar("pref", { key: "clickOpens", value }) }));
    }
    return this.submenus[name]?.(this) ?? [];
  },

  closeMenu() {
    closeOverlay(props()?.overlay);
  },

  runItem(item, cx) {
    const t = this.target;
    this.closeMenu();
    switch (item.id) {
      case "copy-path": return copyText(cx, t.path);
      case "copy-rel": return copyText(cx, t.rel);
      case "copy-name": return copyText(cx, t.path.slice(t.path.lastIndexOf("/") + 1));
      case "reveal": return revealInFinder(t.path);
      case "terminal": return openInTerminal(this.space, t.dir ? t.path : t.path.slice(0, t.path.lastIndexOf("/")) || "/");
      case "open-side": case "open-tab":
        if (t.viewer) return openFile({ path: t.path, rel: t.rel, root: t.root, on: t.on }, item.id === "open-side" ? "side" : "pinned");
        return askSidebar(item.id, { root: t.root, treePath: t.treePath });
      case "open-in-editor": { const app = defaultEditor(); return app && openWith(app, t.path, t.line ?? null); }
      case "appearance": return toggleAppearance();
      case "open-in-browser": { const app = defaultBrowser(); return app && openWith(app, t.path); }
      case "open-changes": return openFile({ path: t.path, rel: t.rel, root: t.root, on: t.on }, "preview", { diff: true });
      default:
        if (item.id.startsWith("pref:")) return askSidebar("pref", { key: item.id.slice(5), value: !t.prefs?.[item.id.slice(5)] });
    }
  },

  menuView() {
    const t = theme();
    const items = this.groups().flat();
    const label = items.find((it) => it.submenu === this.sub)?.label ?? "";
    const subItems = this.sub ? this.submenuItems(this.sub) : [];

    const row = (id, text, { on, right, disabled, icon } = {}) =>
      h_flex().id(id).h(ROW).flex_none().px(10).gap(9).items_center().rounded(6)
        .when(Boolean(on), (el) => el.bg(t.selected))
        .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)))
        .when(Boolean(disabled), (el) => el.text_color(t.dim))
        .when(Boolean(icon), (el) => el.child(icon))
        .child(div().flex_1().min_w(0).truncate().child(text))
        .when(Boolean(right), (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child(right)));

    const panel = v_flex().id("code-explorer-menu").w(WIDTH).max_h((props() ?? {}).height ?? 360).p(PAD).bg(t.popover)
      .border_1().border_color(t.border).rounded(9).text_size(12.8).text_color(t.foreground).overflow_y_scrollbar()
      .track_focus(this.focus).on_key_down((e, cx) => this.menuKey(e, cx, items, subItems));

    if (this.sub) {
      // A list opened by itself (a viewer ▾) is the whole popup: no way back to a menu it never had.
      if (!this.target.startIn) {
        panel.child(row("m-back", `‹  ${label}`, { on: this.subAt === -1 }).text_color(t.muted)
          .on_click((_e, cx) => { this.sub = null; cx.notify(); }));
        panel.child(div().h(1).my(4).mx(6).flex_none().bg(t.border));
      }
      if (!subItems.length) panel.child(div().px(10).py(6).text_size(12).text_color(t.dim).child(this.sub === "agents" ? "No agents running" : "Nothing to show"));
      subItems.forEach((it, i) => {
        if (it.group && (i === 0 || subItems[i - 1].group !== it.group)) panel.child(div().px(10).pt(i ? 8 : 2).pb(3).text_size(10.5).text_color(t.dim).child(it.group.toUpperCase()));
        panel.child(row(`s-${this.sub}-${it.id}`, it.label, { on: i === this.subAt, right: it.detail, disabled: it.disabled, icon: it.icon })
          .on_hover((hovered, cx) => { if (hovered) { this.subAt = i; cx.notify(); } })
          .on_click((_e, cx) => this.pick(it, cx)));
      });
      return panel;
    }

    let n = -1;
    this.groups().forEach((group, g) => {
      if (g) panel.child(div().h(1).my(4).mx(6).flex_none().bg(t.border));
      for (const it of group) {
        const index = ++n;
        panel.child(row(`m-${it.id}`, it.label, { on: index === this.at, right: it.submenu ? "›" : it.shortcut })
          .on_hover((hovered, cx) => { if (hovered && this.at !== index) { this.at = index; cx.notify(); } })
          .on_click((_e, cx) => this.choose(it, cx)));
      }
    });
    return panel;
  },

  // A submenu item: close the menu, then run it.
  pick(item, cx) {
    if (!item || item.disabled) return;
    this.closeMenu();
    item.run(cx);
  },

  choose(item, cx) {
    if (!item) return;
    if (item.submenu) { this.sub = item.submenu; this.subAt = 0; cx.notify(); }
    else this.runItem(item, cx);
  },

  // Main menu: ↑ ↓ move, → or Enter opens a submenu, Enter runs, Esc closes.
  // Submenu: ↑ ↓ move, Enter runs, ← or Esc goes back.
  menuKey(e, cx, items, subItems) {
    const k = e.key;
    if (this.sub) {
      if ((k === "escape" || k === "left") && this.target.startIn) return this.closeMenu();
      if (k === "escape" || k === "left") this.sub = null;
      else if (k === "down") this.subAt = (this.subAt + 1) % Math.max(1, subItems.length);
      else if (k === "up") this.subAt = (this.subAt + subItems.length - 1) % Math.max(1, subItems.length);
      else if (k === "enter" && subItems[this.subAt]) return this.pick(subItems[this.subAt], cx);
      else return;
    } else {
      if (k === "escape") return this.closeMenu();
      if (k === "down" || k === "up") this.at = this.at < 0 ? (k === "down" ? 0 : items.length - 1) : (this.at + (k === "down" ? 1 : items.length - 1)) % items.length;
      else if (k === "enter" || (k === "right" && items[this.at]?.submenu)) return this.choose(items[this.at], cx);
      else return;
    }
    cx.stop_propagation();
    cx.notify();
  },
};
