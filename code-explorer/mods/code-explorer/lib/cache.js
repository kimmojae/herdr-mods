// Files the viewer copies into mods/code-explorer/.cache/ (Herdr draws images only from under its
// own folder; a hidden folder, because writing anywhere else under mods/ reloads the mod): one name
// per viewer and picture, so a viewer's files can be found and removed.

const CAP_BYTES = 200 * 1024 * 1024;

const CACHE_DIR = ".cache";

export const cacheName = (viewerId, n, ext) => `${CACHE_DIR}/${viewerId}-${n}.${ext}`;

/**
 * Files to delete: those of viewers that no longer exist, then the oldest until under `capBytes`.
 * App icons (apps/…) are kept.
 * @param {{name: string, size: number, mtime: number}[]} files names relative to cache/
 */
export function staleFiles(files, liveIds, capBytes = CAP_BYTES) {
  const own = files.filter((f) => !f.name.startsWith("apps/"));
  const dead = own.filter((f) => !liveIds.has(f.name.split("-")[0]));
  const live = own.filter((f) => liveIds.has(f.name.split("-")[0])).sort((a, b) => a.mtime - b.mtime);
  let total = live.reduce((n, f) => n + f.size, 0);
  const trimmed = [];
  for (const f of live) {
    if (total <= capBytes) break;
    trimmed.push(f.name);
    total -= f.size;
  }
  return [...dead.map((f) => f.name), ...trimmed];
}
