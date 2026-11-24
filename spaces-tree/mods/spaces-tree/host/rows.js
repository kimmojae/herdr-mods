// Drawing the list's rows: the Needs-you band, repo group headers, repo and folder headings, checkout rows, agents (with their
// time or, on hover, the pin button), sub-agents, tabs, the SETTLED shelf, and the status marks. Checkout rows and headings press/drag/select as the shipped spaces mod (S:444-499); agent
// and sub rows click as the shipped agents mod (A:182-217, 254-371).
// `ctx` is built once per pass by main.js (the `ctx` object in its render); `ctx.view` is the View,
// whose drag and fold state the handlers change. Never keeps a cx.
import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, window } from "herdr";
import { DIR } from "../lib/name.js";
import { tail } from "../lib/tail.js";
import { gitLine, gitWords } from "../lib/gitstatus.js";
import { placeOf } from "../lib/git.js";
import { dropOk, dropMoves } from "../lib/order.js";
import { OTHER } from "../lib/groups.js";
import { openGroupsMenu } from "./menu.js";
import { clean, age } from "../lib/time.js";

// Herdr's own UI glyphs (the shipped workspace-chrome mod, always there); this mod's own
// icons/ holds only what Herdr lacks (the repo book).
export const icon = (name) => `mods/workspace-chrome/${name}.svg`;
const ownIcon = (name) => `${DIR}/icons/${name}.svg`;
// The tree's column grid (the Doop SpaceRow / AgentRow), px at zoom 1, from a row's own left
// edge; rows sit 6px in from the sidebar's (the list's px), so add 6 for the sidebar's x.
// A child starts at its parent's name column:
//   heading      chevron 6..18, repo/folder glyph 24..38, name from 44
//   checkout     (chevron slot hidden) branch glyph 24..38, mono name from 44
//   agent / tab  status mark 44..58, program icon 64..78, title from 84
//   sub-agent    STEP further per level: mark 64..78, icon 84..98, title from 104
const ROW = 28; // heading, agent, sub and tab rows
const CHECKOUT_ROW = 26; // checkout rows
const HEAD_PAD = 6; // a heading's and a checkout's left padding
const SLOT = 12; // the chevron (hidden on checkout rows)
const GAP = 6; // between a row's parts
const CHILD_PAD = 44; // agent and tab rows: the checkout's name column
const STEP = 20; // one sub-agent level further in: the parent's icon column
const FLAT_PAD = 12; // agent rows outside the tree (PINNED, the rail's card): no guide
const GUIDE_X = 31; // the guide under a checkout: the centre of its 24..38 glyph
const LIT_INSET = 6; // the lit row's bar on the guide line: 16px of a 28px row
// A space's name and its tail never shrink below this (S:30-32).
const SIDE_MIN = 48;

