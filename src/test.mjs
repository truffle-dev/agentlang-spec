// Unit tests for the `list` verb. Run with `npm test` (node --test).
// We build a temp corpus tree for each scenario so the tests don't
// depend on the real harness checkout being present.
//
// node:test is a Node.js builtin and is not implemented by bun's node
// compatibility wrapper. If you see this fail with a cryptic loader
// error, check that `node` resolves to real Node.js (>=20), not to a
// bun shim. Common shim locations: /usr/local/bun-node-fallback-bin/node.
if (globalThis.Bun || process.versions.bun) {
  console.error(
    "agentlang-spec tests require real Node.js (>=20). Detected bun at " +
      process.execPath +
      ". Re-run with a real Node.js binary on PATH."
  );
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resolveCorpusDir,
  collectTasks,
  formatTaskLine,
  loadTaskRecord,
} from "./list.mjs";
import {
  SCAFFOLDS,
  scaffoldFor,
  renderUserPrompt,
  parseEmitArgs,
  loadPromptTemplate,
  runEmit,
} from "./emit.mjs";

async function makeTempCorpus(layout) {
  const root = await mkdtemp(path.join(tmpdir(), "agentlang-spec-test-"));
  for (const [slug, spec] of Object.entries(layout.tasks ?? {})) {
    const taskDir = path.join(root, slug);
    await mkdir(taskDir, { recursive: true });
    if (spec.specJson !== null) {
      await writeFile(path.join(taskDir, "spec.json"), spec.specJson ?? JSON.stringify({
        slug,
        title: spec.title ?? "untitled",
        languages: spec.languages ?? ["ts"],
      }));
    }
    for (const sub of ["public", "hidden"]) {
      const cases = spec[`${sub}Cases`] ?? 0;
      if (cases === 0) continue;
      const dir = path.join(taskDir, "tests", sub);
      await mkdir(dir, { recursive: true });
      for (let i = 1; i <= cases; i += 1) {
        await writeFile(path.join(dir, `case-${String(i).padStart(3, "0")}.json`), "{}");
      }
    }
  }
  return root;
}

test("resolveCorpusDir prefers AGENTLANG_CORPUS_DIR over cwd/corpus", () => {
  const env = { AGENTLANG_CORPUS_DIR: "/tmp/somewhere" };
  assert.equal(resolveCorpusDir(env, "/var/empty"), "/tmp/somewhere");
});

test("resolveCorpusDir falls back to ./corpus when env var is unset or empty", () => {
  assert.equal(resolveCorpusDir({}, "/var/empty"), "/var/empty/corpus");
  assert.equal(
    resolveCorpusDir({ AGENTLANG_CORPUS_DIR: "" }, "/var/empty"),
    "/var/empty/corpus"
  );
});

