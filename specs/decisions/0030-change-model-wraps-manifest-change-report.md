# 0030: Change Model wraps the existing manifest change report

## Status

Accepted. Implemented in `src/build/change-model.ts` (`buildChangeModel()`,
`ChangeModel`), exported from `@maverickcer/env-cap/build`.

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
- **No rename correlation yet.** `renamedFrom` (ADR 0029) exists on
  `DiscoveredVariable`/`ManifestSnapshotVariable` as a diffable field, but
  `diffManifestSnapshots()` doesn't yet read it to correlate a remove+add
  pair into a single rename entry -- that's a second, later phase (Change
  Model B), gated on this base shape existing first so the two changes
  land as independently reviewable, independently revertable steps.

## Consequences

- `ChangeModel` becomes the sixth model Evidence Model assembles against,
  alongside Contract/Dependency/Ownership/Lifecycle/Finding.
- Because this is a pure wrapper, it carries no independent test risk
  beyond "does it pass the value through unmodified" -- the real behavior
  (the diff itself) is already covered by `manifest-snapshot.ts`'s existing
  tests.

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