/** Status mark as the shipped agents mod (A:209-217): spinner, `!` box, dot, ring. */
export function statusMark(t, status) {
  if (status === "working") return svg(icon("spinner")).size(12).mx(1).flex_none().text_color(t.working).spin(900);
  if (status === "blocked") return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold()
    .text_color(t.blocked).flex().items_center().justify_center().child("!");
  if (status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  if (status === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done ?? t.dim);
  return div().size(7).mx(3).flex_none();
}

// A fixed box so marks of different sizes line up.
const markBox = (el) => h_flex().w(14).flex_none().items_center().justify_center().when(Boolean(el), (b) => b.child(el));

/** The program's icon from the app's table: a one-colour glyph (tinted) or a picture (A:76-79). */
export function programIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// Under a checkout or folder (in the tree), or flat (PINNED, the rail's card: ctx.flat).
const childPad = (ctx) => (ctx.flat ? FLAT_PAD : CHILD_PAD);

/**
 * The checkout's guide: a 1px `border` line through each of its child rows (agent, tab, sub)
 * under its glyph, so the rows hang off it; lit, that row's segment is a 2px `accent` bar.
 */
function column(t, lit) {
  const line = div().absolute().left(GUIDE_X).top(0).bottom(0).w(1).bg(t.border);
  // The lit row: a short accent bar on the line, clear of the rows above and below.
  return lit ? [line, div().absolute().left(GUIDE_X - 0.5).top(LIT_INSET).bottom(LIT_INSET).w(2).rounded(1).bg(t.accent)] : [line];
}


// The lit row outside the tree: a short accent bar at its left.
const flatGuide = (t) => div().absolute().left(2).top(7).bottom(7).w(2).rounded(1).bg(t.accent);

// A tag's tones (the mock's Tag): text colour and its fill as a 2-hex alpha over that colour;
// a fill of null is `raised`.
const TONE = {
  dim: ["muted", null],
  accent: ["accent", "24"],
  done: ["done", "24"],
  blocked: ["blocked", "26"],
  working: ["working", "21"],
  ansi5: ["ansi5", "24"],
};

/** One tag: 16px high, 10px mono, on its tone's fill. `away`: a machine that's away, drawn dim. */
export function chip(it, t, ctx, away = false) {
  const [fg, alpha] = TONE[it.tone] ?? TONE.dim;
  const colour = t[fg] ?? t.muted;
  const bg = (alpha && tint(colour, alpha)) || t.raised;
  return h_flex().h(16).px(5).min_w(0).rounded(4).items_center().overflow_hidden().bg(bg)
    .text_size(10).font_family(ctx.mono).font_weight(500).text_color(away ? t.dim : colour)
    .child(div().min_w(0).truncate().child(it.text));
}

/** One row of the tree. */
export function drawRow(row, t, ctx) {
  if (row.kind === "group") return groupRow(row, t, ctx);
  if (row.kind === "repo" || row.kind === "folder") return headingRow(row, t, ctx);
  if (row.kind === "main" || row.kind === "worktree") return checkoutRow(row, t, ctx);
  if (row.kind === "agent") return agentRow(row, t, ctx);
  if (row.kind === "sub") return subRow(row, t, ctx);
  if (row.kind === "tab") return tabRow(row, t, ctx);
  return div();
}

// At the row's right end: git's counts (lib/gitstatus.js), then the PR tag at the far right
// (lib/tail.js). A machine that's away keeps its last tail, drawn dim.
function tailOf(row, t, ctx) {
  const sp = ctx.spaces.get(row.space);
  const pr = ctx.pr?.(row) ?? null;
  const items = tail({ git: row.git, pr });
  const marks = gitSymbols(row.git?.state, t, ctx, `git-${row.space}`);
  if (!items.length && !marks) return null;
  const away = ctx.away.has(sp?.machine ?? null);
  return h_flex().flex_auto().min_w(SIDE_MIN).gap(6).justify_end().items_center()
    .when(Boolean(marks), (e) => e.child(marks))
    .children(items.map((it) => {
      const el = chip(it, t, ctx, away);
      return pr && it.kind === "pr" ? prLink(el, row.space, pr) : el;
    }));
}

/**
 * Git's state with the person's terminal's symbols, each with its count (lib/gitstatus.js), at
 * a checkout's right end, before the PR tag: `=1 $2 ✘2 »1 !9 +3 ?3 ⇡1 ⇣3`, mono, no chip, all `muted` (colour stays for
 * agent state and the PR tag); the counts in words on hover. null when clean.
 */
export function gitSymbols(state, t, ctx, id) {
  const line = gitLine(state);
  if (!line) return null;
  return div().id(id).flex_none().font_family(ctx.mono).text_size(11).text_color(t.muted)
    .tooltip(gitWords(state))
    .child(line);
}

// ⌘-click (Ctrl-click off macOS) on the PR tag opens the PR. The modified press never
// reaches the row, so it neither drags nor selects; a plain click is the row's.
const modified = (e) => (window()?.platform === "macos" ? e?.modifiers?.platform : e?.modifiers?.control) === true;

function prLink(el, space, pr) {
  const web = /^https?:\/\//.test(pr.url);
  const tip = web ? `Open the PR (${window()?.platform === "macos" ? "⌘" : "Ctrl"}-click)` : null;
  return el.id(`pr-${space}`).when(Boolean(tip), (e) => e.tooltip(tip))
    .on_mouse_down("left", (e, cx) => { if (web && modified(e)) cx.stop_propagation(); })
    .on_mouse_up("left", (e, cx) => { if (web && modified(e)) cx.stop_propagation(); })
    .on_click((e, cx) => {
      if (!web || !modified(e)) return;
      cx.stop_propagation();
      cx.open_url(pr.url);
    });
}

// A path with the home folder as `~`.
const tilde = (p, home) => (p && home && p.startsWith(home) ? `~${p.slice(home.length)}` : (p ?? ""));

// What a row drags as (lib/order.js dropOk): a checkout row its space, a heading its group,
// a repo group's header its group's name (and its spaces, for the drop line's side).
function dragOf(row) {
  if (row.kind === "group") {
    return { key: row.key, ids: row.spaces ?? [], group: row.key, machine: row.machine ?? null, main: false, heading: false, header: true, name: row.name };
  }
  const heading = row.kind === "repo" || row.kind === "folder";
  return {
    key: row.key,
    ids: row.kind === "repo" ? row.spaces : [row.space],
    group: heading ? row.key : row.heading,
    machine: row.machine ?? null,
    main: row.kind === "main",
    heading,
    band: heading ? (row.group ?? null) : null,
  };
}

/**
 * Press, drag and drop as the shipped spaces mod (S:444-499): a press then a release on the
 * same row is its click; released on another row that takes the drop (lib/order.js), the
 * dragged space or heading moves there with space.move; a group header's new place is stored
 * (main.js moveGroup) and Herdr's order follows it (keepOrder). A right-click opens the space
 * menu of `menuSpace`.
 */
function draggable(el, row, t, ctx, menuSpace, click) {
  const view = ctx.view;
  const me = dragOf(row);
  const from = view.pressed;
  const i = ctx.coreIndex.get(me.ids[0]) ?? -1;
  const fromIndex = from ? (ctx.coreIndex.get(from.ids[0]) ?? -1) : -1;
  return el
    .when(from?.key === me.key && view.over !== me.key, (e) => e.opacity(0.5))
    .when(Boolean(from) && view.over === me.key && from.key !== me.key, (e) => e.child(
      div().absolute().left(0).right(0).h(2).bg(t.accent)
        .when(fromIndex < i, (line) => line.bottom(0))
        .when(fromIndex > i, (line) => line.top(0)),
    ))
    .on_mouse_down("left", () => {
      view.pressed = me;
      view.over = me.key;
      view.pressedAt = Date.now();
    })
    .on_mouse_move((_e, cx) => {
      const over = view.pressed && (view.pressed.key === me.key || dropOk(view.pressed, me)) ? me.key : null;
      if (view.pressed && view.over !== over) {
        view.over = over;
        cx.notify();
      }
    })
    .on_mouse_up("left", (_e, cx) => {
      const src = view.pressed;
      const over = view.over;
      view.pressed = null;
      view.over = null;
      if (src && over === me.key && src.key !== me.key && dropOk(src, me)) {
        if (src.header) view.moveGroup(src, me);
        else for (const m of dropMoves(ctx.order, src, me)) run("space.move", m);
      } else if (src?.key === me.key) click();
      cx.notify();
    })
    .on_mouse_down("right", () => {
      // A popup is as tall as its items; height is only the most.
      if (menuSpace) openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: menuSpace } } });
    });
}

