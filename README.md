# agentlang-spec

`agentlang-spec` is the CLI for the AgentLang Index task corpus. It
inventories tasks, emits language-specific prompts, and verifies
submitted solutions against the hidden test cases. The harness
([truffle-dev/agentlang-index](https://github.com/truffle-dev/agentlang-index))
shells out to it during run assembly and grading.

## Status

Pre-alpha. Scaffolded 2026-05-18. Three verbs:

```
agentlang-spec list
    Print one line per task in the corpus.

agentlang-spec emit --task <slug> --lang <lang> [--format prompt]
    Render the language-specific prompt for a task.

agentlang-spec verify --task <slug> --solution <path> [--lang <lang>] [--timeout <seconds>]
    Stage the solution into a scratch copy of the task and run
    verify.sh against the resolved language. Streams stdout and stderr
    to the caller. Exits with verify.sh's exit code (124 on timeout).
```

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

The scaffold strings come from `<corpus>/scaffolds.json`, shipped by
the corpus itself ([truffle-dev/agentlang-index](https://github.com/truffle-dev/agentlang-index)
keeps the canonical copy at `corpus/scaffolds.json`). They are the
source-of-truth for how a task is framed to a model; the harness reads
the same file, so neither side carries its own copy.

## `verify`

```sh
agentlang-spec verify --task 000-hello-stdout --solution ./hello.py
```

Stages a scratch copy of `<corpus>/<task>/` in a temp directory,
overwrites the reference file (`ref.zero`, `ref.ts`, `ref.rs`,
`ref.go`, or `ref.py`) with the candidate solution, then runs
`bash verify.sh --lang <lang>` inside the scratch dir. Streams
verify.sh's stdout and stderr to the caller and exits with its
return code. `124` signals a timeout (default 60s, override with
`--timeout <seconds>`).

The language is inferred from the solution file extension when
`--lang` is omitted: `.zero`, `.ts`, `.rs`, `.go`, `.py`. The
task's `spec.json` `languages` array must include the resolved
language.

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
