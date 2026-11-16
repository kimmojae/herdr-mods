// The panel: every account at once. Per account its logo, label and plan, then 5h and 7d with a
// bar, what's left and when it resets. Refresh is the only control; Esc or a click outside closes.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, props, shared, setShared } from "herdr";
import { key } from "../lib/name.js";
import { left, isLow, resetText, cutMiddle, ageText, PANEL } from "../lib/format.js";
import { poll, loadReadings } from "./poll.js";
import { logo, bar, mono } from "./look.js";

export const PANEL_WIDTH = 400;
const { HEAD, ROW, ERR, FOOT, EDGE, EMPTY } = PANEL;

// The footer: the newest reading. A failed account says its own age on its error line.
function age(readings, now) {
  const at = ageText(Math.max(0, ...readings.map((r) => r.at ?? 0)), now);
  return at ? `updated ${at}` : "not updated yet";
}

export const panelMethods = {
  initPanel(cx) {
    this.refreshing = false;
    this.refreshPanel(cx);
  },

  refreshPanel(cx) {
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      try { await poll(); } catch {}
      finally { this.refreshing = false; cx.notify(); }
    });
  },

  // Esc or a click outside closes the popup without the button knowing: forget it here. The
  // time lets a click on the button that closed it not open it again (see bar.js toggle).
  closePanel() {
    if (shared(key("open")) === props()?.overlay) setShared(key("open"), null);
    setShared(key("closedAt"), Date.now());
  },

  account(r, t, now) {
    const nowS = now / 1000, lim = r.limits;
    const line = (label, kind) => {
      const w = lim?.[kind] ?? null, pct = left(w, nowS);
      return h_flex().h(ROW).gap(10).items_center()
        .child(div().w(22).flex_none().text_color(t.dim).child(label))
        .child(div().flex_1().child(bar(pct, 160, 4, t)))
        .child(div().w(40).flex_none().text_right().text_color(isLow(pct) ? t.ansi3 : t.foreground).child(pct === null ? "—" : `${pct}%`))
        .child(div().w(84).flex_none().text_right().text_color(t.dim).child(resetText(kind, w, new Date(now))));
    };
    const plan = r.plan ?? r.limits?.plan;
    return v_flex().py(10).border_b_1().border_color(t.border)
      .child(h_flex().h(HEAD).gap(8).items_center()
        .child(logo(r.provider, 14, t))
        .child(div().text_color(t.foreground).child(cutMiddle(r.label, 26)))
        .when(Boolean(plan), (el) => el.child(div().px(6).rounded(4).bg(t.raised).text_size(9.5).font_semibold()
          .text_color(t.muted).child(String(plan).toUpperCase()))))
      .child(v_flex().pl(22).when(Boolean(r.error) && Boolean(lim), (el) => el.opacity(0.6))
        .child(line("5h", "h5")).child(line("7d", "d7")))
      .when(Boolean(r.error), (el) => el.child(div().h(ERR).pl(22).text_size(11).text_color(t.dim).truncate()
        .child(r.at ? `${r.error} · last read ${ageText(r.at, now)}` : r.error)));
  },

  panelView(cx) {
    const t = theme(), now = Date.now(), readings = loadReadings();
    return v_flex().id("agent-usage-panel").size_full().bg(t.popover).border_1().border_color(t.border).rounded(12)
      .font_family(mono()).text_size(12).text_color(t.muted).overflow_hidden()
      .child(v_flex().flex_1().px(16).pt(EDGE)
        .when(readings.length === 0, (el) => el.child(div().h(EMPTY).flex_none().items_center().flex().text_color(t.dim).child("No signed-in Claude or Codex account found.")))
        .children(readings.map((r) => this.account(r, t, now))))
      .child(h_flex().h(FOOT).flex_none().px(16).items_center().justify_between().text_size(11).text_color(t.dim)
        .child(div().child(this.refreshing ? "updating…" : age(readings, now)))
        .child(div().id("agent-usage-refresh").cursor_pointer().hover((s) => s.text_color(t.foreground))
          .on_click((_e, cx) => { this.refreshPanel(cx); cx.notify(); }).child("↻ refresh")));
  },
};
