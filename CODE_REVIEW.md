# Reviewing changes to env-cap

The reviewer-side companion to [`CONTRIBUTING.md`](CONTRIBUTING.md). It
answers one question: **what makes a change to this package safe to merge?**
It is not a second contributor guide and not a style checklist — CI already
enforces formatting, lint, types, coverage, and mutation score. This
document covers the judgement calls CI can't make.

## 1. Review standard

A change is ready to merge when all of the following hold:

- CI is green — `npm run verify` (typecheck, lint, format, build, schema
  generation, coverage thresholds, `npm run size`, `verify:no-ambient-fs`,
  the API-report drift check) plus the Bun/Deno cross-runtime conformance
  suite.
- Every invariant in §2 that the change touches is still true, and the
  reviewer has checked the specific code, not just trusted the description.
- Any public-surface change (§3) is intentional, justified in the PR, and
  carries the right changeset bump type.
- Any generated artifact in the diff (§4) has been reviewed as output, not
  skimmed.
- The change doesn't weaken a capability boundary (§5).

When a change can't meet this bar in one PR, split it — a partial change
that keeps an invariant intact beats a complete one that bends it "just for
now."

## 2. Package invariants

These are enumerated in [`AGENTS.md`](AGENTS.md) ("Non-negotiable
invariants") and pinned by ADRs. A reviewer's job is to confirm the change
doesn't erode one, even indirectly:

- **Static analysis only — schemas are never executed**
  ([ADR 0002](specs/decisions/0002-static-analysis-never-execution.md)).
  `src/build` parses `env.schema.ts` as TypeScript AST. Reject any change
  that adds `import()`, `require()`, `eval`, `new Function`, `vm`, a
  worker, or a subprocess to the analysis path. A value that can't be
  resolved from a literal must surface as a `Finding`/warning, never a
  guess or a fallback execution.
- **Runtime stays isomorphic, zero-dependency, and within budget**
  ([ADR 0040](specs/decisions/0040-library-surfaces-do-not-acquire-node-fs.md),
  [ADR 0008](specs/decisions/0008-gzip-size-budget.md)). `src/runtime` and
  `src/helpers` must not import `node:*`, must not add a dependency, and
  must stay under the `npm run size` gzip budget. `src/build` is the only
  place `node:fs`/`node:path`/`typescript` may appear, and it must never be
  reachable from a runtime entry point.
- **Warn, don't throw, by default**
  ([ADR 0005](specs/decisions/0005-warn-not-throw-by-default.md)). New
  data-quality findings are warnings. Escalation to an error happens only
  behind an explicit `--strict*` flag / `on*: "throw"` option, and when it
  fires, nothing is written
  ([ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md)).
- **Capability ownership — no global env object**
  ([ADR 0003](specs/decisions/0003-no-global-env-object.md)). Reject any
  merged/global wrapper over multiple contracts.
- **Contracts self-redact; errors never carry values**
  ([ADR 0006](specs/decisions/0006-self-redacting-contracts.md)). Read
  every new/changed error message, log line, and fixture: a raw or
  processed env value must never appear. This is the single highest-value
  thing to check by eye.
- **`--check` computes before it compares and never partially writes**
  ([ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md)).

If a change genuinely needs to move one of these boundaries, it needs its
own ADR first (see [`CONTRIBUTING.md`](CONTRIBUTING.md#adding-an-architecture-decision-record-adr)),
not a reviewer waving it through.

## 3. Public API / stability review

[`VERSIONING.md`](VERSIONING.md) defines three tiers. Before approving:

- **Stable** (public runtime APIs, the four documented `generate*()` build
  orchestrators, every `env-cap --help` flag, `--json` output, the
  published JSON Schema, the generated manifest shape, the ESLint plugin's
  rule names/options). A breaking change here needs a `major` changeset and
  an explicit "yes, we're doing this" in the PR. An _additive_ change
  (new optional flag, new optional option field, new export) is `minor` —
  confirm it's genuinely additive and doesn't change a default.
- **`--json` and the JSON Schema** are versioned by their own
  `schemaVersion` ([ADR 0013](specs/decisions/0013-json-output-is-a-versioned-mirror.md),
  [ADR 0019](specs/decisions/0019-published-json-schema-generated-from-types.md)).
  Additive field: no bump. Changed/removed field: `schemaVersion` bump +
  `major`. The schema is generated from the types (`npm run schema`) —
  confirm the committed `schemas/*.json` in the diff matches.
- **Experimental** (the `packages` option, the lower-level `./build`
  primitives, `./evidence`, `generateEvidenceModel` and friends). May
  change shape in a `minor`/`patch` — but the change should still be
  deliberate, and the ADR's Status line should reflect reality.
- **Private** (anything not re-exported, all AST-traversal internals, the
  dependency-ownership engine internals per
  [ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md)).
  No bump, but check the change didn't leak an internal into a public
  entry point.

Check `package.json#exports` in the diff: the allowed set is exactly `.`,
`./build`, `./node`, `./helpers`, `./evidence`, `./eslint-plugin`,
`./schema`, `./schema/*`, `./package.json`. A new entry is a public-surface
decision.

## 4. Generated-artifact review

env-cap both produces generated artifacts and commits its own
(`schemas/*.json`, example `expected/` golden trees, `docs/api-report/`).
When any of these appear in a diff:

- **Review the artifact as output.** A golden or schema diff is the
  observable behavior change — read it. "Regenerated goldens" in a PR
  description is not a substitute for looking at what changed in them.
- Confirm the artifact was regenerated by the tool, not hand-edited — files
  marked `AUTO-GENERATED FILE. DO NOT EDIT.` must only change via their
  generator.
- If an example's `expected/` tree changed, the source `env.schema.ts` /
  `documentEnv()` change that caused it must be in the same PR and must
  explain the delta.
- If `schemas/*.json` changed without a corresponding types change, that's
  a red flag — the schema is generated from the types.

## 5. Security and capability-boundary review

- The static-analysis guarantee (§2, ADR 0002) is a security boundary:
  env-cap runs against untrusted repo content (schema files, `tsconfig`,
  installed package metadata). Anything that could execute that content, or
  read/traverse outside the declared discovery roots, is a vulnerability,
  not a bug.
- `verify:no-ambient-fs` enforces that runtime/helpers acquire no ambient
  filesystem capability; `src/build` receives its filesystem explicitly
  from the CLI ([ADR 0040](specs/decisions/0040-library-surfaces-do-not-acquire-node-fs.md)).
  A change that reaches for `node:fs` directly inside a library surface
  breaks this — reject it.
- Dependency scanning stays within the bounds described in
  [`SECURITY.md`](SECURITY.md) — no unbounded traversal of `node_modules`.
- Validation `context` is a participation filter, **not** a security or
  bundling boundary ([ADR 0022](specs/decisions/0022-validation-contexts.md),
  [ADR 0004](specs/decisions/0004-no-client-server-package-split.md)). Reject
  any change or doc that implies otherwise.
- New dependency (runtime _or_ dev): scrutinize. The runtime tier allows
  zero; a dev dependency needs a real justification in the PR.

## 6. AI-authored change review

Treat a PR written with an AI assistant as needing the _same_ scrutiny as
any other — but the common failure modes are specific and checkable
against documented invariants:

- **Silent invariant drift.** An assistant "helpfully" adds a fallback that
  executes a schema when static resolution fails (violates ADR 0002), or
  embeds the offending value in an error message to be "more helpful"
  (violates ADR 0006), or reaches for `node:fs` in a helper. Check every
  new `catch`, fallback, and error-message string against §2.
- **Plausible-looking API additions.** A new exported symbol or a new
  `--flag` that looks reasonable but expands the Stable surface without a
  decision. Cross-check `package.json#exports` and the `--help` text in the
  diff against [`VERSIONING.md`](VERSIONING.md) §Stable and
  [`AGENTS.md`](AGENTS.md) invariant 4.
- **Documentation fields in the wrong call.** `description`/`owner`/
  `expiresAt` placed inside `createEnv()` instead of `documentEnv()` —
  [`AGENTS.md`](AGENTS.md) invariant 3.
- **Framework accretion.** A manager/registry/provider wrapper around
  `validateEnv()` — [`AGENTS.md`](AGENTS.md) "Avoid".
- **Tests that assert the bug.** A regenerated golden or a new test that
  simply encodes whatever the code now does. Confirm the _expected_ value
  is correct independently, not just internally consistent.
- **Mutation-score gaming.** A test added only to kill a mutant, asserting
  nothing meaningful. The mutation gate is a floor, not the goal — a test
  must assert real behavior.

[`AGENTS.md`](AGENTS.md), [`PROMPT.md`](PROMPT.md), and
[`skills/env-cap/SKILL.md`](skills/env-cap/SKILL.md) are the invariant set
an assistant was (or should have been) working against — a reviewer can use
the same list.

## 7. Required verification

- `npm run verify` green locally or in CI.
- `npm run test:coverage` — coverage is ratchet-up-only; a threshold is
  raised when coverage improves, never lowered to accommodate a drop.
- Mutation score (Stryker) must not regress. New logic needs tests that
  actually kill mutants by asserting behavior.
- `npm run size` if `src/runtime` or `src/helpers` changed.
- The example `expected/` goldens regenerated (`npm run examples:update-golden`)
  and reviewed if generated output changed.
- The committed Markdown API report regenerated (`npm run docs:api:report`)
  and committed if any public export changed — CI's `docs:api:report:check`
  fails otherwise. The report diff _is_ the API-surface diff; read it.

## 8. Approval checklist

- [ ] CI green (`verify` + cross-runtime conformance)
- [ ] Every touched invariant in §2 re-checked against the actual code
- [ ] No raw/processed env value in any error, log, or fixture
- [ ] Public-surface changes are intentional + correct changeset bump
- [ ] `package.json#exports` unchanged, or the new entry is a deliberate decision
- [ ] `--json` / JSON Schema changes carry the right `schemaVersion` treatment
- [ ] Generated artifacts in the diff reviewed as output, not skimmed
- [ ] `docs/api-report/` regenerated + committed if any public export changed
- [ ] No new runtime dependency; any new dev dependency justified
- [ ] Coverage not lowered; mutation score not regressed
- [ ] An ADR added if a structural boundary moved
