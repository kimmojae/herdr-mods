// Where the panel opens: above the button, right edges lined up. The button's place is kept as
// its distance from the window's bottom-right corner, where the status row sits, so it holds
// when the window is resized and after a restart.
const GAP = 6, EDGE = 8;

// Before the pointer has ever crossed the button: the right end of a 28px status row (the
// button is 24px, 8px in from the block's right edge).
export const GUESS = { right: 8, bottom: 26 };

export function offsetsOf(bounds, view) {
  return { right: view.width - (bounds.x + bounds.width), bottom: view.height - bounds.y };
}

export function panelAt(offsets, view, height, width) {
  return {
    x: Math.max(EDGE, view.width - offsets.right - width),
    y: Math.max(EDGE, view.height - offsets.bottom - height - GAP),
  };
}
