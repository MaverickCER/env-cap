---
"@maverickcer/env-cap": minor
---

`detectCompatibilityIssues()` now sets a stable `code` (`"processor-return-type-conflict"` | `"processor-source-conflict"` | `"validator-source-conflict"`) on every check it runs, matching the `"duplicate-variable-documentation"` code the duplicate-documentation check already set. `CompatibilityIssue.code` is now typed as the new exported `CompatibilityIssueCode` union instead of a bare `string`. First step of the Finding Model work described in [ADR 0024](specs/decisions/0024-fact-model-architecture.md) -- every check now has a stable identifier to key CI filtering, doc-linking, or a future SARIF `ruleId` on.