test("collectTasks reads each task's spec, sorts by slug, and counts public+hidden cases", async () => {
  const root = await makeTempCorpus({
    tasks: {
      "001-fibonacci-memoized": {
        title: "Fibonacci with memoization",
        languages: ["zero", "ts", "rust", "go", "python"],
        publicCases: 4,
        hiddenCases: 1,
      },
      "000-hello-stdout": {
        title: "Hello, stdout",
        languages: ["zero", "ts", "rust", "go", "python"],
        publicCases: 1,
        hiddenCases: 1,
      },
    },
  });
  try {
    const tasks = await collectTasks(root);
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].slug, "000-hello-stdout");
    assert.equal(tasks[0].cases, 2);
    assert.equal(tasks[1].slug, "001-fibonacci-memoized");
    assert.equal(tasks[1].cases, 5);
    assert.deepEqual(tasks[1].langs, ["zero", "ts", "rust", "go", "python"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatTaskLine emits the documented layout", () => {
  const line = formatTaskLine({
    slug: "000-hello-stdout",
    summary: "Hello, stdout",
    langs: ["zero", "ts"],
    cases: 2,
  });
  assert.equal(line, "000-hello-stdout  Hello, stdout  langs=zero,ts  cases=2");
});

test("loadTaskRecord returns null for a directory without spec.json", async () => {
  const root = await makeTempCorpus({
    tasks: {
      "999-no-spec": {
        specJson: null,
      },
    },
  });
  try {
    const rec = await loadTaskRecord(path.join(root, "999-no-spec"));
    assert.equal(rec, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadTaskRecord throws a useful error on malformed JSON", async () => {
  const root = await makeTempCorpus({
    tasks: {
      "999-bad-json": {
        specJson: "{ this is not json",
      },
    },
  });
  try {
    await assert.rejects(
      () => loadTaskRecord(path.join(root, "999-bad-json")),
      /invalid JSON/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- emit verb ---------------------------------------------------------

async function makeTempCorpusWithPrompt(slug, body) {
  const root = await mkdtemp(path.join(tmpdir(), "agentlang-spec-emit-"));
  const taskDir = path.join(root, slug);
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, "prompt.md"), body);
  return root;
}

test("SCAFFOLDS covers exactly the five canonical languages", () => {
  assert.deepEqual(
    Object.keys(SCAFFOLDS).sort(),
    ["go", "python", "rust", "ts", "zero"]
  );
});

test("scaffoldFor returns the per-language block and rejects unknown langs", () => {
  assert.ok(scaffoldFor("zero").startsWith("Write a single Zero 0.1.2"));
  assert.ok(scaffoldFor("python").includes("ref.py"));
  assert.throws(() => scaffoldFor("ocaml"), /unknown --lang 'ocaml'/);
});

test("renderUserPrompt substitutes every {language_scaffold} occurrence", () => {
  const tmpl = "head\n{language_scaffold}\nmid\n{language_scaffold}\ntail\n";
  const out = renderUserPrompt(tmpl, "ts");
  const expected =
    "head\n" + SCAFFOLDS.ts + "\nmid\n" + SCAFFOLDS.ts + "\ntail\n";
  assert.equal(out, expected);
});

test("renderUserPrompt is a no-op when the placeholder is absent", () => {
  const tmpl = "no placeholder here\n";
  assert.equal(renderUserPrompt(tmpl, "rust"), "no placeholder here\n");
});

test("parseEmitArgs accepts space-separated and equals-separated forms", () => {
  assert.deepEqual(
    parseEmitArgs(["--task", "000-hello-stdout", "--lang", "zero"]),
    { task: "000-hello-stdout", lang: "zero", format: "prompt" }
  );
  assert.deepEqual(
    parseEmitArgs(["--task=001-fibonacci-memoized", "--lang=python", "--format=prompt"]),
    { task: "001-fibonacci-memoized", lang: "python", format: "prompt" }
  );
});

test("parseEmitArgs rejects missing required flags and unknown format", () => {
  assert.throws(() => parseEmitArgs(["--lang", "zero"]), /--task <slug> is required/);
  assert.throws(() => parseEmitArgs(["--task", "x"]), /--lang <language> is required/);
  assert.throws(
    () => parseEmitArgs(["--task", "x", "--lang", "zero", "--format", "json"]),
    /unknown --format 'json'/
  );
  assert.throws(
    () => parseEmitArgs(["--what"]),
    /unknown argument: --what/
  );
});

test("loadPromptTemplate reads prompt.md from the corpus directory", async () => {
  const root = await makeTempCorpusWithPrompt("000-hello-stdout", "BODY\n");
  try {
    const text = await loadPromptTemplate(root, "000-hello-stdout");
    assert.equal(text, "BODY\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadPromptTemplate raises a clear error when prompt.md is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agentlang-spec-emit-miss-"));
  try {
    await assert.rejects(
      () => loadPromptTemplate(root, "999-missing"),
      /prompt not found:/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runEmit writes the rendered prompt to stdout", async () => {
  const body =
    "# Task: Hello\n\nDo it.\n\n## Language scaffold\n\n{language_scaffold}\n";
  const root = await makeTempCorpusWithPrompt("000-hello-stdout", body);
  const chunks = [];
  const fakeStdout = { write: (s) => chunks.push(s) };
  try {
    await runEmit(["--task", "000-hello-stdout", "--lang", "go"], {
      env: { AGENTLANG_CORPUS_DIR: root },
      cwd: "/var/empty",
      stdout: fakeStdout,
    });
    const out = chunks.join("");
    assert.ok(out.startsWith("# Task: Hello"));
    assert.ok(out.includes(SCAFFOLDS.go));
    assert.ok(!out.includes("{language_scaffold}"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runEmit honors AGENTLANG_CORPUS_DIR over cwd", async () => {
  const body = "{language_scaffold}\n";
  const root = await makeTempCorpusWithPrompt("000-hello-stdout", body);
  const chunks = [];
  const fakeStdout = { write: (s) => chunks.push(s) };
  try {
    await runEmit(["--task", "000-hello-stdout", "--lang", "rust"], {
      env: { AGENTLANG_CORPUS_DIR: root },
      cwd: "/var/empty",
      stdout: fakeStdout,
    });
    assert.equal(chunks.join(""), SCAFFOLDS.rust + "\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runEmit surfaces an unknown-language error from scaffoldFor", async () => {
  const root = await makeTempCorpusWithPrompt(
    "000-hello-stdout",
    "{language_scaffold}\n"
  );
  try {
    await assert.rejects(
      () =>
        runEmit(["--task", "000-hello-stdout", "--lang", "ocaml"], {
          env: { AGENTLANG_CORPUS_DIR: root },
          cwd: "/var/empty",
          stdout: { write: () => {} },
        }),
      /unknown --lang 'ocaml'/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
