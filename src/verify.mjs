// `agentlang-spec verify --task <slug> --solution <path> [--lang <lang>]
// [--timeout <seconds>]` — stage a candidate solution into a scratch
// copy of the corpus task and run its verify.sh against the named
// language. Streams verify.sh's stdout and stderr to the caller and
// exits with verify.sh's exit code (124 on timeout, matching the
// harness's verify.py).
//
// The language is inferred from the solution file's extension when
// `--lang` is omitted: `.zero` → zero, `.ts` → ts, `.rs` → rust,
// `.go` → go, `.py` → python. The task's spec.json `languages` array
// must include the resolved language.
//
// Corpus resolution matches `list` and `emit`:
//   1. AGENTLANG_CORPUS_DIR env var
//   2. ./corpus relative to cwd

import { spawn } from "node:child_process";
import { cp, mkdtemp, copyFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveCorpusDir } from "./list.mjs";

const REF_FILENAMES = {
  zero: "ref.zero",
  ts: "ref.ts",
  rust: "ref.rs",
  go: "ref.go",
  python: "ref.py",
};

const EXTENSION_TO_LANG = {
  ".zero": "zero",
  ".ts": "ts",
  ".rs": "rust",
  ".go": "go",
  ".py": "python",
};

const KNOWN_LANGS = Object.keys(REF_FILENAMES);

const DEFAULT_TIMEOUT_S = 60;

export function inferLangFromPath(solutionPath) {
  const ext = path.extname(solutionPath).toLowerCase();
  return EXTENSION_TO_LANG[ext];
}

export function parseVerifyArgs(args) {
  let task;
  let solution;
  let lang;
  let timeoutS = DEFAULT_TIMEOUT_S;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--task") {
      task = args[++i];
    } else if (a === "--solution") {
      solution = args[++i];
    } else if (a === "--lang") {
      lang = args[++i];
    } else if (a === "--timeout") {
      timeoutS = Number.parseFloat(args[++i]);
    } else if (a.startsWith("--task=")) {
      task = a.slice("--task=".length);
    } else if (a.startsWith("--solution=")) {
      solution = a.slice("--solution=".length);
    } else if (a.startsWith("--lang=")) {
      lang = a.slice("--lang=".length);
    } else if (a.startsWith("--timeout=")) {
      timeoutS = Number.parseFloat(a.slice("--timeout=".length));
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  if (!task) throw new Error("--task <slug> is required");
  if (!solution) throw new Error("--solution <path> is required");
  if (!lang) {
    const guessed = inferLangFromPath(solution);
    if (!guessed) {
      throw new Error(
        `cannot infer --lang from solution path '${solution}'. ` +
          `Pass --lang explicitly. Known: ${KNOWN_LANGS.join(", ")}`
      );
    }
    lang = guessed;
  }
  if (!KNOWN_LANGS.includes(lang)) {
    throw new Error(
      `unknown --lang '${lang}'. known: ${KNOWN_LANGS.join(", ")}`
    );
  }
  if (!Number.isFinite(timeoutS) || timeoutS <= 0) {
    throw new Error("--timeout must be a positive number of seconds");
  }
  return { task, solution, lang, timeoutS };
}

async function loadTaskSpec(taskDir) {
  const specPath = path.join(taskDir, "spec.json");
  let raw;
  try {
    raw = await readFile(specPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`task spec not found: ${specPath}`);
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in ${specPath}: ${err.message}`);
  }
}

async function ensureFile(filePath, label) {
  let info;
  try {
    info = await stat(filePath);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`${label} not found: ${filePath}`);
    }
    throw err;
  }
  if (!info.isFile()) {
    throw new Error(`${label} is not a regular file: ${filePath}`);
  }
}

function runVerifierProcess(scratchDir, lang, timeoutS, { stdout, stderr }) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const child = spawn("bash", ["verify.sh", "--lang", lang], {
      cwd: scratchDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutS * 1000);
    child.stdout.on("data", (chunk) => stdout.write(chunk));
    child.stderr.on("data", (chunk) => stderr.write(chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const wallMs = Number((process.hrtime.bigint() - started) / 1000000n);
      if (timedOut) {
        stderr.write(
          `\nagentlang-spec verify: timeout after ${timeoutS}s\n`
        );
        resolve({ exitCode: 124, wallMs, timedOut: true });
        return;
      }
      if (signal) {
        resolve({ exitCode: 128, wallMs, signal });
        return;
      }
      resolve({ exitCode: code ?? 0, wallMs });
    });
  });
}

export async function runVerify(
  args,
  {
    env = process.env,
    cwd = process.cwd(),
    stdout = process.stdout,
    stderr = process.stderr,
  } = {}
) {
  const { task, solution, lang, timeoutS } = parseVerifyArgs(args);
  const corpusDir = resolveCorpusDir(env, cwd);
  const taskDir = path.join(corpusDir, task);
  let taskInfo;
  try {
    taskInfo = await stat(taskDir);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`task not found in corpus: ${taskDir}`);
    }
    throw err;
  }
  if (!taskInfo.isDirectory()) {
    throw new Error(`task path is not a directory: ${taskDir}`);
  }
  const spec = await loadTaskSpec(taskDir);
  if (Array.isArray(spec.languages) && !spec.languages.includes(lang)) {
    throw new Error(
      `task '${task}' does not declare support for lang '${lang}'. ` +
        `spec.json languages: ${spec.languages.join(", ")}`
    );
  }
  const solutionAbs = path.resolve(cwd, solution);
  await ensureFile(solutionAbs, "solution");
  await ensureFile(path.join(taskDir, "verify.sh"), "task verify.sh");

  const scratchDir = await mkdtemp(path.join(tmpdir(), "agentlang-verify-"));
  try {
    await cp(taskDir, scratchDir, { recursive: true });
    const refName = REF_FILENAMES[lang];
    await copyFile(solutionAbs, path.join(scratchDir, refName));
    const result = await runVerifierProcess(scratchDir, lang, timeoutS, {
      stdout,
      stderr,
    });
    return result;
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}
