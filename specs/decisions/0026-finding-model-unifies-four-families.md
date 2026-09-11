# 0026: Finding Model unifies four independently-shaped finding families

## Status

Accepted. Implemented in `src/build/finding-model.ts` (`buildFindingModel()`,
`Finding`, `FindingModel`) and `src/build/evidence-reference.ts`
(`EvidenceReference`), exported from `env-cap/build`.

## Context

ADR 0024 named Finding Model as the most scattered of the seven canonical
models. Four independently-shaped finding families exist in the public
surface today, with no shared base type: `CompatibilityIssue`
(`compatibility.ts`/`exclusive-group.ts` -- the only one with `severity`),
`ArtifactCheckFinding` (`check-artifacts.ts` -- a three-value `status`
instead of `severity`), `DocumentationFindings` (`generate-documentation.ts`
-- a container of five arrays, not itself a finding), and the four ownership
findings in `usage-report.ts` (`AbandonedContractFinding`,
`UnresolvedConsumerFinding`, `UnconsumedOwnedVariableFinding`,
`IndeterminateOwnershipFinding`). Only `CompatibilityIssue` has any
machine-readable identifier at all (`code`, optional, and as of ADR 0024's
Phase 4 work populated on every check in `compatibility.ts` -- but still
never set by `detectExclusiveGroupIssues()`). A consumer wanting "every
problem this run found" today has to know about, and separately merge,
four unrelated shapes.

## Decision

**A new adapter, not a replacement.** `buildFindingModel()` maps the four
existing families into one canonical `Finding[]`/`FindingModel` shape.
Every existing exported type (`CompatibilityIssue`, `ArtifactCheckFinding`,
`DocumentationFindings`, the four ownership finding types) stays exactly as
it is -- this is purely additive, per ADR 0024's additive-wrapper
convention.

- **`code` is required on `Finding`, unlike the optional `CompatibilityIssue.code`
  it's adapted from.** Verified this is safe: `CompatibilityIssue` and the
  lower-level discovery/linking primitives are Experimental tier, not
  Stable, per `VERSIONING.md` -- and the package is pre-1.0, where even the
  Stable tier may change. Making `code` required on the _new_ canonical
  type costs nothing against the _existing_ type, which is untouched. Every
  source that doesn't naturally carry a code gets one synthesized here:
  `detectExclusiveGroupIssues()`'s issues (never set one, by design -- ADR 0009) become `"exclusive-group-violation"`; `ArtifactCheckFinding`'s
  `status` becomes `"artifact-stale"`/`"artifact-missing"`; each
  `DocumentationFindings` array and each ownership finding type gets its own
  code (`"undocumented-contract"`, `"abandoned-contract"`, etc.).
- **`location: EvidenceReference` is structured, never a formatted string.**
  The exact hazard `CompatibilityIssue.code` itself once was (an
  inconsistently-populated optional string) is avoided from the start here.
  `EvidenceReference` is a discriminated union keyed by `model`, carrying
  only as much identity as the source finding actually has -- `"contract"`
  (file/exportName/variable, all optional, for `CompatibilityIssue`/
  `DocumentationFindings`), `"ownership"` (contractName always present,
  file/variable optional -- `usage-report.ts`'s finding types don't
  consistently carry `file`+`exportName` together the way `DiscoveredContract`
  does), and `"change"` (a generated artifact's `path`, for
  `ArtifactCheckFinding` -- which isn't about a declared contract or
  variable at all).
- **`EvidenceReference` ships with only the three `model` variants something
  in this codebase actually needs today, not a speculative six-model union.**
  The original audit sketched `EvidenceReference` as covering all seven
  models; building `"dependency"`/`"lifecycle"`/`"finding"`/`"evidence"`
  variants now, with no real finding or projector to populate them, would be
  exactly the kind of premature generality this codebase avoids elsewhere.
  The type is a plain discriminated union -- trivially extended with a new
  variant once Phase 7+ (Dependency/Lifecycle Model) or Phase 13
  (`defineEvidenceProjection()`'s auto-provenance tracking) has a real
  consumer for one.
- **`family` is a coarser, four-value discriminant alongside `code`** --
  `"compatibility"` | `"drift"` | `"documentation"` | `"ownership"` -- for a
  consumer that wants "every documentation gap" without enumerating every
  individual code.
- **`buildFindingModel()`'s input is a flat object of independently-optional
  arrays/containers**, mirroring how `GenerateEnvArtifactsResult`'s own
  `manifest`/`docs`/`usage` fields are each independently optional -- a
  caller passes whatever it actually has (e.g. only `compatibilityIssues` if
  it never ran a docs or usage pass).

## Consequences

- A consumer building a unified findings view (cluster 3.3 in the original
  report audit) can call `buildFindingModel()` once instead of merging four
  shapes by hand.
- `EvidenceReference`'s `"ownership"` variant is keyed by `contractName`
  rather than `file`+`exportName` together, unlike `"contract"` -- a
  deliberate asymmetry reflecting what `usage-report.ts`'s finding types
  actually carry, not an oversight to reconcile later.
- `ArtifactCheckFinding`'s `"ok"` entries never become a `Finding` --
  `buildFindingModel()` only adapts what's actually wrong, consistent with
  every other source family (an absence of a finding already means "nothing
  to report" everywhere else in this model).

## Alternatives considered

- **Make `EvidenceReference` a formatted string** (e.g.
  `"contract:payments-team#STRIPE_KEY"`), mirroring how
  `CompatibilityIssue.code` started as an ad hoc string. Rejected --
  explicitly the anti-pattern ADR 0024 and this ADR both exist to move away
  from; a consumer would need to parse it back apart to do anything
  structured with it.
- **Retrofit `code` onto `CompatibilityIssue` as required**, instead of
  leaving it optional and building a separate, required-`code` `Finding`
  type. Rejected -- `CompatibilityIssue` is real, in-use public surface;
  changing an existing optional field to required is exactly the kind of
  gratuitous churn ADR 0024's additive-only discipline exists to avoid, even
  though the tier technically allows it.
- **Build all seven `EvidenceReference` model variants now**, anticipating
  Dependency/Ownership/Lifecycle/Change Model's eventual finding types.
  Rejected as premature -- see Decision above.
