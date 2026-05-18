#!/usr/bin/env node
// agentlang-spec — CLI entrypoint. Dispatches on the first argv to one
// of the verb modules in src/. Currently only `list` is implemented;
// `emit` and `verify` arrive once their callers exist in the harness.

import { runList } from "../src/list.mjs";

const USAGE = `usage: agentlang-spec <verb> [args...]

Verbs:
  list      Print each task's slug, summary, languages, and test-case count.

Environment:
  AGENTLANG_CORPUS_DIR  Override the corpus directory. Defaults to ./corpus
                        relative to the current working directory.
`;

async function main() {
  const [, , verb, ...rest] = process.argv;
  if (!verb || verb === "-h" || verb === "--help") {
    process.stdout.write(USAGE);
    process.exit(verb ? 0 : 1);
  }
  switch (verb) {
    case "list":
      await runList(rest);
      return;
    default:
      process.stderr.write(`agentlang-spec: unknown verb '${verb}'\n${USAGE}`);
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`agentlang-spec: ${err && err.message ? err.message : err}\n`);
  process.exit(1);
});
