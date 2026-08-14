---
"@maverickcer/env-cap": minor
---

Add the Contract Model: a new, versioned, JSON-serializable projection of every declared environment-variable contract, active or not, including both `documentEnv()` metadata and the AST-derived schema facts (`hasDefault`/`hasProcessor`/`hasValidator`/etc.) that the manifest change-report snapshot deliberately excludes. Exported as `buildContractModel()`/`ContractModel` from `@maverickcer/env-cap/build`; its JSON Schema is published at the new `@maverickcer/env-cap/schema/contract-model` subpath (a `./schema/*` wildcard export now covers any future per-model schema too, alongside the unchanged `./schema`). See [ADR 0025](specs/decisions/0025-contract-model-json-projection.md).
