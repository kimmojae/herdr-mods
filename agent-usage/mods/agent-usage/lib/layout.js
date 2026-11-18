// The block the button sits in, sized to the button so the status beside it gets the rest of
// the row (its hint stays centred under the window).
export const SIDE = 8; // the block's padding either side of the button

export function ownBlock(node, mod) {
  if (!node || typeof node !== "object") return null;
  if (node.root) return ownBlock(node.root, mod);
  if (node.content?.mod === mod) return node;
  for (const c of node.children ?? []) {
    const found = ownBlock(c, mod);
    if (found) return found;
  }
  return null;
}

// The px the block wants for a button this wide; null when it has it already (or no width yet).
// The button's width is measured on screen, after zoom; a layout's px are at zoom 1.
export function fitWidth(block, buttonWidth, zoom = 1) {
  if (!buttonWidth) return null;
  const px = Math.ceil(buttonWidth / (zoom > 0 ? zoom : 1)) + 2 * SIDE;
  return block?.size?.px === px ? null : px;
}
