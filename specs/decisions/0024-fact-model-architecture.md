# 0024: Seven canonical fact models, not thirty-five reports

## Status

Accepted. This ADR establishes the architecture and shared conventions that
ADRs 0025 through 0032 (and the implementation phases between them) apply
incrementally, one additive change at a time. It documents no code of its
own.

## Context

A readiness review of 35 requested report types for env-cap (Configuration
Ownership Report, Secret Exposure Report, SARIF Security Findings Report,
and so on) found that most of them are different renderings of a small,
repeated set of underlying facts, not 35 independent analyses. The clearest
existing symptom is already in this codebase: `docs.ts`'s
`renderSecurityReview()` computes counters like `noOwnerCount`,
`duplicateKeyCount`, and `expiredCount` as plain `let`s inside one function,
and those numbers become Markdown text and nothing else -- no exported type
backs them, so no downstream consumer (the `--json` envelope, a CI gate, a
future SARIF renderer) can ever see them as data. A second, independent
symptom of the same root cause: `usage-report.ts`'s ownership findings and
`docs.ts`'s `effectiveOwner()` resolve "who owns this variable" two
different ways (one checks only the contract-level `owner`, the other
correctly falls back variable-then-contract) -- because ownership resolution
was written twice, once per report, instead of once as a fact.

The review also found a specific, named gap blocking an entire cluster of
requested reports: no field anywhere in env-cap's vocabulary (`EnvDefinition`,
`VariableDocs`, `ContractDocs`) distinguishes a secret from an ordinary
config value. Every report about exposure, secret rotation hygiene, or
security findings has no data to work from until that's fixed at the source.

Building the 35 (or a trimmed 19) requested reports one at a time, as
independent renderers or as incremental fields bolted onto existing report
functions, repeats this exact pattern at larger scale: more places
recomputing the same facts, more chances for two of them to quietly
disagree, as `usage-report.ts` and `docs.ts` already do today.

## Decision

**Seven canonical, versioned, JSON-serializable fact models become the real
API surface: Contract, Dependency, Ownership, Lifecycle, Finding, Change,
Evidence.** Every report is a projection over one or more of these models,
built through a single public projection function
(`defineEvidenceProjection()`, ADR 0031), never a second, independently
computed source of truth. Facts belong in a model; judgment (what counts as
risky, what satisfies a compliance control) belongs in a projection,
never inside a model itself -- this is why Risk Report, Compliance Evidence
Report, and Environment/Executive Assurance Report are cut on principle, not
deferred: each requires an opinion env-cap has no basis to supply. The
mission this architecture serves: env-cap doesn't decide what compliance
means; it produces verifiable evidence from the configuration architecture,
and provides the machinery to transform that evidence into whatever
downstream standard a consumer requires.

Conventions every model-adding phase follows, so they don't get re-decided
per phase:

- **New model types are additive wrappers, never in-place rewrites.**
  `DiscoveredContract`, `ManifestChangeReport`, `CompatibilityIssue`,
  `OwnershipDependencyEntry`, and every other existing exported type stay
  exactly as they are. Each canonical model is a new file that maps or
  aggregates the existing pieces into a versioned shape. This is what keeps
  every phase of this build-out additive-only, needing no major-version
  discussion despite the scale of the overall change.
- **`schemaVersion` discipline, one constant per model.** Bumped only when a
  reader could misinterpret the new shape -- the same rule
  `MANIFEST_SNAPSHOT_SCHEMA_VERSION` (ADR 0021) and `JSON_SCHEMA_VERSION`
  (ADR 0013) already document. A purely additive field never requires a
  bump.
- **Provenance is caller-supplied, never ambient-detected.** Evidence
  Model's commit-SHA/timestamp stamping (ADR 0031, ADR 0032) takes an
  optional callback the same shape as ADR 0012's `LiveExpirationDates` --
  env-cap never shells out to `git` itself, and an omitted callback means
  omitted fields, never a guess. This mirrors the project's existing
  invariant that nothing is ever inferred from an ambient signal (see the
  validation-context rule in ADR 0022).
- **The published JSON Schema generator generalizes to one target per
  model**, rather than staying hardcoded to the single `--json` envelope
  type it covers today (ADR 0019). Each model phase adds one entry to that
  generator's target list and one freshness+correctness test pair, instead
  of inventing its own schema-publishing mechanism.
- **The ten first-party reference projections are ordinary
  `defineEvidenceProjection()` calls, with no privileged internal path.** If
  a reference projection needs something the public projection API can't
  express, that's proof the API is incomplete, not license to give
  first-party code special access the public surface lacks -- the same
  discipline `specs/architecture.md` already applies to `src/cli/` importing
  only `build`'s public surface, never an internal file.

Sequencing: Contract Model ships first, since it's the closest of the seven
to already existing and because Finding Model's secret-specific facts are
blocked on its one missing field (`classification`). Finding Model ships
second because it's the most scattered of the seven today and is referenced,
directly or via Evidence Model, by most of what follows. Dependency,
Ownership, Lifecycle, and Change Model have no shape dependency on each
other and may ship in any order once Finding Model exists. Evidence Model
ships last, since it's defined as the composition of the other six -- built
before they're real would just produce an evidence artifact full of holes.

## Consequences

- The package's public surface grows by roughly seven new Experimental-tier
  types and one new public entry point (`./evidence`, ADR 0031) over the
  course of this build-out, none of it replacing anything existing.
- `usage-report.ts`'s owner-resolution divergence from `docs.ts`'s
  `effectiveOwner()` gets fixed as part of Ownership Model landing (a real
  bug fix, bundled with -- not hidden inside -- that model's new type), since
  the whole point of a canonical model is that a fact gets computed once.
- The ten reference projections replace the originally-requested 35/19
  report list; several of the originally-requested reports turn out to be
  the same projection viewed two ways (e.g. Configuration Consumer Report is
  Configuration Dependency Report, inverted) and are folded in as filters
  rather than shipped as separate artifacts.
- This is sized closer to the package's original build-out than to a
  consistency pass. It lands as a long sequence of independently-mergeable,
  independently-`npm run verify`-clean phases rather than one release, each
  with its own changeset, so the scale of the overall change never forces a
  single high-risk merge.

## Alternatives considered

- **Ship the 35 (or 19) requested reports as independent renderers, one at
  a time.** Rejected -- this is the exact pattern already producing
  divergent bugs in this codebase (`usage-report.ts` vs. `docs.ts`'s owner
  resolution) and would multiply, not fix, that risk at 35x the scale.
- **Add fields to existing report functions incrementally, without a
  unifying model layer.** Rejected as indistinguishable in the long run
  from the previous option -- `renderSecurityReview()` growing a 12th, 13th,
  14th inline counter is the same anti-pattern that motivated this ADR in
  the first place, just deferred rather than fixed.
- **Ship opinionated compliance/risk/executive-assurance reports directly,
  since the underlying facts already exist.** Rejected -- a risk weighting,
  a named compliance framework's control language, and an executive
  headline number are each an opinion env-cap has no basis to assert on a
  consumer's behalf. The projection mechanism exists precisely so a
  consumer can build these correctly, for their own policy, without
  env-cap guessing.
- **Land this as one large release once everything is ready.** Rejected --
  given the acknowledged size of this change, a single merge would be
  effectively unreviewable and would leave the package in a broken
  intermediate state for the duration of the work. Additive, independently
  verifiable phases were chosen specifically to avoid that.