/**
 * A repo group's header (lib/groups.js), between the machine header and its headings, at the
 * headings' left (no indent for what's under it): the fold chevron in a heading's slot (12px,
 * `dim`), the name at the repo glyph's column, in 10px caps (`foreground` at 65%: a grey brighter than `muted`, hair-space tracked), the number of headings in mono (10px, `dim`).
 * Folded, the distinct marks of what's inside sit at its right, most urgent first. A click folds;
 * a drag moves it among its machine's groups (not OTHER, which stays last); a right-click opens
 * the Edit groups menu (host/menu.js).
 */
// gpui has no letter spacing: a hair space (U+200A) between letters stands in for the mock's
// .08em tracking on caps labels.
const tracked = (s) => [...s].join("\u200A");

function groupRow(row, t, ctx) {
  const view = ctx.view;
  const toggle = () => view.toggleFold(row.key, row.machine ?? null);
  const el = h_flex()
    .relative()
    .id(`grp-${row.key}`)
    .h(CHECKOUT_ROW)
    .mt(6)
    .flex_none()
    .pl(HEAD_PAD)
    .pr(8)
    .gap(GAP)
    .items_center()
    .rounded(6)
    .text_size(10)
    .font_weight(600)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_mouse_down("right", () => openGroupsMenu())
    // The chevron in a heading's slot, so both chevrons share a column and the name starts at
    // the repo glyph's.
    .child(div().w(SLOT).flex_none().flex().items_center().justify_center().text_color(t.dim)
      .child(svg(icon(`chevron-${row.folded ? "right" : "down"}`)).size(12)))
    .child(div().flex_initial().min_w(0).truncate().text_color(tint(t.foreground, "a6") ?? t.muted)
      .child(tracked(String(row.name ?? "").toUpperCase())))
    .child(div().flex_none().font_family(ctx.mono).font_weight(400).text_color(t.dim).child(String(row.count ?? 0)))
    .child(div().flex_1())
    .when(Boolean(row.folded && row.marks?.length), (e) => e.child(h_flex().flex_none().gap(4).items_center()
      .children(row.marks.map((m) => markBox(statusMark(t, m))))));
  // OTHER doesn't drag (it stays last): a plain click folds it.
  if (row.name === OTHER) return el.on_click((_e, cx) => { toggle(); cx.notify(); });
  return draggable(el, row, t, ctx, null, toggle);
}

