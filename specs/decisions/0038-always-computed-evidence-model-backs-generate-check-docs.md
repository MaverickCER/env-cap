# 0038: A real, always-computed `EvidenceModel` backs `generate`/`check`/docs; `ManifestSnapshot` retires; docs/ownership never throw

## Status

Accepted. Implemented.

## Context

`EvidenceModel`/`generateEvidenceModel()` (ADR 0031) existed, fully tested, schema-published — but
`computeArtifacts()`, the function `generateEnvArtifacts()`/`checkEnvArtifacts()`/the CLI's default
path all ultimately depend on, never actually built one. Every real consumer that wanted evidence,
including this repo's own `enterprise-platform` example, had to either hand-roll a duplicate
discovery pipeline or call `generateEvidenceModel()` as a second, fully independent
discover-and-link pass. `generate-evidence.ts` used to say this duplication out loud: "a real,
accepted cost." A sibling project (`data-cap`) hit and fixed the identical bug: an evidence model
that existed but was never wired into the artifact path everything else depends on. This ADR mirrors
that fix directly rather than inventing new snapshot machinery.

Two smaller, longstanding gaps rode along with the fix once the model became load-bearing:

- **`env.manifest.snapshot.json`** (ADR 0021) mechanically derived its path from the manifest's own
  location (`src/generated/env.manifest.ts` → `src/generated/env.manifest.snapshot.json`), implying
  it belonged to the same artifact family as the manifest. It doesn't. `env.manifest.ts` is a
  **runtime build artifact** — real TypeScript, imported and executed by the running application. A
  change-history/citation-baseline file is a **CI/reporting artifact** — read by `--check`, by CI
  tooling, by humans; never a build input to the application itself, and tying its path to the
  manifest's meant a project with no `.ts` manifest at all had no way to get one.
