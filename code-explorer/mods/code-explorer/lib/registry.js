// Which viewer shows which file in which tab. A mod copy can't name its own tab, so every viewer
// has an id here and claims the tab it was opened in (the focused one, as it opens). Shared as
// `code-explorer:viewers`: { [id]: {space, file, preview, tab, others, at, markdown?} }.

export const newViewerId = (now, rand) => `v${now.toString(36)}${rand.toString(36).slice(2, 8)}`;

const find = (entries, test) => Object.entries(entries).find(([, e]) => test(e)) ?? null;

export const findOpen = (entries, space, path) => find(entries, (e) => e.space === space && e.file?.path === path);

export const previewEntry = (entries, space) => find(entries, (e) => e.space === space && e.preview);

/** The focused tab when it is a viewer tab no other entry holds and not one that existed before. */
export function claimTab(entries, id, focusedTab, viewerTabs) {
  const entry = entries[id];
  if (!entry || entry.tab || !focusedTab || !viewerTabs.has(focusedTab)) return null;
  if (entry.others?.includes(focusedTab)) return null;
  if (Object.entries(entries).some(([other, e]) => other !== id && e.tab === focusedTab)) return null;
  return focusedTab;
}

/** Entries whose tab still exists, plus unclaimed ones younger than `graceMs`. */
export function prune(entries, liveTabs, now, graceMs = 15000) {
  return Object.fromEntries(Object.entries(entries).filter(([, e]) => (e.tab ? liveTabs.has(e.tab) : now - (e.at ?? 0) < graceMs)));
}
