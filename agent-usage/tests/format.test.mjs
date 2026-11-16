import { test } from "node:test";
import assert from "node:assert/strict";
import { left, isLow, resetText, cutMiddle, fillWidth, ageText, panelHeight, monoFont } from "../mods/agent-usage/lib/format.js";

const now = new Date(2026, 10, 13, 18, 6, 0);
const nowS = now / 1000;

test("left is 100 minus used, rounded, clamped 0..100", () => {
  assert.equal(left({ used: 41.4, resetsAt: nowS + 60 }, nowS), 59);
  assert.equal(left({ used: 130, resetsAt: nowS + 60 }, nowS), 0);
});

test("left is null when the window is missing or its reset has passed", () => {
  assert.equal(left(null, nowS), null);
  assert.equal(left({ used: 10, resetsAt: nowS - 1 }, nowS), null);
});

test("isLow under 30 left", () => {
  assert.equal(isLow(29), true);
  assert.equal(isLow(30), false);
  assert.equal(isLow(null), false);
});

test("5h reset is a countdown", () => {
  assert.equal(resetText("h5", { used: 1, resetsAt: nowS + 114 * 60 }, now), "1h54m");
  assert.equal(resetText("h5", { used: 1, resetsAt: nowS + 38 * 60 }, now), "38m");
});

test("7d reset is day and time", () => {
  assert.equal(resetText("d7", { used: 1, resetsAt: new Date(2026, 10, 15, 8, 0) / 1000 }, now), "Sun 8:00am");
  assert.equal(resetText("d7", { used: 1, resetsAt: new Date(2026, 10, 17, 21, 30) / 1000 }, now), "Tue 9:30pm");
});

test("a passed or missing reset reads —", () => {
  assert.equal(resetText("d7", null, now), "—");
  assert.equal(resetText("h5", { used: 1, resetsAt: nowS - 5 }, now), "—");
});

test("cutMiddle keeps both ends", () => {
  assert.equal(cutMiddle("info@ironycombined.com", 18), "info@iron…ined.com");
  assert.equal(cutMiddle("acme-cloud", 18), "acme-cloud");
});

test("fillWidth is null for an unknown window, so it can't look like 0% left", () => {
  assert.equal(fillWidth(null, 30), null);
  assert.equal(fillWidth(0, 30), 0);
  assert.equal(fillWidth(50, 30), 15);
});

test("ageText says how old a reading is", () => {
  const t = new Date(2026, 10, 13, 18, 0).getTime();
  assert.equal(ageText(t, t + 20_000), "just now");
  assert.equal(ageText(t, t + 12 * 60_000), "12 min ago");
  assert.equal(ageText(t, t + 3 * 3600_000), "3 h ago");
  assert.equal(ageText(t, t + 2 * 86400_000), "2 d ago");
  assert.equal(ageText(null, t), null);
});

// A popup is drawn as tall as its content, so the height it is placed by must be exactly that.
test("panelHeight is the panel's content height, an error line only under a failed account", () => {
  const ok = {}, failed = { error: "No reply" };
  // top pad · per account: padding, header, two rows, its line under it · footer · border
  assert.equal(panelHeight([ok]), 5 + (20 + 24 + 2 * 22 + 1) + 34 + 2);
  assert.equal(panelHeight([ok, failed]) - panelHeight([ok, ok]), 18);
  assert.equal(panelHeight([]), 5 + 40 + 34 + 2);
});

test("monoFont is the terminal font from Herdr's settings, Menlo when none is set", () => {
  assert.equal(monoFont({ font: "Caskoding" }), "Caskoding");
  assert.equal(monoFont({ font: "" }), "Menlo");
  assert.equal(monoFont({}), "Menlo");
  assert.equal(monoFont(null), "Menlo");
});
