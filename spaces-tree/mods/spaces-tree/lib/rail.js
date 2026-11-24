// The collapsed rail: which space tiles to draw.

/**
 * @param {{spaces:{id:string}[], agents:{space:string, status:string}[], active:string|null, waiting:number}} p
 * @returns {{waiting:number, tiles:string[], more:number}}
 */
export function railTiles({ spaces, agents, active, waiting }) {
  const busy = new Set();
  for (const a of agents) if (a.status !== "idle") busy.add(a.space);
  const tiles = spaces.map((s) => s.id).filter((id) => busy.has(id) || id === active);
  return { waiting, tiles, more: spaces.length - tiles.length };
}