/**
 * A heading: a repo (its spaces are the checkout rows under it), or a space not in git (a
 * folder, which is itself the space: it selects, and its tab rows hang under it).
 */
function headingRow(row, t, ctx) {
  const view = ctx.view;
  const folder = row.kind === "folder";
  const sp = ctx.spaces.get(row.space);
  // Hover: the repo's own folder (a folder heading: the space's).
  const path = tilde(folder ? (sp ? placeOf(sp, ctx.paneList) : "") : row.path, ctx.home);
  const on = folder && Boolean(sp?.active);
  const toggle = () => view.toggleFold(row.key, row.machine ?? null);
  const chevron = div().id(`fold-${row.key}`).w(SLOT).h(18).flex_none().flex().items_center().justify_center().rounded(4)
    .text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_mouse_up("left", (_e, cx) => {
      cx.stop_propagation();
      // A drag released here ends without a move; a plain click folds.
      const dragging = view.pressed !== null && view.pressed.key !== row.key;
      view.pressed = null;
      view.over = null;
      if (!dragging) toggle();
      cx.notify();
    })
    .child(svg(icon(`chevron-${row.folded ? "right" : "down"}`)).size(12));
  const el = h_flex()
    .relative()
    .id(`head-${row.key}`)
    .when(Boolean(path), (e) => e.tooltip(path))
    .h(ROW)
    .flex_none()
    .pl(HEAD_PAD)
    .pr(8)
    .gap(GAP)
    .items_center()
    .rounded(6)
    .text_size(13)
    .font_weight(500)
    // The shown space: the `selected` fill only; the one accent bar marks the lit row under it.
    .when(on, (e) => e.bg(t.selected))
    .when(!on, (e) => e.hover((s) => s.bg(t.hover)))
    .child(chevron)
    // The repo's book in `accent`; a folder in `accent` too (a heading). The space's colour
    // (space.colors) stays for Herdr's menus and the rail's tiles.
    .child(svg(folder ? icon("folder") : ownIcon("repo")).size(14).flex_none().text_color(t.accent))
    .child(div().flex_initial().min_w(SIDE_MIN).truncate().text_color(t.foreground).child(row.name ?? ""))
    .child(div().flex_1())
    // A folded heading's most urgent mark at the row's right end, in one column whatever the
    // name's length (where an open checkout's git counts sit); headings carry no tags.
    .when(Boolean(row.folded && row.mark), (e) => e.child(markBox(statusMark(t, row.mark))));
  // A repo heading's click folds it, its menu is its main checkout's (else its first space's).
  return draggable(el, row, t, ctx, row.space, folder ? () => run("space.select", { id: row.space }) : toggle);
}

