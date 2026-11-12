# Reviewing changes to env-cap

A change is safe to merge when CI is green, no invariant below has moved, and every surface change is declared. CI checks formatting, lint, types, coverage and mutation; this list covers the rest. [`CONTRIBUTING.md`](CONTRIBUTING.md) is the author's side.

## 1. Review standard

A change is ready to merge when all of these hold:

- The `contract` and `lint` checks are green; the branch ruleset requires both.
- Every other CI job is green too. They are the Bun and Deno suite, the examples, the integration fixtures, `typescript-5`, `typescript-compat` and the package-manager smoke test.
- The `required` check waits for those jobs, but the ruleset does not yet require `required`, so a reviewer must look.
- `benchmark-pr` is green. A failure there skips `lint`, `verify` and `contract`, which GitHub then counts as passing; check it by hand.
- Every invariant in §2 that the change touches still holds, checked in the code, not the description.
- Any public-surface change (§3) is intended, explained, and carries the right changeset.
- Any generated artifact in the diff (§4) has been read as output.
- No capability boundary is weakened (§5).

When a change cannot meet this bar in one pull request, split it.

## 2. Package invariants

These are listed in [`AGENTS.md`](AGENTS.md) ("Non-negotiable invariants") and pinned by ADRs. Check that the change does not erode one, even indirectly:

- **Schemas are never executed** ([ADR 0002](specs/decisions/0002-static-analysis-never-execution.md)). Reject any change that adds `import()`, `require()`, `eval`, `new Function`, `vm`, a worker or a subprocess to the analysis path. Lint bans `eval` and `new Function`; the rest is yours to catch. An unresolvable value must surface as a finding, never a guess.
- **The runtime stays isomorphic and within budget** ([ADR 0040](specs/decisions/0040-library-surfaces-do-not-acquire-node-fs.md), [ADR 0008](specs/decisions/0008-gzip-size-budget.md)). `src/runtime` and `src/helpers` must not import `node:*` or add a dependency. The browser-bundle test catches a Node import; nothing catches a third-party import.
- **Only `src/cli` may import `node:fs`.** ESLint enforces it in `src/`. `src/build` uses `node:path` and `typescript` and takes its filesystem from the caller. No runtime entry may reach `src/build`; `compiler-isolation` checks that.
- **Warn, do not throw, by default** ([ADR 0005](specs/decisions/0005-warn-not-throw-by-default.md)). New data-quality findings are warnings. Escalation happens only behind a `--strict*` flag or an `on*: "throw"` option, and nothing is written when it fires ([ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md)).
- **No global env object** ([ADR 0003](specs/decisions/0003-no-global-env-object.md)). Reject any wrapper that merges contracts.
- **Errors never carry values** ([ADR 0006](specs/decisions/0006-self-redacting-contracts.md)). Read every new or changed error message, log line and fixture for a raw or processed value. This is the most valuable thing to check by eye.
- **`--check` computes before it compares and never writes** ([ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md)).

