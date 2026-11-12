// The code view's highlighter. It carries state across lines (block comments, template strings,
// JSX) and names tokens after the TextMate scopes a theme colours. highlight(text, path) returns
// one array of [kind, text] per line; lib/palette.js maps kinds to colours.

const words = (s) => new Set(s.split(" ").filter(Boolean));

const JS = {
  line: ["//"], block: true, quotes: "\"'", backtick: "template", regex: true,
  kw: words("import export from as default return if else for while do switch case break continue throw try catch finally await yield with debugger async satisfies"),
  storage: words("const let var class interface type enum namespace module"),
  func: words("function"),
  mod: words("static public private protected readonly abstract declare override extends implements"),
  ops: words("new typeof instanceof in of delete void keyof infer is"),
  consts: words("true false null undefined NaN Infinity"),
  support: words("document window navigator location localStorage sessionStorage history console Promise Object Array Date Map Set WeakMap WeakSet Error TypeError RangeError Symbol RegExp Number String Boolean BigInt Proxy Reflect Intl"),
};
const LANGS = {
  js: { ...JS, jsThis: true, jsClass: true },
  jsx: { ...JS, jsThis: true, jsClass: true, jsx: true },
  ts: { ...JS, ts: true },
  tsx: { ...JS, ts: true, jsx: true },
  py: {
    line: ["#"], quotes: "\"'", triple: true, selfParam: true, callsPlain: true,
    kw: words("import from as return if elif else for while break continue pass raise try except finally with yield await async global nonlocal assert del match case"),
    storage: words("class"), func: words("def lambda"), mod: words(""), ops: words("and or not in is"),
    consts: words("True False None"), support: words(""),
    builtins: words("print len range str int float bool list dict set tuple open isinstance issubclass enumerate zip map filter sorted reversed super type min max sum abs any all iter next getattr setattr hasattr repr format input id hash vars dir round"),
  },
  go: {
    line: ["//"], block: true, quotes: "\"'", backtick: "raw",
    kw: words("package import return if else for range switch case default break continue go defer select fallthrough goto"),
    storage: words("var const type struct interface map chan"), func: words("func"), mod: words(""), ops: words(""),
    consts: words("true false nil iota"), support: words(""),
    types: words("string bool byte rune error any int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 complex64 complex128"),
  },
  rust: {
    line: ["//"], block: true, quotes: "\"",
    kw: words("use mod pub crate return if else for while loop match break continue in as where unsafe async await move ref dyn impl trait extern super"),
    storage: words("let mut const static struct enum type"), func: words("fn"), mod: words(""), ops: words(""),
    consts: words("true false None Some Ok Err self Self"), support: words(""),
    types: words("u8 u16 u32 u64 u128 usize i8 i16 i32 i64 i128 isize f32 f64 bool char str"), capsTypes: true,
  },
  c: {
    line: ["//"], block: true, quotes: "\"'",
    kw: words("import package return if else for while do switch case default break continue throw throws try catch finally new using namespace include define when is in as guard defer yield await async"),
    storage: words("class struct enum interface union typedef var val let const fun func auto int long short char float double bool boolean void unsigned signed object record"),
    func: words("fun func"), mod: words("public private protected internal static final abstract override virtual sealed open readonly extern inline volatile mutating"),
    ops: words("instanceof sizeof typeof"), consts: words("true false null nil NULL nullptr this self super"), support: words(""),
  },
  ruby: {
    line: ["#"], quotes: "\"'", kw: words("require require_relative return if elsif else unless until while for in do end begin rescue ensure raise yield case when then module"),
    storage: words("class"), func: words("def"), mod: words("private public protected attr_reader attr_writer attr_accessor"), ops: words("and or not"),
    consts: words("true false nil self"), support: words(""), callsPlain: true,
  },
  php: {
    line: ["//", "#"], block: true, quotes: "\"'", kw: words("namespace use return if elseif else foreach for while do switch case break continue throw try catch finally echo require require_once include new as"),
    storage: words("class interface trait enum const var"), func: words("function fn"), mod: words("public private protected static abstract final readonly"), ops: words("instanceof and or not"),
    consts: words("true false null TRUE FALSE NULL"), support: words(""),
  },
  sh: {
    line: ["#"], quotes: "\"'", callsPlain: true,
    kw: words("if then else elif fi for while until do done case esac in return exit local export function source select break continue"),
    storage: words(""), func: words(""), mod: words(""), ops: words(""), consts: words("true false"), support: words(""),
  },
  lua: {
    line: ["--"], quotes: "\"'", kw: words("return if then elseif else end for while do repeat until break in goto"),
    storage: words("local"), func: words("function"), mod: words(""), ops: words("and or not"), consts: words("true false nil self"), support: words(""),
  },
  sql: {
    line: ["--"], block: true, quotes: "'\"", nocase: true, callsPlain: true,
    kw: words("select from where and or not insert into values update set delete create table alter drop index view join left right inner outer full on as group by order having limit offset union all distinct case when then else end is like in between exists primary key foreign references default unique check constraint begin commit rollback with returning if replace"),
    storage: words(""), func: words(""), mod: words(""), ops: words(""), consts: words("true false null"), support: words(""),
  },
  toml: {
    line: ["#"], quotes: "\"'", triple: true, kw: words(""), storage: words(""), func: words(""), mod: words(""), ops: words(""),
    consts: words("true false"), support: words(""), callsPlain: true,
  },
};

