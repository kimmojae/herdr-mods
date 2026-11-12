// A file in a tab or a split, read-only. The sidebar opens viewers through openFile(); each viewer
// copy keeps its registry entry (lib/registry.js) up to date from render, so a change shows at once.
// Code (highlighted, with changes against HEAD), Markdown (rendered or code), images and HTML
// (its text and structure via Herdr's TextView) — pictures are drawn through copies in
// the mod's hidden .cache/ (writing elsewhere under mods/ would reload the mod).
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, panes, spaces, focused, shared, setShared, run, theme, readTextFile, watchFolder, exec, appHome, nextCommand } from "herdr";
import * as fs from "fs/promises";
import { newViewerId, findOpen, previewEntry, claimTab, prune } from "../lib/registry.js";
import { baseName, parentOf, viewerKind, extOf } from "../lib/paths.js";
import { highlight } from "../lib/highlight.js";
import { parseHunks, allAdded } from "../lib/hunks.js";
import { markdownBlocks } from "../lib/markdown.js";
import { cacheName, staleFiles } from "../lib/cache.js";
import { openWith, defaultEditor } from "./apps.js";
import { toggleAppearance } from "./actions.js";

const VIEWERS = "code-explorer:viewers";
const MAX_CHARS = 400000, IMAGE_MAX = 20 * 1024 * 1024;
export const HIGHLIGHT_CHARS = 200000; // longer files are drawn plain
export const MOD = "mods/code-explorer";
const COPY = 'mkdir -p -- "$(dirname -- "$2")" && { cmp -s -- "$1" "$2" || cp -- "$1" "$2"; }';

export const viewerEntries = () => shared(VIEWERS) ?? {};

export function setEntry(id, change) {
  const all = viewerEntries();
  setShared(VIEWERS, { ...all, [id]: { ...all[id], ...change } });
}

/** Tabs that hold a code-explorer pane (viewers; the sidebar is a layout block, not a pane). */
export const viewerTabs = () => new Set(panes().filter((p) => p.mod === "code-explorer").map((p) => p.tab));

export const activeSpace = () => spaces().find((s) => s.active)?.id;
// test(1), not fs: Herdr's fs reads only under the home folder.
const exists = (p) => exec("test", ["-e", p]).then((r) => r.code === 0, () => false);

function newViewer(file, space, preview, diff) {
  const id = newViewerId(Date.now(), Math.random());
  setEntry(id, { space, file, preview, diff, tab: null, others: [...viewerTabs()], at: Date.now() });
  run("tab.new", { space, name: baseName(file.path), mod: "code-explorer", props: { mode: "viewer", viewer: id, space, file } });
}

/**
 * Opens `file` ({path, rel, root, on}) the way `how` says: "preview" reuses the space's preview
 * tab, "pinned" opens a tab of its own, "side" splits the current tab, "editor" hands it to the
 * default editor ("cursor", the old name, too).
 * `diff: true` shows it as Changes (HEAD and the file side by side).
 */
export function openFile(file, how = "preview", { diff = false } = {}) {
  const space = activeSpace();
  if (!space) return;
  if (how === "editor" || how === "cursor") {
    const editor = defaultEditor();
    if (editor && !file.on) return openWith(editor, file.path);
    how = "preview";
  }
  const entries = viewerEntries();
  const open = findOpen(entries, space, file.path);
  if (open && how !== "side") {
    if (how === "pinned" && open[1].preview) setEntry(open[0], { preview: false });
    if (diff) setEntry(open[0], { diff: true });
    if (open[1].tab) run("tab.select", { id: open[1].tab });
    return;
  }
  if (how === "side") {
    const id = newViewerId(Date.now(), Math.random());
    setEntry(id, { space, file, preview: false, diff, tab: focused()?.tab ?? null, others: [], at: Date.now() });
    run("pane.split", { direction: "right", mod: "code-explorer", props: { mode: "viewer", viewer: id, space, file } });
    return;
  }
  const preview = how === "preview" ? previewEntry(entries, space) : null;
  if (preview) {
    const [id, entry] = preview;
    setEntry(id, { file, diff });
    if (entry.tab) { run("tab.rename", { id: entry.tab, name: baseName(file.path) }); run("tab.select", { id: entry.tab }); }
    return;
  }
  newViewer(file, space, how === "preview", diff);
}

/** Pins the preview viewer showing `path` (a double-click). */
export function keepOpen(path) {
  const open = findOpen(viewerEntries(), activeSpace(), path);
  if (open?.[1].preview) setEntry(open[0], { preview: false });
}

/** Drops entries of closed tabs (the sidebar calls it; not in the first seconds after start). */
export function pruneViewers(startedAt) {
  if (Date.now() - startedAt < 15000) return;
  const all = viewerEntries();
  const kept = prune(all, viewerTabs(), Date.now());
  if (Object.keys(kept).length !== Object.keys(all).length) setShared(VIEWERS, kept);
}

