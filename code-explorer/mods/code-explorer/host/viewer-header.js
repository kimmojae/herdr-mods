// The viewer's header: file icon, name, folder, lines added and removed, then by kind Keep Open,
// Code / Changes (Preview / Code / Changes for Markdown and HTML), Fit / 100%, the editor's and
// (HTML) the browser's icon buttons, and ⋯. Methods of the one View class (main.js).
import { div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { pickGit } from "../lib/palette.js";
import { lineCounts } from "../lib/hunks.js";
import { baseName } from "../lib/paths.js";
import { resolveIcon } from "../lib/icons.js";
import { isWeb } from "../lib/openwith.js";
import { openWith, defaultEditor, defaultBrowser, installedApps, iconPath as appIconPath } from "./apps.js";
import { openMenu } from "./menu-view.js";
import { setEntry, activeSpace, MOD } from "./viewer.js";

const CTRL = 28; // px: the height of every header control

export const viewerHeaderMethods = {
  // Header controls are all CTRL high: a lone button carries a border like the icon buttons;
  // a segment inside a segmented control is CTRL less the control's border and padding.
  button(id, label, onClick, t, { on = false, icon = null, segment = false } = {}) {
    return h_flex().id(id).h(segment ? CTRL - 6 : CTRL).flex_none().px(8).gap(6).items_center().text_size(12).cursor_pointer()
      .rounded(segment ? 5 : 7).when(!segment, (el) => el.border_1().border_color(t.border))
      .text_color(on ? t.foreground : t.muted).when(on, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); })
      .when(Boolean(icon), (el) => el.child(icon)).child(label);
  },

  // Icon buttons: the default editor (at the first change) and, for HTML, the default browser,
  // each with a ▾ list when there is more than one to choose from. Labels are in the tooltips;
  // right-click in Files spells them out. (Virtual-list rows can't take their own clicks, so
  // there is no per-line jump.)
  openButtons(file, t) {
    const apps = installedApps(), first = this.hunks.find((h) => h.count !== Infinity);
    const line = first ? first.line + 1 : null;
    const bar = h_flex().flex_none().gap(4).items_center();
    const button = (id, app, count, startIn, open) => {
      const part = (pid, onClick) => h_flex().id(pid).h_full().items_center().cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); onClick(); cx.notify(); });
      const split = h_flex().h(CTRL).flex_none().items_center().rounded(7).border_1().border_color(t.border).overflow_hidden().text_size(11).text_color(t.muted)
        .child(part(`${id}-open`, open).px(5).tooltip(`Open in ${app.name}`).child(image(appIconPath(app)).size(18).flex_none()));
      if (count > 1) split.child(part(`${id}-list`, () => openMenu({ ...file, dir: false, treePath: null, viewer: this.viewerId, startIn, line }, activeSpace()))
        .px(4).border_l(1).border_color(t.border).tooltip("Choose…").child("▾"));
      return split;
    };
    const editor = defaultEditor(), browser = isWeb(file.path) ? defaultBrowser() : null;
    if (editor) bar.child(button("v-editor", editor, apps.editors.length, "editorList", () => openWith(editor, file.path, line)));
    if (browser) bar.child(button("v-browser", browser, apps.browsers.length, "browserList", () => openWith(browser, file.path)));
    return bar;
  },

  segmented(id, options, value, onPick, t) {
    const seg = h_flex().h(CTRL).flex_none().items_center().p(2).gap(2).rounded(7).border_1().border_color(t.border);
    for (const [v, label] of options) seg.child(this.button(`${id}-${v}`, label, (cx) => onPick(v, cx), t, { on: v === value, segment: true }));
    return seg;
  },

  viewerHeader(entry, t) {
    const file = this.shown;
    const folder = file?.rel?.includes("/") ? file.rel.slice(0, file.rel.lastIndexOf("/")) : "";
    const iconPath = file ? resolveIcon(this.iconMap ?? null, baseName(file.path), false) : null;
    const lines = this.lines ?? [];
    const { added, removed } = lineCounts(this.hunks, lines.length - (lines.at(-1) === "" ? 1 : 0));
    const git = pickGit(t, this.palettes);
    const bar = h_flex().h(40).flex_none().pl(12).pr(6).gap(8).items_center().border_b(1).border_color(t.border).text_size(12).text_color(t.dim)
      .when(Boolean(iconPath), (el) => el.child(image(iconPath).size(16).flex_none()))
      .child(div().flex_none().font_semibold().text_size(13).text_color(t.foreground).child(file ? baseName(file.path) : "No file"))
      .child(div().min_w(0).truncate().child([folder, entry?.preview ? "Preview" : null].filter(Boolean).join(" · ")))
      // Lines added and removed, as git --stat and Cursor's Source Control show them.
      .when(added > 0, (el) => el.child(div().flex_none().text_color(git.A).child(`+${added}`)))
      .when(removed > 0, (el) => el.child(div().flex_none().text_color(git.D).child(`−${removed}`)))
      .child(div().flex_1());
    if (entry?.preview) bar.child(this.button("v-keep", "Keep Open", () => setEntry(this.viewerId, { preview: false }), t));
    const sideBySide = this.showsChanges();
    if (sideBySide && this.narrow()) bar.child(div().flex_none().child("Inline · narrow"));
    // One switch per kind; Changes joins it when there is something to compare.
    const withChanges = (options) => (this.diffable() ? [...options, ["changes", "Changes"]] : options);
    const pick = (key) => (v) => setEntry(this.viewerId, v === "changes" ? { diff: true } : { diff: false, ...(key ? { [key]: v } : {}) });
    if (this.kind === "code" && this.diffable()) bar.child(this.segmented("v-view", withChanges([["code", "Code"]]), sideBySide ? "changes" : "code", pick(null), t));
    if (this.kind === "markdown") bar.child(this.segmented("v-md", withChanges([["preview", "Preview"], ["code", "Code"]]), sideBySide ? "changes" : this.markdownView(), pick("markdown"), t));
    if (this.kind === "html") bar.child(this.segmented("v-html", withChanges([["preview", "Preview"], ["code", "Code"]]), sideBySide ? "changes" : this.htmlView(), pick("html"), t));
    if (this.kind === "image") bar.child(this.segmented("v-fit", [["fit", "Fit"], ["full", "100%"]], this.fit ? "fit" : "full", (v) => { this.fit = v === "fit"; }, t));
    if (file && !file.on) bar.child(this.openButtons(file, t));
    bar.child(div().id("v-more").size(CTRL).flex_none().flex().items_center().justify_center().rounded(7).cursor_pointer().text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); if (file) openMenu({ ...file, dir: false, treePath: null, viewer: this.viewerId }, activeSpace()); })
      .child(svg(`${MOD}/ui/more.svg`).size(14)));
    return bar;
  },
};