/** One checkout: a space of a repo, named by its branch, its tags at the right. */
function checkoutRow(row, t, ctx) {
  const sp = ctx.spaces.get(row.space);
  const id = row.space;
  const on = Boolean(sp?.active);
  const after = tailOf(row, t, ctx);
  // The space's name and where it is (its first terminal's folder): two spaces on one checkout,
  // or a renamed one, tell apart by it.
  const where = [sp?.name, sp ? tilde(placeOf(sp, ctx.paneList), ctx.home) : ""].filter(Boolean).join(" · ");
  const el = h_flex()
    .relative()
    .id(`space-${id}`)
    .when(Boolean(where), (e) => e.tooltip(where))
    .h(CHECKOUT_ROW)
    .flex_none()
    .pl(HEAD_PAD)
    .pr(8)
    .gap(GAP)
    .items_center()
    .rounded(6)
    .text_size(12)
    .font_weight(400)
    .when(on, (e) => e.bg(t.selected))
    .when(!on, (e) => e.hover((s) => s.bg(t.hover)))
    // The chevron's slot, empty, so the glyph sits in the heading's glyph column.
    .child(div().w(SLOT).flex_none())
    // The main checkout: Herdr's branch glyph (as its status bar shows by the branch), `muted`.
    // A linked worktree: Herdr's git-branch, the glyph its space menu gives New / Open worktree,
    // in the theme's green (ansi2), so a checkout branched off stands out from the main one.
    .child(svg(row.kind === "worktree" ? icon("git-branch") : icon("branch")).size(14).flex_none()
      .text_color(row.kind === "worktree" ? (t.ansi2 ?? t.muted) : t.muted))
    .child(div().flex_initial().min_w(SIDE_MIN).truncate().text_color(on ? t.foreground : child(t)).font_family(ctx.mono).text_size(11).when(on, (el) => el.font_weight(500))
      .child(row.name ?? sp?.name ?? ""))
    .child(div().flex_1())
    .when(Boolean(after), (e) => e.child(after));
  return draggable(el, row, t, ctx, id, () => run("space.select", { id }));
}

// The fold chevron of an agent with sub-agents; folded, their count, coloured by the most
// urgent one (A:254-277).
function subFold(row, t, ctx) {
  const view = ctx.view;
  const open = !row.folded;
  return div().id(`fold-${row.address}`).h(18).px(3).gap(3).flex().flex_none().items_center().rounded(4).text_size(11)
    .text_color(open ? t.dim : (t[row.mark] ?? t.dim))
    .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_click((_e, cx) => { cx.stop_propagation(); view.toggleAgent(row.address); cx.notify(); })
    .child(svg(icon(`chevron-${open ? "down" : "right"}`)).size(11).flex_none())
    .when(!open, (el) => el.child(String(row.subs)));
}

/**
 * What sits at an agent row's right: the time in its current state, or, while the pointer
 * is on the row, the pin button (A:328-334, 351-369).
 */
