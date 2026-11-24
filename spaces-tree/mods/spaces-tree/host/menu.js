// The groups menu: a right-click on the SPACES header or a repo group's header opens a popup
// copy of this mod (props {mode: "menu"}) with one item, "Edit groups…", drawn as Herdr's own
// `menu` mod draws its items (Herdr's popup frame, `popover`, 31px rows, a 14px `muted` glyph).
// Edit groups opens the rules' file (lib/groups.js CONFIG_FILE) in the system's text editor,
// first creating it as `{ "groups": [] }` when it isn't there. Never keeps a cx.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, openOverlay, closeOverlay, theme, appHome, readTextFile, writeTextFile, exec, notify, window } from "herdr";
import { NAME } from "../lib/name.js";
import { CONFIG_FILE } from "../lib/groups.js";

const ITEMS = [{ id: "edit-groups", label: "Edit groups…", icon: "square-pen" }];
const PAD = 5;
const ROW = 31;

/** Opens the menu at the pointer, as tall as its items. */
export function openGroupsMenu() {
  openOverlay({ mod: NAME, kind: "popup", width: 200, height: PAD * 2 + ITEMS.length * ROW, props: { mode: "menu" } });
}

// A new rules file changes nothing until the person writes a rule.
const STARTER = '{\n  "groups": []\n}\n';

// The system's opener for a text file, the path its own argument: macOS's default text editor
// (`open -t`), Linux's default app (`xdg-open`), Windows's (`start`, through cmd).
function opener(path) {
  const platform = window()?.platform;
  if (platform === "macos") return ["open", ["-t", path]];
  if (platform === "windows") return ["cmd", ["/c", "start", "", path]];
  return ["xdg-open", [path]];
}

/** Creates the rules' file when missing (never touches one that's there), then opens it. */
export async function editGroups() {
  const path = `${appHome()}/${CONFIG_FILE}`;
  try {
    if ((await readTextFile(path)) === null) await writeTextFile(path, STARTER, null);
  } catch (e) {
    // A file made meanwhile (a stale snapshot) is fine: open what's there.
    if ((await readTextFile(path).catch(() => null)) === null) {
      notify({ title: `Couldn't create ${CONFIG_FILE}`, body: String(e?.message ?? e), level: "error" });
      return;
    }
  }
  const [cmd, args] = opener(path);
  const r = await exec(cmd, args, { timeout: 15000 }).catch((e) => ({ code: 1, stderr: String(e?.message ?? e) }));
  if (r.code !== 0) notify({ title: `Couldn't open ${CONFIG_FILE}`, body: (r.stderr || "").trim(), level: "error" });
}

export const menuMethods = {
  initMenu(cx) {
    this.at = 0;
    this.focus = cx.focus_handle();
    this.focus.focus();
  },

  // The item runs, then the popup closes (closing first would cancel the run).
  chooseMenu(i, cx) {
    const it = ITEMS[i];
    if (!it) return;
    cx.spawn(async () => {
      if (it.id === "edit-groups") await editGroups();
      closeOverlay(props()?.overlay);
    });
  },

  menuView() {
    const t = theme();
    return v_flex()
      .id("groups-menu")
      .track_focus(this.focus)
      .w_full()
      .min_h(0)
      .p(PAD)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % ITEMS.length;
        else if (e.key === "up") this.at = (this.at + ITEMS.length - 1) % ITEMS.length;
        else if (e.key === "enter") return this.chooseMenu(this.at, cx);
        else if (e.key === "escape") return closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(ITEMS.map((it, i) => h_flex()
        .id(`mi-${it.id}`)
        .h(ROW)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .when(i === this.at, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.chooseMenu(i, cx))
        .child(svg(`mods/workspace-chrome/${it.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(it.label))));
  },
};
