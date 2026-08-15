---
"@maverickcer/env-cap": minor
---

Add the Ownership Model: `buildOwnershipModel()`/`OwnershipModel` publish every contract and variable's effective owner, plus first-class `unownedContracts`/`unownedVariables` arrays -- previously only a count (`noOwnerCount`) inside `docs.ts`'s rendered security-review text. Also exports `effectiveOwner()` (relocated from `docs.ts` to `link.ts`) as reusable public surface. See [ADR 0028](specs/decisions/0028-ownership-model-shared-effective-owner.md).
