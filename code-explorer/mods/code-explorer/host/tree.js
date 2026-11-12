// The Files panel: a lazy tree of the focused pane's folder. Started from Herdr's shipped
// `files` mod 0.1.15 (Apache-2.0): folder listing, git marks and the folder watch. Files open
// in viewers (host/viewer.js).
import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, window, appHome, nextCommand } from "herdr";
import { parseStatus, folderMarks, markOf } from "../lib/status.js";
import { resolveIcon } from "../lib/icons.js";
import { parseIgnored, isIgnored, isExcluded } from "../lib/ignore.js";
import { relativeTo } from "../lib/paths.js";
import { openMenu } from "./menu-view.js";
import { lastAsk, copyText, revealInFinder, openInFinder, toggleAppearance } from "./actions.js";
import { loadApps, defaultEditor, openWith, iconPath, FINDER } from "./apps.js";
import { startAgentWith } from "./agents.js";
import { openFile, keepOpen, pruneViewers, cleanCache, viewerEntries, loadPalettes } from "./viewer.js";
import { pickGit } from "../lib/palette.js";


// Per-copy preferences (localStorage can throw or come back empty; the defaults stand then).
const PREFS = { hideDots: false, hideIgnored: false, followActive: true, clickOpens: "preview" };
function loadPrefs() {
  const out = { ...PREFS };
  for (const key of Object.keys(PREFS)) {
    try {
      const v = localStorage.getItem(`code-explorer:${key}`);
      if (v !== null) out[key] = JSON.parse(v);
    } catch {}
  }
  return out;
}
function setPref(view, key, value) {
  view.prefs[key] = value;
  try { localStorage.setItem(`code-explorer:${key}`, JSON.stringify(value)); } catch {}
}

