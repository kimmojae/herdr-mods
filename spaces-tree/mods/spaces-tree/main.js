// spaces-tree: the sidebar's spaces and agents as one tree: machine → repo heading →
// [repo group →] checkout (one row per space) → agent → sub-agent. One pass reads Herdr once (spaces, agents, terminals, panes, machines,
// focus, theme), builds the rows with lib/tree.js and draws them with host/rows.js.
//   host/git.js       git per place (the shipped spaces mod's scheduler)
//   host/pr.js        gh pr view per checkout (the PR tag)
//   host/machines.js  hc machine ls, machine headers, reconnect / login
//   host/rows.js      the rows and status marks
//   host/rail.js      the rail (sidebar under 160px) and its hover cards
//   host/menu.js      the groups menu (a popup copy of this mod, props {mode: "menu"}): Edit groups…
// lib/ holds the logic that does not touch Herdr; tests run it under plain Node.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, agents, terminals, panes, machines, focused, theme, shared, setShared, settings, run, window, checking, home, appHome, setAgentOrder, readTextFile, props } from "herdr";
import { key } from "./lib/name.js";
import { gitKey, placeOf } from "./lib/git.js";
import { buildTree, leadPanes, subAgents, isSpaceRow, coreOrder, litRow, groupKeys } from "./lib/tree.js";
import { parseRules, CONFIG_FILE, ruleNames, orderNames, moveGroup, readGroupOrder, writeGroupOrder, pruneGroupOrder } from "./lib/groups.js";
import { spaceMoves, agentOrder } from "./lib/order.js";
import { needsYou, spacePlaces, placeLabel } from "./lib/band.js";
import { presence, presenceState } from "./lib/presence.js";
import { track } from "./lib/time.js";
import { assignColors } from "./lib/colors.js";
import { readFolds, writeFolds, pruneFolds, migrateFolds } from "./lib/folds.js";
import { GitWatch } from "./host/git.js";
import { PrWatch } from "./host/pr.js";
import { Machines } from "./host/machines.js";
import { drawRow, bandRow, sectionHeader, settledHeader, settledRow, presenceBox, pinnedHeight, MOTION, BAND_ROW, BAND_GAP } from "./host/rows.js";
import { narrow, drawRail, rowsBySpace } from "./host/rail.js";
import { openGroupsMenu, menuMethods } from "./host/menu.js";
import { railTiles } from "./lib/rail.js";

// A new space waits this long for its git, so a checkout appears under its repo heading
// instead of jumping there (S:75-78, 301).
const WAIT = 1500;
// No scrolling to the shown space this soon after a press in the list (the press moved it).
const PRESS_QUIET = 1000;
// Folded headings (lib/folds.js); the key is the one folded spaces were kept under.
const SPACES_FOLDED = key("spaces.folded");
const CHANGED = key("changed");
const SETTLED_OPEN = key("settled.open");
// The repo groups' order the person dragged, per machine (lib/groups.js readGroupOrder).
const GROUP_ORDER = key("groups.order");
// Agent rows' times move on this often (A:91).
const TICK = 30000;
// The repo group rules' file (lib/groups.js) is read again this often (a small local read).
const RULES_EVERY = 5000;

