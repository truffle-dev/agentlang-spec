// `agentlang-spec emit --task <slug> --lang <lang> [--format prompt]` —
// render the language-specific prompt for a task. Reads
// `<corpus>/<slug>/prompt.md`, substitutes the `{language_scaffold}`
// placeholder with the per-language scaffold block, and writes the
// result to stdout.
//
// The scaffold strings below are the canonical source-of-truth for
// how the AgentLang Index frames a task to a model. They duplicate
// the strings in agentlang-index's harness/src/agentlang_harness/
// prompt.py (`_SCAFFOLDS` map). Keep both in sync until a shared
// `corpus/scaffolds.json` lands; the harness will then read this CLI
// instead of carrying its own copy.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveCorpusDir } from "./list.mjs";

export const SCAFFOLDS = {
  zero:
    "Write a single Zero 0.1.2 source file named `ref.zero`. Define " +
    "`pub fun main(world: World) -> Void raises`. Use `world.out.write` " +
    "for stdout and `world.err.write` for stderr. Zero 0.1.2's direct " +
    "ELF64 backend exposes no stdin capability; if the task requires " +
    "input, read it from `std.args.get(1)` instead. Fixed-array element " +
    "types are restricted to i32, u32, and u8; emulate larger integer " +
    "memos with parallel u32 arrays. Return only the source inside a " +
    "single ```zero fenced code block.",
  ts:
    "Write a single TypeScript source file named `ref.ts`. Read from " +
    "`process.stdin` if the task requires input and write the answer " +
    "to `process.stdout`. Keep type annotations minimal so the same " +
    "source runs under tsx, bun, or plain node. Return only the source " +
    "inside a single ```ts fenced code block.",
  rust:
    "Write a single Rust source file named `ref.rs` that compiles with " +
    "`rustc ref.rs -o prog` (no Cargo manifest used at runtime). Read " +
    "from `std::io::stdin` if input is required and write to " +
    "`std::io::stdout`. Prefer `print!` over `println!` when the spec " +
    "is byte-exact. Return only the source inside a single ```rust " +
    "fenced code block.",
  go:
    "Write a single Go source file named `ref.go` in `package main`. " +
    "Read stdin via `bufio.NewReader(os.Stdin)` if input is required. " +
    "Use `fmt.Print` (not `fmt.Println`) when the spec is byte-exact. " +
    "The harness runs `go run ref.go`. Return only the source inside " +
    "a single ```go fenced code block.",
  python:
    "Write a single Python 3.12 source file named `ref.py`. Use " +
    "`sys.stdin.read()` or `input()` for input and `sys.stdout.write` " +
    "for output (not `print`) when the spec is byte-exact. The harness " +
    "runs `python3 ref.py`. Return only the source inside a single " +
    "```python fenced code block.",
};

const KNOWN_LANGS = Object.keys(SCAFFOLDS);
const KNOWN_FORMATS = ["prompt"];

export function scaffoldFor(lang) {
  const block = SCAFFOLDS[lang];
  if (block === undefined) {
    throw new Error(
      `unknown --lang '${lang}'. known: ${KNOWN_LANGS.join(", ")}`
    );
  }
  return block;
}

export function renderUserPrompt(template, lang) {
  return template.replaceAll("{language_scaffold}", scaffoldFor(lang));
}

export function parseEmitArgs(args) {
  let task;
  let lang;
  let format = "prompt";
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--task") {
      task = args[++i];
    } else if (a === "--lang") {
      lang = args[++i];
    } else if (a === "--format") {
      format = args[++i];
    } else if (a.startsWith("--task=")) {
      task = a.slice("--task=".length);
    } else if (a.startsWith("--lang=")) {
      lang = a.slice("--lang=".length);
    } else if (a.startsWith("--format=")) {
      format = a.slice("--format=".length);
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  if (!task) throw new Error("--task <slug> is required");
  if (!lang) throw new Error("--lang <language> is required");
  if (!KNOWN_FORMATS.includes(format)) {
    throw new Error(
      `unknown --format '${format}'. known: ${KNOWN_FORMATS.join(", ")}`
    );
  }
  return { task, lang, format };
}

export async function loadPromptTemplate(corpusDir, slug) {
  const promptPath = path.join(corpusDir, slug, "prompt.md");
  try {
    return await readFile(promptPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`prompt not found: ${promptPath}`);
    }
    throw err;
  }
}

export async function runEmit(
  args,
  { env = process.env, cwd = process.cwd(), stdout = process.stdout } = {}
) {
  const { task, lang } = parseEmitArgs(args);
  const corpusDir = resolveCorpusDir(env, cwd);
  const template = await loadPromptTemplate(corpusDir, task);
  const rendered = renderUserPrompt(template, lang);
  stdout.write(rendered);
}
