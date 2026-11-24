# herdr-mods

Mods and themes for the [Herdr](https://herdr.dev) desktop app: a Files panel with a code viewer,
the Naps themes, your AI usage limits, and a sidebar with your spaces and agents in one tree.

## Packages

| Package | Kind | What you get |
|---|---|---|
| **[code-explorer](code-explorer/README.md)** | mod | A Files panel with Symbols icons and git colours, Open in your editor at the change, side-by-side Changes, Find like Cursor's, Markdown and images, and Add File to Agent. |
| **[naps](naps/README.md)** | layout · theme · mod | The Naps and Naps Dusk Gold themes in Herdr's own window, and a light/dark button (`⌘⌥L`) in the bottom bar. |
| **[agent-usage](agent-usage/README.md)** | mod | What's left of every Claude Code account's and Codex's 5-hour and 7-day limits, in the bottom bar; `⌘⌥U` for all of them. |
| **[spaces-tree](spaces-tree/README.md)** | mod | The sidebar's spaces and agents as one tree: each repo's checkouts as branch rows, worktrees, tabs and sub-agents beneath, what needs you on top. |

## Install

Each package installs on its own: open it above and follow its Install and Uninstall. With
several, add layouts before mods, since a layout can replace panels a mod has taken over.

Built and tested on macOS with the Herdr desktop app.

## Develop

The file icons come from [Symbols](https://github.com/miguelsolorio/vscode-symbols) and the
themes and code colours from [Naps](https://marketplace.visualstudio.com/items?itemName=kimmojae.naps-theme),
both generated from the extensions installed in Cursor. When either updates, `npm run import`
regenerates them; nothing watches in the background.

```sh
npm test          # node --test, no dependencies
npm run import    # regenerate icons, themes and code colours from Cursor's extensions
npm run sync      # install a -test working copy into ~/.config/herdr-app and run herdr-app check
npm run sync -- code-explorer   # just one package (or naps, agent-usage, spaces-tree)
npm run sync -- --clean   # remove the -test copy again (or --clean naps)
```

[AGENTS.md](AGENTS.md) has the rules for working on this repo; each package's `RECIPE.md` says
how it looks and behaves.

## Credits & license

`code-explorer` started from Herdr's own `files` mod and `spaces-tree` from its `spaces` and
`agents` mods (Apache-2.0). Icons are generated from
[Symbols](https://github.com/miguelsolorio/vscode-symbols) by Miguel Solorio (MIT). See
[NOTICE](NOTICE). This repo is [Apache-2.0](LICENSE).
