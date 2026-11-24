// The tag at a checkout row's right: its PR. (Git's state is drawn as the terminal's symbols
// right after the name: lib/gitstatus.js.)

const PR = {
  ok: ["✓", "done"],
  failing: ["checks", "blocked"],
  review: ["review", "accent"],
  merged: ["merged", "ansi5"],
};

/**
 * @param {{git:import("./tree.js").Git|null|undefined, pr?:{number:number, kind:string}|null}} a
 * @returns {{text:string, tone:"dim"|"done"|"blocked"|"accent"|"ansi5", kind?:"pr"}[]}
 */
export function tail({ git, pr }) {
  const out = [];
  if (!git) return out;
  const tag = pr && PR[pr.kind];
  if (tag) out.push({ text: `#${pr.number} ${tag[0]}`, tone: tag[1], kind: "pr" });
  return out;
}