- `generateDocumentation()`/`generateUsageReport()` each had a throw-on-issue escape hatch
  (`onUndocumented`, `onOwnershipIssue`, the CLI's `--strict-docs`/`--strict-ownership`) for
  categories of finding — undocumented variables, unconsumed owned dependencies — that are not
  provable defects the way ADR 0009's exclusive-group/compatibility errors are. Both are heuristic
  signals with real, common false-positive causes (a webhook handler in another repo; a shell script
  reading the variable; a package outside the `packages` allowlist), yet a throw treated them as hard
  failures.

## Decision

### `computeArtifacts()` always builds the real `EvidenceModel`

- The six canonical fact models (Contract/Dependency/Ownership/Lifecycle/Finding/Change →
  `EvidenceModel`) are composed on **every** `computeArtifacts()` call, unconditionally
  (`generate-env-artifacts.ts`), reusing the exact same builders `generateEvidenceModel()` calls —
  not a second implementation of the same assembly. `GenerateEnvArtifactsResult.evidence:
EvidenceModel` is therefore always populated, regardless of whether `--evidence`/`options.evidence`
  was requested. Free to compute (the same discovery/link pass every other requested output already
  paid for, via the shared `assembleProject()`), always real, never conditionally scoped.
- **New `--evidence <path>` CLI flag / `evidence?: { location: string } | false` option** on
  `GenerateEnvArtifactsOptions`, resolved via `resolveWithinRoot()` exactly like every other output
  location — independent of, and unconstrained by, `manifest.location`. Requesting it needs no other
  pass: `generateEnvArtifacts({ root, evidence: { location: "docs/env.evidence.json" } })` alone
  succeeds and writes exactly that one file (plus its `.fingerprint` sidecar, below).
- **Default location convention is `docs/`, never `src/`** — the same reasoning that already put
  `ENVIRONMENT.md`/`OWNERSHIP.md` there: this is generated-but-non-runtime content, not a build
  input. Every example commits `docs/env.evidence.json`.
- **Optional, always** — nothing writes it unless `evidence.location`/`--evidence <path>` is
  explicitly passed. Not an automatic side effect of requesting a manifest, unlike the old sidecar.
- `--check` gets evidence support through the **existing generic plumbing**, not a new mechanism:
  `ArtifactCheckFinding["artifact"]`'s union gained `"evidence"`, and `checkEnvArtifacts()` re-renders
  the evidence JSON in-memory and diffs it against disk via the same `compareTextArtifact()`/
  `readIfExists()` path manifest/docs/usage already used (`check-artifacts.ts`).

### The provenance/timestamp trap, and the parallel `change`-field trap

`EvidenceModel.provenance.generatedAt` is a live timestamp. Persisting it into `docs/env.evidence.json`
and then having `--check` re-render-and-diff the same way as every other artifact would fail on
_every single run_, even with zero real changes — the file can never be "up to date" against itself,
since a fresh render's timestamp can never equal a past write's. `normalizeEvidenceSnapshotForComparison()`
(`evidence-snapshot.ts`) blanks `provenance.generatedAt` before any comparison — used by
`check-artifacts.ts`'s `normalizeEvidenceJsonForComparison()`, by every example's golden-file
comparison (`test/support/example-runner.ts`), and by the `--json` envelope's embedded `evidence`
field (`normalizeExampleJsonOutput()`) — one normalization rule, applied at every place a persisted
or embedded copy gets compared, not three separately-maintained ones.

A second, less obvious instance of the same trap surfaced during implementation: `evidence.change`
describes "what's different from whatever snapshot was on disk the moment this run computed it." By
construction, a `--check` run's own re-derivation of `change` is **not reproducible** against the
file it's verifying — by the time `--check` recomputes, the file just written _is_ the new baseline,
so the diff naturally comes back different from (emptier than) what got persisted. This isn't drift;
it's what `change` means. `normalizeEvidenceSnapshotForComparison()` blanks `change.manifest` and
`change.renamedVariables` to a constant empty value for exactly the same reason it blanks
`generatedAt` — caught by a real test (`--check` run twice in a row with no source edits must report
clean both times), not by inspection.

### `env.manifest.snapshot.json` retires; one evidence file replaces it

`src/build/manifest-snapshot.ts` is deleted. Its two real jobs both retarget to
`docs/env.evidence.json` (or wherever `evidence.location`/a caller's `previousSnapshotLocation`
points), fully decoupled from wherever — or whether — a `.ts` manifest is even being generated:

- **Field-level change diffing** — `diffContracts()` (`evidence-snapshot.ts`), a **generic structural
  differ**, not a hand-maintained field-by-field comparison. It walks every own key of a
  `ManifestContractRef`/`ManifestVariableRef` pair via `genericFieldChanges()`, skip-listing identity
  fields (`file`, `exportName`, `key`) rather than special-casing every content field by name — a new
  field on either shape is diffed automatically, with no matching update required in the differ
  itself. `metadata` is special-cased to recurse per-key (`recordFieldChanges()`) rather than being
  diffed as one opaque blob, so `metadata.<key>`-level change entries survive.
- **Dynamic-access citation content-hash baselines** (ADR 0037) —
  `computeDynamicAccessAcknowledgments()`/`findDynamicAccessCitationProblems()` now read
  `contentHash` off `EvidenceModel.dependency`'s own `DynamicAccessAssertion` (a field added directly
  to that type, not a parallel shape) instead of a separate `ManifestSnapshotVariable.dynamicAccessSnapshots`
  array.

One committed file, two consumers (`--check` staleness, and cross-run citation-freshness comparison),
not two files, and not tied to the manifest's own path. Whether a project commits
`docs/env.evidence.json` is that project's call — a missing file reads as the normal first-run state
everywhere this is read, never an error.

### The fingerprint cache (`getEvidenceModel()`), mirroring `data-cap`'s fix

A full `generateEvidenceModel()` call pays for schema parsing, cross-file linking, the
dependency-graph AST scan, and all six model builds — expensive to pay on every single report/
projection script invocation. `evidence-cache.ts` adds:

- **`computeSourceFingerprint()`** — a SHA-256 over the raw bytes of every schema file and every
  usage-scan-surface file (`**/*.ts`/`**/*.tsx`, the same broad surface ADR 0036's dynamic-access
  scan already uses), plus env-cap's own installed version. Zero AST work; still pays for the
  discovery/glob walk itself (fingerprinting has to know which files matter), but skips everything
  after it. Deterministic — file paths are deduplicated and sorted before hashing.
- **`getEvidenceModel()`** — trusts the committed evidence artifact only when its paired
  `.fingerprint` sidecar matches a freshly-computed `computeSourceFingerprint()`; never on file
  presence alone, never on a timestamp (a checkout, a rebase, or a `touch` can all bump mtime with no
  real content change). On any mismatch — stale fingerprint, missing/corrupt evidence file, no
  sidecar at all — falls back to a real `generateEvidenceModel()` call. Never hard-fails, never
  serves data that might be stale.
