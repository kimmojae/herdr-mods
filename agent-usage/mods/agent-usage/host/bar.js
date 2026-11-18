// The bottom-bar button: per account a logo and two mini bars, 5h over 7d. One button for all;
// a click or ⌘⌥U opens the panel above it.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, shared, setShared, openOverlay, closeOverlay, nextCommand, run, layout, settings } from "herdr";
import { NAME, key } from "../lib/name.js";
import { left, panelHeight } from "../lib/format.js";
import { ownBlock, fitWidth, SIDE } from "../lib/layout.js";
import { offsetsOf, panelAt, GUESS } from "../lib/place.js";
import { poll, loadReadings } from "./poll.js";
import { logo, bar, mono } from "./look.js";
import { PANEL_WIDTH } from "./panel.js";

const EVERY = 5 * 60 * 1000;
// A click on the button outside the open popup closes it first (Herdr) and then reaches the
// button: a toggle this soon after a close is that same click.
const SAME_CLICK = 400;

// Everything a mod measures (pointer, window, its own size) is on screen, after zoom; layout px
// and a popup's size are at zoom 1.
const zoom = () => Number(settings().zoom) || 1;

export const barMethods = {
  initBar(cx) {
    // Shared state outlives a restart; a panel open then is gone now.
    if (shared(key("open"))) setShared(key("open"), null);
    this.refresh(cx);
    cx.timer.every(EVERY, (cx) => this.refresh(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const command = String(await nextCommand()).split(".").pop();
        if (command === "toggle") this.toggle();
        if (command === "refit") this.refit();
        cx.notify();
      }
    });
  },

  refresh(cx) {
    if (this.polling) return;
    this.polling = true;
    cx.spawn(async (cx) => {
      try { await poll(); } catch {}
      finally { this.polling = false; cx.notify(); }
    });
  },

  // Above the button, right edges lined up (see lib/place.js).
  toggle() {
    const open = shared(key("open"));
    if (open) { closeOverlay(open); setShared(key("open"), null); return; }
    if (Date.now() - (shared(key("closedAt")) ?? 0) < SAME_CLICK) return;
    this.openPanel();
  },

  openPanel() {
    const height = panelHeight(loadReadings()), z = zoom();
    this.openHeight = height;
    this.openZoom = z;
    const at = this.view ? panelAt(shared(key("place")) ?? GUESS, this.view, height, PANEL_WIDTH, z) : "pointer";
    const id = openOverlay({ mod: NAME, kind: "popup", frame: "none", width: PANEL_WIDTH, height, at, props: { mode: "panel" } });
    setShared(key("open"), id);
  },

  // The block takes the button's width, no more: the status beside it keeps the rest of the row.
  fitBlock(width) {
    this.buttonWidth = width;
    const block = ownBlock(layout(), NAME);
    const px = block && fitWidth(block, width, zoom());
    if (px) run("layout.resize", { id: block.id, px });
  },

  // The pointer on the button tells where it is; kept in shared state for the next start.
  learnPlace(e) {
    if (!this.view || !e?.local_position) return;
    const bounds = e.bounds ?? { x: e.position.x - e.local_position.x, y: e.position.y - e.local_position.y, width: this.buttonWidth ?? 0 };
    const place = offsetsOf(bounds, this.view, zoom()), now = shared(key("place"));
    if (now?.right !== place.right || now?.bottom !== place.bottom) setShared(key("place"), place);
  },

  item(r, t, nowS) {
    const lim = r.limits;
    const row = (label, w) => h_flex().gap(5).items_center()
      .child(div().text_color(t.dim).child(label))
      .child(bar(left(w, nowS), 30, 3, t));
    return h_flex().gap(6).items_center()
      .child(div().when(!lim, (el) => el.opacity(0.4)).child(logo(r.provider, 13, t)))
      .when(Boolean(lim), (el) => el.child(v_flex().gap(1).text_size(10).font_family(mono()).line_height("11px")
        .when(Boolean(r.error), (s) => s.opacity(0.5))
        .child(row("5h", lim.h5)).child(row("7d", lim.d7))));
  },

  // A popup placed by one height and drawn at another floats off the button or covers it: when
  // the poll the panel started finds another account or a new error, or the zoom changes, open it again. Not while
  // drawing: a closeOverlay there leaves the old popup open, so it goes through the command queue.
  fitPanel(readings) {
    if (this.refitting || !this.misfit(readings)) return;
    this.refitting = true;
    run(`${NAME}.refit`);
  },

  misfit(readings) {
    return Boolean(shared(key("open"))) && this.openHeight !== undefined
      && (panelHeight(readings) !== this.openHeight || zoom() !== this.openZoom);
  },

  refit() {
    this.refitting = false;
    if (!this.misfit(loadReadings())) return;
    closeOverlay(shared(key("open")));
    this.openPanel();
  },

  barView() {
    const t = theme(), nowS = Date.now() / 1000;
    this.view = window.viewport_size(); // gpui's window, not herdr's window()
    const readings = loadReadings();
    this.fitPanel(readings);
    const open = Boolean(shared(key("open")));
    return h_flex().id(NAME).size_full().items_center().justify_end().px(SIDE).bg(t.chrome)
      .border_t(1).border_color(t.border)
      .child(h_flex().id("agent-usage-button").h(24).px(8).gap(14).items_center().rounded(6).cursor_pointer()
        .accessibility_label("Agent usage").tooltip("Agent usage (⌘⌥U)")
        .when(open, (el) => el.bg(t.selected)).when(!open, (el) => el.hover((s) => s.bg(t.hover)))
        .on_size_change((size) => this.fitBlock(size.width))
        .on_mouse_move((e) => this.learnPlace(e))
        .on_mouse_down("left", (e) => this.learnPlace(e))
        .on_click((_e, cx) => { this.toggle(); cx.notify(); })
        .when(readings.length === 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(this.polling ? "Usage…" : "No accounts")))
        .children(readings.map((r) => this.item(r, t, nowS))));
  },
};
