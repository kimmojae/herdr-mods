// Add File to Agent: puts "@<path> " into an agent's input without pressing Enter — through the
// clipboard and terminal.paste, because `hc send` always submits. A new agent is started in a
// tab first; the sidebar waits for it to settle (a menu's copy closes before that), then pastes.
import { svg, image } from "gpui-kit";
import { agents, knownAgents, run } from "herdr";

const WAIT_MS = 500, GIVE_UP_MS = 30000;

// Elements are single-use: build an icon on every render, never store one.
export const programIcon = (program) => {
  if (!program?.icon) return null;
  return program.tint ? svg(program.icon).size(16).flex_none() : image(program.icon).size(16).flex_none();
};

/** Running agents in a space; working ones are shown but can't be chosen. */
export function agentChoices(space) {
  return agents().filter((a) => a.space === space).map((a) => ({
    address: a.address,
    label: `${a.program?.name ?? a.app ?? "Agent"} · ${a.tab_name || a.tab_index}`,
    icon: programIcon(a.program),
    disabled: a.status === "working",
    detail: a.status === "working" ? "working" : "",
  }));
}

/** Installed agents that can be started (programs.json entries with `run`). */
export async function newAgentChoices(on) {
  const known = await knownAgents({ on: on ?? null }).catch(() => []);
  return known.filter((a) => a.installed).map((a) => ({ key: a.key, label: a.name, run: a.run, program: a }));
}

export function insertIntoAgent(cx, address, text) {
  cx.write_to_clipboard(text);
  run("pane.focus", { terminal: address });
  run("terminal.paste");
}

/** Sidebar side of "Add File to New Agent": start it, wait until it is idle, paste. */
export function startAgentWith(cx, { space, folder, argv, text }) {
  const before = new Set(agents().map((a) => a.address));
  run("tab.new", { space, folder, argv });
  const started = Date.now();
  const check = (cx) => {
    const fresh = agents().find((a) => !before.has(a.address) && a.space === space);
    if (fresh && (fresh.status === "idle" || fresh.status === "done")) return insertIntoAgent(cx, fresh.address, text);
    if (Date.now() - started < GIVE_UP_MS) cx.timer.after(WAIT_MS, check);
  };
  cx.timer.after(WAIT_MS, check);
}
