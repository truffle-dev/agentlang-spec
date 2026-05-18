// Unit tests for the `list` verb. Run with `npm test` (node --test).
// We build a temp corpus tree for each scenario so the tests don't
// depend on the real harness checkout being present.

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
