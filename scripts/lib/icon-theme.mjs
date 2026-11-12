// A VS Code file icon theme as code-explorer's icons.json: every key lower-cased, every value
// the icon's path inside the mod (`icons/files/x.svg`, `icons/folders/x.svg`).

const target = (iconPath) => {
  const [kind, name] = iconPath.replace(/^\.\//, "").split("/").slice(-2);
  return `icons/${kind === "folders" ? "folders" : "files"}/${name}`;
};

/**
 * @param {object} theme  the parsed icon theme JSON
 * @param {{id: string, version: string}} source
 * @returns {{map: object, files: string[]}} files: icon paths to copy, as the theme writes them
 */
export function buildIconMap(theme, source) {
  const defs = theme.iconDefinitions ?? {};
  const files = new Set();
  const pathOf = (id) => {
    const p = defs[id]?.iconPath;
    if (!p) return null;
    files.add(p);
    return target(p);
  };
  const table = (obj) => {
    const out = {};
    for (const [key, id] of Object.entries(obj ?? {})) {
      const p = pathOf(id);
      if (p) out[key.toLowerCase()] = p;
    }
    return out;
  };
  const map = {
    source,
    file: pathOf(theme.file),
    folder: pathOf(theme.folder),
    names: table(theme.fileNames),
    exts: table(theme.fileExtensions),
    langs: table(theme.languageIds),
    folders: table(theme.folderNames),
  };
  return { map, files: [...files] };
}
