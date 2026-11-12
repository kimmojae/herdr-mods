// The viewer's bodies: code (highlighted, change bars, old lines on click), Changes (HEAD and the
// file side by side, inline when narrow), Markdown and HTML previews, and pictures. Methods of the
// one View class (main.js).
import { div, image } from "gpui-kit";
import { v_flex, h_flex, TextView, Scrollbar, v_virtual_list } from "gpui-base";
import { settings } from "herdr";
import { pickPalette } from "../lib/palette.js";
import { buildRows, hunkKey, buildSideRows, wordRange, markRuns } from "../lib/hunks.js";
import { highlight } from "../lib/highlight.js";
import { resolveLink, markdownBlocks } from "../lib/markdown.js";
import { baseName, parentOf } from "../lib/paths.js";
import { openFile, MOD, HIGHLIGHT_CHARS } from "./viewer.js";

const NARROW = 900; // px: Cursor's diffEditor.renderSideBySideInlineBreakpoint

export const viewerViewMethods = {
  // Changes in a narrow pane: the code view with every change open, as Cursor does under 900px.
  narrow() { return (this.paneWidth ?? Infinity) < NARROW; },

  codeView(t, inline = false) {
    const font = settings().font_family, size = settings().font_size ?? 14;
    const palette = pickPalette(t, this.palettes);
    const rowH = Math.round(size * 1.6);
    const open = inline ? new Set(this.hunks.filter((h) => h.old.length).map(hunkKey)) : this.openHunks;
    const rows = buildRows(this.lines ?? [], this.hunks, open);
    const sizes = rows.some((r) => r.type === "removed") ? rows.map((r) => (r.type === "removed" ? 8 : rowH)) : rowH;
    const widest = (this.lines ?? []).reduce((m, l) => Math.max(m, l.length), 0);
    const id = `v-lines-${this.viewerId}`;
    const mark = (h) => (!h ? null : h.kind === "added" ? t.ansi2 : h.kind === "removed" ? t.ansi1 : open.has(hunkKey(h)) ? t.ansi2 : t.ansi3);
    const row = (r) => {
      if (r.type === "removed") return h_flex().id(`v-${r.key}`).h(8).w_full().items_center().cursor_pointer().child(div().h(2).w_full().bg(t.ansi1));
      const old = r.type === "old", color = old ? t.ansi1 : mark(r.hunk);
      const runs = markRuns(old ? [["old", r.text]] : this.tokens?.[r.number - 1] ?? [], null);
      return h_flex().id(`v-${r.key}`).h(rowH).w_full().items_center()
        .when(Boolean(color), (el) => el.bg(`${color.slice(0, 7)}26`))
        .child(div().w(3).h_full().flex_none().when(Boolean(color), (el) => el.bg(color)))
        .child(div().w(size * 3.5).pr(size).flex_none().text_right().text_color(t.dim).child(String(r.number)))
        .child(h_flex().flex_1().min_w(0).whitespace_nowrap().children(runs.map(([kind, text]) => {
          const st = palette[kind];
          return div().flex_none().whitespace_nowrap().text_color(kind === "old" ? t.ansi1 : st?.color ?? t.foreground)
            .when(Boolean(st?.italic), (el) => el.italic()).when(Boolean(st?.bold), (el) => el.font_weight(700)).child(text);
        })));
    };
    const list = v_virtual_list(id, rows.length, sizes, (i) => rows[i].key, (range) => rows.slice(range.start, range.end).map(row))
      .on_item_click((key, cx) => {
        const r = rows.find((x) => x.key === key);
        if (!inline && r?.hunk?.old.length) { const k = hunkKey(r.hunk); this.openHunks.delete(k) || this.openHunks.add(k); cx.notify(); }
      })
      .size_full();
    return div().id("v-code").flex_1().min_h(0).min_w(0).relative().font_family(font).text_size(size)
      .child(div().id("v-x").size_full().overflow_x_scrollbar().child(div().w_full().min_w(Math.max(300, (widest * 0.62 + 6) * size)).h_full().child(list)))
      .child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0());
  },

  // HEAD on the left, the file on the right, one row per pair so both sides scroll together.
  changesView(t) {
    const font = settings().font_family, size = settings().font_size ?? 14;
    const palette = pickPalette(t, this.palettes);
    const rowH = Math.round(size * 1.6);
    if (this.sideText !== this.text || this.sideHunks !== this.hunks) {
      this.sideText = this.text; this.sideHunks = this.hunks;
      this.sideRows = buildSideRows(this.lines ?? [], this.hunks);
      const olds = this.sideRows.filter((r) => r.left).map((r) => r.left.text);
      const tokens = this.text.length > HIGHLIGHT_CHARS ? olds.map((l) => [["plain", l]]) : highlight(olds.join("\n"), this.shown.path);
      let n = 0;
      for (const r of this.sideRows) {
        if (r.left) r.left.runs = tokens[n++] ?? [["plain", r.left.text]];
        r.words = r.kind === "changed" ? wordRange(r.left.text, r.right.text) : null;
      }
    }
    const rows = this.sideRows;
    const id = `v-side-${this.viewerId}`;
    const tint = (c, a) => `${c.slice(0, 7)}${a}`;
    const cell = (side, color, runs, range) => {
      if (!side) return div().flex_1().min_w(0).h_full().bg(tint(t.foreground, "0a"));
      return h_flex().flex_1().min_w(0).h_full().items_center().overflow_hidden()
        .when(Boolean(color), (el) => el.bg(tint(color, "26")))
        .child(div().w(3).h_full().flex_none().when(Boolean(color), (el) => el.bg(color)))
        .child(div().w(size * 3.5).pr(size).flex_none().text_right().text_color(color ?? t.dim).child(String(side.number)))
        .child(h_flex().flex_1().min_w(0).overflow_hidden().whitespace_nowrap().children(markRuns(runs, range).map(([kind, text, marked]) => {
          const st = palette[kind];
          return div().flex_none().whitespace_nowrap().text_color(st?.color ?? t.foreground)
            .when(Boolean(marked) && Boolean(color), (el) => el.bg(tint(color, "59")).rounded(2))
            .when(Boolean(st?.italic), (el) => el.italic()).when(Boolean(st?.bold), (el) => el.font_weight(700)).child(text);
        })));
    };
    const row = (r) => {
      const right = r.right ? this.tokens?.[r.right.number - 1] ?? [["plain", r.right.text]] : null;
      return h_flex().id(`v-${r.key}`).h(rowH).w_full()
        .child(cell(r.left, r.kind === "same" ? null : t.ansi1, r.left?.runs, r.words?.left))
        .child(div().w(1).h_full().flex_none().bg(t.border))
        .child(cell(r.right, r.kind === "same" ? null : t.ansi2, right, r.words?.right));
    };
    const label = (name, note) => h_flex().flex_1().min_w(0).px(12).gap(6).items_center()
      .child(div().text_color(t.muted).child(name)).child(div().truncate().child(note));
    const list = v_virtual_list(id, rows.length, rowH, (i) => rows[i].key, (range) => rows.slice(range.start, range.end).map(row)).size_full();
    return v_flex().flex_1().min_h(0).min_w(0)
      .child(h_flex().h(24).flex_none().border_b(1).border_color(t.border).text_size(11).text_color(t.dim)
        .child(label("HEAD", "· last commit")).child(div().w(1).h_full().bg(t.border)).child(label("Working Tree", "· this file")))
      .child(div().id("v-side").flex_1().min_h(0).min_w(0).relative().font_family(font).text_size(size)
        .child(list)
        .child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0()));
  },

  markdownPreview(t) {
    const file = this.shown;
    return v_flex().id("v-md").flex_1().min_h(0).min_w(0).overflow_y_scrollbar().px(26).py(18).gap(12)
      .children(markdownBlocks(this.text, parentOf(file.path)).map((block, i) => {
        if (block.type === "image") {
          const copy = this.mdPictures?.get(block.path);
          return copy ? image(`${MOD}/${copy}`).max_w_full().flex_none() : div().text_color(t.dim).child(block.alt || baseName(block.path));
        }
        return TextView.markdown(`v-md-${i}`, block.text).text_size(14).w_full().min_w(0).scrollable(false).selectable(true)
          .on_link_click((url, cx) => {
            if (/^https?:\/\//i.test(url)) return cx.open_url(url);
            const path = resolveLink(parentOf(file.path), url);
            if (path) openFile({ path, rel: path.startsWith(`${file.root}/`) ? path.slice(file.root.length + 1) : path, root: file.root, on: file.on }, "preview");
          });
      }));
  },

  pictureView(t) {
    if (!this.picture) return div().p(14).text_color(t.dim).child("Loading…");
    const checker = div().flex_1().min_h(0).min_w(0).p(16).flex().items_center().justify_center()
      .child(this.fit ? image(`${MOD}/${this.picture}`).max_w_full().max_h_full() : image(`${MOD}/${this.picture}`));
    return v_flex().flex_1().min_h(0).child(this.fit ? checker : div().id("v-pic").flex_1().min_h(0).overflow_scroll().child(checker))
      .child(div().h(26).flex_none().px(12).flex().items_center().border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
        .child([this.dims, this.bytes ? `${Math.max(1, Math.round(this.bytes / 1024))} KB` : ""].filter(Boolean).join(" · ")));
  },

  // Herdr has no web view: TextView shows the page's text and structure; styles and scripts don't run.
  htmlPreview(t) {
    return v_flex().flex_1().min_h(0)
      .child(div().id("v-html").flex_1().min_h(0).overflow_y_scrollbar().px(26).py(18)
        .child(TextView.html(`v-html-${this.viewerId}`, this.text).text_size(14).w_full().min_w(0).scrollable(false).selectable(true)));
  },
};
