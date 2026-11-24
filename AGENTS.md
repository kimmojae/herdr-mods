# herdr-mods — notes for agents

Mods and themes for the Herdr desktop app. Read `~/.config/herdr-app/AGENTS.md` before writing
or changing any mod code: it is the API reference for this Herdr version, and its `.d.ts` files
next to it are the truth for every function and element.

## Packages

| Folder | What it is |
|---|---|
| `code-explorer/` | One mod, `mods/code-explorer/`: the Files panel (tree), a read-only file viewer, and context menus. |
| `naps/` | A layout: Herdr's own window in the two Naps themes, and one small mod, `mods/naps/`: the light/dark button in its bottom row (⌘⌥L). |
| `agent-usage/` | One mod, `mods/agent-usage/`: what's left of each Claude Code account's and Codex's 5h/7d limits, a bottom-bar button and a panel. |
| `spaces-tree/` | One mod, `mods/spaces-tree/`: the sidebar's spaces and agents as one tree (machine, repo, worktree, agent). |
| `scripts/` | `import-cursor.mjs` (generate icons, themes, code colours from Cursor's extensions) and `sync.mjs` (install into Herdr). |

How each package looks and behaves, and what it is built from: its `RECIPE.md`
(`code-explorer/RECIPE.md`, `naps/RECIPE.md`, `agent-usage/RECIPE.md`, `spaces-tree/RECIPE.md`). Keep it in step with the code.

## Rules

- No npm dependencies. Node 22 or newer; tests are `node --test` (`npm test`).
- Files in `code-explorer/mods/code-explorer/lib/`, `naps/mods/naps/lib/`, `agent-usage/mods/agent-usage/lib/` and `spaces-tree/mods/spaces-tree/lib/` are plain ES modules: they never import
  `herdr`, `gpui-kit` or `gpui-base`, so they run under `node --test`.
- Mod code: no HTML/CSS/web views, no `setTimeout` (use `cx.timer`), never keep a `cx`,
  colours from `theme()` names (generated syntax colours excepted).
- Pass file paths to programs as separate arguments, never inside a shell string.
- After changing a package, sync just that one: `npm run sync -- code-explorer` or
  `npm run sync -- naps` or `npm run sync -- agent-usage` or `npm run sync -- spaces-tree` (all when none is named), then confirm `herdr-app check` passed and
  `herdr-app status` shows `"errors": []`. Look at the window with `herdr-app shot` before
  calling a UI change done.
- Sync installs a working copy beside the released packages people get from GitHub, and never
  touches those: the mod as `code-explorer-test` (with its `mod:code-explorer-test` keys), naps's
  themes as `<name>-test` and its mod as `naps-test` (its ⌘⌥L under `layout:herdr-mods-test`), the mod `agent-usage-test` with its `⌘⌥U`, the mod `spaces-tree-test`. One layout, `herdr-mods-test`,
  puts together whatever is installed: naps in its `-test` themes, `code-explorer-test` in Files,
  `agent-usage-test` and `naps-test` beside workspace-status (released or built-in ones where a copy isn't installed), `spaces-tree-test` in place of the spaces and agents lists;
  every sync rebuilds it. Try changes there; `npm run sync -- --clean [package]` removes the
  copies, and the layout follows. The mod's name lives only in `lib/name.js`.

## When Symbols or Naps updates in Cursor

1. `npm run import` — regenerates `code-explorer/mods/code-explorer/icons/`, `icons.json`,
   `syntax/*.json` and `naps/themes/*.json` from the newest extension versions in
   `~/.cursor/extensions`.
2. Review the diff.
3. `npm run sync` (both packages).

## Screenshots

`preview.png` files are public. Never capture company code, repository names or conversations;
take them on a sample folder.
