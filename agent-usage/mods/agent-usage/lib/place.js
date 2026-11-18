// Where the panel opens: above the button, right edges lined up. The button's place is kept as
// its distance from the window's bottom-right corner, where the status row sits, so it holds
// when the window is resized and after a restart.
const GAP = 6, EDGE = 8;

// Before the pointer has ever crossed the button: the right end of a 28px status row (the
// button is 24px, 8px in from the block's right edge).
export const GUESS = { right: 8, bottom: 26 };

// The pointer, the button and the window are measured on screen, after zoom; the place is kept
// at zoom 1, like the popup's width and height, so it holds when the zoom changes.
const scale = (zoom) => (zoom > 0 ? zoom : 1);

export function offsetsOf(bounds, view, zoom = 1) {
  const z = scale(zoom);
  return { right: (view.width - (bounds.x + bounds.width)) / z, bottom: (view.height - bounds.y) / z };
}

export function panelAt(offsets, view, height, width, zoom = 1) {
  const z = scale(zoom);
  return {
    x: Math.max(EDGE, view.width - (offsets.right + width) * z),
    y: Math.max(EDGE, view.height - (offsets.bottom + height) * z - GAP),
  };
}
