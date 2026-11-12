import { test } from "node:test";
import assert from "node:assert/strict";
import { menuGroups, headerGroups } from "../mods/code-explorer/lib/menu.js";

const file = { path: "/r/src/App.tsx", rel: "src/App.tsx", root: "/r", dir: false, on: null };
const folder = { path: "/r/src", rel: "src", root: "/r", dir: true, on: null };
const ids = (groups) => groups.map((g) => g.map((i) => i.id));

test("file menu groups follow Cursor's explorer menu", () => {
  assert.deepEqual(ids(menuGroups(file)), [
    ["open-side", "open-tab", "reveal", "terminal"],
    ["add-agent", "add-new-agent"],
    ["copy-path", "copy-rel", "copy-name"],
  ]);
});

test("folder menu has no expand/collapse (a click does that, as in Cursor) and no file-only items", () => {
  const groups = ids(menuGroups({ ...folder, open: true }));
  assert.deepEqual(groups.flat().filter((id) => id === "toggle" || id === "collapse-inside"), []);
  assert.equal(groups[0][0], "reveal");
  assert.equal(groups.flat().includes("open-side"), false);
  assert.equal(groups.flat().includes("open-tab"), false);
});


test("another machine's file hides editors, browsers and Reveal in Finder", () => {
  const all = ids(menuGroups({ ...file, path: "/r/a.html", on: "vps", editor: "Zed", editors: 2, browsers: 2 })).flat();
  assert.deepEqual(all.filter((id) => /editor|browser/.test(id)), []);
  assert.equal(all.includes("reveal"), false);
});

test("the empty-area menu is the root folder's, with no Refresh (the tree keeps itself current)", () => {
  const all = ids(menuGroups({ ...folder, rel: "", isRoot: true })).flat();
  assert.equal(all.includes("refresh"), false);
  assert.ok(all.includes("terminal"));
  assert.equal(all.includes("toggle"), false);
});

test("shortcuts match Cursor's", () => {
  const byId = Object.fromEntries(menuGroups(file).flat().map((i) => [i.id, i.shortcut]));
  assert.equal(byId["copy-path"], "⌥⌘C");
  assert.equal(byId["copy-rel"], "⌥⇧⌘C");
  assert.equal(byId.reveal, "⌥⌘R");
  assert.equal(byId["open-side"], "⌃↩");
});

test("submenu items name what they open", () => {
  const byId = Object.fromEntries(menuGroups(file).flat().map((i) => [i.id, i.submenu]));
  assert.equal(byId["add-agent"], "agents");
  assert.equal(byId["add-new-agent"], "newAgents");
});

test("a changed file offers Open Changes after the open items; others don't", () => {
  assert.deepEqual(ids(menuGroups({ ...file, changed: true }))[0], ["open-side", "open-tab", "open-changes", "reveal", "terminal"]);
  assert.equal(ids(menuGroups(file)).flat().includes("open-changes"), false);
  assert.equal(ids(menuGroups({ ...folder, changed: true })).flat().includes("open-changes"), false);
});

test("with a default editor, every local menu starts with Open in <editor>", () => {
  const first = menuGroups({ ...file, editor: "Zed", editors: 1 })[0][0];
  assert.deepEqual([first.id, first.label], ["open-in-editor", "Open in Zed"]);
  assert.equal(menuGroups({ ...folder, editor: "Zed", editors: 1 })[0][0].id, "open-in-editor");
  assert.equal(ids(menuGroups({ ...file, editor: "Zed", editors: 1, on: "vps" })).flat().includes("open-in-editor"), false);
  assert.equal(ids(menuGroups(file)).flat().includes("open-in-editor"), false);
});

test("a list of editors only when there is more than one", () => {
  assert.equal(ids(menuGroups({ ...file, editor: "Zed", editors: 1 })).flat().includes("editor-list"), false);
  const item = menuGroups({ ...file, editor: "Zed", editors: 2 })[0][1];
  assert.deepEqual([item.id, item.label, item.submenu], ["editor-list", "Open in Other Editor", "editorList"]);
});

test("an HTML file adds Open in Browser, and a list when there are several browsers", () => {
  const html = { ...file, path: "/r/index.html", rel: "index.html", editor: "Zed", editors: 1, browsers: 2 };
  assert.deepEqual(ids(menuGroups(html))[0].slice(0, 3), ["open-in-editor", "open-in-browser", "browser-list"]);
  assert.equal(ids(menuGroups({ ...html, browsers: 1 })).flat().includes("browser-list"), false);
  assert.equal(ids(menuGroups({ ...file, browsers: 2 })).flat().includes("open-in-browser"), false);
});

test("Open With is gone: editors and browsers have their own items", () => {
  assert.equal(ids(menuGroups({ ...file, editor: "Zed", editors: 3 })).flat().includes("open-with"), false);
});

test("the header menu: the panel's settings, then light/dark", () => {
  assert.deepEqual(ids(headerGroups({})), [["click-opens", "pref:hideDots", "pref:hideIgnored", "pref:followActive"], ["appearance"]]);
  const [dark, light] = [headerGroups({}, { dark: true })[1][0], headerGroups({}, { dark: false })[1][0]];
  assert.deepEqual([dark.label, dark.shortcut], ["Light Mode", "⌥⌘L"]);
  assert.equal(light.label, "Dark Mode");
  assert.equal(headerGroups({ hideDots: true })[0][1].shortcut, "✓");
  assert.equal(headerGroups({ hideIgnored: true })[0][2].shortcut, "✓");
});

test("a viewer's ⋯ leaves out what its header buttons already do, and Open in New Tab", () => {
  const all = ids(menuGroups({ ...file, path: "/r/a.html", viewer: "v1", editor: "Zed", editors: 2, browsers: 2 })).flat();
  assert.deepEqual(all.filter((id) => /editor|browser|open-tab/.test(id)), []);
  assert.ok(all.includes("open-side") && all.includes("reveal") && all.includes("copy-path"));
});
