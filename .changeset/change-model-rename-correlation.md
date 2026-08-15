---
"@maverickcer/env-cap": minor
---

`buildChangeModel()` now correlates a renamed variable's `addedVariables`/`removedVariables` pair (matched via the current declaration's `renamedFrom`, ADR 0029) into a new `ChangeModel.renamedVariables` array, and takes two new parameters -- `currentContracts` and `root` -- to do so. `ManifestChangeReport` itself is unchanged; `renamedVariables` is additive, not a filter over the existing `addedVariables`/`removedVariables`. See [ADR 0030](specs/decisions/0030-change-model-wraps-manifest-change-report.md).