/** Deletes cache files of viewers that are gone, and the oldest over the cap (sidebar, at start). */
export async function cleanCache() {
  const dir = `${appHome()}/${MOD}/.cache`;
  let names = [];
  try { names = await fs.readdir(dir); } catch { return; }
  const files = [];
  for (const name of names.filter((n) => n !== "apps")) {
    try { const s = await fs.stat(`${dir}/${name}`); files.push({ name, size: s.size, mtime: s.mtimeMs }); } catch {}
  }
  for (const name of staleFiles(files, new Set(Object.keys(viewerEntries())))) await fs.rm(`${dir}/${name}`, { force: true }).catch(() => {});
}

export async function loadPalettes() {
  const dir = `${appHome()}/${MOD}/syntax`;
  const out = [];
  for (const name of await fs.readdir(dir).catch(() => [])) {
    try { out.push(JSON.parse(await readTextFile(`${dir}/${name}`))); } catch {}
  }
  return out;
}

export const viewerMethods = {
  initViewer(cx) {
    const p = props() ?? {};
    this.viewerId = p.viewer;
    this.viewerFile = p.file;
    this.shown = null;
    this.serial = 0;
    this.palettes = [];
    this.openHunks = new Set();
    this.fit = true;
    cx.spawn(async (cx) => {
      this.palettes = await loadPalettes();
      try { this.iconMap = JSON.parse(await readTextFile(`${appHome()}/${MOD}/icons.json`)); } catch { this.iconMap = null; }
      cx.notify();
    });
    cx.timer.every(5000, (cx) => { if (this.shown) { this.readHunks(this.shown, cx); if (this.shown.on) this.reload(cx); } });
    // ⌘⌥L reaches the copies on screen; a viewer may be the only one (Files closed).
    cx.spawn(async () => { for (;;) { if (String(await nextCommand()).split(".").pop() === "toggle-appearance") toggleAppearance(); } });
  },

  async closeViewer() {
    // A closed viewer leaves the registry, or a reopened file would only select the tab it was in.
    const { [this.viewerId]: _gone, ...rest } = viewerEntries();
    if (_gone) setShared(VIEWERS, rest);
    const copies = [this.picture, ...(this.mdPictures?.values() ?? [])].filter(Boolean);
    for (const c of copies) await fs.rm(`${appHome()}/${MOD}/${c}`, { force: true }).catch(() => {});
  },

  // Runs in render: claim the tab as it opens, follow the registry's file.
  syncViewer(cx) {
    const entries = viewerEntries();
    let entry = entries[this.viewerId];
    if (!entry && this.viewerFile) {
      // Pruned before this viewer first showed (or lost on quit): register it again in full.
      entry = { space: (props() ?? {}).space ?? activeSpace(), file: this.viewerFile, preview: false, tab: null, others: [], at: Date.now() };
      setEntry(this.viewerId, entry);
    }
    if (entry && !entry.tab) {
      const tab = claimTab(entries, this.viewerId, focused()?.tab, viewerTabs());
      if (tab) setEntry(this.viewerId, { tab });
    }
    const file = entry?.file ?? this.viewerFile;
    if (file && file.path !== this.shown?.path) this.showFile(file, cx);
    return entry;
  },

  showFile(file, cx) {
    this.shown = file;
    this.kind = viewerKind(file.path);
    this.text = undefined; this.problem = null; this.lines = null; this.tokens = null;
    this.hunks = []; this.openHunks = new Set();
    this.picture = null; this.dims = ""; this.bytes = 0;
    this.reload(cx);
    this.readHunks(file, cx);
    this.watchFile(file, cx);
  },

  watchFile(file, cx) {
    if (file.on || this.watching === file.path) return;
    this.watching = file.path;
    const serial = (this.watchSerial = (this.watchSerial ?? 0) + 1);
    cx.spawn(async (cx) => {
      try {
        while (this.watchSerial === serial) {
          const changed = await watchFolder(parentOf(file.path));
          if (this.watchSerial !== serial || this.shown?.path !== file.path) break;
          if (changed.includes(file.path) || changed.includes(parentOf(file.path))) { this.reload(cx); this.readHunks(file, cx); }
        }
      } catch { /* the folder went away; the next read says so */ }
    });
  },

  reload(cx) {
    const file = this.shown;
    if (!file) return;
    if (this.kind === "image") return this.loadPicture(file, cx);
    cx.spawn(async (cx) => {
      let text, problem = null;
      try { text = await readTextFile(file.path, { on: file.on }); }
      catch { problem = "This file can't be shown: it's over 1 MB or unreadable."; }
      if (this.shown?.path !== file.path) return;
      if (!problem && text === null) problem = "This file is no longer available.";
      else if (!problem && text.includes("\0")) problem = "Binary file · no text preview.";
      if (problem) { this.problem = problem; this.text = undefined; return cx.notify(); }
      const cut = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n… (file truncated)` : text;
      if (cut === this.text) return;
      this.problem = null;
      this.text = cut;
      this.lines = cut.replace(/\r/g, "").replace(/\t/g, "    ").split("\n");
      this.tokens = cut.length > HIGHLIGHT_CHARS ? this.lines.map((l) => [["plain", l]]) : highlight(this.lines.join("\n"), file.path);
      if (this.kind === "markdown") this.loadMarkdownPictures(file, cx);
      cx.notify();
    });
  },

  // Asked on every check: a commit clears the marks without touching the file.
  readHunks(file, cx) {
    if (this.kind === "image" || this.diffing) return;
    this.diffing = true;
    cx.spawn(async (cx) => {
      const git = (args) => exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], { cwd: parentOf(file.path), on: file.on }).catch(() => null);
      let hunks = [];
      const status = await git(["status", "--porcelain=v1", "--", file.path]);
      if (status?.code === 0 && status.stdout.startsWith("??")) hunks = allAdded();
      else if (status?.code === 0 && status.stdout.trim()) {
        const diff = await git(["diff", "--no-color", "--no-ext-diff", "--no-textconv", "-U0", "HEAD", "--", file.path]);
        if (diff?.code === 0) hunks = parseHunks(diff.stdout);
      }
      this.diffing = false;
      if (this.shown?.path !== file.path || JSON.stringify(hunks) === JSON.stringify(this.hunks)) return;
      this.hunks = hunks;
      cx.notify();
    });
  },

  // ── pictures: images and Markdown images ─────────────────────────────────────

  copyPicture(src, n, cx, done) {
    const name = cacheName(this.viewerId, n, extOf(src) || "png");
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", COPY, "copy", src, `${appHome()}/${MOD}/${name}`]).catch(() => null);
      done(r?.code === 0 ? name : null);
      cx.notify();
    });
  },

  loadPicture(file, cx) {
    // Reached from render (showFile): set the message without cx.notify(), which render forbids.
    if (file.on) { this.problem = "Images on another machine can't be shown here."; return; }
    cx.spawn(async (cx) => {
      // stat(1), not fs: Herdr's fs reads only under the home folder, files can be anywhere.
      const st = await exec("stat", ["-f", "%z", file.path]).catch(() => null);
      const size = st?.code === 0 ? Number(st.stdout.trim()) : NaN;
      if (Number.isNaN(size)) { this.problem = "This file is no longer available."; return cx.notify(); }
      if (size > IMAGE_MAX) { this.problem = "This image is over 20 MB. Use Open With to view it."; return cx.notify(); }
      this.bytes = size;
      const dims = await exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file.path]).catch(() => null);
      const w = /pixelWidth: (\d+)/.exec(dims?.stdout ?? "")?.[1], h = /pixelHeight: (\d+)/.exec(dims?.stdout ?? "")?.[1];
      this.dims = w && h ? `${w} × ${h}` : "";
      this.copyPicture(file.path, ++this.serial, cx, (name) => {
        if (this.picture && this.picture !== name) fs.rm(`${appHome()}/${MOD}/${this.picture}`, { force: true }).catch(() => {});
        this.picture = name;
        this.problem = name ? null : "This image can't be shown.";
      });
    });
  },

  loadMarkdownPictures(file, cx) {
    if (file.on) return;
    this.mdPictures ??= new Map();
    for (const block of markdownBlocks(this.text, parentOf(file.path)).filter((b) => b.type === "image")) {
      if (this.mdPictures.has(block.path)) continue;
      this.mdPictures.set(block.path, null);
      this.copyPicture(block.path, `m${this.mdPictures.size}`, cx, (name) => this.mdPictures.set(block.path, name));
    }
  },

  // ── views ─────────────────────────────────────────────────────────────────────────────────

  markdownView() { return viewerEntries()[this.viewerId]?.markdown === "code" ? "code" : "preview"; },
  htmlView() { return viewerEntries()[this.viewerId]?.html === "code" ? "code" : "preview"; },
  // Changes needs a HEAD to compare with: not for untracked files (allAdded) or pictures.
  diffable() { return this.kind !== "image" && this.text !== undefined && this.hunks.length > 0 && this.hunks[0].count !== Infinity; },
  showsChanges() { return Boolean(viewerEntries()[this.viewerId]?.diff) && this.diffable(); },

  viewerView(cx) {
    const t = theme();
    const entry = this.syncViewer(cx);
    const body = this.problem ? div().p(14).text_color(t.dim).child(this.problem)
      : this.kind === "image" ? this.pictureView(t)
      : this.text === undefined ? div().p(14).text_color(t.dim).child("Loading…")
      : this.showsChanges() ? (this.narrow() ? this.codeView(t, true) : this.changesView(t))
      : this.kind === "markdown" && this.markdownView() === "preview" ? this.markdownPreview(t)
      : this.kind === "html" && this.htmlView() === "preview" ? this.htmlPreview(t)
      : this.codeView(t);
    return v_flex().id("code-explorer-viewer").size_full()
      .on_size_change((size, cx) => { if (size.width !== this.paneWidth) { this.paneWidth = size.width; cx.notify(); } }).min_h(0).min_w(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13)
      .child(this.viewerHeader(entry, t))
      .child(body);
  },
};
