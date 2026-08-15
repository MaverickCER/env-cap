---
"@maverickcer/env-cap": minor
---

Add `deprecated`/`deprecatedReason`/`removeBy`/`renamedFrom` to `documentEnv()`'s per-variable docs (`deprecated`/`deprecatedReason` also at the contract level), threaded through the same static-analysis path every other documentation field follows -- `DiscoveredContract`/`DiscoveredVariable`, and the committed manifest change-report snapshot with field-level diffing. Add the Lifecycle Model: `buildLifecycleModel()`/`LifecycleModel` promote the existing `ExpiringEntry`/`computeExpiringEntries()` into a canonical, versioned shape (`expiring`), plus a new `contracts` array carrying every lifecycle-relevant fact for contracts/variables that set at least one. See [ADR 0029](specs/decisions/0029-lifecycle-model-deprecation-rename-fields.md).
