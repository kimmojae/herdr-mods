# herdr-mods — notes for agents

Mods and themes for the Herdr desktop app. Read `~/.config/herdr-app/AGENTS.md` before writing
or changing any mod code: it is the API reference for this Herdr version, and its `.d.ts` files
next to it are the truth for every function and element.

## Packages

| Folder | What it is |
|---|---|
| `code-explorer/` | One mod, `mods/code-explorer/`: the Files panel (tree), a read-only file viewer, and context menus. |
| `naps/` | A layout: Herdr's own window in the two Naps themes (no mods of its own). |
| `scripts/` | `import-cursor.mjs` (generate icons, themes, code colours from Cursor's extensions) and `sync.mjs` (install into Herdr). |

How each package looks and behaves, and what it is built from: its `RECIPE.md`
(`code-explorer/RECIPE.md`, `naps/RECIPE.md`). Keep it in step with the code.

## Rules

- No npm dependencies. Node 22 or newer; tests are `node --test` (`npm test`).
- Files in `code-explorer/mods/code-explorer/lib/` are plain ES modules: they never import
  `herdr`, `gpui-kit` or `gpui-base`, so they run under `node --test`.
- Mod code: no HTML/CSS/web views, no `setTimeout` (use `cx.timer`), never keep a `cx`,
  colours from `theme()` names (generated syntax colours excepted).
- Pass file paths to programs as separate arguments, never inside a shell string.
- After changing anything under `code-explorer/` or `naps/`: `npm run sync`, then confirm
  `herdr-app check` passed and `herdr-app status` shows `"errors": []`. Look at the window with
  `herdr-app shot` before calling a UI change done.
- Sync installs layouts as `<name>-test` (`naps-test`): that is the working copy; the released
  name (`naps`) is what people get from GitHub.

## When Symbols or Naps updates in Cursor

1. `npm run import` — regenerates `code-explorer/mods/code-explorer/icons/`, `icons.json`,
   `syntax/*.json` and `naps/themes/*.json` from the newest extension versions in
   `~/.cursor/extensions`.
2. Review the diff.
3. `npm run sync`.

## Screenshots

`preview.png` files are public. Never capture company code, repository names or conversations;
take them on a sample folder.
