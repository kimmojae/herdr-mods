// A VS Code colour theme as a Herdr theme (themes/<slug>.json) and as code-explorer's syntax
// palette (syntax/<slug>.json). Translucent colours are flattened onto what they sit on.
import { blend, flatten } from "./color.mjs";

const ANSI = ["Black", "Red", "Green", "Yellow", "Blue", "Magenta", "Cyan", "White"];

export const slugOf = (label) => label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function toHerdrTheme(vs) {
  const c = vs.colors ?? {};
  const background = flatten(c["editor.background"], "#000000");
  const on = (key, bg = background) => (c[key] ? flatten(c[key], bg) : undefined);
  const chrome = on("sideBar.background") ?? background;
  const foreground = on("editor.foreground");
  const colors = {
    canvas: on("activityBar.background"),
    chrome,
    surface: chrome,
    popover: on("editorWidget.background"),
    raised: blend("#ffffff", chrome, 0.06),
    hover: on("list.hoverBackground", chrome),
    selected: on("list.activeSelectionBackground", chrome),
    border: blend("#ffffff", background, 0.06),
    accent: on("textLink.foreground"),
    solid: on("button.background"),
    solid_foreground: on("button.foreground"),
    muted: foreground ? blend(foreground, chrome, 0.62) : undefined,
    dim: on("tab.inactiveForeground", chrome),
  };
  const ansi = [...ANSI.map((n) => c[`terminal.ansi${n}`]), ...ANSI.map((n) => c[`terminal.ansiBright${n}`])];
  return {
    background,
    foreground,
    selection: on("editor.selectionBackground"),
    cursor: on("editorCursor.foreground"),
    ansi: ansi.every(Boolean) ? ansi.map((x) => flatten(x, background)) : undefined,
    colors: Object.fromEntries(Object.entries(colors).filter(([, v]) => v)),
  };
}

const scopesOf = (rule) =>
  (Array.isArray(rule.scope) ? rule.scope : String(rule.scope ?? "").split(",")).map((s) => s.trim()).filter(Boolean);

/** The style VS Code gives `scope`: the longest matching rule scope wins, a later rule wins ties. */
export function resolveScope(tokenColors, scope) {
  let best = null, bestLen = -1;
  for (const rule of tokenColors ?? []) {
    for (const s of scopesOf(rule)) {
      if ((scope === s || scope.startsWith(`${s}.`)) && s.length >= bestLen) {
        best = rule.settings ?? {};
        bestLen = s.length;
      }
    }
  }
  if (!best) return null;
  const style = {};
  if (best.foreground) style.color = best.foreground;
  const fs = best.fontStyle ?? "";
  if (fs.includes("italic")) style.italic = true;
  if (fs.includes("bold")) style.bold = true;
  return style;
}

export const KIND_SCOPES = {
  comment: "comment", string: "string", quote: "punctuation.definition.string", number: "constant.numeric",
  keyword: "keyword.control", storage: "storage.type", funcKw: "storage.type.function",
  arrow: "storage.type.function.arrow", modifier: "storage.modifier", constant: "constant.language",
  this: "variable.language.this.js", function: "entity.name.function", param: "variable.parameter",
  support: "support.class", type: "meta.type.annotation", punct: "keyword.operator",
  tplPunct: "punctuation.definition.template-expression", tag: "entity.name.tag", tagp: "punctuation.definition.tag",
  attr: "entity.other.attribute-name", entity: "constant.character", jsonKey: "support.type.property-name.json",
  jsonArray: "punctuation.definition.array.begin.json", yamlKey: "entity.name.tag.yaml", cssValue: "meta.property-value",
  heading: "entity.name.section.markdown", mdPunct: "punctuation.definition.heading.markdown",
  mdLang: "fenced_code.block.language", mdQuote: "markup.quote.markdown", mdList: "markup.list.unnumbered.markdown",
  mdNum: "markup.list.numbered.markdown", link: "markup.underline.link.markdown", bold: "markup.bold.markdown",
  italic: "markup.italic.markdown",
};

export function toSyntaxPalette(vs) {
  const theme = toHerdrTheme(vs);
  const kinds = {};
  for (const [kind, scope] of Object.entries(KIND_SCOPES)) {
    const style = resolveScope(vs.tokenColors, scope);
    if (!style) continue;
    if (style.color) style.color = flatten(style.color, theme.background);
    kinds[kind] = style;
  }
  const git = {};
  for (const [mark, [key, fallback]] of Object.entries(GIT_COLORS)) {
    git[mark] = flatten(vs.colors?.[`gitDecoration.${key}`] ?? fallback, theme.background).toLowerCase();
  }
  return { theme: { background: theme.background, foreground: theme.foreground }, kinds, git };
}

// The tree's letters → VS Code's gitDecoration keys, with Cursor's dark defaults.
const GIT_COLORS = {
  U: ["untrackedResourceForeground", "#73c991"],
  A: ["addedResourceForeground", "#81b88b"],
  M: ["modifiedResourceForeground", "#e2c08d"],
  D: ["deletedResourceForeground", "#c74e39"],
  "!": ["conflictingResourceForeground", "#e4676b"],
};
