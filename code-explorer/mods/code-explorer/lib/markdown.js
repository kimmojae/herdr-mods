// Markdown preview helpers: links resolved against the file's folder, and standalone local
// images split out so the viewer can draw them through its cache.
import { viewerKind } from "./paths.js";

/** A link or image source as an absolute path; null for web links, other schemes and anchors. */
export function resolveLink(folder, link) {
  const target = String(link ?? "").trim();
  if (!target || target.startsWith("#")) return null;
  // URL does the `.`/`..` walking; the folder is encoded part by part so `#`, `?` and spaces in
  // folder names stay names.
  const base = `file://${folder.split("/").map(encodeURIComponent).join("/")}/`;
  let url;
  try { url = new URL(target, base); } catch { return null; }
  if (url.protocol !== "file:") return null;
  try { return decodeURIComponent(url.pathname); } catch { return url.pathname; }
}

// `![alt](src)`, `![alt](<src with spaces>)` or `![alt](src "title")` alone on a line.
function imageOnLine(line) {
  const s = line.trim();
  const close = s.indexOf("](");
  if (!s.startsWith("![") || !s.endsWith(")") || close < 0) return null;
  const inside = s.slice(close + 2, -1).trim();
  const src = inside.startsWith("<") ? inside.slice(1, inside.indexOf(">")) : inside.split(/\s+/)[0];
  return src ? { alt: s.slice(2, close), src } : null;
}

// A code fence marker: up to three spaces, then three or more of ` or ~.
function fenceOn(line) {
  const indent = line.length - line.trimStart().length;
  const char = line.trimStart()[0];
  if (indent > 3 || (char !== "`" && char !== "~")) return null;
  let size = 0;
  while (line[indent + size] === char) size++;
  return size >= 3 ? { char, size, rest: line.slice(indent + size).trim() } : null;
}

/** @returns {({type: "text", text: string} | {type: "image", alt: string, path: string})[]} */
export function markdownBlocks(text, folder) {
  let source = String(text ?? "");
  // Front matter reads as one run-on paragraph in Markdown: show it as YAML instead.
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (front) source = ["```yaml", front[1], "```", source.slice(front[0].length)].join("\n");

  const blocks = [];
  let run = [], open = null;
  const endRun = () => {
    if (run.some((l) => l.trim())) blocks.push({ type: "text", text: run.join("\n") });
    run = [];
  };
  for (const line of source.split("\n")) {
    const fence = fenceOn(line);
    if (open) {
      // Only the same character, at least as long, with nothing after it, closes a fence.
      if (fence && fence.char === open.char && fence.size >= open.size && !fence.rest) open = null;
    } else if (fence) {
      open = fence;
    } else {
      const image = imageOnLine(line);
      const path = image && resolveLink(folder, image.src);
      if (path && viewerKind(path) === "image") {
        endRun();
        blocks.push({ type: "image", alt: image.alt, path });
        continue;
      }
    }
    run.push(line);
  }
  endRun();
  return blocks;
}