// File extension → language family.
const EXT = Object.fromEntries(Object.entries({
  js: "js mjs cjs", jsx: "jsx", ts: "ts mts cts", tsx: "tsx", py: "py pyi", go: "go", rust: "rs",
  c: "c h cc cpp hpp cxx cs java kt kts swift dart scala groovy gradle m mm",
  ruby: "rb rake", php: "php", sh: "sh bash zsh fish ksh", lua: "lua", sql: "sql", toml: "toml",
  hcl: "tf tfvars hcl", json: "json jsonc json5 jsonl webmanifest", yaml: "yaml yml", css: "css", scss: "scss sass less",
  markdown: "md mdx markdown", markup: "html htm xml svg vue svelte plist xhtml",
}).flatMap(([fam, exts]) => exts.split(" ").map((ext) => [ext, fam])));

export function family(path) {
  const name = path.split("/").pop().toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile.") || name.endsWith(".dockerfile")) return "dockerfile";
  if (name === "makefile" || name === "gnumakefile" || name.endsWith(".mk")) return "sh";
  if (name.startsWith(".env") || name.endsWith(".env")) return "sh";
  if ([".zshrc", ".bashrc", ".profile", ".zprofile", ".bash_profile"].includes(name)) return "sh";
  if ([".babelrc", ".eslintrc", ".prettierrc"].includes(name)) return "json";
  const ext = name.includes(".") ? name.split(".").pop() : "";
  return EXT[ext] ?? "plain";
}

// Token stream → rows: split at newlines and merge neighbours of one kind (fewer spans per row).
function toLines(tokens) {
  const rows = [[]];
  for (const [kind, text] of tokens) {
    text.split("\n").forEach((piece, n) => {
      if (n > 0) rows.push([]);
      if (!piece) return;
      const row = rows.at(-1), tail = row.at(-1);
      if (tail?.[0] === kind) tail[1] += piece;
      else row.push([kind, piece]);
    });
  }
  return rows;
}

// The small lexers below are rule lists: at each position the first rule whose sticky regex
// matches wins; its action is a token kind or a function (match, out, state, end). Nothing
// matching emits one plain character.
function scan(text, rules, out = [], state = {}) {
  let at = 0;
  while (at < text.length) {
    const list = typeof rules === "function" ? rules(state) : rules;
    let moved = false;
    for (const [re, act] of list) {
      re.lastIndex = at;
      const m = re.exec(text);
      if (!m?.[0]) continue;
      if (typeof act === "string") out.push([act, m[0]]);
      else act(m, out, state, re.lastIndex);
      at = re.lastIndex;
      moved = true;
      break;
    }
    if (!moved) out.push(["plain", text[at++]]);
  }
  return out;
}

// A quoted string as quote, body, quote (the closing quote only when it is there).
function quoted(out, s) {
  const q = s[0], closed = s.length > 1 && s.endsWith(q);
  out.push(["quote", q], ["string", s.slice(1, closed ? -1 : undefined)]);
  if (closed) out.push(["quote", q]);
}

