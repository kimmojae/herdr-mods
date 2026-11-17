// Find in the viewer, as Cursor's find widget does it: Aa (match case), ab (whole word), .*
// (regular expression), matches line by line, the current one apart.

export const MAX_MATCHES = 9999;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every match of `query` in `items` (one string per line; null for a row with no text).
 * @returns {{matches: {item: number, start: number, end: number}[], error: string|null, capped: boolean}}
 */
export function findMatches(items, query, { caseSensitive = false, wholeWord = false, regex = false } = {}) {
  const none = { matches: [], error: null, capped: false };
  if (!query) return none;
  let source = regex ? query : escape(query);
  // Letters and digits of any script count as word characters, so 마이 isn't a word in 마이그레이션.
  if (wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  let re;
  // `u` only where \p needs it: it rejects escapes like \- that people type in Cursor's .* field.
  try { re = new RegExp(source, `g${wholeWord ? "u" : ""}${caseSensitive ? "" : "i"}`); }
  catch (e) { return { ...none, error: e.message }; }
  const matches = [];
  for (let item = 0; item < items.length; item++) {
    const text = items[item];
    if (!text) continue;
    re.lastIndex = 0;
    for (let m; (m = re.exec(text));) {
      if (!m[0].length) { re.lastIndex++; continue; }
      matches.push({ item, start: m.index, end: m.index + m[0].length });
      if (matches.length >= MAX_MATCHES) return { matches, error: null, capped: true };
    }
  }
  return { matches, error: null, capped: false };
}

/**
 * Highlighted runs ([kind, text, mark?]) split at `ranges` ([start, end, current], in order); a run
 * inside one gets a fourth element, "match" or "current". Empty runs go.
 */
export function markFound(runs, ranges) {
  if (!ranges.length) return runs;
  const out = [];
  let at = 0;
  for (const run of runs) {
    const [kind, text, mark] = run;
    let from = 0;
    const push = (to, find) => {
      if (to <= from) return;
      const piece = text.slice(from, to);
      out.push(find ? [kind, piece, mark, find] : run.length > 2 ? [kind, piece, mark] : [kind, piece]);
      from = to;
    };
    for (const [start, end, current] of ranges) {
      if (end <= at + from || start >= at + text.length) continue;
      push(Math.max(0, start - at));
      push(Math.min(text.length, end - at), current ? "current" : "match");
    }
    push(text.length);
    at += text.length;
  }
  return out;
}

/** The match after (step 1) or before (step -1) `index`, wrapping around; -1 when there are none. */
export const nextIndex = (index, count, step) => (count ? (((index < 0 && step > 0 ? -1 : index) + step) % count + count) % count : -1);