Moving one of these boundaries needs its own ADR first ([CONTRIBUTING.md](CONTRIBUTING.md#adding-an-architecture-decision-record-adr)).

## 3. Public API and stability review

[`VERSIONING.md`](VERSIONING.md) lists every entry point and its tier. Every entry point is Stable today; nothing ships Experimental ([ADR 0045](specs/decisions/0045-promote-experimental-surfaces-to-stable.md)).

- **Stable.** A breaking change needs a `major` changeset from 1.0, or a `minor` before 1.0, and an explicit decision in the pull request. In a hand-written changeset, an additive change is `minor`; confirm it does not change a default. `ApiContract` and `SurfaceContract` fail when the declared level is too low.
- **`--json` and the JSON Schema.** An additive field needs no `schemaVersion` bump. A changed or removed field needs a `schemaVersion` bump and a breaking changeset ([ADR 0013](specs/decisions/0013-json-output-is-a-versioned-mirror.md), [ADR 0019](specs/decisions/0019-published-json-schema-generated-from-types.md)). No check ties the shape change to the bump, so check it here.
- **The schema is generated** from the types by `npm run schema`. The `Schema` check fails if the committed file differs.
- **Private.** Anything not re-exported, the AST-traversal internals, and the dependency-ownership engine ([ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md)). No bump, but check nothing internal leaked into an entry point.

Check `package.json#exports` in the diff. The allowed set is `.`, `./build`, `./node`, `./helpers`, `./evidence`, `./eslint-plugin`, `./schema`, `./schema/*` and `./package.json`. A new entry is a public-surface decision and needs a row in `docs/surface.json`.

## 4. Generated-artifact review

env-cap commits its own generated files: `schemas/*.json`, `docs/api-report/`, the flagship examples' `docs/` and manifests, and the integration fixtures' `expected/` trees. When one appears in a diff:

- **Read it as output.** A schema or golden diff is the observable behaviour change. "Regenerated goldens" in a description does not replace reading them.
- Confirm a generator wrote it. A file marked as generated changes only through its generator.
- If an example's generated `docs/` changed, the schema or `documentEnv()` change that caused it must be in the same pull request.
- If `schemas/*.json` changed without a matching type change, that is a red flag.

## 5. Security and capability-boundary review

- The static-analysis rule (§2) is a security boundary. env-cap runs on untrusted repository content: schema files, `tsconfig.json`, package metadata. Anything that could run that content, or read outside the declared roots, is a vulnerability.
- The `AmbientCapabilities` check allows `fs` only in the CLI, `./node` and the ESLint plugin. A library surface that reaches for `node:fs` breaks this; reject it.
- Dependency scanning stays within the bounds in [`SECURITY.md`](SECURITY.md#build-time-security-model).
- A validation `context` is a participation filter, not a security or bundling boundary ([ADR 0022](specs/decisions/0022-validation-contexts.md), [ADR 0004](specs/decisions/0004-no-client-server-package-split.md)). Reject a change or a document that implies otherwise.
- A new dependency, runtime or dev, needs scrutiny. The runtime entries allow none; a dev dependency needs a reason in the pull request.

## 6. AI-authored change review

A pull request written with an AI assistant gets the same scrutiny. Its common failure modes are specific:

- **Silent invariant drift:** a fallback that executes a schema, a value embedded in an error to be "helpful", or `node:fs` in a helper. Check every new `catch`, fallback and error string against §2.
- **Plausible API additions:** a new export or flag that widens the Stable surface without a decision. Compare `package.json#exports` and `--help` in the diff with [`VERSIONING.md`](VERSIONING.md).
- **Documentation fields in the wrong call:** `description`, `owner` or `expiresAt` inside `createEnv()` instead of `documentEnv()`.
- **Framework accretion:** a manager, registry or provider around `validateEnv()`.
- **Tests that assert the bug:** a regenerated golden or a test that encodes whatever the code now does. Confirm the expected value independently.
- **Mutation gaming:** a test that kills a mutant but asserts nothing meaningful.

[`AGENTS.md`](AGENTS.md), [`PROMPT.md`](PROMPT.md) and [`skills/env-cap/SKILL.md`](skills/env-cap/SKILL.md) are the rules an assistant works against; use the same list.

## 7. Required verification

- `npm run verify` green, locally or in CI.
- Coverage floors in `vitest.config.ts` not lowered without a stated reason.
- Mutation: the `contract` job fails on any surviving, timed-out or uncovered mutant. New logic needs tests that assert behaviour.
- `npm run size` if `src/runtime`, `src/helpers` or `src/evidence` changed.
- Integration-fixture goldens regenerated with `npm run examples:update-golden`, and read, if generated output changed.
- The API report regenerated with `npm run docs:api:report` if a public export or its TSDoc changed. The `ApiDocsReport` check fails otherwise. The report diff is the API diff; read it.

## 8. Approval checklist

- [ ] `contract` and `lint` green, and every other CI job green
- [ ] Every touched invariant in §2 re-checked against the code
- [ ] No raw or processed value in any error, log or fixture
- [ ] Public-surface changes intended, with the right changeset
- [ ] `package.json#exports` unchanged, or the new entry is a decision
- [ ] `--json` and JSON Schema changes carry the right `schemaVersion` treatment
- [ ] Generated artifacts in the diff read as output
- [ ] `docs/api-report/` regenerated if a public export changed
- [ ] No new runtime dependency; any new dev dependency justified
- [ ] Coverage floors not lowered without a reason; no surviving mutants
- [ ] An ADR added if a structural boundary moved
