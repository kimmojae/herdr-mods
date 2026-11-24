// The Needs-you band: agents waiting on the person, longest wait first.
import { clean } from "./time.js";

/**
 * What a band row's second line names, per space: the repo and branch from the space's git,
 * a space not in git (or not known yet) by its own name.
 * @param {{id:string, name:string}[]} spaces
 * @param {Map<string, {name:string, branch:string}|null|undefined>} git
 * @returns {Map<string,{name:string, branch:string|null}>}
 */
export function spacePlaces(spaces, git) {
  return new Map(spaces.map((s) => {
    const g = git.get(s.id);
    return [s.id, g ? { name: g.name, branch: g.branch ?? null } : { name: s.name, branch: null }];
  }));
}

/** A row's second line out of the tree (the band, PINNED): `repo · branch`, else the space's name. */
export const placeLabel = (place) => (place ? (place.branch ? `${place.name} · ${place.branch}` : place.name) : "");

/**
 * @param {object[]} agents  agents() entries
 * @param {import("./tree.js").Sub[]} subs
 * @param {Record<string,{s:string,at:number}>} changed
 * @param {number} now
 * @param {Map<string,{name:string, branch:string|null}>} spaces
 * @returns {{address:string, pane?:string, status:string, title:string, where:string, waited:number}[]}
 */
export function needsYou(agents, subs, changed, now, spaces) {
  const whereOf = (a) => placeLabel(spaces.get(a.space)) || (a.space_name ?? "");
  const waited = (address) => (changed[address] ? now - changed[address].at : 0);
  const byAddress = new Map(agents.map((a) => [a.address, a]));
  const rows = [];
  for (const a of agents) {
    if (a.status !== "blocked" && a.status !== "done") continue;
    // Done in the pane the person is in: they're already looking (Herdr turns it idle on their
    // next move), so the band doesn't flash it. Blocked still shows: it waits on input.
    if (a.status === "done" && a.focused) continue;
    rows.push({ address: a.address, pane: a.pane, status: a.status, title: clean(a.title), where: whereOf(a), waited: waited(a.address) });
  }
  for (const k of subs) {
    if (k.kept || k.status !== "blocked") continue;
    const parent = byAddress.get(k.parent);
    rows.push({ address: k.address, pane: undefined, status: "blocked", title: k.title, where: parent ? whereOf(parent) : "", waited: waited(k.address) });
  }
  return rows.sort((x, y) => y.waited - x.waited);
}
