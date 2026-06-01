# agentlang-spec

`agentlang-spec` is the CLI for the AgentLang Index task corpus. It
inventories tasks, emits language-specific prompts, and verifies
submitted solutions against the hidden test cases. The harness
([truffle-dev/agentlang-index](https://github.com/truffle-dev/agentlang-index))
shells out to it during run assembly and grading.

## Status

Pre-alpha. Scaffolded 2026-05-18. Three verbs planned:

```
agentlang-spec list
    Print one line per task in the corpus.

agentlang-spec emit --task <slug> --lang <lang> [--format prompt]
    Render the language-specific prompt for a task.

agentlang-spec verify --task <slug> --solution <path>
    Run the language toolchain in the sandbox shape and compare output
    against the hidden test cases. (not yet implemented)
```

`list` and `emit` are implemented today; `verify` arrives once its
caller exists in the harness.

## `list`

```sh
agentlang-spec list
000-hello-stdout  Hello, stdout  langs=zero,ts,rust,go,python  cases=2
001-fibonacci-memoized  Fibonacci with memoization  langs=zero,ts,rust,go,python  cases=5
```

The corpus directory resolves in this order:

1. `AGENTLANG_CORPUS_DIR` environment variable
2. `./corpus` relative to the current working directory

Case counts include both public and hidden cases. Languages are read
from each task's `spec.json`.

## `emit`

```sh
agentlang-spec emit --task 000-hello-stdout --lang zero
```

Reads `<corpus>/<task>/prompt.md` and substitutes the
`{language_scaffold}` placeholder with the canonical per-language
scaffold block (file name, stdin/stdout contract, fence tag, and any
language-specific gotchas the harness expects the model to respect).
Writes the rendered prompt to stdout.

Languages: `zero`, `ts`, `rust`, `go`, `python`. Format is `prompt`
today; future formats (`json` with structured metadata, raw template
passthrough) land on the same surface.

The corpus directory resolves the same way as `list`
(`AGENTLANG_CORPUS_DIR` then `./corpus`).

The scaffold strings are the canonical source-of-truth for how a task
is framed to a model. The harness in
[truffle-dev/agentlang-index](https://github.com/truffle-dev/agentlang-index)
currently carries its own copy under
`harness/src/agentlang_harness/prompt.py`; the two must stay in sync
until a shared `corpus/scaffolds.json` lands and the harness reads
through this CLI.

## Install

```sh
npm install -g agentlang-spec
agentlang-spec list
```

Or run locally from a checkout:

```sh
node bin/agentlang-spec.mjs list
```

Bun also works (`bun bin/agentlang-spec.mjs list`).

## Test

```sh
npm test
```

Tests live in `src/test.mjs` and use `node:test`. They build temporary
corpus trees per scenario, so they have no dependency on the harness
checkout being present.

## Toolchain

Node.js 20+. The CLI deliberately has zero runtime dependencies (no
`commander`, no `yargs`, no `glob`). Verb dispatch is a switch on
`process.argv`; corpus walking uses `node:fs/promises`. This keeps it
sippable from the harness without `npm install` overhead in CI.

A Zero implementation of the same surface may follow once Zero's
`World` capability set is rich enough to read JSON files, fork child
processes, and walk directories. Until then the canonical CLI lives in
Node.

## License

Apache-2.0. See [LICENSE](LICENSE).
