// naps: light ↔ dark from the layout's bottom row, a button and ⌘⌥L. The key is bound under
// layout:naps, so it reaches this copy, which is always on screen there.
// lib/ holds the logic that does not touch Herdr; tests run it under plain Node.
import { View, div, svg } from "gpui-kit";
import { theme, settings, appHome, nextCommand, notify, shared, setShared } from "herdr";
import * as fs from "fs/promises";
import { flipAppearance } from "./lib/appearance.js";
import { NAME, DIR, key } from "./lib/name.js";

// A held key repeats, and settings().dark only changes once Herdr has read the file: a second
// flip this soon would read the old appearance and write it back.
const SETTLE = 500;

async function toggleAppearance() {
  if (Date.now() - (shared(key("flipped-at")) ?? 0) < SETTLE) return;
  setShared(key("flipped-at"), Date.now());
  const file = `${appHome()}/settings.json`;
  try {
    const next = flipAppearance(await fs.readFile(file, "utf8"), Boolean(settings().dark));
    if (next) await fs.writeFile(file, next);
  } catch (e) { notify({ title: "Couldn't switch light and dark", body: String(e), level: "error" }); }
}

class Naps extends View {
  init(_given, cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const command = String(await nextCommand()).split(".").pop();
        if (command === "toggle-appearance") await toggleAppearance();
        cx.notify();
      }
    });
  }

  // The icon is what a click switches to.
  render() {
    const t = theme(), dark = Boolean(settings().dark);
    return div().id(NAME).size_full().flex().items_center().justify_center().bg(t.chrome)
      .border_t(1).border_color(t.border)
      .child(div().id("naps-appearance").size(24).flex().items_center().justify_center().rounded(6).cursor_pointer()
        .accessibility_label(dark ? "Light mode" : "Dark mode").tooltip(`${dark ? "Light" : "Dark"} mode (⌥⌘L)`)
        .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => { toggleAppearance(); })
        .child(svg(`${DIR}/icons/${dark ? "sun" : "moon"}.svg`).size(14)));
  }
}

export default Naps;
