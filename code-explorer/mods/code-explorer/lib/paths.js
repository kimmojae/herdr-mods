// Path helpers for "/"-separated paths (macOS, Linux and remote machines).

export const baseName = (p) => p.slice(p.lastIndexOf("/") + 1);

export const parentOf = (p) => p.slice(0, p.lastIndexOf("/")) || "/";

/** The last extension, lower-cased; "" when the name has none ("Dockerfile"). */
export function extOf(name) {
  const base = baseName(name);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

/** `abs` relative to `root`: "" for the root itself, null when it is outside. */
export function relativeTo(root, abs) {
  if (abs === root) return "";
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return abs.startsWith(prefix) ? abs.slice(prefix.length) : null;
}

const IMAGES = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const MARKDOWN = new Set(["md", "markdown", "mdx"]);
const HTML = new Set(["html", "htm"]);

/** Which view shows a file: "image", "markdown", "html" or "code". */
export function viewerKind(name) {
  const ext = extOf(name);
  return IMAGES.has(ext) ? "image" : MARKDOWN.has(ext) ? "markdown" : HTML.has(ext) ? "html" : "code";
}