export function agentTrail(row, t, ctx) {
  const view = ctx.view;
  if (view.hovered === row.address) {
    const isPinned = ctx.pinned.has(row.address);
    return div()
      .id(`pin-${row.address}`)
      .flex_none()
      .p(2)
      .rounded(4)
      .text_color(t.dim)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(isPinned ? "Unpin" : "Pin to the top")
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run("terminal.pin", { terminal: row.address, pinned: !isPinned });
        // The row moves away from under the pointer, and no hover-out comes.
        view.hovered = null;
        cx.notify();
      })
      .child(svg(icon(isPinned ? "pin-off" : "pin")).size(13));
  }
  const at = ctx.changed[row.address]?.at;
  if (!at) return null;
  return div().flex_none().text_size(11).text_color(t.dim).child(age(ctx.now - at));
}

function agentRow(row, t, ctx) {
  const view = ctx.view;
  // Lit: the focused terminal's agent (main.js ctx.lit), without a fill (one fill per list).
  const lit = ctx.lit?.address === row.address;
  const pic = programIcon(row.program, 14, t.foreground);
  const trail = agentTrail(row, t, ctx);
  // Out of the tree (PINNED: ctx.place), a second line names its repo and branch, as the band's.
  const place = ctx.place?.(row.space) ?? "";
  return h_flex()
    .relative()
    .id(`ag-${row.address}`)
    .h(place ? ROW + 12 : ROW)
    .flex_none()
    .pl(childPad(ctx))
    .pr(8)
    .gap(6)
    .items_center()
    .rounded(6)
    .text_size(12)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_hover((on, cx) => {
      if (on) view.hovered = row.address;
      else if (view.hovered === row.address) view.hovered = null;
      cx.notify();
    })
    .on_click(() => run("pane.focus", { pane: row.pane }))
    .when(!ctx.flat, (el) => el.children(column(t, lit)))
    .when(ctx.flat && lit, (el) => el.child(flatGuide(t)))
    .child(markBox(statusMark(t, row.status)))
    .when(Boolean(pic), (el) => el.child(div().id(`agent-fold-${row.address}`)
      .when(row.subs > 0, (b) => b.on_click((_e, cx) => { cx.stop_propagation(); view.toggleAgent(row.address); cx.notify(); }))
      .child(pic)))
    .child(v_flex().flex_1().min_w(0)
      .child(div().id(`ag-title-${row.address}`).truncate().text_color(lit ? t.foreground : child(t)).when(lit, (el) => el.font_weight(500))
        .when(Boolean(row.tip), (el) => el.tooltip(row.tip))
        .child(agentTitle(row)))
      .when(Boolean(place), (el) => el.child(div().truncate().text_size(11.5).text_color(t.muted).child(place))))
    .when(row.subs > 0, (el) => el.child(subFold(row, t, ctx)))
    .when(Boolean(trail), (el) => el.child(trail));
}

// What the agent says it's doing, without its status glyph; else its program.
const agentTitle = (row) => clean(row.title) || row.program?.name || row.address;

function subRow(row, t, ctx) {
  const lit = ctx.lit?.address === row.address;
  const kept = ctx.kept.has(row.address);
  const pic = programIcon(row.program, 14, t.foreground);
  // One STEP in per level below its agent: its mark in the parent's icon column. The parent's
  // mark box starts STEP to the left, so its centre is at left - STEP + 7: the elbow comes down
  // from there to this row's middle and runs right to 4px before this row's mark.
  const left = childPad(ctx) + STEP * Math.max(1, row.level ?? 1);
  const elbowX = left - STEP + 7;
  const at = ctx.changed[row.address]?.at;
  return h_flex()
    .relative()
    .id(`sub-${row.address}`)
    .h(ROW)
    .flex_none()
    .pl(left)
    .pr(8)
    .gap(6)
    .items_center()
    .rounded(6)
    .text_size(12)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click(() => (kept ? run("pane.focus", { terminal: row.address }) : run("terminal.peek", { terminal: row.address })))
    .when(!ctx.flat, (el) => el.children(column(t, lit)))
    .when(ctx.flat && lit, (el) => el.child(flatGuide(t)))
    // The elbow: border left and bottom, radius 4, its foot at the row's middle.
    .child(div().absolute().left(elbowX).top(0).w(STEP - 11).h(ROW / 2).border_l(1).border_b(1).rounded_bl(4).border_color(t.border))
    .child(markBox(statusMark(t, row.status)))
    .when(Boolean(pic), (el) => el.child(pic))
    .child(div().flex_1().min_w(0).truncate().text_color(lit ? t.foreground : child(t)).when(lit, (el) => el.font_weight(500))
      .child(row.title))
    // The time in its current state (lib/time.js track covers sub-agents too).
    .when(Boolean(at), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(age(ctx.now - at))));
}

