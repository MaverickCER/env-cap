# 0037: Developer-declared dynamic-access citations, kept fully separate from `VariableAccessStatus`, with committed-baseline acknowledgment freshness

## Status

Accepted. Implemented. **Amended**: the two `FindingCode`s this ADR introduced were renamed from
`"dynamic-access-citation-stale"`/`"dynamic-access-citation-missing"` to
`"stale-dynamic-access-citation"`/`"missing-dynamic-access-citation"` to match the adjective-first
word order every other `FindingCode` uses (`FINDING_MODEL_SCHEMA_VERSION` bumped to 2). Every
occurrence of the old names below is historical — read as the renamed values.

## Context

ADR 0036 made "dynamic (computed) property access was observed" a first-class, position-cited fact
(`dynamicAccessSites`), but left no way for a developer to explain _away_ a false "unconsumed"/
"indeterminate" signal when the real access genuinely happens somewhere env-cap's static AST walk
can't see at all — a separate shell script, a Docker entrypoint, a sibling service in another
repository, a config loader that string-builds a key with no traceable import relationship to the
contract. Without an escape hatch, every such variable permanently reads as unused or uncertain, no
matter how correct the deployment actually is.

The obvious naive fix — a developer-supplied `dynamicAccess` hint that upgrades `VariableAccessStatus`
directly to `"used"` — was considered and rejected during design review: that would make env-cap
_claim it observed_ something it never actually saw, collapsing two epistemically different kinds of
evidence (an AST walk's own finding vs. a developer's unverified claim) into one signal a report
reader could no longer tell apart.

## Decision

- **`VariableDocs.dynamicAccess?: readonly string[]`** (new) — each entry a
  `"<relative-path>:<line>:<column>"` citation. Parsed via a new, shared `parsePositionCitation()`
  (`source-position.ts`), reused everywhere a citation needs turning back into a `SourcePosition`.
  Malformed entries (wrong shape, non-positive line/column) are dropped individually with a
  `ParseWarning`, never a hard failure — matches every other statically-unresolvable-field policy in
  `parse.ts`.
- **`VariableAccessStatus` is untouched — still exactly `"used" | "unconsumed" | "indeterminate"`,
  purely AST-derived.** A citation is modeled as a wholly separate, independent fact:
  `DependencyModelVariable.dynamicAccessAssertions: readonly DynamicAccessAssertion[]`, each entry a
  `SourcePosition` plus its own `acknowledgment: "fresh" | "stale" | "missing"`. The raw `status` and
  any assertions are always both present on the same object — nothing ever overwrites the other. A
  citation is called an **acknowledgment**, not "verification": content-hash matching only proves the
  developer re-confirmed the citation against a specific version of the cited file, never that the
  citation is semantically correct (env-cap was never built to parse shell scripts, Dockerfiles, or
  YAML).
- **Freshness is a committed-baseline comparison, re-derived every run, mirroring the existing
  `renamedFrom`/`expiresAt` "committed snapshot, diffed on next run" pattern.**
  `ManifestSnapshotVariable.dynamicAccessSnapshots` stores a SHA-256 hex digest of each cited file's
  full content at the moment `generate:env` last ran and confirmed the file existed —
  `MANIFEST_SNAPSHOT_SCHEMA_VERSION` was **not** bumped for this (purely additive), so every reader
  must treat the field as possibly absent, not just possibly empty (see Consequences).
  `computeDynamicAccessAcknowledgments()` (`manifest-snapshot.ts`) re-checks, every run: does the
  cited file exist right now (never trusted from either snapshot -- always a fresh, live check)? If
  not, `"missing"`. If it exists, does its current hash match the previous snapshot's stored digest
  for that exact citation? Match, or no previous baseline at all (a brand-new citation, nothing to
  contradict it yet) → `"fresh"`. Mismatch → `"stale"`.
- **Only a `"fresh"` assertion suppresses a finding.** `deriveOwnershipFindings()`
  (`dependency-graph.ts`) skips `unconsumedOwned`/`indeterminate` entirely for a variable with at
  least one fresh assertion — but never silently drops it: it's reported instead in a new `asserted`
  category (`AssertedOwnershipFinding`/`AssertedDynamicAccessFinding`), carrying `wouldBeStatus`
  (what `status` would have produced) side by side with the assertion, rendered in
  `OWNERSHIP.md` as its own `## Asserted (developer-acknowledged dynamic access)` section — the
  report always shows what was actually observed, never lets a developer's claim quietly replace it.
