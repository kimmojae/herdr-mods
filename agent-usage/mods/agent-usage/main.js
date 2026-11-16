// agent-usage: what's left of each Claude Code account's and Codex's 5-hour and 7-day limits.
// One class, two roles, each its own copy:
//   bar    the button in the bottom status row (default)   host/bar.js
//   panel  the popup it opens                              host/panel.js
// lib/ holds the logic that does not touch Herdr; tests run it under plain Node.
import { View, div } from "gpui-kit";
import { props, theme } from "herdr";
import { barMethods } from "./host/bar.js";
import { panelMethods } from "./host/panel.js";

class AgentUsage extends View {
  init(given, cx) {
    this.mode = (props() ?? given ?? {}).mode ?? "bar";
    if (this.mode === "bar") this.initBar(cx);
    else if (this.mode === "panel") this.initPanel(cx);
  }

  async close() {
    if (this.mode === "panel") this.closePanel();
  }

  render(cx) {
    if (this.mode === "bar") return this.barView(cx);
    if (this.mode === "panel") return this.panelView(cx);
    return div().size_full().p(12).text_color(theme().dim).child(`Unknown mode: ${this.mode}`);
  }
}

Object.assign(AgentUsage.prototype, barMethods, panelMethods);

export default AgentUsage;
