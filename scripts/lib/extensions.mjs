// Finds an installed VS Code / Cursor extension by id. Extension folders are named
// `<publisher>.<name>-<version>[-<platform>]`; the newest version wins.
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const compare = (a, b) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

/** @returns {Promise<{path: string, version: string} | null>} */
export async function findLatestExtension(dir, id) {
  let names;
  try { names = await readdir(dir); } catch { return null; }
  const prefix = `${id.toLowerCase()}-`;
  let best = null;
  for (const name of names) {
    if (!name.toLowerCase().startsWith(prefix)) continue;
    const version = /^(\d+(?:\.\d+)*)/.exec(name.slice(prefix.length))?.[1];
    if (version && (!best || compare(version, best.version) > 0)) best = { path: join(dir, name), version };
  }
  return best;
}