- **A stale or missing citation becomes a real, actionable `Finding`.** Two new `FindingCode`s,
  `"stale-dynamic-access-citation"`/`"missing-dynamic-access-citation"` (`family: "ownership"`,
  `severity: "warning"`), computed by `findDynamicAccessCitationProblems()` and adapted by
  `finding-model.ts` — the one ownership-family finding with a genuinely meaningful `location.position`
  (every other ownership finding leaves it `undefined`, per ADR 0036's still-deferred position
  threading), since the citation's own position _is_ exactly what the finding is about. This is what
  actually prevents a citation from permanently laundering a variable out of scrutiny: once its
  baseline goes stale, the suppression stops applying on the very next run.

## Consequences

- `ManifestSnapshotVariable.dynamicAccessSnapshots` is typed `readonly (...)[] | undefined`, not a
  bare array, specifically because it's additive-without-a-version-bump — a real snapshot committed
  before this field existed parses as `"ok"` (not `"unsupported-version"`) while genuinely lacking the
  key. `computeDynamicAccessAcknowledgments()` defaults to `[]` at every read site; caught via a real
  fixture (`test/integration/positive/enterprise/tsconfig-aliases`) throwing
  `TypeError: variable.dynamicAccessSnapshots is not iterable` against its own real, pre-existing
  committed snapshot before this defensive read was added — not a hypothetical.
- `buildManifestSnapshot()` becomes `async` (hashing cited files is I/O) and gains a required
  `readFile` parameter; `computeManifestChanges()` likewise gains a required `readFile` parameter.
  Every production call site (`generate-manifest.ts`, `generate-evidence.ts`,
  `generate-env-artifacts.ts`) already had a `readFile`/`readFileCached` in scope, so this was a
  mechanical threading change, not new plumbing.
- `buildDependencyGraph()`/`buildDependencyModel()`/`computeUsage()` each gain an optional final
  `dynamicAccessAcknowledgments` parameter. When the manifest pass isn't also requested (no
  `computeManifestChanges()` call happened), this is simply omitted — every `dynamicAccessAssertions`
  reads back as `[]` for that run, a real, honestly-scoped limitation: acknowledgment freshness needs
  the manifest snapshot's committed baseline to mean anything, so it's only as available as that pass
  is.
- Implementing this surfaced a real, pre-existing gap unrelated to this ADR: `generate-env-artifacts.ts`'s
  `computeArtifacts()` (the orchestrator behind `generateEnvArtifacts()`, the CLI's default
  `generate:env` path) was still calling a bare `discoverSchemaFiles()` for its usage scan instead of
  ADR 0036's `computeScanSurface()` — meaning the most common path never actually scanned allow-listed
  `packages` sources for usage, only `generateUsageReport()`/`generateEvidenceModel()` did. Fixed as
  part of this pass (it needed the same `computeScanSurface()` call site touched to thread
  `dynamicAccessAcknowledgments` through anyway), not a new gap this ADR introduces.
- `OwnershipFindings`/`RenderUsageReportOptions` both gain a mandatory `asserted` field — every
  existing hand-written fixture constructing either shape needed a `asserted: []` (or real content)
  added.

## Alternatives considered

- **Upgrading `VariableAccessStatus` to a 4th value (e.g. `"asserted-dynamic"`) when a citation
  exists.** Rejected during design review — conflates "env-cap observed this" with "a developer
  claimed this," the exact distinction this whole feature exists to preserve. A consumer reading
  `status` alone must always get a purely AST-derived answer.
- **Calling citation-hash matching "verification."** Rejected — a matching hash proves the developer
  re-confirmed the citation against an unchanged file, nothing about whether the citation is
  semantically correct. "Acknowledgment" is the honest word.
- **Trusting a citation forever, with no freshness check.** Rejected — a citation that's never
  re-validated could let a variable launder itself out of "unused" scrutiny indefinitely, even after
  the cited file (and the access it once documented) is deleted or rewritten. Re-deriving freshness
  every run, against a committed baseline, closes that permanently.
