# 0030: Change Model wraps the existing manifest change report

## Status

Accepted. Implemented in `src/build/change-model.ts` (`buildChangeModel()`,
`ChangeModel`), exported from `env-cap/build`. Rename
correlation (`RenamedVariable`, `renamedVariables`) landed as a second
phase on top of this same file once ADR 0029's `renamedFrom` field existed
to correlate from.

## Context

ADR 0024 named Change Model as the sixth of the seven canonical models,
already fact-shaped and exported as `ManifestChangeReport` (ADR 0021), but
with no versioned, model-namespaced identity of its own -- it's just a field
(`result.manifest.changes`) on `GenerateEnvManifestResult`, not a value a
consumer can hand to `defineEvidenceProjection()`-style code alongside the
other six models.

## Decision

**A thin wrapper, computing nothing new.** `ChangeModel` is
`{ schemaVersion, manifest: ManifestChangeReport }`; `buildChangeModel()`
takes an already-computed `ManifestChangeReport` and wraps it. Concretely:

- **`ManifestChangeReport` and its ref/update/field-change types stay
  exactly as they are, exported from where they already are.** Nothing
  about `generateEnvManifest()`'s consumer surface changes. This mirrors
  ADR 0024's additive-wrapper convention exactly: a canonical model is a
  new file that maps or aggregates existing pieces, never an in-place
  rewrite.
- **No rename correlation in the base shape.** `renamedFrom` (ADR 0029)
  exists on `DiscoveredVariable`/`ManifestSnapshotVariable` as a diffable
  field, but `diffManifestSnapshots()` itself doesn't read it -- correlation
  landed as a second, later phase (Change Model B, below), gated on this
  base shape existing first so the two changes land as independently
  reviewable, independently revertable steps.

**Change Model B: rename correlation lives in `change-model.ts`, not
`manifest-snapshot.ts`.** `buildChangeModel()` gained two more parameters
(`currentContracts: readonly DiscoveredContract[]`, `root: string`) and a
new `renamedVariables: readonly RenamedVariable[]` field on `ChangeModel`:

- **`ManifestChangeReport`/`diffManifestSnapshots()` stay untouched**,
  exactly as this ADR's original decision required. Correlation happens by
  cross-referencing the _current_ contracts' `renamedFrom` declarations
  against the _already-computed_ `manifest.addedVariables`/
  `removedVariables` -- a second pass over data that already exists, not a
  change to how the diff itself is computed. `ManifestVariableRef` gains no
  new field; `renamedFrom` isn't in that ref shape and doesn't need to be.
- **A rename is only ever correlated within the same contract**
  (`contractIdentity` must match on both halves) -- a variable moving
  between two different contracts' schemas is a different kind of change,
  not a rename, and correlating across contracts would risk a false match
  on a coincidentally-reused key name.
- **A `renamedFrom` that doesn't resolve to a real `removedVariables`
  entry correlates nothing.** No error, no warning -- the variable simply
  keeps showing as an ordinary addition in `manifest.addedVariables`,
  same "provable, not heuristic" fallback-to-silence ADR 0010 already
  established for barrel re-exports.
- **`renamedVariables` is additive, not a filter.** `manifest.addedVariables`/
  `removedVariables` still list a correlated rename's two halves
  separately -- a consumer wanting a deduplicated view filters them out
  using `renamedVariables` itself, rather than this model silently
  removing entries from the untouched legacy report.
- **No `renamedContracts`.** Lifecycle Model deliberately has no
  contract-level `renamedFrom` (ADR 0029's own alternatives-considered
  section) -- there is no field to correlate a contract-level rename from,
  so no such array is added here either.

## Consequences

- `ChangeModel` becomes the sixth model Evidence Model assembles against,
  alongside Contract/Dependency/Ownership/Lifecycle/Finding.
- `buildChangeModel()`'s signature grew from `(manifest)` to
  `(manifest, currentContracts, root)` between these two phases, both
  landing before any published release included the first shape -- an
  Experimental-tier signature change with no real external caller to
  break, per `VERSIONING.md`.
- A rename shows up in `ChangeModel.renamedVariables` as
  `{ previousKey, currentKey, ... }` the moment a `documentEnv()` edit sets
  `renamedFrom`, with no manual bookkeeping beyond authoring that one field.

## Alternatives considered

- **Land rename correlation in the same phase.** Rejected -- bundling "give
  Change Model its own identity" with "teach the diff to correlate renames"
  would make this phase's diff meaningfully harder to review and revert
  independently, for no benefit; the two are separable concerns that happen
  to touch the same file.
- **Fold `ChangeModel` directly into `ManifestChangeReport`** (add a
  `schemaVersion` field to the existing type) rather than a wrapping type.
  Rejected -- `ManifestChangeReport` is real, in-use public surface
  (`result.manifest.changes`); adding an unrelated `schemaVersion` field to
  it conflates "the diff" with "the model-namespaced fact wrapper," and
  would need every existing consumer destructuring that type to account for
  a field with no bearing on the diff itself.
