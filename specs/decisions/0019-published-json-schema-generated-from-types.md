# 0019: The published `--json` schema is generated from `src/cli/json.ts`'s types, never hand-authored

## Status

Accepted. Implemented in `scripts/generate-json-schema.mjs`, committed at
`schemas/env-cap-report.schema.json`, published via the `./schema` subpath
export.

## Context

`--json`'s envelope is already committed to being semver-stable (ADR 0013)
and documented via prose plus one worked example in the README, backed
internally by the `JsonSuccessPayload`/`JsonErrorPayload` types in
`src/cli/json.ts`. None of that helps an external, non-TypeScript tool -- a
Go service, a Python dashboard, a generic CI linter -- validate or codegen
against real `--json` output without hand-transcribing the README's one
example. A real, standalone JSON Schema artifact closes that gap, but only
if it can't silently drift from the actual emitted shape -- a hand-authored
schema is itself a second place the envelope's shape has to be kept in sync
by hand, exactly the kind of duplication `report.d.mts` (ADR 0013 decision 7) already accepts as a narrow, one-off exception for a single internal
test-support file, not a pattern to repeat for a schema external parties
will build real tooling against.

## Decision

- **Generated from types, not hand-authored.** `scripts/generate-json-schema.mjs`
  uses `ts-json-schema-generator` (a devDependency, not shipped at runtime)
  to compile `src/cli/json.ts`'s exported `JsonReportPayload` type --
  `JsonSuccessPayload | JsonErrorPayload`, the complete envelope shape --
  directly into `schemas/env-cap-report.schema.json`. `report.d.mts`'s
  hand-kept-in-sync exception is accepted there specifically because it's
  one internal file with one maintainer's own test suite as the only
  consumer; a schema published for arbitrary external tooling to build
  against does not get the same latitude.
- **Two tests, not one**, because they prove different things:
  - **Freshness** (`test/build/json-schema.test.ts`): regenerates the
    schema in-memory and compares it byte-for-byte against the committed
    file, failing if they differ. This proves the committed file matches
    what the generator _currently_ produces -- the same "generated but
    committed, diffable" discipline the example projects already use for
    their own generated manifests/docs.
  - **Correctness**: using `ajv` (a devDependency) against real `--json`
    output from actually running the built CLI (a success case, a failure
    case, and a `--check` run producing a `checkResult`-bearing payload),
    asserting each validates cleanly against the committed schema.
    Freshness alone only proves "the schema matches what the generator
    currently produces" -- it says nothing about whether the schema is
    _correct_ against real, running output, which is the property external
    tooling actually depends on. A generator bug that produces a
    self-consistent but wrong schema would pass the freshness test and fail
    this one.
- **Ships in the published npm tarball, with its own subpath export.**
  `schemas/` is added to `package.json`'s `files` array, and
  `env-cap/schema` maps directly to the JSON file -- the same
  pattern already used for `"./package.json": "./package.json"` -- so a
  consumer can resolve it via Node's own module resolution rather than
  reconstructing a path into `node_modules`.
- **Evolves under the same additive-only rules as `--json` itself.** A new
  optional field appearing in the schema is never a breaking change; a
  changed or removed field is, exactly mirroring ADR 0013's policy for the
  envelope the schema describes. `VERSIONING.md`'s Stable tier gains an
  explicit line for this.

## Consequences

- `npm run schema` regenerates the file — a developer runs it locally after
  changing `src/cli/json.ts`'s types and commits the result, the same as any
  other generated-and-committed artifact this project produces. No CI step
  re-runs the script itself; a stale commit is still caught, via the
  freshness test (`test/build/json-schema.test.ts`), which regenerates the
  schema in-memory during the normal test run and byte-compares it against
  the committed file — the same way a stale generated manifest would fail in
  any project using this tool on itself.
- External tooling gets exactly one artifact to point at
  (`env-cap/schema` or `schemas/env-cap-report.schema.json` in
  the repo) instead of reverse-engineering the README's prose example.
- `ts-json-schema-generator` and `ajv` are devDependencies only -- neither
  ships in the published package or is required at runtime by anything
  except the schema-generation/test scripts themselves.

## Alternatives considered

- **Hand-author the schema once and keep it in sync manually.** Rejected --
  this is precisely the failure mode a generated schema exists to prevent;
  a manually-maintained schema silently drifting from the real envelope
  would be worse than not publishing one at all, since it would carry false
  authority.
- **Freshness test only, skip the correctness test.** Rejected -- freshness
  alone can't catch a generator bug that produces a schema internally
  consistent with itself but wrong against what the CLI actually emits
  (e.g. a misconfigured `expose`/`jsDoc` option silently dropping a real
  field). Running the real, built CLI and validating its actual output is
  the only way to catch that class of bug.
- **`typescript-json-schema` instead of `ts-json-schema-generator`.**
  Both are actively maintained and comparably popular; `ts-json-schema-generator`
  was chosen as the plan's leading candidate and confirmed still actively
  maintained (multiple releases within the last month) at implementation
  time. Either would satisfy this decision's actual requirement (generated,
  not hand-authored); this is a tooling choice, not a load-bearing part of
  the decision itself.