- **Never self-heals, never writes.** A cache miss inside `getEvidenceModel()` does not refresh the
  committed artifact or its fingerprint — only the explicit write path
  (`generateEnvArtifacts()`'s `evidence` option, which calls `writeEvidenceSnapshot()` +
  `writeEvidenceFingerprint()` together, always in that order so the two files never describe
  different moments) does that. Two independent callers hitting the same stale cache both recompute
  independently; neither's recompute updates what the other reads.

**A consequence worth naming explicitly, not a bug**: because the fingerprint's scan surface is
`**/*.ts`/`**/*.tsx` across the whole project, editing _any_ TypeScript file in a project — including
a test file with no relationship to a schema or a consumer — invalidates the cache and changes the
fingerprint. This is the intended breadth (the same surface ADR 0036/0037's citation machinery needs
to stay honest about what was actually scanned), not something to narrow for convenience.

A real test bug caught this design's own edge, mirroring `data-cap`'s account of the same mistake:
`configuration-governance.test.ts`'s provenance test asserts a **freshly-generated** `generatedAt` is
`>=` a timestamp captured immediately before the call. Calling the _cache-aware_ `getEvidenceModel()`
there is wrong on its face — the whole point of that function is to skip generation (and thus skip
stamping a new `generatedAt`) when nothing changed, so asserting freshness through it is
self-contradicting, not merely flaky. Fixed by having that one test call `generateEvidenceModel()`
directly; every other test in the same file, which only wants correct _content_, keeps using
`getEvidenceModel()` for the cache's real benefit.

### `ENVIRONMENT.md`/`OWNERSHIP.md` never throw; findings replace the escape hatch

