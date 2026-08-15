---
"@maverickcer/env-cap": minor
---

Add the Finding Model: `buildFindingModel()`/`Finding`/`FindingModel` unify `CompatibilityIssue`, `ArtifactCheckFinding`, `DocumentationFindings`, and the four `usage-report.ts` ownership findings into one shape with a required, stable `code`, a coarse `family` discriminant, and a structured `location: EvidenceReference` pointer instead of a formatted string. All four existing finding types are unchanged -- this is purely additive. Also adds the new `EvidenceReference` type (`ContractEvidenceReference` | `OwnershipEvidenceReference` | `ChangeEvidenceReference`), the structured-location vocabulary the Finding Model and, later, `defineEvidenceProjection()` build on. See [ADR 0026](specs/decisions/0026-finding-model-unifies-four-families.md).