class SpacesTree extends View {
  init(_props, cx) {
    // The groups menu's popup copy (host/menu.js) draws only the menu.
    if (props()?.mode === "menu") { this.mode = "menu"; this.initMenu(cx); return; }
    this.machines = new Machines();
    this.git = new GitWatch((m) => this.machines.folded.has(m));
    this.pr = new PrWatch((m) => this.machines.folded.has(m));
    // Spaces there at the start show at once; later ones wait (at most WAIT) for their git.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null; // what was pressed in the list (a drag's source, host/rows.js dragOf)
    this.over = null; // the key of the row the drag is over (one that takes the drop)
    this.pressedAt = 0;
    // Folded heading key -> its machine (lib/folds.js), so a machine still loading keeps its folds.
    try { this.folds = readFolds(localStorage.getItem(SPACES_FOLDED)); } catch { this.folds = new Map(); }
    try { this.groupOrder = readGroupOrder(localStorage.getItem(GROUP_ORDER)); } catch { this.groupOrder = new Map(); }
    this.foldedAgents = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts (lib/time.js track).
    try { this.changed = JSON.parse(localStorage.getItem(CHANGED) ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.settledOpen = JSON.parse(localStorage.getItem(SETTLED_OPEN) ?? "false") === true; } catch { this.settledOpen = false; }
    this.hovered = null; // agent row under the pointer: its time gives way to the pin button
    this.ordering = null; // the last space.move batch: {key, at, machines}
    this.scroll = ScrollHandle.new();
    this.litAt = -1; // the shown space's row among the list's direct children, -1 when not drawn
    this.revealed = undefined;
    this.revealedAt = -1; // space rows before the shown one at the last reveal
    this.aboveSig = "";
    this.sizeSig = "";
    // The band's and PINNED's rows and sections coming and going (lib/presence.js), and until
    // when (ms) the block above the list is still growing or collapsing.
    this.motion = { band: presenceState(), bandSection: presenceState(), pinned: presenceState(), pinnedSection: presenceState() };
    this.movingUntil = 0;
    this.wakeAt = 0;
    // Repo group rules (lib/groups.js): none until the file is read; `ok` false (bad JSON)
    // shows no groups but keeps group folds.
    this.rules = { rules: [], ok: false };
    this.rulesText = undefined;
    if (checking()) return;
    this.readRules(cx);
    cx.timer.every(RULES_EVERY, (cx) => this.readRules(cx));
    this.machines.poll(cx);
    cx.timer.every(15000, (cx) => this.machines.poll(cx));
    // Git only when the refs could have changed (host/git.js); colours when the spaces change.
    cx.timer.every(250, (cx) => this.tick(cx));
    this.tick(cx);
    cx.timer.every(TICK, (cx) => cx.notify());
  }

  tick(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const ms = machines();
    const ps = panes();
    this.git.due(cx, sp, ps, ms, Boolean(window()?.active));
    this.pr.due(cx, this.checkouts(sp, ps), now, Boolean(window()?.active));
    this.pruneFolds(sp, ps, ms);
    // Agents' state changes are stamped here, outside render (it writes localStorage).
    const ag = agents();
    this.stamp(ag, subAgents(terminals(), ag), now);
    // The only shared write outside a person's action: when the set of spaces changed.
    const colors = assignColors(shared("space.colors") ?? {}, sp);
    if (colors) setShared("space.colors", colors);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now, ms)) cx.notify();
  }

  // The rules' file, read off the UI thread; a redraw only when its text changed. A read that
  // fails keeps the last rules; a missing file means no groups.
  readRules(cx) {
    cx.spawn(async (cx) => {
      let text;
      try { text = await readTextFile(`${appHome()}/${CONFIG_FILE}`); } catch { return; }
      if (text === this.rulesText) return;
      this.rulesText = text;
      this.rules = parseRules(text);
      if (!this.rules.ok) console.warn(`spaces-tree: ${CONFIG_FILE} is not {"groups": [{"name", "path"}]} (${this.rules.error}); no groups shown`);
      cx.notify();
    });
  }

  // What lib/tree.js groups headings with: the rules, this computer's home (a remote
  // machine's isn't known: there only absolute rule paths match), and where each space is.
  groupsOf(sp, ps) {
    if (!this.rules.rules.length) return null;
    return { rules: this.rules.rules, homes: new Map([[null, home()]]), places: new Map(sp.map((s) => [s.id, placeOf(s, ps)])), orders: this.groupOrder };
  }

  /**
   * A group header dropped on another (host/rows.js draggable): its machine's group order is
   * stored with it moved there; the next pass shows it, and keepOrder moves the spaces so
   * Herdr's order follows.
   * @param {{name:string, machine:string|null}} src
   * @param {{name:string}} dst
   */
  moveGroup(src, dst) {
    const m = src.machine ?? null;
    const next = moveGroup(orderNames(ruleNames(this.rules.rules), this.groupOrder.get(m)), src.name, dst.name);
    if (!next) return;
    this.groupOrder.set(m, next);
    try { localStorage.setItem(GROUP_ORDER, writeGroupOrder(this.groupOrder)); } catch {}
  }

  // Places with a git result on a branch: where `gh pr view` is asked, each once.
  checkouts(sp, ps) {
    const out = new Map();
    for (const s of sp) {
      const key = gitKey(s, ps);
      const branch = this.git.get(key)?.branch;
      if (!branch || branch === "(detached)" || out.has(key)) continue;
      const [on, cwd] = JSON.parse(key);
      out.set(key, { key, cwd, on, branch });
    }
    return [...out.values()];
  }

  /**
   * @param {string} key the heading's (lib/tree.js headingKey)
   * @param {string|null} machine its machine (null: this computer)
   */
  toggleFold(key, machine) {
    this.folds.has(key) ? this.folds.delete(key) : this.folds.set(key, machine ?? null);
    try { localStorage.setItem(SPACES_FOLDED, writeFolds(this.folds)); } catch {}
  }

  // Folds kept by space id (before headings) move to their heading once its git is known.
  // Folds of headings that are gone go too (they would keep the fold set non-empty), but only
  // where their machine is ready and every space's git there is known: one still loading (or
  // away) hasn't listed its spaces yet, and its folds must survive a start (lib/folds.js).
  // Stored only when something changed.
  pruneFolds(sp, ps, ms) {
    const git = new Map(sp.map((s) => [s.id, this.git.get(gitKey(s, ps))]));
    // hc says connected but no layout is listed for it yet: its spaces aren't in either.
    const waiting = this.machines.list.some((k) => k.state === "connected" && !ms.some((m) => m.name === k.name));
    const moved = migrateFolds(this.folds, sp, git);
    // Group folds go only once the rules are read and valid (an edit mid-way keeps them).
    const groups = this.rulesText !== undefined && this.rules.ok ? groupKeys(sp, git, this.groupsOf(sp, ps)) : null;
    if (pruneFolds(this.folds, sp, ms, waiting, git, groups) || moved) {
      try { localStorage.setItem(SPACES_FOLDED, writeFolds(this.folds)); } catch {}
    }
    // A dragged group order loses names that are no longer rules on the same terms.
    if (groups && pruneGroupOrder(this.groupOrder, this.rules.rules, ms)) {
      try { localStorage.setItem(GROUP_ORDER, writeGroupOrder(this.groupOrder)); } catch {}
    }
  }

  toggleSettled() {
    this.settledOpen = !this.settledOpen;
    try { localStorage.setItem(SETTLED_OPEN, JSON.stringify(this.settledOpen)); } catch {}
  }

  // Stamps agents and sub-agents whose state changed; stored only when something did.
  stamp(ag, subs, now) {
    const r = track(this.changed, ag, subs, now);
    if (!r.dirty) return;
    this.changed = r.changed;
    try { localStorage.setItem(CHANGED, JSON.stringify(this.changed)); } catch {}
  }

  toggleAgent(address) {
    this.foldedAgents.has(address) ? this.foldedAgents.delete(address) : this.foldedAgents.add(address);
  }

  // A retry after a move that didn't take: every affected machine ready, a second on (S:293-295).
  orderingDue(now, ms = machines()) {
    return Boolean(this.ordering) && now - this.ordering.at >= 1000
      && this.ordering.machines.every((name) => ms.some((m) => m.name === name && m.layout === "ready"));
  }

  // Herdr's own space order follows the displayed one (each repo's spaces together, at its
  // first space, main checkouts first), so ⌘-number and the menus agree with the list. Retried only when the key
  // changes, or once every affected machine is ready again (S:316-334).
  keepOrder(sp, target, ms) {
    const order = sp.map((s) => s.id);
    if (order.length === target.length && order.every((id, i) => id === target[i])) {
      this.ordering = null;
      return;
    }
    const k = JSON.stringify([order, target, ms]);
    if (this.ordering?.key === k && !this.orderingDue(Date.now(), ms)) return;
    const moves = spaceMoves(order, target);
    // Nothing to move (ids differ only): no retry for a batch that was never sent.
    if (!moves.length) { this.ordering = null; return; }
    const machineOf = new Map(sp.map((s) => [s.id, s.machine ?? null]));
    this.ordering = { key: k, at: Date.now(), machines: [...new Set(moves.map((m) => machineOf.get(m.id)))] };
    for (const m of moves) run("space.move", m);
  }

  // The tree's machine groups in the shipped order: this computer, then the others by name,
  // with a group for a remote machine that has no spaces yet (S:346, 358).
  arrange(tree, remote) {
    if (!remote.length) return [{ machine: undefined, head: null, rows: tree }];
    const groups = new Map();
    let current = null;
    for (const r of tree) {
      if (r.kind === "machine") {
        current = { machine: r.machine, head: r, rows: [] };
        groups.set(r.machine, current);
      } else current?.rows.push(r);
    }
    return [null, ...remote].map((m) => groups.get(m)
      ?? { machine: m, head: { kind: "machine", machine: m, folded: this.machines.folded.has(m) }, rows: [] });
  }

  // Rows of spaces still waiting for their git go, with what's under them; an open group
  // header left with nothing under it goes too.
  visible(rows) {
    const out = [];
    let skip = -1;
    for (const r of rows) {
      if (skip >= 0 && r.depth > skip) continue;
      skip = -1;
      if (isSpaceRow(r) && !this.shown.has(r.space)) { skip = r.depth; continue; }
      out.push(r);
    }
    return out.filter((r, i) => r.kind !== "group" || r.folded || (out[i + 1] && out[i + 1].kind !== "group" && out[i + 1].kind !== "machine"));
  }

  // Fixed above the scroll: the Needs-you band (gone when nobody waits), then PINNED. Rows,
  // and each section as a whole, grow in and collapse (lib/presence.js, host/rows.js presenceBox):
  // the tree below slides instead of jumping. `cx` only for the one-shot wake.
  above(band, pinned, t, ctx, where, cx) {
    const now = Date.now();
    const out = [];
    const step = (state, items, keyOf) => {
      const r = presence(state, items, keyOf, now, MOTION);
      if (r.moving) this.movingUntil = Math.max(this.movingUntil, now + MOTION + 100);
      if (r.wake !== null) this.wake(cx, r.wake);
      return r.list;
    };
    // Each band row is BAND_ROW tall with BAND_GAP under it, the section's own bottom padding 2
    // less to match.
    const bandRows = step(this.motion.band, band, (b) => b.address);
    const [bandSec] = step(this.motion.bandSection, band.length ? [{ count: band.length }] : [], () => "band");
    if (bandSec) {
      const rowsH = bandRows.reduce((h, r) => h + (r.phase === "shown" ? BAND_ROW + BAND_GAP : 0), 0);
      out.push(presenceBox("band", bandSec.phase, 31 + rowsH + 6 + 1,
        v_flex().flex_none().px(8).pb(6).border_b(1).border_color(t.border)
          .child(sectionHeader("NEEDS YOU", bandSec.item.count, t))
          .children(bandRows.map((r) => presenceBox(`band-${r.key}`, r.phase, BAND_ROW + BAND_GAP,
            bandRow(r.item, t, r.phase !== "leave"))))));
    }
    // Pinned rows draw flat (no guide), out of the tree: each names its repo and branch on a
    // second line, as the band does.
    const here = { ...ctx, flat: true, place: (id) => placeLabel(where.get(id)) };
    const pinRows = step(this.motion.pinned, pinned, (r) => r.key);
    const count = pinned.filter((r) => r.kind === "agent").length;
    const [pinSec] = step(this.motion.pinnedSection, pinned.length ? [{ count }] : [], () => "pinned");
    if (pinSec) {
      const rowsH = pinRows.reduce((h, r) => h + (r.phase === "shown" ? pinnedHeight(r.item, here) : 0), 0);
      out.push(presenceBox("pinned", pinSec.phase, 31 + rowsH + 4,
        v_flex().flex_none().px(8).pb(4)
          .child(sectionHeader("PINNED", pinSec.item.count, t))
          .children(pinRows.map((r) => presenceBox(`pin-${r.key}`, r.phase, pinnedHeight(r.item, here),
            drawRow(r.item, t, here))))));
    }
    return out;
  }

  // One render `ms` from now (an entering row's second draw, a finished leave's drop); a timer
  // only when none due sooner is waiting.
  wake(cx, ms) {
    const at = Date.now() + ms;
    if (this.wakeAt && this.wakeAt <= at) return;
    this.wakeAt = at;
    cx.timer.after(Math.max(16, ms + 4), (cx) => {
      if (this.wakeAt <= Date.now()) this.wakeAt = 0;
      cx.notify();
    });
  }

  // The SETTLED shelf at the end of the scroll, folded by default.
  below(settled, t) {
    if (!settled.length) return [];
    const head = settledHeader(settled.length, this.settledOpen, t, () => this.toggleSettled());
    return this.settledOpen ? [head, ...settled.map((r) => settledRow(r, t))] : [head];
  }

  render(cx) {
    if (this.mode === "menu") return this.menuView();
    const t = theme();
    const now = Date.now();
    // One read of each per pass: every host read copies its whole list into JS.
    const sp = spaces(), ag = agents(), ps = panes(), terms = terminals(), ms = machines(), foc = focused();
    const font = settings()?.font;
    const git = new Map();
    for (const s of sp) {
      const g = this.git.get(gitKey(s, ps));
      git.set(s.id, g);
      if (!this.shown.has(s.id) && (g !== undefined || now - (this.born[s.id] ??= now) > WAIT)) this.shown.add(s.id);
    }
    const remote = this.machines.remote(sp);
    const multi = remote.length > 0;
    const subs = subAgents(terms, ag);
    const groups = this.groupsOf(sp, ps);
    const input = { spaces: sp, agents: ag, subs, leads: leadPanes(ps), git, multiMachine: multi, groups };
    const folded = new Set(this.folds.keys());
    const built = buildTree({ ...input, folded, foldedMachines: this.machines.folded, foldedAgents: this.foldedAgents });
    // Core order: spaces() order with each repo's spaces kept together at its first space
    // (lib/tree.js coreOrder): every space, folded or hidden ones too, and never grouped by
    // machine (that grouping is display-only, in arrange()).
    const target = coreOrder(sp, git, groups);
    this.keepOrder(sp, target, ms);

    // What host/rows.js draws with, built once per pass.
    const ctx = {
      view: this,
      spaces: new Map(sp.map((s) => [s.id, s])),
      coreIndex: new Map(sp.map((s, i) => [s.id, i])),
      colors: shared("space.colors") ?? {},
      // The one lit row among the drawn ones (lib/tree.js litRow): the focused terminal's agent
      // or sub-agent row, else the shown tab's tab row or its first agent row.
      lit: litRow({ focused: foc, agents: ag, subs, spaces: sp, rows: [...built.pinned, ...this.visible(built.tree)] }),
      order: sp.map((s) => s.id),
      kept: new Set(ag.map((a) => a.address)),
      panes: new Map(ps.map((p) => [p.pane, p])),
      home: home(),
      away: new Set(ms.filter((m) => m.layout === "unavailable").map((m) => m.name)),
      mono: typeof font === "string" && font ? font : "Menlo",
      pr: (row) => (ctx.spaces.get(row.space) ? this.pr.get(gitKey(ctx.spaces.get(row.space), ps)) : null),
      pinned: new Set(ag.filter((a) => a.pinned).map((a) => a.address)),
      changed: this.changed,
      now,
      git,
      paneList: ps,
    };
    const rail = narrow();

    // The list's direct children; the shown space's index among them is the scroll target
    // (machine headers, login notes and loading rows count too).
    const children = [];
    this.litAt = -1;
    let before = 0; // space rows drawn before the shown one (agent, sub and tab rows don't count)
    let spaceAt = -1;
    const shownId = sp.find((s) => s.active)?.id;
    const add = (rows) => {
      for (const r of rows) {
        if (isSpaceRow(r)) {
          if (r.space === shownId) { this.litAt = children.length; spaceAt = before; }
          before++;
        } else if ((r.kind === "repo" || r.kind === "group") && r.folded && r.spaces.includes(shownId)) {
          // The shown space's heading (or group) is folded: bring it into view.
          this.litAt = children.length;
          spaceAt = before;
        }
        children.push(drawRow(r, t, ctx));
      }
    };
    for (const g of rail ? [] : this.arrange(built.tree, remote)) {
      const rows = this.visible(g.rows);
      if (!g.head) {
        // One machine: this computer's header all the same, as in the mock (not foldable).
        children.push(this.machines.localHeader(t, false));
        if (!rows.length && this.machines.loading(null, sp, ms, this.shown)) children.push(this.machines.loadingRow(null, t));
        add(rows);
        continue;
      }
      const head = this.machines.header(g.machine, t);
      children.push(...head.items);
      if (head.rebuilt || head.folded) continue;
      if (rows.length) add(rows);
      else children.push(this.machines.loading(g.machine, sp, ms, this.shown) ? this.machines.loadingRow(g.machine, t) : this.machines.emptyRow(g.machine, t));
    }
    if (!rail) children.push(...this.below(built.settled.filter((r) => this.shown.has(r.space)), t));
    // agent.next / agent.prev walk every agent: pinned, then the tree in display order, each
    // once (not the band). A fold is visual only, and a space still waiting for its git counts.
    const open = !folded.size && !this.machines.folded.size && !this.foldedAgents.size ? built
      : buildTree({ ...input, folded: new Set(), foldedMachines: new Set(), foldedAgents: new Set() });
    const flat = this.arrange(open.tree, remote).flatMap((g) => g.rows);
    setAgentOrder(agentOrder({ pinned: open.pinned, tree: flat }, ctx.kept));

    // Waiting agents, longest first, with their repo and branch (a space not in git: its name).
    const where = spacePlaces(sp, git);
    // A row whose title says nothing reads its program's name instead (lib/band.js gives "").
    const programOf = new Map([...subs, ...ag].map((a) => [a.address, a.program?.name]));
    const band = needsYou(ag, subs, this.changed, now, where)
      .map((b) => (b.title ? b : { ...b, title: programOf.get(b.address) || b.where || b.address }));
    this.aboveSig = `${band.length}/${built.pinned.length}`;

    // Bring the shown space into view when it, or its place in the list, changes.
    const active = sp.find((s) => s.active)?.id;
    // Not on the rail: it draws no rows, and the list looks again when it comes back.
    // Only the space rows before it count (as shipped), so an agent or sub-agent row appearing
    // above doesn't pull the list back.
    if (!rail && (active !== this.revealed || spaceAt !== this.revealedAt)) {
      this.revealed = active;
      this.revealedAt = spaceAt;
      if (this.litAt >= 0 && now - this.pressedAt > PRESS_QUIET) this.scroll.scroll_to_item(this.litAt);
    }

    if (rail) {
      // Tiles in the displayed order (each repo's spaces together), spaces still waiting for
      // their git left out as in the list.
      const byId = ctx.spaces;
      const shownOrder = target.filter((id) => this.shown.has(id)).map((id) => byId.get(id));
      const r = railTiles({ spaces: shownOrder, agents: ag, active: active ?? null, waiting: band.length });
      return drawRail(r, band, rowsBySpace(open.tree, open.pinned), t, ctx);
    }

    const count = sp.filter((s) => this.shown.has(s.id)).length;
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .children(this.above(band, built.pinned, t, ctx, where, cx))
      .child(h_flex().id("spaces-head").h(31).flex_none().pl(16).pr(10).items_center().justify_between()
        // A right-click: the groups menu (Edit groups…).
        .on_mouse_down("right", () => openGroupsMenu())
        .child(h_flex().gap(6).items_center().text_size(10).font_weight(600).text_color(t.dim)
          .child("SPACES").child(div().font_weight(400).child(String(count))))
        .child(div().id("space-new").size(24).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("New space")
          .on_click(() => run("space.new"))
          .child(svg(`mods/workspace-chrome/plus.svg`).size(14))))
      .child(v_flex().id("tree").flex_1().min_h(0).px(6).pb(14).overflow_y_scrollbar().mode("always").track_scroll(this.scroll)
        // A block above growing, or the window resizing, can push the shown space out.
        .on_size_change((_size, cx) => {
          // A change that comes with the band or PINNED block above changing is not the
          // sidebar's size: leave the scroll where the person put it.
          // Nor while that block is still growing or collapsing.
          const same = this.aboveSig === this.sizeSig && Date.now() > this.movingUntil;
          this.sizeSig = this.aboveSig;
          if (same && this.litAt >= 0) { this.scroll.scroll_to_item(this.litAt); cx.notify(); }
        })
        .on_mouse_down("left", () => { this.pressedAt = Date.now(); })
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; this.over = null; cx.notify(); })
        .children(children));
  }
}

Object.assign(SpacesTree.prototype, menuMethods);

export default SpacesTree;
