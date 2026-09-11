# 0028: Ownership Model shares one `effectiveOwner()` rule, fixing a pre-existing divergence

## Status

Accepted. `effectiveOwner()` relocated from `docs.ts` (private) to
`link.ts` (exported). Implemented in `src/build/ownership-model.ts`
(`buildOwnershipModel()`, `OwnershipModel`), exported from
`env-cap/build`. `src/build/generate-usage.ts` now uses the
shared function for `unconsumedOwnedVariables`' `owner` field.

## Context

ADR 0024 flagged that Ownership Model's "unowned" signal previously existed
only as a count (`noOwnerCount`) inside `docs.ts`'s `renderSecurityReview()`
prose, computed via that file's own private `effectiveOwner()` (variable's
own `owner`, falling back to the contract's). Investigating that gap
surfaced a real, separate bug: `generate-usage.ts`'s `computeUsage()`
resolves ownership for its findings using only `contract.owner`, via a
locally-built `ownerByIdentity` map that never looks at a variable's own
`owner` override at all. For a contract-level finding (`dependencyOwnership`,
`abandonedContracts`) that's correct -- there's no specific variable in
play. But `UnconsumedOwnedVariableFinding` _does_ name a specific variable
(`key`), and its `owner` field was silently using the contract-only value --
meaning `docs.ts`'s Catalog/ownership matrix and `usage-report.ts`'s
Dependency & Ownership Report could disagree about who owns the same
variable whenever a `documentEnv()` call set a per-variable `owner`
override with no contract-level default.

## Decision

**Fix the bug and build the model on the corrected, shared rule in the same
change**, rather than building a new model on top of a known-divergent
foundation:

- **`effectiveOwner()` moves to `link.ts`, exported.** Co-located with
  `DiscoveredContract`/`DiscoveredVariable`, the types it operates over,
  instead of living private inside the one renderer that happened to need
  it first. `docs.ts` now imports it instead of defining its own copy.
- **`generate-usage.ts` gains a second lookup, `effectiveOwnerFor()`,
  used only for `unconsumedOwnedVariables`.** The existing contract-only
  `ownerFor()` stays exactly as it was for the three genuinely
  contract-level fields (`dependencyOwnership.owner`,
  `abandonedContracts.owner`) -- those have no variable to consider an
  override for, so using the contract's own `owner` there was never wrong.
  Only the one finding type that names a specific variable needed the fix.
- **`OwnershipModel` computes every variable's owner through the same
  shared `effectiveOwner()`, and itemizes `unownedContracts`/
  `unownedVariables` as real arrays**, matching the array-of-refs shape
  `abandonedContracts`/`unconsumedOwnedVariables` already established in
  `usage-report.ts` -- not a new shape invented for this model.
- **Scoped to every discovered contract, active or not** -- the same scope
  `renderSecurityReview()`'s `noOwnerCount` already had (it counts over
  `for (const contract of contracts)` with no `active` filter). This model
  formalizes that existing scope rather than narrowing it.

## Consequences

- `docs.ts` and `usage-report.ts` can no longer disagree about who owns a
  variable -- both read through the one function.
- This is, narrowly, a bug fix bundled with new scope: the changeset for
  this change ships as two entries -- a `patch` for the
  `unconsumedOwnedVariables` owner-resolution fix, a `minor` for the new
  `OwnershipModel` type -- so the changelog doesn't conflate "this was
  wrong before" with "this is new."
- `OwnershipModelContract.owner` is deliberately _not_ run through
  `effectiveOwner()` (there's no level above a contract to fall back to) --
  only `OwnershipModelVariable.owner` is "effective" in that sense. A
  reader shouldn't assume the same word means the same computation at both
  levels without checking; the field-level doc comments say so explicitly.

## Alternatives considered

- **Ship `OwnershipModel` first, fix the `generate-usage.ts` bug in a
  separate, later change.** Rejected -- building a new canonical model on
  top of a foundation already known to produce two different answers for
  the same question would just give the bug a second, model-shaped place
  to hide, rather than actually resolving ADR 0024's stated goal of "a fact
  gets computed once."
- **Leave `ownerFor()` (contract-only) as the single lookup, and make
  `effectiveOwnerFor()` the _only_ one, used everywhere in
  `generate-usage.ts`.** Rejected -- `dependencyOwnership`/
  `abandonedContracts` are genuinely contract-level facts; running them
  through variable-aware resolution would be meaningless (there's no
  variable) and would obscure that these three fields answer a different
  question than `unconsumedOwnedVariables.owner` does.