- `onUndocumented`/`blocking` (`generate-documentation.ts`) and `onOwnershipIssue`/`blocking`
  (`generate-usage.ts`) are removed outright — pre-1.0, not deprecated-and-kept. So are the CLI's
  `--strict-docs`/`--strict-ownership` flags. `--strict` (manifest exclusive-group/compatibility —
  ADR 0009's genuinely provable error category) is untouched; it is the one pass that still blocks.
- Documentation completeness and ownership hygiene are visible `Finding`s (`documentation`/
  `ownership` families) a team can gate on in its own CI step, reading `Finding[]` off the evidence
  artifact — never something env-cap enforces via a thrown error. `computeDocumentation()`/
  `computeUsage()` now have exactly one throw-severity-free shape of result each, computed
  unconditionally regardless of whether the corresponding pass was itself requested (Finding Model,
  now part of the always-built `EvidenceModel`, needs both either way).

### `renderDocs()` migrates to `ContractModel`; the hand-synced adapter drops

`docs.ts`'s `renderDocs()`/`renderCatalog()`/`renderDependencyGraph()` take `ContractModelContract`/
`ContractModelVariable` directly instead of `DiscoveredContract[]`, and drop the `root` param (a
`ContractModelContract.file` is already root-relative, POSIX-separated — no `relativeTo()` helper
needed at render time). This removes the need for `to-discovered-contracts.mjs`, a hand-synced,
untyped adapter the `enterprise-platform` example's `config-reference.mjs` projection used to
maintain solely to satisfy `renderDocs()`'s old signature — already flagged as a drift risk in ADR
0036's Consequences. `config-reference.mjs` now calls `renderDocs(evidence.contract.contracts, ...)`
directly. `generate-documentation.ts`/`check-artifacts.ts` build a `ContractModelContract[]` once
(`computeDocumentation()`'s `contractModelContracts` field) and pass it to both the real write path
and the `--check` comparison, rather than each computing it separately.

`ContractModelVariable` gained a new field, `dynamicAccess: readonly string[] | undefined`, populated
in `buildContractModel()` — purely additive, no schema-version bump. `effectiveOwner()`/
`effectivePurpose()`/`effectiveLegalBasis()`/`effectiveRetentionPolicy()`/`effectiveDataResidency()`/
`effectiveAuditRequired()` (`link.ts`) were genericized to structural parameter types so one
implementation serves both `DiscoveredContract`/`DiscoveredVariable` and `ContractModelContract`/
`ContractModelVariable` shapes without duplicating the field-fallback logic. `computeExpiringEntries()`
deliberately was **not** migrated the same way — it stays on a new, narrower structural type
(`ExpiryBearingContract`, satisfied by both shapes) rather than `ContractModel`, specifically to avoid
silently changing the Stable-tier `DocumentationFindings.expiringSoon[].file` from absolute to
relative. Nothing in `docs.ts`'s own render path calls this function; migrating it would have been an
unforced breaking change to an unrelated public field.

### Confidence signal: the caveat gets specific, and a citation-freshness column replaces a collapsed label

`OWNERSHIP.md`'s "unconsumed owned dependencies" caveat expanded from a bare "not proof of dead code"
to name the concrete cases: a separate out-of-repo service or webhook handler; non-TypeScript
consumers (a shell script, a Dockerfile, a Terraform/Kubernetes manifest); or a package whose usage
lives outside this project's own `packages` allowlist (ADR 0014).

Rather than collapsing confidence into a `high`/`low` label, `UnconsumedOwnedVariableFinding`/
`IndeterminateOwnershipFinding` gained `staleOrMissingCitations: readonly DynamicAccessCitationProblem[]`
(`usage-report.ts`), joined from `findDynamicAccessCitationProblems()`'s existing output on the
variable-identity key ADR 0037 already produces. Rendered as its own report column
(`formatStaleOrMissingCitations()`): blank is the strongest "looks genuinely unused" signal — no
developer has ever claimed dynamic access here. A non-blank cell names the exact stale/missing
citation(s) — a developer specifically claimed dynamic access once and that claim can no longer be
verified — the report shows the receipt directly rather than asking a reader to trust a label.

## Consequences

- **Breaking (deliberate, pre-1.0, per VERSIONING.md)**: `GenerateEnvManifestResult.changes` no
  longer exists — `generateEnvManifest()` itself no longer tracks change history at all; that moved
  entirely to the persisted evidence artifact. Any script computing "what changed" from a bare
  manifest call (e.g. `split-generators`'s fixture, which calls the standalone generators separately
  rather than through `generateEnvArtifacts()`) must call `generateEvidenceModel()`/`getEvidenceModel()`
  itself and read `evidence.change.manifest`.
- `src/build/manifest-snapshot.ts` is deleted; `ManifestChangeReport`/`ManifestContractRef`/etc. types
  live on, retargeted, in `evidence-snapshot.ts`.
- `--strict-docs`/`--strict-ownership` are gone from the CLI; a project relying on either for CI
  gating needs to switch to reading `Finding[]` off `--evidence`'s output in its own step.
- `RenderDocsOptions.undocumentedContracts`/`undocumentedVariables` (and the equivalent
  `check-artifacts.ts` comparison) need root-relative `file` values now, matching `ContractModelContract`'s
  convention — `generate-documentation.ts` exports `relativizeRef()` for exactly this conversion,
  applied at both the real write path and the drift-check path.
- A test asserting no file under `src/runtime/` (or the isomorphic `src/evidence/`) imports evidence-
  snapshot/cache machinery would be a reasonable follow-up to make the "never executed at runtime"
  invariant self-verifying rather than convention-only; not added in this pass.
- Every flagship (`application/`, `team-service/`, `enterprise-platform/`) and every integration
  fixture's `expected/` golden now includes `docs/env.evidence.json` + `.fingerprint`, regenerated via
  `scripts/update-example-goldens.mjs`. Because the fingerprint's scan surface is project-wide
  (`**/*.ts`/`**/*.tsx`), editing _any_ `.ts` file inside an example directory — including its own test
  files — changes that example's fingerprint and requires re-running the golden-regeneration script,
  even when the edit has nothing to do with schemas or evidence content.

## Alternatives considered

- **Keep deriving the snapshot's path from `manifest.location`.** Rejected — ties a CI/reporting
  artifact's existence to whether a project happens to also generate a runtime `.ts` manifest, which
  is an unrelated decision. A project with only `--docs`/`--ownership`, no `.ts` manifest at all,
  should still be able to get evidence.
- **Compare `--check`'s embedded/persisted `generatedAt` and `change` by re-deriving and accepting the
  mismatch as real drift.** Rejected — this would make `--check` permanently unable to report "up to
  date" for the one artifact whose entire point is proving CI can trust it; caught by a real repeated-
  `--check` test, not merely reasoned about.
- **Upgrade `unconsumedOwnedVariables`/`indeterminate` findings to a collapsed `confidence: "high" |
"low"` label.** Rejected — collapses an inspectable fact (which exact citations exist, and whether
  each is fresh) into a label a reader has to trust rather than verify, the same objection ADR 0036/
  0037 already raised against less-specific evidence shapes elsewhere in this codebase.
- **Migrate `computeExpiringEntries()` to `ContractModelContract` alongside everything else in
  `docs.ts`.** Rejected — no caller inside `docs.ts`'s own render path needs it on that type, and doing
  so would have silently flipped `DocumentationFindings.expiringSoon[].file` (Stable tier) from
  absolute to relative for no benefit.
