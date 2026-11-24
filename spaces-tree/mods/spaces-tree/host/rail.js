// The sidebar's rail (under 160px, as the shipped spaces mod, S:20, 501-515): the Needs-you
// count, one 32px tile per space with an agent that isn't idle (and the shown one), and a
// dashed `+N` tile that widens the sidebar back. Resting the pointer on a tile shows a card:
// the space's name and folder, its branch and tags, and its agent rows (host/rows.js).
// Never keeps a cx.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, HoverCard } from "gpui-base";
import { run, layout, shared } from "herdr";
import { MARK } from "../lib/colors.js";
import { tail } from "../lib/tail.js";
import { placeOf } from "../lib/git.js";
import { isSpaceRow } from "../lib/tree.js";
import { drawRow, statusMark, chip, gitSymbols } from "./rows.js";

const TILE = 32;
const AVATAR = 22;
const CARD_W = 280;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

/** The rail goes by the sidebar's width, not a flag: dragging its edge narrows it too (S:20). */
export const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// A theme colour at `alpha` (two hex digits); anything but #rrggbb gets none.
const tint = (c, alpha) => (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c + alpha : null);

// The space's avatar: its initial on its `space.colors` colour (shared with Herdr's menus);
// a space with no colour ("~") is a plain raised square.
function avatar(sp, t, ctx, size) {
  const c = ctx.colors[sp.id];
  const fill = c ? (c.startsWith("#") ? c : (MARK[c] ?? t[c])) : null;
  return h_flex().size(size).flex_none().rounded(6).items_center().justify_center()
    .text_size(size > 20 ? 12 : 10.5).font_bold()
    .bg(fill ?? t.raised).text_color(fill ? "#ffffff" : t.muted)
    .child([...(sp.name ?? "")][0]?.toUpperCase() ?? "?");
}

const tile = () => h_flex().size(TILE).flex_none().rounded(8).items_center().justify_center();

/**
 * The rail.
 * @param {{waiting:number, tiles:string[], more:number}} r lib/rail.js railTiles
 * @param {object[]} band lib/band.js needsYou, as main.js shows it
 * @param {Map<string,object[]>} agentRows each space's agent and sub rows (lib/tree.js)
 */
export function drawRail(r, band, agentRows, t, ctx) {
  const top = [];
  if (r.waiting > 0) {
    const first = band[0];
    top.push(h_flex().flex_none().justify_center().pt(6).pb(4).child(tile().id("rail-waiting")
      .bg(tint(t.blocked, "26") ?? t.raised).text_color(t.blocked).text_size(13).font_bold()
      .cursor_pointer().tooltip(`${r.waiting} need${r.waiting === 1 ? "s" : ""} you`)
      // The first in the band, as its row would: a sub-agent without a pane opens as a peek.
      .on_click(() => (first.pane ? run("pane.focus", { pane: first.pane }) : run("terminal.peek", { terminal: first.address })))
      .child(String(r.waiting))));
  }
  const tiles = r.tiles.map((id) => ctx.spaces.get(id)).filter(Boolean).map((sp) => spaceTile(sp, agentRows.get(sp.id) ?? [], t, ctx));
  if (r.more > 0) {
    tiles.push(tile().id("rail-more").border(1).border_dashed().border_color(t.border)
      .text_size(11.5).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
      .tooltip("All spaces")
      .on_click(() => run("layout.resize", { id: "sidebar", px: shared("sidebar.width") ?? 268 }))
      .child(`+${r.more}`));
  }
  return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
    .children(top)
    .child(h_flex().h(31).flex_none().items_center().justify_center()
      .child(div().id("space-new").size(24).flex_none().flex().items_center().justify_center().rounded(6)
        .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("New space")
        .on_click(() => run("space.new"))
        .child(svg(`mods/workspace-chrome/plus.svg`).size(14))))
    .child(v_flex().id("rail").flex_1().min_h(0).pb(14).gap(4).items_center().overflow_y_scrollbar()
      .children(tiles));
}

