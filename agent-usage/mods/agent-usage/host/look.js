// What the bar and the panel both draw: a provider's logo and a limit's bar, in the same
// colours, so a bar in the button and its row in the panel look alike.
import { div, image } from "gpui-kit";
import { DIR } from "../lib/name.js";
import { settings } from "herdr";
import { isLow, fillWidth, monoFont } from "../lib/format.js";

/** The terminal's font, read each render so a change in Settings shows at once. */
export const mono = () => monoFont(settings());

/** Each provider's mark as Herdr's own program table draws it (`icons/<provider>.svg` in the
 *  Herdr home), so it matches the tab bar, toasts and sidebars. */
export function logo(provider, size, t) {
  return image(`icons/${provider}.svg`).size(size).flex_none();
}

export const fillColor = (pct, t) => (isLow(pct) ? t.ansi3 : t.muted);

/** A bar `width` px wide filled to what's left. Unknown (no reading, reset passed): a faint
 *  track with no fill, so it never reads as 0% left. */
export function bar(pct, width, height, t) {
  const fill = fillWidth(pct, width);
  const track = div().w(width).h(height).flex_none().rounded(height).bg(t.border);
  return fill === null ? track.opacity(0.35) : track.child(div().h_full().w(fill).rounded(height).bg(fillColor(pct, t)));
}
