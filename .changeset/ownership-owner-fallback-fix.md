---
"@maverickcer/env-cap": patch
---

Fix `generateUsageReport()`'s `unconsumedOwnedVariables[].owner` ignoring a variable-level `owner` override when the contract has none set. It previously resolved ownership using only the contract's default `owner`, so a `documentEnv()` call setting `variables: { KEY: { owner: "..." } }` with no contract-level `owner` produced `owner: undefined` for that finding, disagreeing with the docs Catalog and ownership matrix (which already applied the variable-then-contract fallback correctly). `dependencyOwnership`/`abandonedContracts` are unaffected -- those are genuinely contract-level facts with no variable to override.
