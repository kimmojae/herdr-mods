// What the bar and the panel print: what's left of a limit and when it resets.
// A window is { used: 0..100, resetsAt: epoch seconds }.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Percent left, 0..100; null when there is no window or its reset has passed. */
export function left(w, nowS) {
  if (!w || w.resetsAt <= nowS) return null;
  return Math.max(0, Math.min(100, Math.round(100 - w.used)));
}

/** Under 30% left. */
export const isLow = (pct) => pct !== null && pct < 30;

/** 5h: a countdown ("1h54m", "38m"). 7d: day and time ("Sun 8:00am"). "—" when unknown. */
export function resetText(kind, w, now) {
  const nowS = now / 1000;
  if (!w || w.resetsAt <= nowS) return "—";
  if (kind === "h5") {
    const m = Math.round((w.resetsAt - nowS) / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
  }
  const d = new Date(w.resetsAt * 1000);
  const h = d.getHours();
  return `${DAYS[d.getDay()]} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/** A bar's fill in px; null when the window is unknown, so it is drawn apart from 0% left. */
export const fillWidth = (pct, width) => (pct === null ? null : Math.round((width * pct) / 100));

/** How old a reading is: "just now", "12 min ago", "3 h ago", "2 d ago"; null when never read. */
export function ageText(at, now) {
  if (!at) return null;
  const m = Math.floor((now - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

// The panel's rows, in px. A popup can't grow once open, so its height is fixed from the number
// of accounts, with an error line kept for each: a failure during the open poll can't push the
// footer out.
export const PANEL = { EDGE: 5, ACCOUNT_PAD: 20, HEAD: 24, ROW: 22, LINE: 1, ERR: 18, FOOT: 34, EMPTY: 40 };

// The panel's content height (a popup is drawn as tall as its content): an error line only
// under a failed account.
export function panelHeight(readings) {
  const { EDGE, ACCOUNT_PAD, HEAD, ROW, LINE, ERR, FOOT, EMPTY } = PANEL;
  const accounts = readings.reduce((h, r) => h + ACCOUNT_PAD + HEAD + 2 * ROW + LINE + (r.error ? ERR : 0), 0);
  return EDGE + (readings.length ? accounts : EMPTY) + FOOT + 2;
}

/** Long labels keep both ends: "info@iron…ined.com". */
export function cutMiddle(s, max) {
  if (s.length <= max) return s;
  const room = max - 1;
  return `${s.slice(0, Math.ceil(room / 2))}…${s.slice(s.length - Math.floor(room / 2))}`;
}

// The terminal's font (Herdr's `font` setting), so the numbers line up like the terminal's.
export function monoFont(settings) {
  const font = settings?.font;
  return typeof font === "string" && font ? font : "Menlo";
}
