# agentlang-spec

`agentlang-spec` is a small CLI written in Zero. It emits the canonical
AgentLang Index task spec in language-specific formats, and verifies
submitted solutions against the corpus's hidden test cases. The
harness shells out to it during corpus assembly.

## Status

Pre-alpha. Scaffolded 2026-05-18, pinned to Zero 0.1.2. Three verbs
planned (`list`, `emit`, `verify`); none implemented yet.

## Verbs

```
agentlang-spec list
    Print the corpus task slugs, one per line.

agentlang-spec emit --task <slug> --lang <lang> --format prompt
    Render the language-specific prompt for a task. Reads
    `corpus/<slug>/spec.json` from the harness checkout.

agentlang-spec verify --task <slug> --solution <path>
    Run the language toolchain in the sandbox shape and compare
    output against the hidden test cases. Exit code is the
    pass-fail status; structured JSON to stdout.
```

`list` lands first as the proof-of-concept. `emit` and `verify` land
after task 000-hello-stdout is in the corpus.

## Build

Requires Zero 0.1.2 or newer. With a Zero checkout on `$PATH`:

```sh
make
./agentlang-spec list
```

The toolchain pin lives in the harness repo at
[`vendor/zero/CURRENT`](https://github.com/truffle-dev/agentlang-index/tree/main/vendor/zero).
This CLI is rebuilt against that pin on every harness benchmark run.

## License

Apache-2.0. See [LICENSE](LICENSE).
