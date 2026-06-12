// `agentlang-spec emit --task <slug> --lang <lang> [--format prompt]` —
// render the language-specific prompt for a task. Reads
// `<corpus>/<slug>/prompt.md`, substitutes the `{language_scaffold}`
// placeholder with the per-language scaffold block, and writes the
// result to stdout.
//
// The scaffold strings live in `<corpus>/scaffolds.json`, shipped by
// the corpus itself (agentlang-index keeps the canonical copy at
// `corpus/scaffolds.json`). The harness and this CLI both read that
// file, so neither carries its own copy of the strings.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveCorpusDir } from "./list.mjs";

const KNOWN_FORMATS = ["prompt"];

export async function loadScaffolds(corpusDir) {
  const scaffoldsPath = path.join(corpusDir, "scaffolds.json");
  let raw;
  try {
    raw = await readFile(scaffoldsPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `scaffolds file not found: ${scaffoldsPath} — the corpus must ` +
          "ship a scaffolds.json (agentlang-index keeps it at corpus/scaffolds.json)"
      );
    }
    throw err;
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error(`malformed scaffolds file (invalid JSON): ${scaffoldsPath}`);
  }
  const scaffolds = doc?.scaffolds;
  if (scaffolds === null || typeof scaffolds !== "object" || Array.isArray(scaffolds)) {
    throw new Error(
      `malformed scaffolds file (no 'scaffolds' map): ${scaffoldsPath}`
    );
  }
  return scaffolds;
}

export function scaffoldFor(scaffolds, lang) {
  const block = scaffolds[lang];
  if (typeof block !== "string") {
    throw new Error(
      `unknown --lang '${lang}'. known: ${Object.keys(scaffolds).join(", ")}`
    );
  }
  return block;
}

export function renderUserPrompt(template, lang, scaffolds) {
  return template.replaceAll("{language_scaffold}", scaffoldFor(scaffolds, lang));
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
  const scaffolds = await loadScaffolds(corpusDir);
  const template = await loadPromptTemplate(corpusDir, task);
  const rendered = renderUserPrompt(template, lang, scaffolds);
  stdout.write(rendered);
}
