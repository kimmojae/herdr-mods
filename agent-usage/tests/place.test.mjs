import { test } from "node:test";
import assert from "node:assert/strict";
import { offsetsOf, panelAt, GUESS } from "../mods/agent-usage/lib/place.js";

const view = { width: 1600, height: 1000 };

test("offsetsOf keeps the button's place from the window's bottom-right corner", () => {
  assert.deepEqual(offsetsOf({ x: 1300, y: 970, width: 292, height: 24 }, view), { right: 8, bottom: 30 });
});

test("panelAt puts the panel above the button, right edges lined up", () => {
  assert.deepEqual(panelAt({ right: 8, bottom: 30 }, view, 308, 400), { x: 1192, y: 656 });
});

test("panelAt follows a resized window", () => {
  assert.deepEqual(panelAt({ right: 8, bottom: 30 }, { width: 1200, height: 800 }, 308, 400), { x: 792, y: 456 });
});

test("panelAt stays inside a window too small for it", () => {
  assert.deepEqual(panelAt({ right: 8, bottom: 30 }, { width: 300, height: 200 }, 308, 400), { x: 8, y: 8 });
});

test("the place is kept at zoom 1 and drawn, like the panel, at zoom times that", () => {
  assert.deepEqual(offsetsOf({ x: 1300, y: 985, width: 296, height: 12 }, view, 0.5), { right: 8, bottom: 30 });
  assert.deepEqual(offsetsOf({ x: 1000, y: 940, width: 584, height: 48 }, view, 2), { right: 8, bottom: 30 });
  assert.deepEqual(panelAt({ right: 8, bottom: 30 }, view, 300, 400, 0.5), { x: 1396, y: 829 });
  assert.deepEqual(panelAt({ right: 8, bottom: 30 }, view, 300, 400, 2), { x: 784, y: 334 });
});

test("before the button was ever seen, it is guessed at the status row's right end", () => {
  assert.deepEqual(GUESS, { right: 8, bottom: 26 });
});
