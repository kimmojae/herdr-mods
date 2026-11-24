// The PR tag: parse `gh pr view --json …` output and decide when to ask again.

export const PR_ARGS = ["pr", "view", "--json", "number,state,isDraft,url,statusCheckRollup,reviewDecision,headRefOid"];

const BAD_CONCLUSION = new Set(["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]);
const BAD_STATE = new Set(["FAILURE", "ERROR"]);

/**
 * @param {{code:number, stdout:string}|null|undefined} result  an ExecResult
 * @returns {{number:number, url:string, kind:"failing"|"review"|"ok"|"merged"}|null}
 */
export function parsePr(result) {
  try {
    if (!result || result.code !== 0 || !String(result.stdout ?? "").trim()) return null;
    const pr = JSON.parse(result.stdout);
    if (!pr || typeof pr !== "object" || Array.isArray(pr)) return null;
    if (typeof pr.number !== "number" || typeof pr.url !== "string") return null;
    if (pr.state === "CLOSED") return null;
    const base = { number: pr.number, url: pr.url, ...(typeof pr.headRefOid === "string" && pr.headRefOid ? { head: pr.headRefOid } : {}) };
    if (pr.state === "MERGED") return { ...base, kind: "merged" };
    const rollup = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
    if (rollup.some((c) => c && (BAD_CONCLUSION.has(c.conclusion) || BAD_STATE.has(c.state)))) return { ...base, kind: "failing" };
    if (pr.reviewDecision === "REVIEW_REQUIRED" || pr.reviewDecision === "CHANGES_REQUESTED" || pr.isDraft === true) return { ...base, kind: "review" };
    return { ...base, kind: "ok" };
  } catch {
    return null;
  }
}

/**
 * What an ExecResult says about the PR: `{pr}` (a tag, or null: no PR / closed) is an
 * answer that replaces what was shown; `{failed: true}` (no gh, not signed in, network,
 * unreadable output) is no answer, so what was shown stays.
 * @param {{code:number, stdout:string, stderr?:string}|null|undefined} result
 * @returns {{pr: ReturnType<typeof parsePr>}|{failed: true}}
 */
export function prAnswer(result) {
  try {
    if (!result) return { failed: true };
    if (result.code === 0) {
      const text = String(result.stdout ?? "").trim();
      if (!text) return { failed: true };
      const pr = JSON.parse(text);
      if (!pr || typeof pr !== "object" || Array.isArray(pr)) return { failed: true };
      if (typeof pr.number !== "number" || typeof pr.url !== "string") return { failed: true };
      return { pr: parsePr(result) };
    }
    return /no pull requests? found/i.test(String(result.stderr ?? "")) ? { pr: null } : { failed: true };
  } catch {
    return { failed: true };
  }
}

/**
 * A merged PR shows only while the checkout's HEAD is the commit that was merged (the branch
 * was merged as it is); a long-lived branch's old merged PR shows nothing. Other kinds as is.
 * @param {{kind:string, head?:string}|null|undefined} pr
 * @param {string|null|undefined} headSha
 */
export function prShown(pr, headSha) {
  if (!pr) return null;
  if (pr.kind !== "merged") return pr;
  return pr.head && headSha && pr.head.toLowerCase() === String(headSha).toLowerCase() ? pr : null;
}

/** @param {{branch:string, at:number}|undefined} entry */
export function prDue(entry, branch, now) {
  return !entry || entry.branch !== branch || now - entry.at >= 60_000;
}