function tabRow(row, t, ctx) {
  const pic = programIcon(row.program, 14, t.muted);
  const sp = ctx.spaces.get(row.space);
  const tab = (sp?.tabs ?? []).find((x) => x.id === row.tab);
  const p = ctx.panes.get(row.pane);
  // A title that says something (not the terminal's id, not the program's name, not a path),
  // else just the program's name ("zsh"), its folder (`~/…`) in the row's tooltip. A tab
  // someone named keeps its name.
  const live = clean(row.title);
  const path = /^[~/]|^[A-Za-z]:\\/.test((row.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== p?.terminal && live !== row.program?.name && !path && !live.includes("@")
    && live.toLowerCase() !== row.program?.key;
  const where = p?.cwd ? (p.cwd.startsWith(ctx.home) ? `~${p.cwd.slice(ctx.home.length)}` : p.cwd) : "";
  const fallback = !tab?.named && !telling;
  const name = tab?.named ? tab.name : telling ? live : row.program?.name || tab?.name;
  // Lit: the shown space's active tab when no agent has focus (main.js ctx.lit).
  const lit = ctx.lit?.tab === row.tab;
  return h_flex()
    .relative()
    .id(`tab-${row.tab}`)
    .when(fallback && Boolean(where), (e) => e.tooltip(where))
    .h(ROW)
    .flex_none()
    .pl(childPad(ctx))
    .pr(8)
    .gap(6)
    .items_center()
    .rounded(6)
    .text_size(12)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click(() => {
      run("space.select", { id: row.space });
      run("tab.select", { id: row.tab });
    })
    .when(!ctx.flat, (el) => el.children(column(t, lit)))
    .when(ctx.flat && lit, (el) => el.child(flatGuide(t)))
    // A tab without an agent is idle: the ring keeps the status column lined up.
    .child(markBox(statusMark(t, "idle")))
    .when(Boolean(pic), (el) => el.child(pic))
    .child(div().flex_1().min_w(0).truncate().text_color(lit ? t.foreground : child(t)).when(lit, (el) => el.font_weight(500))
      .child(name || ""));
}

// A theme colour at `alpha` (two hex digits), over whatever is under it. Theme colours are
// #rrggbb; anything else gets no tint.
const tint = (c, alpha) => (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c + alpha : null);

// A child row's text (checkout, agent, sub-agent, tab): a step under its heading's foreground,
// brighter than muted, so parent and child read apart. The shown row keeps full foreground.
const child = (t) => tint(t.foreground, "cc") ?? t.foreground;

/** A group's header: `LABEL n` in 10px caps, and whatever goes at its right. */
export function sectionHeader(label, count, t, right = null) {
  return h_flex().h(31).flex_none().pl(8).pr(2).items_center().justify_between()
    .child(h_flex().gap(6).items_center().text_size(10).font_weight(600).text_color(t.dim)
      .child(label).child(div().font_weight(400).child(String(count))))
    .when(Boolean(right), (el) => el.child(right));
}

// Rows coming and going (lib/presence.js): how long a grow-in or collapse runs, in ms.
export const MOTION = 180;
const EASE = { duration: MOTION, easing: "ease-out" };
// A band row's height, fixed (two lines, 5px above and below) so the presence box that animates
// it is exactly as tall as the row and never clips its rounded corners; and the gap below it.
export const BAND_ROW = ROW + 18;
export const BAND_GAP = 2;

/**
 * A row or section that grows in and collapses (lib/presence.js phase): height `full` and
 * opacity 1 when shown, 0 when entering (its first draw) or leaving, both by native transition
 * (ease-out, MOTION ms). A leaving one keeps its last content and takes no clicks: a cover
 * over it swallows them.
 * @param {string} id  stable across renders
 * @param {"enter"|"shown"|"leave"} phase
 * @param {number} full  its height when shown
 */
export function presenceBox(id, phase, full, child) {
  const open = phase === "shown";
  return v_flex()
    .id(id)
    .relative()
    .flex_none()
    .overflow_hidden()
    .h(open ? full : 0)
    .opacity(open ? 1 : 0)
    .transition("height", EASE)
    .transition("opacity", EASE)
    .child(child)
    .when(phase === "leave", (el) => el.child(div().id(`${id}-gone`).absolute().inset_0()
      .on_click((_e, cx) => cx.stop_propagation())));
}

/** A PINNED row's height, as drawRow draws it flat (agentRow, subRow). */
export const pinnedHeight = (row, ctx) => (row.kind === "agent" && ctx.place?.(row.space) ? ROW + 12 : ROW);

/**
 * One row of the Needs-you band (lib/band.js): status mark, title over `space · branch`,
 * the time waited. Never lit: it's a shortcut to the agent's place in the tree. Not `live`
 * (leaving): no click, no hover.
 */
export function bandRow(b, t, live = true) {
  const blocked = b.status === "blocked";
  const bg = tint(blocked ? t.blocked : t.done, blocked ? "1a" : "12");
  // Hover deepens the tint, so the row keeps saying how urgent it is.
  const hot = tint(blocked ? t.blocked : t.done, blocked ? "26" : "1f") ?? t.hover;
  return h_flex()
    .id(`band-row-${b.address}`)
    .flex_none()
    .h(BAND_ROW)
    .py(5)
    .pl(8)
    .pr(8)
    .gap(7)
    .items_center()
    .rounded(8)
    .when(Boolean(bg), (el) => el.bg(bg))
    // A sub-agent without a pane opens as a peek, as in the tree.
    .when(live, (el) => el.cursor_pointer().hover((s) => s.bg(hot))
      .on_click(() => (b.pane ? run("pane.focus", { pane: b.pane }) : run("terminal.peek", { terminal: b.address }))))
    .child(markBox(statusMark(t, b.status)))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().text_color(t.foreground).child(b.title))
      .when(Boolean(b.where), (el) => el.child(div().truncate().text_size(11.5).text_color(t.muted).child(b.where))))
    .child(div().flex_none().text_size(11).text_color(t.dim).child(age(b.waited)));
}

/** The SETTLED shelf's header: folds the shelf. */
export function settledHeader(count, open, t, toggle) {
  return h_flex().id("settled").h(31).mt(6).flex_none().pl(8).pr(8).gap(6).items_center()
    .text_size(10).font_weight(600).text_color(t.dim)
    .cursor_pointer().hover((s) => s.text_color(t.foreground))
    .on_click((_e, cx) => { toggle(); cx.notify(); })
    .child("SETTLED").child(div().font_weight(400).child(String(count)))
    .child(div().flex_1())
    .child(svg(icon(`chevron-${open ? "down" : "right"}`)).size(11).flex_none());
}

/** A settled tab on the shelf: `tab name · space`; a click brings it back into view. */
export function settledRow(row, t) {
  return h_flex()
    .id(`settled-${row.tab}`)
    .h(ROW)
    .flex_none()
    .pl(8)
    .pr(8)
    .gap(7)
    .items_center()
    .rounded(8)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click(() => {
      run("space.select", { id: row.space });
      run("tab.select", { id: row.tab });
    })
    .child(markBox(null))
    .child(div().flex_1().min_w(0).truncate().text_color(t.dim)
      .child([row.name, row.title].filter(Boolean).join(" \u00b7 ")));
}
