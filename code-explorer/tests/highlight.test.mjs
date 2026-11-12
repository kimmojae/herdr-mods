import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { highlight } from "../mods/code-explorer/lib/highlight.js";

const gauge = await readFile(new URL("./fixtures/Gauge.tsx", import.meta.url), "utf8");
const lines = highlight(gauge, "Gauge.tsx");
const kindOf = (lineText, token) => {
  const i = gauge.split("\n").findIndex((l) => l.includes(lineText));
  return lines[i].find(([, s]) => s.trim() === token)?.[0];
};

test("an arrow function assigned to const is a function", () => {
  assert.equal(kindOf("const isReading", "isReading"), "function");
});

test("arrow parameters are params and their annotations are types", () => {
  assert.equal(kindOf("const isReading", "data"), "param");
  assert.equal(kindOf("const isReading", "unknown"), "type");
});

test("a destructured parameter's annotation is a type", () => {
  assert.equal(kindOf("export function Gauge", "GaugeProps"), "type");
  assert.equal(kindOf("export function Gauge", "part"), "param");
});

test("strings keep their quotes as separate tokens", () => {
  const i = gauge.split("\n").findIndex((l) => l.includes('"object"'));
  const at = lines[i].findIndex(([, s]) => s === "object");
  assert.deepEqual(lines[i].slice(at - 1, at + 2).map(([k]) => k), ["quote", "string", "quote"]);
});

const samples = {
  "a.tsx": gauge,
  "a.json": '{\n  "a": [1, true, null],\n  // c\n  "b": "x"\n}\n',
  "a.yaml": "key: value # c\nlist:\n  - one\n  - 'two'\nblock: |\n  text\n",
  "a.css": ".a:hover { color: #fff; margin: 0 4px; }\n/* c */\n",
  "a.md": "# Title\n\n- item `code`\n```js\nconst x = 1\n```\n[link](./a.md)\n",
  "a.py": 'def f(self, a=1):\n    """doc\n    more"""\n    return print(a)  # c\n',
  "a.sh": 'echo "$HOME" # c\nif [ -f x ]; then\n  cat <<EOF\nEOF\nfi\n',
  "회의 메모 \"v2\".md": "한글 *강조* 문서\n",
};

test("every line's text survives highlighting unchanged", () => {
  for (const [name, text] of Object.entries(samples)) {
    const out = highlight(text, name);
    assert.equal(out.length, text.split("\n").length, name);
    assert.equal(out.map((l) => l.map(([, s]) => s).join("")).join("\n"), text, name);
  }
});

// Golden output for each language family; a rewrite of a lexer must reproduce it token for token.
test("each language's tokens match the recorded snapshot", async () => {
  const dir = new URL("./fixtures/highlight/", import.meta.url);
  const expected = JSON.parse(await readFile(new URL("expected.json", dir), "utf8"));
  for (const [name, tokens] of Object.entries(expected)) {
    assert.deepEqual(highlight(await readFile(new URL(name, dir), "utf8"), name), tokens, name);
  }
});

// kind of the first token whose text is `token`, in the highlighted `text`
const kindIn = (text, path, token) => highlight(text, path).flat().find(([, s]) => s.trim() === token)?.[0];

test("Go colours builtin types, declared type names and parameter types", () => {
  const go = "type User struct { ID int64 }\nfunc Get(name string, u *User) (string, error) { return \"\", nil }\n";
  for (const t of ["int64", "string", "error"]) assert.equal(kindIn(go, "a.go", t), "type", t);
  assert.equal(kindIn("type User struct {}", "a.go", "User"), "type");
  assert.equal(kindIn("func f(u *User) {}", "a.go", "User"), "type");
});

test("Rust colours types, lifetimes and macros", () => {
  const rs = "pub struct User<'a> { name: &'a str, age: u32 }\nfn main() { let m: HashMap<String, i32> = HashMap::new(); println!(\"{}\", 'c'); }\n";
  for (const t of ["User", "str", "u32", "HashMap", "String", "i32"]) assert.equal(kindIn(rs, "a.rs", t), "type", t);
  assert.equal(kindIn(rs, "a.rs", "'a"), "modifier");
  assert.equal(kindIn(rs, "a.rs", "println"), "function");
  assert.equal(kindIn(rs, "a.rs", "c"), "string");
});

test("Terraform: blocks, labels, attributes, functions, interpolation and comments", () => {
  const tf = [
    "# network",
    'resource "aws_instance" "web" {',
    '  ami           = lookup(var.amis, var.region)',
    '  tags          = { Name = "web-${var.env}" }',
    "  monitoring    = true",
    "  count         = 2",
    "}",
  ].join("\n");
  const lines = highlight(tf, "main.tf");
  assert.equal(lines.length, 7);
  assert.equal(kindIn(tf, "main.tf", "# network"), "comment");
  assert.equal(kindIn(tf, "main.tf", "resource"), "storage");
  assert.equal(kindIn(tf, "main.tf", "aws_instance"), "string");
  assert.equal(kindIn(tf, "main.tf", "ami"), "jsonKey");
  assert.equal(kindIn(tf, "main.tf", "lookup"), "function");
  assert.equal(kindIn(tf, "main.tf", "true"), "constant");
  assert.equal(kindIn(tf, "main.tf", "2"), "number");
  assert.equal(kindIn(tf, "main.tf", "${"), "tplPunct");
  assert.equal(kindIn("x = 1", "terraform.tfvars", "x"), "jsonKey");
});
