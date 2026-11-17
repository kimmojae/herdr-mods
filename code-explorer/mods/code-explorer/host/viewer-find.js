// Find in the viewer: Cursor's find widget over Code and Changes (not the Markdown and HTML
// previews, which Cursor doesn't search either). ⌘F opens it, Enter / ⇧Enter (and ⌘G / ⇧⌘G) step
// through matches, Esc closes it. Methods of the one View class (main.js).
import { div, svg } from "gpui-kit";
import { h_flex, InputState, Input, VirtualListScrollHandle } from "gpui-base";
import { findMatches, markFound, nextIndex } from "../lib/find.js";
import { MOD } from "./viewer.js";

const NONE = { matches: [], error: null, capped: false };

export const viewerFindMethods = {
  initFind(cx) {
    this.viewerFocus = cx.focus_handle();
    this.listScroll = VirtualListScrollHandle.new();
    this.finding = false;
    this.findOptions = { caseSensitive: false, wholeWord: false, regex: false };
    this.findAt = -1;
    this.findInput = InputState.new({ placeholder: "Find" });
    this.findInput.on("change", (_e, cx) => { this.findAt = -1; this.findReveal = true; cx.notify(); });
    this.findInput.on("submit", (e, cx) => this.findStep(e?.shift ? -1 : 1, cx));
    this.findInput.on("focus", (_e, cx) => { this.findTyping = true; cx.notify(); });
    this.findInput.on("blur", (_e, cx) => { this.findTyping = false; cx.notify(); });
  },

  // Code and Changes only: the previews draw through TextView, which can't mark or scroll to text.
  findable() {
    if (this.problem || this.text === undefined || this.kind === "image") return false;
    if (this.showsChanges()) return true;
    return !(this.kind === "markdown" && this.markdownView() === "preview") && !(this.kind === "html" && this.htmlView() === "preview");
  },

  openFind(cx) {
    if (!this.findable()) return;
    this.finding = true;
    // Like Cursor: the field keeps the last search, selected so typing replaces it.
    this.findInput.set_selected_range({ start: 0, end: this.findInput.value().length });
    this.findInput.focus();
    this.findReveal = true;
    cx.notify();
  },

  closeFind(cx) {
    this.finding = false;
    this.viewerFocus.focus();
    cx.notify();
  },

  findStep(step, cx) {
    const count = this.found?.matches.length ?? 0;
    if (!count) return;
    this.findAt = nextIndex(this.findAt, count, step);
    this.findReveal = true;
    cx.notify();
  },

  findKey(e, cx) {
    const key = String(e.key).toLowerCase(), cmd = e.modifiers?.platform;
    if (cmd && key === "f") this.openFind(cx);
    else if (cmd && key === "g" && this.finding) this.findStep(e.modifiers.shift ? -1 : 1, cx);
    else if (key === "escape" && this.finding) this.closeFind(cx);
    else return;
    cx.stop_propagation();
  },

  /**
   * The matches in `items` (one string per list row, or per row and side), worked out again only
   * when the query, the options or the rows change. Returns the ranges to mark, by item.
   */
  findIn(view, items) {
    const query = this.finding ? this.findInput.value() : "";
    const key = [view, query, JSON.stringify(this.findOptions), items.length].join("\u0000");
    if (this.findKeyed !== key || this.findItems?.length !== items.length || this.findItems.some((s, i) => s !== items[i])) {
      this.findKeyed = key;
      this.findItems = items;
      this.found = this.finding ? findMatches(items, query, this.findOptions) : NONE;
      if (this.findAt >= this.found.matches.length) this.findAt = this.found.matches.length ? 0 : -1;
    }
    const { matches } = this.found;
    if (matches.length && this.findAt < 0) this.findAt = 0;
    const byItem = new Map();
    matches.forEach((m, i) => {
      if (!byItem.has(m.item)) byItem.set(m.item, []);
      byItem.get(m.item).push([m.start, m.end, i === this.findAt]);
    });
    return byItem;
  },

  // After a step or a new query: bring the current match's row to the middle of the list.
  revealFound(rowOf) {
    if (!this.findReveal) return;
    this.findReveal = false;
    const m = this.found?.matches[this.findAt];
    if (m) this.listScroll.scroll_to_item(rowOf(m.item), "center");
  },

  withFound(runs, ranges) { return ranges ? markFound(runs, ranges) : runs; },

  // Cursor's colours for these come from VS Code's defaults, not the theme: other matches in the
  // theme's orange, the current one in its accent.
  foundBg(find, t) { return find === "current" ? `${t.accent.slice(0, 7)}80` : `${t.ansi3.slice(0, 7)}40`; },

  findBar(t) {
    const { matches, error, capped } = this.found ?? NONE;
    const query = this.findInput.value();
    const count = error ? "Invalid expression" : !query ? "No results" : !matches.length ? "No results"
      : `${this.findAt + 1} of ${matches.length}${capped ? "+" : ""}`;
    const miss = Boolean(query) && (Boolean(error) || !matches.length);
    const toggle = (id, label, tip, on) => div().id(id).h(20).min_w(22).px(3).flex_none().flex().items_center().justify_center().rounded(4)
      .text_size(11).cursor_pointer().tooltip(tip)
      .when(this.findOptions[on], (el) => el.bg(`${t.accent.slice(0, 7)}40`).border_1().border_color(t.accent).text_color(t.foreground))
      .when(!this.findOptions[on], (el) => el.text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .on_click((_e, cx) => { this.findOptions = { ...this.findOptions, [on]: !this.findOptions[on] }; this.findReveal = true; this.findInput.focus(); cx.notify(); })
      .child(label);
    const icon = (id, name, tip, onClick, enabled = true) => div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(4)
      .text_color(enabled ? t.muted : t.dim).tooltip(tip)
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => onClick(cx)))
      .child(svg(`${MOD}/ui/${name}.svg`).size(14));
    return h_flex().id("v-find").absolute().top(0).right(18).h(36).pl(8).pr(4).gap(4).items_center()
      .bg(t.popover).border_1().border_t(0).border_color(t.border).rounded_b(6).shadow_md().text_size(12)
      // Clicks in the bar stay in it: the viewer behind takes the keyboard on mouse down.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(h_flex().w(240).h(26).pl(6).pr(2).gap(1).items_center().rounded(4).bg(t.popover).border_1()
        .border_color(miss ? t.ansi1 : this.findTyping ? t.accent : t.border)
        .child(div().flex_1().min_w(0).h_full().cursor_text().child(Input.new(this.findInput).h_full().text_size(12).text_color(t.foreground)))
        .child(toggle("v-find-case", "Aa", "Match Case", "caseSensitive"))
        .child(toggle("v-find-word", "ab", "Match Whole Word", "wholeWord"))
        .child(toggle("v-find-regex", ".*", "Use Regular Expression", "regex")))
      .child(div().w(92).flex_none().px(4).truncate().text_color(miss ? t.ansi9 : t.muted).child(count))
      .child(icon("v-find-prev", "arrow-up", "Previous Match (⇧Enter)", (cx) => this.findStep(-1, cx), matches.length > 0))
      .child(icon("v-find-next", "arrow-down", "Next Match (Enter)", (cx) => this.findStep(1, cx), matches.length > 0))
      .child(icon("v-find-close", "x", "Close (Escape)", (cx) => this.closeFind(cx)));
  },
};
