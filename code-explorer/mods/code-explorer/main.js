// code-explorer: a Cursor-style Files panel for Herdr. One class, three roles, each its own copy:
//   sidebar  the tree (default)          host/tree.js
//   viewer   a file in a tab or a split  host/viewer.js (+ viewer-header.js, viewer-views.js)
//   menu     a right-click popup         host/menu-view.js
// lib/ holds the logic that does not touch Herdr; tests run it under plain Node.
import { View, div } from "gpui-kit";
import { props, theme } from "herdr";
import { treeMethods } from "./host/tree.js";
import { menuMethods } from "./host/menu-view.js";
import { viewerMethods } from "./host/viewer.js";
import { viewerHeaderMethods } from "./host/viewer-header.js";
import { viewerViewMethods } from "./host/viewer-views.js";

class CodeExplorer extends View {
  init(given, cx) {
    this.mode = (props() ?? given ?? {}).mode ?? "sidebar";
    if (this.mode === "sidebar") this.initSidebar(cx);
    else if (this.mode === "menu") this.initMenu(cx);
    else if (this.mode === "viewer") this.initViewer(cx);
  }

  // Herdr calls this when the pane, tab or popup goes: a viewer removes its cached pictures.
  async close() {
    if (this.mode === "viewer") await this.closeViewer();
  }

  render(cx) {
    if (this.mode === "sidebar") return this.sidebarView(cx);
    if (this.mode === "menu") return this.menuView(cx);
    if (this.mode === "viewer") return this.viewerView(cx);
    return div().size_full().p(12).text_color(theme().dim).child(`Unknown mode: ${this.mode}`);
  }
}

Object.assign(CodeExplorer.prototype, treeMethods, menuMethods, viewerMethods, viewerHeaderMethods, viewerViewMethods);

export default CodeExplorer;
