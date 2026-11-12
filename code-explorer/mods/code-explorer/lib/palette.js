// Token colours for the code view: the generated palette of the active theme (matched by its
// background), else one built from the theme's ANSI colours so any theme reads well.

// The generated palette of the theme showing now, found by its background.
const generatedFor = (t, palettes) => {
  const bg = String(t.background ?? "").toLowerCase();
  return palettes.find((p) => p.theme?.background?.toLowerCase() === bg);
};

/** @returns {Record<string, {color?: string, italic?: boolean, bold?: boolean}>} */
export const pickPalette = (t, palettes) => generatedFor(t, palettes)?.kinds ?? fallbackPalette(t);

/** Colours for the git letters U/A/M/D/!: the generated palette's (the theme's own), else ANSI ones. */
export const pickGit = (t, palettes) => generatedFor(t, palettes)?.git ?? { U: t.ansi2, A: t.ansi2, M: t.ansi3, D: t.ansi1, "!": t.ansi1 };

function fallbackPalette(t) {
  const c = (color, extra = {}) => ({ color, ...extra });
  return {
    comment: c(t.dim, { italic: true }), string: c(t.ansi2), quote: c(t.dim), number: c(t.ansi1),
    keyword: c(t.ansi5), storage: c(t.ansi5), funcKw: c(t.ansi6), arrow: c(t.ansi6), modifier: c(t.ansi5),
    constant: c(t.ansi1), this: c(t.ansi1, { italic: true }), function: c(t.ansi4), param: c(t.ansi3),
    support: c(t.ansi6), type: c(t.ansi3), punct: c(t.muted), tplPunct: c(t.muted), tag: c(t.ansi5),
    tagp: c(t.dim), attr: c(t.ansi4), entity: c(t.ansi1), jsonKey: c(t.ansi4), jsonArray: c(t.muted),
    yamlKey: c(t.ansi4), cssValue: c(t.ansi2), heading: c(t.ansi4, { bold: true }), mdPunct: c(t.dim),
    mdLang: c(t.ansi3), mdQuote: c(t.dim, { italic: true }), mdList: c(t.ansi3), mdNum: c(t.ansi3),
    link: c(t.ansi4), bold: { bold: true }, italic: { italic: true },
  };
}