function spaceTile(sp, rows, t, ctx) {
  const on = Boolean(sp.active);
  const mark = sp.status ? statusMark(t, sp.status) : null;
  const trigger = tile().relative().id(`rail-${sp.id}`)
    .cursor_pointer()
    .when(on, (el) => el.bg(t.selected).border(1).border_color(t.accent))
    .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
    .on_click(() => run("space.select", { id: sp.id }))
    .child(avatar(sp, t, ctx, AVATAR))
    .when(Boolean(mark), (el) => el.child(h_flex().absolute().right(-2).bottom(-2).min_w(14).h(14).rounded(5)
      .items_center().justify_center().bg(on ? t.selected : t.chrome).child(mark)));
  // The card opens beside the tile and stays while the pointer crosses to it, so its rows
  // can be clicked; it takes neither focus nor keys (a HoverCard is not a Popover).
  return HoverCard.new(`rail-card-${sp.id}`).anchor("left_center").open_delay(250).close_delay(200)
    .trigger(trigger)
    .content(card(sp, rows, t, ctx));
}

/** The card: name and folder, branch and tags, then the space's agents as in the tree. */
export function card(sp, rows, t, ctx) {
  const git = ctx.git.get(sp.id);
  const folder = placeOf(sp, ctx.paneList) ?? "";
  const where = ctx.home && folder.startsWith(ctx.home) ? `~${folder.slice(ctx.home.length)}` : folder;
  const pr = git ? ctx.pr({ space: sp.id }) : null;
  // The branch always (the card has no row name to stand for it); at the right, git's counts
  // and the PR.
  const tags = git ? tail({ git, pr }) : [];
  const marks = git ? gitSymbols(git.state, t, ctx, `card-git-${sp.id}`) : null;
  const here = { ...ctx, flat: true };
  return v_flex().w(CARD_W).ml(6).p(6).gap(2).rounded(10).bg(t.popover).border(1).border_color(t.border).shadow_lg()
    .text_size(13)
    .child(h_flex().gap(8).px(6).pt(2).items_center()
      .child(avatar(sp, t, ctx, 18))
      .child(div().flex_1().min_w(0).truncate().font_weight(500).text_color(t.foreground).child(sp.name ?? "")))
    .when(Boolean(where), (el) => el.child(div().px(6).truncate().text_size(11.5).text_color(t.dim).child(where)))
    .when(Boolean(git), (el) => el.child(h_flex().px(6).pt(2).gap(6).items_center().text_size(11.5).text_color(t.muted)
      .child(svg(`mods/workspace-chrome/branch.svg`).size(12).flex_none().text_color(t.dim))
      .child(div().flex_1().min_w(0).truncate().font_family(ctx.mono).child(git.branch))
      // Right end: git's counts, then the PR tag.
      .when(Boolean(marks), (e) => e.child(marks))
      .children(tags.map((it) => chip(it, t, ctx, ctx.away.has(sp.machine ?? null)).flex_none()))))
    .child(div().h(1).mx(6).my(4).bg(t.border))
    .when(rows.length > 0, (el) => el.children(rows.map((r) => drawRow(r, t, here))))
    .when(!rows.length, (el) => el.child(div().px(6).pb(4).text_size(12).text_color(t.dim).child("No agents")));
}

/**
 * Each space's agent and sub rows, from PINNED and the unfolded tree, their depths counted
 * from the space (a top-level agent is 0). Sub rows follow their agent, so they go with it.
 */
export function rowsBySpace(tree, pinned) {
  const out = new Map();
  const add = (space, r, depth) => {
    if (!out.has(space)) out.set(space, []);
    out.get(space).push({ ...r, depth });
  };
  // PINNED: agents at depth 0, each with its subs under it.
  let cur = null;
  for (const r of pinned) {
    if (r.kind === "agent" && r.depth === 0) cur = r.space ?? null;
    if (cur && (r.kind === "agent" || r.kind === "sub")) add(cur, r, r.depth);
  }
  cur = null;
  let top = 0;
  for (const r of tree) {
    if (isSpaceRow(r)) { cur = r.space; top = r.depth + 1; continue; }
    if (r.kind === "repo" || r.kind === "machine" || r.kind === "group") { cur = null; continue; }
    if (cur && (r.kind === "agent" || r.kind === "sub")) add(cur, r, Math.max(0, r.depth - top));
  }
  return out;
}