const PER_FOLDER = 500, TOTAL = 5000;
const UI = "mods/code-explorer/ui";

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export const treeMethods = {
  initSidebar(cx) {
    this.startedAt = Date.now();
    this.answered = lastAsk()?.id; // shared state outlives a reload: never replay the last request
    this.treeFocus = cx.focus_handle();
    this.palettes = [];
    cx.spawn(async (cx) => { this.palettes = await loadPalettes(); cx.notify(); });
    cx.spawn(async cx => {
      for (;;) {
        const command = String(await nextCommand()).split(".").pop();
        this.runCommand(command, cx);
        cx.notify();
      }
    });
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {}; this.folderMarks = new Map();
    this.ignored = new Set(); this.top = null;
    this.prefs = loadPrefs();
    this.iconMap = null;
    cx.spawn(async cx => {
      try { this.iconMap = JSON.parse(await readTextFile(`${appHome()}/mods/code-explorer/icons.json`)); } catch { this.iconMap = null; }
      cx.notify();
    });
    this.findApps(cx);
    cx.spawn(async () => { await cleanCache().catch(() => null); });
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  },

  // Symbols in full colour; the shipped single-colour icons when icons.json is missing.
  icon(name, dir, t) {
    const path = resolveIcon(this.iconMap, name, dir);
    return path ? image(path).size(16).flex_none() : svg(`${UI}/${dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted);
  },

  // The focused pane's folder. A viewer or other mod pane has no folder of its own, so while one
  // is focused the tree stays where it was instead of falling back to the space's folder.
  location() {
    const space = spaces().find(s => s.active), f = focused();
    const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
    if (pane?.mod === "code-explorer") {
      // A viewer: the tree shows the folder its file was opened from.
      const entry = Object.values(viewerEntries()).find(e => e.tab === pane.tab && e.space === space?.id);
      if (entry?.file?.root) return (this.place = { cwd: entry.file.root, on: entry.file.on ?? null, space: space?.id });
    }
    if (pane?.mod && this.place?.space === space?.id) return this.place;
    if (pane?.mod) {
      // Another mod pane right after a reload: the first terminal in the same tab, else the space's folder.
      const term = panes().find(p => p.tab === pane.tab && !p.mod && p.cwd);
      return (this.place = { cwd: term?.cwd || space?.folder, on: space?.machine ?? null, space: space?.id });
    }
    const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
    return (this.place = { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id });
  },

  placeKey() {
    return JSON.stringify(this.location());
  },

  current(context) {
    return this.context === context && this.placeKey() === context.key;
  },

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  },

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  },

  refresh(cx) {
    const { cwd, on } = this.location(), next = this.placeKey();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.sel = null; this.followed = null;
      this.pending = new Set(); this.marks = {}; this.folderMarks = new Map(); this.ignored = new Set(); this.top = null;
      this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        await this.loadGit(context);
        if (!this.current(context)) return;
        this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  },

  // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
  async loadGit(context) {
    const { cwd, on } = context;
    const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
    let marks = {}, ignored = new Set(), topDir = null;
    if (top?.code === 0) {
      topDir = top.stdout.trim();
      const git = (args) => exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], { cwd: topDir, on }).catch(() => null);
      const [status, ignoredOut] = await Promise.all([
        git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]),
        git(["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]),
      ]);
      if (status?.code === 0) marks = parseStatus(status.stdout, topDir);
      if (ignoredOut?.code === 0) ignored = parseIgnored(ignoredOut.stdout);
    }
    if (this.current(context)) { this.marks = marks; this.folderMarks = folderMarks(marks, topDir ?? context.cwd); this.ignored = ignored; this.top = topDir; }
  },

  // `path` relative to the tree's root → whether git ignores it.
  ignoredRow(path, dir) {
    if (!this.top || !this.ignored.size) return false;
    const base = relativeTo(this.top.normalize("NFC"), this.root.normalize("NFC"));
    if (base === null) return false;
    return isIgnored(this.ignored, base ? `${base}/${path}` : path, dir);
  },

  // What a menu needs to know about a row (plain data: it crosses to the menu's copy).
  targetOf(path, dir) {
    const abs = path ? `${this.root}/${path}` : this.root;
    const rel = this.top ? (relativeTo(this.top, abs) ?? path) : path;
    return { path: abs, rel, treePath: path, root: this.root, top: this.top, dir, on: this.on ?? null, open: dir && this.folders.has(path), isRoot: !path,
      changed: !dir && this.marks[abs.normalize("NFC")] === "M" };
  },

  rowMenu(path, dir) {
    openMenu(this.targetOf(path, dir), this.location().space);
  },

  openHeaderMenu() {
    openMenu({ kind: "header", prefs: { ...this.prefs } }, this.location().space);
  },

  // A choice from the menu's copy that needs this tree. `root` guards against an old request
  // replayed after the folder changed.
  answerMenu(cx) {
    const ask = lastAsk();
    if (!ask || ask.id === this.answered) return;
    this.answered = ask.id;
    // Runs during render: what it changes shows in this render, so it never calls cx.notify().
    if (ask.action === "pref") { setPref(this, ask.key, ask.value); return; }
    if (ask.action === "start-agent") { startAgentWith(cx, ask); return; }
    if (ask.root !== this.root) return;
    const path = ask.treePath ?? "";
    if (ask.action === "open-side" || ask.action === "open-tab") openFile(this.fileOf(path), ask.action === "open-side" ? "side" : "pinned");
  },

  collapseAll(cx) {
    this.folders = new Set();
    for (const key of [...this.entries.keys()]) if (key) this.entries.delete(key);
    cx.notify();
  },

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  },

  fileOf(path) {
    const t = this.targetOf(path, false);
    return { path: t.path, rel: t.rel, root: this.root, on: t.on };
  },

  // Click: the "Click Opens" choice; double-click: keep (pin) it; ⌘-click: to the side.
  clickFile(path, e) {
    const file = this.fileOf(path);
    if (e?.click_count === 2) return keepOpen(file.path);
    if (e?.modifiers?.platform) return openFile(file, "side");
    // Older saves may hold "side", "editor" or "cursor": those now preview.
    openFile(file, this.prefs.clickOpens === "pinned" ? "pinned" : "preview");
  },

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    if (!prefix) this.visible = [];
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      if (isExcluded(entry.name) || (this.prefs.hideDots && entry.name.startsWith("."))) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = markOf(this.marks, this.folderMarks, `${this.root}/${path}`.normalize("NFC"), entry.dir);
      const ignored = this.ignoredRow(path, entry.dir);
      if (ignored && this.prefs.hideIgnored) continue;
      this.visible.push({ path, dir: entry.dir });
      out.push(this.row(entry, path, depth, open, mark, ignored, t));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  },

  // ⌥-click: a folder and everything inside it, opened breadth-first up to 2,000 entries.
  toggleDeep(path, cx) {
    if (this.folders.has(path)) return this.toggle(path, cx);
    const context = this.context;
    cx.spawn(async cx => {
      const queue = [path];
      let seen = 0;
      while (queue.length && seen < 2000 && this.current(context)) {
        const next = queue.shift();
        this.folders.add(next);
        if (!this.entries.has(next)) await this.loadFolder(next, context).catch(() => null);
        for (const e of this.entries.get(next) ?? []) { seen++; if (e.dir && !this.ignoredRow(`${next}/${e.name}`, true)) queue.push(`${next}/${e.name}`); }
        cx.notify();
      }
    });
  },

  // The file a focused viewer shows, as a path in this tree; null when it is elsewhere.
  activePath() {
    const f = focused();
    const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
    if (pane?.mod !== "code-explorer") return null;
    const entry = Object.values(viewerEntries()).find(e => e.tab === pane.tab);
    return entry?.file ? relativeTo(this.root, entry.file.path) : null;
  },

  // Follow Active File: open the folders above the viewer's file once per file.
  follow(cx) {
    const path = this.activePath();
    if (!path || path === this.followed) return;
    this.followed = path;
    this.sel = path;
    if (!this.prefs.followActive) return;
    const parts = path.split("/").slice(0, -1);
    const context = this.context;
    cx.spawn(async cx => {
      for (let i = 1; i <= parts.length && this.current(context); i++) {
        const folder = parts.slice(0, i).join("/");
        this.folders.add(folder);
        if (!this.entries.has(folder)) await this.loadFolder(folder, context).catch(() => null);
      }
      cx.notify();
    });
  },

  treeKey(e, cx) {
    const rows = this.visible ?? [];
    const i = rows.findIndex(r => r.path === this.sel);
    const at = rows[i];
    const k = e.key;
    // ⌘← collapses every folder, as in Cursor; the selection moves up to its top-level folder.
    if (e.keystroke === "cmd-left") {
      this.collapseAll(cx);
      if (this.sel?.includes("/")) this.sel = this.sel.slice(0, this.sel.indexOf("/"));
      return cx.stop_propagation();
    }
    if (k === "down" || k === "up") this.sel = rows[Math.max(0, Math.min(rows.length - 1, i < 0 ? 0 : i + (k === "down" ? 1 : -1)))]?.path;
    else if (k === "right" && at?.dir) { if (!this.folders.has(at.path)) this.toggle(at.path, cx); else this.sel = rows[i + 1]?.path ?? this.sel; }
    else if (k === "left" && at) { if (at.dir && this.folders.has(at.path)) this.toggle(at.path, cx); else if (at.path.includes("/")) this.sel = at.path.slice(0, at.path.lastIndexOf("/")); }
    else if (k === "enter" && at) at.dir ? this.toggle(at.path, cx) : openFile(this.fileOf(at.path), "pinned");
    else if (k === "space" && at && !at.dir) openFile(this.fileOf(at.path), "preview");
    else return;
    cx.stop_propagation();
    cx.notify();
  },

  // Keys bound in keys.json under mod:code-explorer, for the selected row (else the active file).
  runCommand(command, cx) {
    const path = this.sel ?? this.activePath();
    if (command === "focus") return this.treeFocus?.focus();
    if (command === "toggle-appearance") return toggleAppearance();
    if (path == null) return;
    const t = this.targetOf(path, Boolean(this.visible?.find(r => r.path === path)?.dir));
    if (command === "copy-path") copyText(cx, t.path);
    else if (command === "copy-relative") copyText(cx, t.rel);
    else if (command === "reveal" && !t.on) revealInFinder(t.path);
    else if (command === "open-side" && !t.dir) openFile(this.fileOf(path), "side");
  },

  headerButton(id, icon, label, onClick, t) {
    const glyph = svg(`${UI}/${icon}.svg`).size(14).flex_none();
    return div().id(id).size(24).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer()
      .text_color(t.dim).tooltip(label).accessibility_label(label)
      .hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(glyph);
  },

  // Installed editors and browsers, once Herdr names the platform (it may not, in a copy's
  // first moments): until then, ask again every second.
  findApps(cx) {
    cx.spawn(async (cx) => {
      if (await loadApps().catch(() => true)) cx.notify();
      else cx.timer.after(1000, (cx) => this.findApps(cx));
    });
  },

  // An app's icon that opens a folder in it: Finder (the shown folder), the default editor (the
  // repo, or the shown folder outside git).
  appButton(id, app, folder, open, t) {
    const label = `Open ${folder.split("/").pop()} in ${app.name}`;
    return div().id(id).size(24).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer()
      .tooltip(label).accessibility_label(label).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => { cx.stop_propagation(); open(folder); })
      .child(image(iconPath(app)).size(18).flex_none());
  },

  header(t) {
    const name = this.root?.split(/[\\/]/).pop() ?? "";
    const editor = this.on || !this.root ? null : defaultEditor();
    return h_flex().h(42).flex_none().pl(14).pr(8).gap(4).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().mr(4).child("Files"))
      .when(Boolean(name), el => el.child(div().flex_none().max_w(140).truncate().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(name)))
      .child(div().flex_1())
      .when(!this.on && Boolean(this.root), el => el.child(this.appButton("files-finder", FINDER, this.root, openInFinder, t)))
      .when(Boolean(editor), el => el.child(this.appButton("files-editor", editor, this.top ?? this.root, (f) => openWith(editor, f), t)))
      .child(this.headerButton("files-collapse", "collapse", "Collapse all", cx => this.collapseAll(cx), t))
      .child(this.headerButton("files-more", "more", "More", cx => this.openHeaderMenu?.(cx), t));
  },

  row(entry, path, depth, open, mark, ignored, t) {
    const active = path === this.sel;
    return h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
      .when(active, el => el.bg(t.selected)).when(!active, el => el.hover(s => s.bg(t.hover)))
      .when(ignored, el => el.opacity(0.42))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.rowMenu(path, entry.dir); })
      .on_click((e, cx) => {
        this.sel = path;
        this.treeFocus?.focus();
        if (!entry.dir) return this.clickFile(path, e);
        if (e?.click_count === 2) return;
        e?.modifiers?.alt ? this.toggleDeep(path, cx) : this.toggle(path, cx);
      })
      .child(entry.dir ? svg(`${UI}/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
      .child(this.icon(entry.name, entry.dir, t))
      // Like Cursor: the name takes the change's colour; a file shows its letter, a folder a dot.
      .child(div().flex_1().min_w(0).truncate().when(Boolean(mark), el => el.text_color(pickGit(t, this.palettes)[mark])).child(entry.name))
      .when(Boolean(mark), el => el.child(div().flex_none().text_size(entry.dir ? 9 : 11).text_color(pickGit(t, this.palettes)[mark]).child(entry.dir ? "●" : mark)));
  },

  sidebarView(cx) {
    if (this.placeKey() !== this.context?.key) this.refresh(cx);
    this.answerMenu(cx);
    this.follow(cx);
    pruneViewers(this.startedAt);
    const t = theme();
    return v_flex().id("code-explorer").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.chrome).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .track_focus(this.treeFocus).on_key_down((e, cx) => this.treeKey(e, cx))
      .child(this.header(t))
      .child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6)
        .on_mouse_down("right", (_e, cx) => { if (this.root) this.rowMenu("", true); })
        .children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total"))));
  },
};
