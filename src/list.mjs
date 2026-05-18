// `agentlang-spec list` — walk the corpus directory, read each task's
// spec.json, and print one line per task:
//
//   <slug>  <summary>  langs=<comma-list>  cases=<count>
//
// The summary is the spec's `title` (terse one-liner). The languages
// list comes from spec.json's `languages` array. The case count totals
// the JSON files under tests/public + tests/hidden.
//
// Resolution order for the corpus directory:
//   1. AGENTLANG_CORPUS_DIR env var
//   2. ./corpus relative to cwd
//
// Exits 0 when at least one task was emitted, 1 otherwise (or on error).

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export function resolveCorpusDir(env, cwd) {
  if (env.AGENTLANG_CORPUS_DIR && env.AGENTLANG_CORPUS_DIR.length > 0) {
    return path.resolve(env.AGENTLANG_CORPUS_DIR);
  }
  return path.resolve(cwd, "corpus");
}

async function listTaskDirs(corpusDir) {
  let entries;
  try {
    entries = await readdir(corpusDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`corpus directory not found: ${corpusDir}`);
    }
    throw err;
  }
  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    slugs.push(entry.name);
  }
  slugs.sort();
  return slugs;
}

async function countCases(taskDir) {
  let total = 0;
  for (const sub of ["public", "hidden"]) {
    const dir = path.join(taskDir, "tests", sub);
    try {
      const entries = await readdir(dir);
      for (const name of entries) {
        if (name.endsWith(".json")) total += 1;
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  return total;
}

export async function loadTaskRecord(taskDir) {
  const specPath = path.join(taskDir, "spec.json");
  let raw;
  try {
    raw = await readFile(specPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in ${specPath}: ${err.message}`);
  }
  const slug = spec.slug || path.basename(taskDir);
  const summary = spec.title || "(no title)";
  const langs = Array.isArray(spec.languages) ? spec.languages : [];
  const cases = await countCases(taskDir);
  return { slug, summary, langs, cases };
}

export async function collectTasks(corpusDir) {
  const slugs = await listTaskDirs(corpusDir);
  const tasks = [];
  for (const slug of slugs) {
    const taskDir = path.join(corpusDir, slug);
    let info;
    try {
      info = await stat(taskDir);
    } catch {
      continue;
    }
    if (!info.isDirectory()) continue;
    const rec = await loadTaskRecord(taskDir);
    if (rec) tasks.push(rec);
  }
  return tasks;
}

export function formatTaskLine(rec) {
  const langs = rec.langs.length > 0 ? rec.langs.join(",") : "(none)";
  return `${rec.slug}  ${rec.summary}  langs=${langs}  cases=${rec.cases}`;
}

export async function runList(_args, { env = process.env, cwd = process.cwd(), stdout = process.stdout } = {}) {
  const corpusDir = resolveCorpusDir(env, cwd);
  const tasks = await collectTasks(corpusDir);
  if (tasks.length === 0) {
    process.stderr.write(`agentlang-spec list: no tasks found under ${corpusDir}\n`);
    process.exit(1);
  }
  for (const rec of tasks) {
    stdout.write(formatTaskLine(rec) + "\n");
  }
}