const WS = /[ \t\r\n]+/y;
const WORD = /[A-Za-z_$][\w$]*/y;
const NUM = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)[nLlUuFf]?/y;
const OP = /=>|\?\.|\.\.\.|::|->|[=!]==?|[<>]=?|&&=?|\|\|=?|\?\?=?|[-+*/%&|^]=?|\+\+|--|[~!?:;,.@#\\]/y;
const EXPR_AFTER = /^(?:[([{,;=:?!&|+\-*/%<>~^]+|=>|return|case|yield|await|default|else|do|in|of|typeof|void|new|throw|\$\{|&&|\|\|)$/;

function lexCode(text, cfg) {
  const out = [];
  const stack = [];
  const n = text.length;
  let i = 0;
  let prev = null;
  let prev2 = null;
  let annot = null;
  let pending = null;
  let closedParams = false;

  const emit = (k, s) => { if (s) out.push([k, s]); };
  const sig = (k, s) => { emit(k, s); prev2 = prev; prev = { k, s }; if (annot) annot.fresh = false; };
  const top = () => stack[stack.length - 1];
  const match = (re) => { re.lastIndex = i; const m = re.exec(text); return m ? m[0] : null; };
  const after = (from) => { let j = from; while (j < n && (text[j] === " " || text[j] === "\t")) j++; return j; };
  const exprPos = () => !prev || prev.k === "keyword" || (prev.k !== "plain" && EXPR_AFTER.test(prev.s) && prev.s !== ")");

  const quoted = (q, len = 1, multi = false) => {
    const close = q.repeat(len);
    let j = i + len;
    while (j < n && !text.startsWith(close, j) && (multi || text[j] !== "\n")) j += text[j] === "\\" ? 2 : 1;
    const closed = text.startsWith(close, j);
    emit("quote", close);
    emit("string", text.slice(i + len, Math.min(j, n)));
    if (closed) emit("quote", close);
    prev2 = prev;
    prev = { k: "string", s: q };
    if (annot) annot.fresh = false;
    i = closed ? j + len : j;
  };

  // Whether the parenthesis at `from` closes onto an arrow: `(a, b) =>` or `(a): T =>`.
  const arrowAfterParens = (from) => {
    let depth = 0;
    let j = from;
    for (; j < n && j - from < 3000; j++) {
      const c = text[j];
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) break;
      else if (c === "\"" || c === "'" || c === "`") {
        const q = c;
        for (j++; j < n && text[j] !== q && text[j] !== "\n"; j++) if (text[j] === "\\") j++;
      }
    }
    if (depth !== 0) return false;
    let k = j + 1;
    while (k < n && /\s/.test(text[k])) k++;
    if (text.startsWith("=>", k)) return true;
    if (!cfg.ts || text[k] !== ":") return false;
    const rest = text.slice(k, k + 300);
    const arrow = rest.indexOf("=>");
    const stop = rest.search(/[;{\n]/);
    return arrow >= 0 && (stop < 0 || arrow < stop);
  };

  // `const name = (…) =>`, `= async`, `= function`, `= x =>`: the name is a function's.
  const namesFunction = (end) => {
    let j = after(end);
    if (text[j] !== "=" || text[j + 1] === "=" || text[j + 1] === ">") return false;
    j = after(j + 1);
    if (text.startsWith("async", j)) j = after(j + 5);
    if (text.startsWith("function", j)) return true;
    if (text[j] === "(") return arrowAfterParens(j);
    const w = /[A-Za-z_$][\w$]*/y;
    w.lastIndex = j;
    const m = w.exec(text);
    return Boolean(m) && text.startsWith("=>", after(j + m[0].length));
  };

  // `(` at `from` opens parameters when it follows a function's name or keyword, or when an
  // arrow follows its `)`.
  const opensParams = (from) => {
    if (prev && (cfg.func.has(prev.s) || (prev.k === "function" && prev2 && cfg.func.has(prev2.s)))) return true;
    if (cfg.backtick === "template" && arrowAfterParens(from)) return true;
    let depth = 0;
    let j = from;
    for (; j < n && j - i < 3000; j++) {
      const c = text[j];
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) break;
      else if (c === "\"" || c === "'" || c === "`") {
        const q = c;
        for (j++; j < n && text[j] !== q && text[j] !== "\n"; j++) if (text[j] === "\\") j++;
      }
    }
    if (depth !== 0) return false;
    let k = j + 1;
    while (k < n && /\s/.test(text[k])) k++;
    if (text.startsWith("=>", k)) return true;
    if (cfg.ts && text[k] === ":") {
      const rest = text.slice(k, k + 300);
      const arrow = rest.indexOf("=>");
      const stop = rest.search(/[;{\n]/);
      if (arrow >= 0 && (stop < 0 || arrow < stop)) return true;
      if (prev?.k === "function" && rest.search(/\{/) >= 0) return true;
    }
    return prev?.k === "function" && text[k] === "{" && stack.some((s) => s.t === "{");
  };

  const classify = (w) => {
    const key = cfg.nocase ? w.toLowerCase() : w;
    if (annot) return cfg.ops.has(w) ? "punct" : "type";
    if (cfg.kw.has(key)) return "keyword";
    if (cfg.storage.has(key)) return w === "class" && cfg.jsClass ? "modifier" : "storage";
    if (cfg.func.has(key)) return "funcKw";
    if (cfg.mod.has(key)) return "modifier";
    if (cfg.ops.has(key)) return "punct";
    if (cfg.consts.has(key)) return "constant";
    if (w === "this" && cfg.jsThis) return "this";
    if (w === "self" && cfg.selfParam) return "param";
    if (prev && cfg.func.has(prev.s) && prev.s !== "lambda") return "function";
    if (prev?.s === "new") return "plain";
    if (cfg.types?.has(w)) return "type";
    // Rust: CamelCase names are types; Go: the name after `type`, after `*`/`[]`, or after a parameter.
    if (cfg.capsTypes && /^[A-Z]/.test(w)) return "type";
    if (cfg === LANGS.go && (prev?.s === "type" || (/^[A-Z]/.test(w) && (prev?.s === "*" || prev?.s === "]")) || prev?.k === "param")) return "type";
    if (cfg === LANGS.rust && text[i + w.length] === "!" && text[i + w.length + 1] !== "=") return "function";
    if (cfg.backtick === "template" && prev && ["const", "let", "var"].includes(prev.s) && namesFunction(i + w.length)) return "function";
    const j = after(i + w.length);
    if (text[j] === "(") {
      if (cfg.builtins?.has(w)) return "function";
      return cfg.callsPlain ? "plain" : "function";
    }
    if (text.startsWith("=>", j) && cfg.backtick === "template") return "param";
    const t = top();
    const afterOpen = prev && (prev.s === "(" || prev.s === "," || prev.s === "..." || prev.s === "{" || prev.s === "[");
    if (afterOpen && (t?.params || (t?.inParams && t.t !== "("))) return "param";
    if (cfg.support.has(w)) return "support";
    return "plain";
  };

  const startAnnot = (nl) => { annot = { depth: stack.length, nl, fresh: true }; };

  while (i < n) {
    const t = top();

    if (t?.t === "tpl") {
      let j = i;
      while (j < n && text[j] !== "`" && !text.startsWith("${", j)) j += text[j] === "\\" ? 2 : 1;
      emit("string", text.slice(i, Math.min(j, n)));
      if (j >= n) { i = n; break; }
      if (text[j] === "`") { emit("quote", "`"); stack.pop(); prev = { k: "string", s: "`" }; i = j + 1; }
      else { emit("tplPunct", "${"); stack.push({ t: "tplx" }); prev = { k: "punct", s: "${" }; i = j + 2; }
      continue;
    }

    if (t?.t === "tag") {
      const ws = match(WS);
      if (ws) { emit("plain", ws); i += ws.length; continue; }
      if (text.startsWith("/>", i)) { emit("tagp", "/>"); stack.pop(); prev = { k: "plain", s: ">" }; i += 2; continue; }
      if (text[i] === ">") {
        emit("tagp", ">");
        stack.pop();
        if (t.closing) { if (top()?.t === "kids") stack.pop(); prev = { k: "plain", s: ">" }; }
        else stack.push({ t: "kids" });
        i++;
        continue;
      }
      if (text[i] === "{") { emit("plain", "{"); stack.push({ t: "jsxx" }); prev = { k: "punct", s: "{" }; i++; continue; }
      if (text[i] === "\"" || text[i] === "'") { quoted(text[i]); continue; }
      if (text[i] === "=") { emit("punct", "="); i++; continue; }
      const name = match(/[\w$.:-]+/y);
      if (name) { emit(t.named ? "attr" : "tag", name); t.named = true; i += name.length; continue; }
      emit("plain", text[i]);
      i++;
      continue;
    }

    if (t?.t === "kids") {
      let j = i;
      while (j < n && text[j] !== "<" && text[j] !== "{") j++;
      emit("plain", text.slice(i, j));
      i = j;
      if (i >= n) break;
      if (text[i] === "{") { emit("plain", "{"); stack.push({ t: "jsxx" }); prev = { k: "punct", s: "{" }; i++; }
      else if (text[i + 1] === "/") { emit("tagp", "</"); stack.push({ t: "tag", closing: true }); i += 2; }
      else { emit("tagp", "<"); stack.push({ t: "tag", closing: false }); i++; }
      continue;
    }

    const c = text[i];
    const ws = match(WS);
    if (ws) {
      emit("plain", ws);
      i += ws.length;
      if (annot?.nl && ws.includes("\n") && stack.length === annot.depth) annot = null;
      continue;
    }
    const lineMark = cfg.line.find((m) => text.startsWith(m, i));
    if (lineMark && !(lineMark === "#" && cfg === LANGS.sh && text[i - 1] === "$")) {
      const end = text.indexOf("\n", i);
      emit("comment", text.slice(i, end < 0 ? n : end));
      i = end < 0 ? n : end;
      continue;
    }
    if (cfg.block && text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      emit("comment", text.slice(i, stop));
      i = stop;
      continue;
    }
    if (cfg.triple && (text.startsWith("\"\"\"", i) || text.startsWith("'''", i))) { quoted(c, 3, true); continue; }
    if (cfg === LANGS.rust && c === "'") {
      // 'a is a lifetime, 'x' a char.
      const life = /^'[A-Za-z_]\w*(?!')/.test(text.slice(i, i + 40)) && match(/'[A-Za-z_]\w*/y);
      if (life) { sig("modifier", life); i += life.length; }
      else quoted(c);
      continue;
    }
    if (cfg.quotes.includes(c)) { quoted(c); continue; }
    if (c === "`" && cfg.backtick === "template") { emit("quote", "`"); stack.push({ t: "tpl" }); i++; continue; }
    if (c === "`" && cfg.backtick === "raw") { quoted("`", 1, true); continue; }
    if (cfg.regex && c === "/" && exprPos()) {
      const m = /\/(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\\\n[])+\/[a-z]*/y;
      m.lastIndex = i;
      const r = m.exec(text);
      if (r) { emit("quote", "/"); emit("string", r[0].slice(1, r[0].lastIndexOf("/"))); emit("quote", r[0].slice(r[0].lastIndexOf("/"))); prev = { k: "string", s: "/" }; i += r[0].length; continue; }
    }
    if (cfg.jsx && c === "<" && exprPos() && /[A-Za-z>]/.test(text[i + 1] ?? "")) {
      emit("tagp", "<");
      stack.push({ t: "tag", closing: false });
      i++;
      continue;
    }
    if (/\d/.test(c) || (c === "." && /\d/.test(text[i + 1] ?? ""))) {
      const num = match(NUM);
      if (num) { sig(annot ? "type" : "number", num); i += num.length; continue; }
    }
    if (c === "@" && /[A-Za-z_]/.test(text[i + 1] ?? "") && (cfg.ts || cfg === LANGS.py || cfg.jsClass)) {
      WORD.lastIndex = i + 1;
      const w = WORD.exec(text)[0];
      sig("function", `@${w}`);
      i += w.length + 1;
      continue;
    }
    if (cfg === LANGS.sh && c === "$") {
      const v = match(/\$(?:\{[^}\n]*\}?|\([^)\n]*\)?|[\w@#?*!$-]+)/y);
      if (v) { sig("plain", v); i += v.length; continue; }
    }
    const w = match(WORD);
    if (w) {
      const kind = classify(w);
      if (cfg.ts && w === "type" && kind === "storage") pending = "type";
      else if (cfg.ts && w === "interface") pending = "interface";
      else if (pending === "type" && kind !== "punct") pending = "typeName";
      sig(kind, w);
      i += w.length;
      continue;
    }

    const op = match(OP) ?? ("([{)]}".includes(c) ? c : null);
    if (!op) { emit("plain", c); i++; continue; }
    const params = op === "(" && !annot && opensParams(i);
    i += op.length;
    if ("([{".includes(op)) {
      if (annot && stack.length === annot.depth && op === "{" && !annot.fresh) annot = null;
      const entry = { t: op };
      if (op === "(") entry.params = params;
      // Destructured parameters: `({ a, b }) =>`, `([x, y]) =>`.
      if (op !== "(" && !annot && (t?.params || t?.inParams) && prev && (prev.s === "(" || prev.s === "," || prev.s === "{" || prev.s === "[")) entry.inParams = true;
      if (op === "{") {
        entry.typeBody = pending === "interface" || Boolean(annot?.fresh);
        if (pending === "interface") pending = null;
      }
      sig(op === "{" && t?.t === "jsxx" ? "plain" : "punct", op);
      stack.push(entry);
      closedParams = false;
      continue;
    }
    if (")]}".includes(op)) {
      if (op === "}" && (t?.t === "tplx" || t?.t === "jsxx")) {
        stack.pop();
        emit(t.t === "tplx" ? "tplPunct" : "plain", "}");
        prev = { k: "punct", s: ")" };
        continue;
      }
      const closed = stack.pop();
      if (annot && stack.length < annot.depth) annot = null;
      closedParams = op === ")" && Boolean(closed?.params);
      sig("punct", op);
      prev = { k: closed?.inParams ? "param" : "punct", s: ")" };
      continue;
    }
    if (op === "." || op === "?." || op === "::" || op === "->") { emit("plain", op); prev2 = prev; prev = { k: "plain", s: op }; continue; }
    if (op === "=>") { annot = null; sig("arrow", op); continue; }
    if (cfg.ts && op === ":" && !annot) {
      const top_ = top();
      if ((top_?.params && prev && (prev.k === "param" || prev.s === "?")) || (top_?.typeBody && prev && prev.k !== "string") || (closedParams && prev?.s === ")")
        || ((!top_ || top_.t === "{") && prev2 && ["const", "let", "var"].includes(prev2.s))) {
        sig("punct", op);
        startAnnot(Boolean(top_?.typeBody));
        continue;
      }
    }
    if (annot && stack.length === annot.depth && [",", ";", "="].includes(op)) annot = null;
    if (op === "=" && pending === "typeName") { pending = null; sig("punct", op); startAnnot(true); continue; }
    if (op === ";") pending = null;
    closedParams = false;
    sig("punct", op);
  }
  return out;
}

const JSON_RULES = [
  [/\s+/y, "plain"],
  [/\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y, "comment"],
  [/"(?:[^"\\\n]|\\.)*"?/y, (m, out, _s, end, text = m.input) => {
    // A string followed by `:` is a key.
    const next = text.slice(end).trimStart()[0];
    const s = m[0], closed = s.length > 1 && s.endsWith("\"");
    out.push(["quote", "\""], [next === ":" ? "jsonKey" : "string", s.slice(1, closed ? -1 : undefined)]);
    if (closed) out.push(["quote", "\""]);
  }],
  [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, "number"],
  [/(?:true|false|null)\b/y, "constant"],
  [/[[\]]/y, "jsonArray"],
  [/[{}:,]/y, "punct"],
];
const lexJson = (text) => toLines(scan(text, JSON_RULES));

// YAML is read a line at a time: `key:` prefixes, then flow values, and `|`/`>` blocks whose
// deeper-indented lines are all string.
const YAML_SCALAR_NUMBER = /^[-+]?(?:\d[\d_]*(?:\.\d*)?(?:[eE][-+]?\d+)?|0x[\da-f]+|\.inf|\.nan)$/i;
const YAML_SCALAR_CONST = /^(?:true|false|yes|no|on|off|null|~)$/i;
const YAML_VALUE = [
  [/\s+/y, "plain"],
  [/#.*/y, "comment"],
  [/"(?:[^"\\]|\\.)*"?|'(?:[^']|'')*'?/y, (m, out) => quoted(out, m[0])],
  [/[&*][^\s,[\]{}]+|![^\s]*/y, "plain"],
  [/[[\]{},]|[|>][-+\d]*/y, "punct"],
  [/[^\s,[\]{}#][^,[\]{}#]*?(?=\s+#|\s*[,[\]{}]|\s*$)/y, (m, out) => {
    const t = m[0].trim();
    out.push([YAML_SCALAR_NUMBER.test(t) ? "number" : YAML_SCALAR_CONST.test(t) ? "constant" : "string", m[0]]);
  }],
];
const YAML_KEY = new RegExp(`^(\\s*)((?:-\\s+)*)(${[
  String.raw`"(?:[^"\\]|\\.)*"`, // "double"
  String.raw`'[^']*'`, // 'single'
  String.raw`[^\s#'"{}[\],&*!|>-][^#]*?`, // bare
  String.raw`-[^\s#][^#]*?`, // bare, starting with a dash that isn't a list item
].join("|")})(\\s*:)(?=\\s|$)`);
function lexYaml(text) {
  let blockAt = -1;
  return text.split("\n").map((line) => {
    const indent = line.length - line.replace(/^ +/, "").length;
    if (blockAt >= 0 && (!line.trim() || indent > blockAt)) return line ? [["string", line]] : [];
    blockAt = -1;
    if (line.trimStart().startsWith("#")) return [["comment", line]];
    const out = [];
    if (/^(?:---|\.\.\.)(?:\s|$)/.test(line)) {
      out.push(["punct", line.slice(0, 3)]);
      return toLines(scan(line.slice(3), YAML_VALUE, out))[0];
    }
    let rest = line;
    const key = YAML_KEY.exec(line), items = !key && /^(\s*)((?:-\s+)+)/.exec(line);
    if (key) out.push(["plain", key[1]], ["punct", key[2]], ["yamlKey", key[3]], ["punct", key[4]]);
    else if (items) out.push(["plain", items[1]], ["punct", items[2]]);
    if (key || items) rest = line.slice((key || items)[0].length);
    scan(rest, YAML_VALUE, out);
    if (/^\s*[|>][-+\d]*\s*(?:#.*)?$/.test(rest)) blockAt = indent;
    return toLines(out)[0] ?? [];
  });
}

// CSS tracks whether it is inside a block and inside a property's value.
const PSEUDO = /^::?(?:hover|focus|active|before|after|not|is|where|has|first|last|nth|root|checked|disabled|visited|placeholder|selection|global)/;
function cssRules(scss) {
  return [
    [/\s+/y, "plain"],
    [scss ? /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*/y : /\/\*[\s\S]*?(?:\*\/|$)/y, "comment"],
    [/"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/y, (m, out) => quoted(out, m[0])],
    [/@[\w-]+/y, "keyword"],
    [/#[\da-fA-F]{3,8}\b|#[\w-]+/y, (m, out, s) => out.push([s.value ? "number" : "attr", m[0]])],
    [/-?(?:\d+\.?\d*|\.\d+)[a-zA-Z%]*/y, "number"],
    [/\$[\w-]+|--[\w-]+/y, "plain"],
    [/!important/y, "type"],
    [/\.[\w-]+|::?[\w-]+/y, (m, out, s) => {
      // `prop:value` written without a space reads as a pseudo-class; inside a block it isn't one.
      if (m[0][0] === ":" && s.depth > 0 && !s.value && !PSEUDO.test(m[0])) {
        s.value = true;
        out.push(["punct", ":"], ["cssValue", m[0].slice(1)]);
      } else out.push([s.value ? "cssValue" : "attr", m[0]]);
    }],
    [/[\w-]+(?=\s*\()/y, "function"],
    [/[\w-]+/y, (m, out, s, end) => {
      const property = s.depth > 0 && /^\s*:/.test(m.input.slice(end, end + 40));
      out.push([s.value ? "cssValue" : property ? "plain" : "tag", m[0]]);
    }],
    [/[{}]/y, (m, out, s) => { s.depth = Math.max(0, s.depth + (m[0] === "{" ? 1 : -1)); s.value = false; out.push(["punct", m[0]]); }],
    [/[:;,>+~&()*=[\]]/y, (m, out, s) => {
      if (m[0] === ":" && s.depth > 0) s.value = true;
      if (m[0] === ";") s.value = false;
      out.push(["punct", m[0]]);
    }],
  ];
}
const CSS = cssRules(false), SCSS = cssRules(true);
const lexCss = (text, scss) => toLines(scan(text, scss ? SCSS : CSS, [], { depth: 0, value: false }));

// HTML/XML: text and tags outside, attributes inside a tag.
const MARKUP_TEXT = [
  [/<!--[\s\S]*?(?:-->|$)/y, "comment"],
  [/<!\[CDATA\[[\s\S]*?(?:\]\]>|$)/y, "string"],
  [/<[!?][^>]*>?/y, "tagp"],
  [/(<\/?)([\w:.-]+)/y, (m, out, s) => { out.push(["tagp", m[1]], ["tag", m[2]]); s.tag = true; }],
  [/&[#\w]+;/y, "entity"],
  [/[^<&]+/y, "plain"],
];
const MARKUP_TAG = [
  [/\/?>/y, (m, out, s) => { out.push(["tagp", m[0]]); s.tag = false; }],
  [/"[^"]*"?|'[^']*'?/y, (m, out) => quoted(out, m[0])],
  [/[\w:@.#-]+/y, "attr"],
  [/=/y, "punct"],
  [/\s+/y, "plain"],
];
const lexMarkup = (text) => toLines(scan(text, (s) => (s.tag ? MARKUP_TAG : MARKUP_TEXT), [], { tag: false }));

function mdInline(s, out) {
  const re = /(`[^`]*`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(!?\[)([^\]]*)(\])(\()([^)\s]*)([^)]*)(\))|(<https?:[^>]+>|https?:\/\/[^\s)]+)|([^`*_[<h!]+|[\s\S])/y;
  for (let m; re.lastIndex < s.length && (m = re.exec(s));) {
    if (m[1]) out.push(["plain", m[1]]);
    else if (m[2]) out.push(["bold", m[2]]);
    else if (m[3]) out.push(["italic", m[3]]);
    else if (m[4]) out.push(["punct", m[4]], ["string", m[5]], ["punct", m[6]], ["link", m[7]], ["link", m[8]], ["link", m[9]], ["link", m[10]]);
    else if (m[11]) out.push(["link", m[11]]);
    else out.push(["plain", m[0]]);
  }
}
function lexMarkdown(text) {
  let fence = null;
  return text.split("\n").map((line) => {
    const f = /^(\s{0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (f && f[2][0] === fence[0] && f[2].length >= fence.length && !f[3].trim()) { fence = null; return [["plain", f[1]], ["mdPunct", f[2]]]; }
      return line ? [["plain", line]] : [];
    }
    if (f) { fence = f[2]; return toLines([["plain", f[1]], ["mdPunct", f[2]], ["mdLang", f[3]]])[0]; }
    const out = [];
    const h = /^(\s{0,3})(#{1,6})(\s+.*|$)/.exec(line);
    if (h) return toLines([["plain", h[1]], ["mdPunct", h[2]], ["heading", h[3]]])[0];
    if (/^\s*>/.test(line)) return [["mdQuote", line]];
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return [["mdPunct", line]];
    const list = /^(\s*)([-*+]|\d+[.)])(\s+)/.exec(line);
    let rest = line;
    if (list) { out.push(["plain", list[1]], [/\d/.test(list[2]) ? "mdNum" : "mdList", list[2]], ["plain", list[3]]); rest = line.slice(list[0].length); }
    mdInline(rest, out);
    return toLines(out)[0] ?? [];
  });
}

// HCL (Terraform): blocks and their labels, `key =` attributes, calls, strings with ${…}.
function hclString(m, out) {
  const s = m[0], closed = s.length > 1 && s.endsWith("\"");
  out.push(["quote", "\""]);
  for (const part of s.slice(1, closed ? -1 : undefined).split(/(\$\{[^}]*\}?)/)) {
    if (!part) continue;
    if (!part.startsWith("${")) { out.push(["string", part]); continue; }
    const shut = part.endsWith("}");
    out.push(["tplPunct", "${"], ["plain", part.slice(2, shut ? -1 : undefined)]);
    if (shut) out.push(["tplPunct", "}"]);
  }
  if (closed) out.push(["quote", "\""]);
}
const HCL = [
  [/\s+/y, "plain"],
  [/#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y, "comment"],
  [/<<-?(\w+)\n[\s\S]*?\n\s*\1(?=\n|$)/y, "string"],
  [/"(?:[^"\\\n]|\\.)*"?/y, hclString],
  [/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, "number"],
  [/(?:true|false|null)\b/y, "constant"],
  [/(?:for|in|if|else)\b(?!\s*=)/y, "keyword"],
  [/[A-Za-z_][\w-]*(?=\s*=(?!=))/y, "jsonKey"],
  [/[A-Za-z_][\w-]*(?=\s*\()/y, "function"],
  [/[A-Za-z_][\w-]*(?=(?:\s+"[^"\n]*")*\s*\{)/y, "storage"],
  [/[A-Za-z_][\w-]*/y, "plain"],
  [/[{}[\](),.:?=<>!+\-*\/%&|]/y, "punct"],
];
const lexHcl = (text) => toLines(scan(text, HCL));

// A Dockerfile line: an all-caps instruction, then shell.
function lexDockerfile(text) {
  return text.split("\n").map((line) => {
    if (line.trimStart().startsWith("#")) return [["comment", line]];
    const lead = line.slice(0, line.length - line.trimStart().length);
    const word = line.slice(lead.length).split(/\s/, 1)[0];
    if (!/^[A-Z]+$/.test(word)) return toLines(lexCode(line, LANGS.sh))[0] ?? [];
    return toLines([["plain", lead], ["keyword", word], ...lexCode(line.slice(lead.length + word.length), LANGS.sh)])[0] ?? [];
  });
}

const plainLines = (text) => text.split("\n").map((l) => (l ? [["plain", l]] : []));
const LEXERS = {
  json: lexJson, yaml: lexYaml, css: (t) => lexCss(t, false), scss: (t) => lexCss(t, true),
  markup: lexMarkup, markdown: lexMarkdown, dockerfile: lexDockerfile, hcl: lexHcl, plain: plainLines,
};

/** One array of [kind, text] per line of `text`, for the file at `path`. */
export function highlight(text, path) {
  const fam = family(path);
  return LEXERS[fam] ? LEXERS[fam](text) : toLines(lexCode(text, LANGS[fam]));
}
