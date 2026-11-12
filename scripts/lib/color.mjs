// Herdr theme files take opaque #rrggbb colours; VS Code themes often use #rgb and #rrggbbaa.

/** "#rgb" | "#rgba" | "#rrggbb" | "#rrggbbaa" → [r, g, b, a] with a in 0..1 */
function parse(color) {
  let hex = color.replace(/^#/, "").toLowerCase();
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
}

const hex2 = (v) => Math.round(v).toString(16).padStart(2, "0");

/** `fg` over `bg` at `alpha` (default: fg's own alpha), as #rrggbb. */
export function blend(fg, bg, alpha) {
  const [r, g, b, a] = parse(fg);
  const [R, G, B] = parse(bg);
  const k = alpha ?? a;
  return `#${hex2(r * k + R * (1 - k))}${hex2(g * k + G * (1 - k))}${hex2(b * k + B * (1 - k))}`;
}

/** A colour with its own alpha flattened onto `bg`. */
export const flatten = (color, bg) => blend(color, bg);
