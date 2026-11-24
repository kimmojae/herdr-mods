// Machines: `hc machine ls` every 15 s (non-temporary ones), their group headers, and the
// reconnect / login / keeps-running flows. Port of the shipped spaces mod (S:84-91, 155-207,
// 338-419). Never keeps a cx: every method that starts work takes the caller's.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { hc, run, openOverlay } from "herdr";
import { key } from "../lib/name.js";

const FOLDED = key("machines.folded");
const RECONNECTING = key("machines.reconnecting");
const state = (machine) => (machine?.state ?? "asleep").replace(/_/g, " ");

export class Machines {
  constructor() {
    this.list = []; // hc machine ls, non-temporary
    try {
      this.reconnecting = JSON.parse(localStorage.getItem(RECONNECTING) ?? "{}");
      if (!this.reconnecting || typeof this.reconnecting !== "object" || Array.isArray(this.reconnecting)) this.reconnecting = {};
      for (const s of Object.values(this.reconnecting)) s.busy = false;
    } catch { this.reconnecting = {}; }
    try { this.folded = new Set(JSON.parse(localStorage.getItem(FOLDED) ?? "[]")); } catch { this.folded = new Set(); }
    this.copiedLogin = null;
    this.localHover = false; // the pointer is on this computer's header (its `+` shows)
  }

  poll(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.list = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary);
      } catch {}
      cx.notify();
    });
  }

  /** Remote machine names to group by: spaces', hc's and those being reconnected (S:346). */
  remote(sp) {
    return [...new Set([...sp.map((s) => s.machine).filter(Boolean), ...this.list.map((m) => m.name), ...Object.keys(this.reconnecting)])].sort();
  }

  toggle(m) {
    this.folded.has(m) ? this.folded.delete(m) : this.folded.add(m);
    localStorage.setItem(FOLDED, JSON.stringify([...this.folded]));
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  /** Its layout is loading, or hc says connected but no layout yet, or a space there still waits. */
  loading(m, sp, ms, shown) {
    const layout = ms.find((k) => k.name === m)?.layout;
    return layout === "loading" || (!layout && this.list.some((k) => k.name === m && k.state === "connected"))
      || sp.some((s) => (s.machine ?? null) === m && !shown.has(s.id));
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const st = this.reconnecting[name] ??= { machine, removed: false };
    st.busy = true;
    st.error = null;
    localStorage.setItem(RECONNECTING, JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const ask = async (args) => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!st.removed) {
          await ask(["machine", "rm", name]);
          st.removed = true;
          localStorage.setItem(RECONNECTING, JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem(FOLDED, JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        st.error = String(e.message ?? e);
        st.busy = false;
      }
      localStorage.setItem(RECONNECTING, JSON.stringify(this.reconnecting));
      this.poll(cx);
      cx.notify();
    });
  }

  /**
   * A machine group's top: its header, then the login guidance when it needs one (S:359-412).
   * `rebuilt`: only the header is drawn for the group (S:403).
   * @returns {{items: object[], rebuilt: boolean, folded: boolean}}
   */
  header(m, t) {
    if (m === null) {
      const folded = this.folded.has(null);
      return { items: [this.localHeader(t, true)], rebuilt: false, folded };
    }
    const repair = this.reconnecting[m];
    const machine = this.list.find((k) => k.name === m) ?? repair?.machine;
    const connected = machine?.state === "connected";
    const rebuilt = this.rebuilt(machine) || !!repair;
    const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
    const folded = this.folded.has(m);
    const head = h_flex().id(`machine-${m}`).h(26).flex_none().px(8).gap(7).items_center().rounded(7)
      .text_size(11).text_color(t.dim)
      .cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.toggle(m); cx.notify(); })
      .when(machine?.keeps_running_after_logout === false, (el) => el.child(div().id(`machine-logout-${m}`)
        .flex_none().text_color(t.blocked).tooltip("Agents stop when you disconnect. Click for the fix.")
        .on_click((_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "machine-add", kind: "dialog", width: 560 }); }).child("⚠")))
      .child(svg(`mods/workspace-chrome/server.svg`).size(13).flex_none())
      .child(div().flex_1().truncate().child(m))
      .when(!connected && !rebuilt && !login, (el) => el.child(div().flex_none().child(state(machine))))
      .when(rebuilt, (el) => el.child(h_flex().flex_none().gap(3).items_center()
        .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
        .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
          .hover((s) => s.text_color(t.foreground))
          .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
          .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
          .child(repair?.busy ? "Connecting…" : "Connect"))))
      .when(connected, (el) => el.child(div().id(`machine-add-${m}`).flex_none().px(4).rounded(4)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(`New space on ${m}`)
        .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m }); })
        .child(svg(`mods/workspace-chrome/plus.svg`).size(12))))
      .child(div().size(6).rounded(3).flex_none().bg(connected ? (t.done ?? t.dim) : t.dim))
      .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none());
    const guidance = login && !rebuilt ? [v_flex().id(`machine-login-${m}`).px(8).pb(6).gap(3).flex_none()
      .child(div().text_size(11).text_color(t.blocked).child("needs a login: run"))
      .child(h_flex().gap(5).items_center()
        .child(div().flex_1().min_w(0).truncate().tooltip(login).text_size(11).text_color(t.muted).child(login))
        .child(div().id(`machine-login-copy-${m}`).flex_none().px(5).py(2).rounded(4)
          .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
          .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
    return { items: [head, ...guidance], rebuilt, folded };
  }

  /**
   * This computer's header, as in the mock: a 6px `done` dot and "This computer", 10px, `dim`.
   * `foldable` (other machines listed): a click folds its spaces as the remote headers do, and
   * on hover a `+` makes a space here in one click (`SPACES +` may ask which machine).
   */
  localHeader(t, foldable) {
    const hot = foldable && this.localHover;
    return h_flex().id("machine-local").h(24).flex_none().px(10).gap(6).items_center().rounded(6)
      .text_size(10).font_weight(500).text_color(t.dim)
      .when(foldable, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => { if (this.localHover !== on) { this.localHover = on; cx.notify(); } })
        .on_click((_e, cx) => { this.toggle(null); cx.notify(); }))
      .child(div().size(6).rounded(3).flex_none().bg(t.done ?? t.dim))
      .child(div().flex_1().truncate().child("This computer"))
      .when(hot, (el) => el.child(div().id("machine-add-local").flex_none().px(4).rounded(4)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("New space on this computer")
        .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: "" }); })
        .child(svg(`mods/workspace-chrome/plus.svg`).size(12))));
  }

  /** "Loading…" while a machine's spaces aren't readable yet (S:352). */
  loadingRow(m, t) {
    return h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).items_center()
      .text_size(12).text_color(t.dim).child("Loading…");
  }

  /** A machine without spaces: "New space there" (S:396-402). */
  emptyRow(m, t) {
    return h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7)
      .text_size(12).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(() => run("space.new", { machine: m ?? "" }))
      .child(svg(`mods/workspace-chrome/plus.svg`).size(12)).child("New space there");
  }
}
