# 0029: Lifecycle Model adds deprecation/rename fields, promotes ExpiringEntry

## Status

Accepted. `deprecated`/`deprecatedReason`/`removeBy`/`renamedFrom` added to
`VariableDocs` (`deprecated`/`deprecatedReason` also on `ContractDocs`),
threaded through `parse.ts` -> `link.ts` -> `manifest-snapshot.ts`.
Implemented in `src/build/lifecycle-model.ts` (`buildLifecycleModel()`,
`LifecycleModel`), exported from `env-cap/build`.

## Context

ADR 0024 named two gaps in the Lifecycle Model: no `deprecated`/`removeBy`
field at all (only contract-level `active: boolean`, which means "on/off,"
not "being phased out"), and no `renamedFrom` -- so a variable rename shows
up in `ManifestChangeReport` as an unrelated `removedVariables` +
`addedVariables` pair instead of a single correlated change. Zero grep hits
existed anywhere in the codebase for any of these four fields before this
change.

## Decision

**Add the four fields exactly like every other `documentEnv()` field
already flows** -- `runtime/document.ts` -> `build/parse.ts`
(`DiscoveredVariableDocs`/`DiscoveredContractDocs`) -> `build/link.ts`
(`DiscoveredVariable`/`DiscoveredContract`) -> `build/manifest-snapshot.ts`
(`ManifestSnapshotVariable`/`ManifestSnapshotContract`, including
field-level diffing), the same path ADR 0024's Contract Model phase
established for `classification`. No new mechanism, no special case.

- **`deprecated`/`deprecatedReason` exist at both variable and contract
  level; `removeBy`/`renamedFrom` exist only at variable level.** A
  variable rename is a variable-level fact by nature. A contract-level
  "removeBy"/"renamedFrom" wasn't asked for by the audit and has no clear
  meaning (a contract doesn't have a single name to rename `from`) --
  adding it now would be speculative scope, not a real gap being closed.
- **`deprecated` is deliberately independent of `expiresAt` and of
  contract-level `active`.** `expiresAt` is a rotation/sunset _date_;
  `deprecated` is a phase-out _signal_ with no required date attached (a
  variable can be deprecated with no `removeBy` set yet). `active` is an
  on/off switch for whether a contract participates in the manifest at all
  -- orthogonal to whether it's being phased out. All three stay
  independently settable, matching how `expiresAt` and `active` already
  coexist without one implying the other.
- **`LifecycleModel` promotes the already-good `ExpiringEntry`/
  `computeExpiringEntries()` precedent** (real, exported, already reused
  across `renderDocs()` and `generate-documentation.ts`) into a canonical,
  versioned shape (`expiring` field, unchanged), and adds a new
  `contracts` array carrying every lifecycle-relevant fact
  (`expiresAt`, `refreshInstructions`, `deprecated`, `deprecatedReason`,
  `removeBy`, `renamedFrom`) per contract/variable.
- **`LifecycleModel.contracts` only includes a contract when it, or at
  least one of its variables, actually sets a lifecycle field** -- the same
  "only what's relevant" scope `renderLifecycleReport()`'s existing row
  filter already uses (`expiresAt || owner || refreshInstructions`, minus
  `owner`, which belongs to the Ownership Model, not this one). A contract
  with no lifecycle data at all contributes nothing to this model, same as
  it contributes no row to the rendered report today.
- **`renamedFrom` is authored, not inferred.** Consistent with ADR 0010's
  "provable, not heuristic" ethos: no Levenshtein/similarity matching is
  attempted anywhere to _guess_ a rename from a remove+add pair.
  `diffManifestSnapshots()` reading `renamedFrom` to actually correlate a
  rename is Change Model B's job (a later phase), gated on this field
  existing first.

## Consequences

- `ManifestChangeReport`'s `updatedVariables` now includes `renamedFrom` in
  its field-level diff whenever it changes, same as any other field --
  itself not yet a rename _correlation_, just a diffable fact, until Change
  Model B lands.
- A deprecation workflow (flag a variable, give a reason, set a removal
  date) is now representable in `documentEnv()` without overloading
  `expiresAt` (a rotation concept) or `active` (an on/off switch) to mean
  something they were never designed to mean.
- `LifecycleModelContract`/`LifecycleModelVariable` deliberately omit
  `owner` -- a consumer wanting both lifecycle and ownership facts for the
  same contract joins `LifecycleModel` with `OwnershipModel` by identity
  (`file`+`exportName`), rather than this model duplicating a field that
  model already owns.

## Alternatives considered

- **Overload `expiresAt` to also mean "deprecated."** Rejected -- a
  variable can be deprecated with no known removal date yet (the whole
  reason `removeBy` is optional and separate), and a variable can have a
  rotation `expiresAt` with no deprecation intent at all (a secret that
  just needs periodic rotation, not phase-out). Conflating the two would
  make either concept unrepresentable without the other.
- **Attempt heuristic rename detection** (matching a removed key to an
  added key by similarity/edit-distance) instead of an authored
  `renamedFrom` field. Rejected -- exactly the kind of guess ADR 0010's
  "provable, not heuristic" principle already rules out elsewhere in this
  codebase; a false-positive rename correlation would be actively
  misleading in a change report.
- **Add `removeBy`/`renamedFrom` at the contract level too, for
  symmetry.** Rejected as speculative -- neither has a clear meaning at
  contract granularity, and nothing in the original audit asked for it.
