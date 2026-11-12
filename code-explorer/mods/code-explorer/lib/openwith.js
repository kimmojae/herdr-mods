// What a file can be opened in: the installed editors (the default one marked) and, for HTML,
// the browsers (the macOS default one marked). Each has its own button and list.
import { extOf } from "./paths.js";

const WEB = new Set(["html", "htm"]);
export const isWeb = (name) => WEB.has(extOf(name));

/** @typedef {{id: string, name: string, path: string}} App */

/** @returns {(App & {detail: string})[]} */
export const editorChoices = (editors, defaultEditor) =>
  editors.map((a) => ({ ...a, detail: a.id === defaultEditor?.id ? "✓ default" : "" }));

/** @returns {(App & {detail: string})[]} */
export const browserChoices = (browsers, systemDefault) =>
  browsers.map((a) => ({ ...a, detail: a.id === systemDefault?.id ? "macOS default" : "" }));
