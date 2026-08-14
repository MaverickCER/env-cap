---
"@maverickcer/env-cap": minor
---

Add an optional `classification` field to `documentEnv()`'s contract- and variable-level docs (`"secret" | "credential" | "pii" | "config"`), mirroring `owner`'s default-plus-per-variable-override pattern. Statically discovered like every other documentation field -- threaded through `DiscoveredVariable`/`DiscoveredContract` (`@maverickcer/env-cap/build`) and the committed manifest change-report snapshot, including field-level diffing when a variable's classification changes between runs. This is the first step of the Contract Model work described in [ADR 0024](specs/decisions/0024-fact-model-architecture.md) -- the one field the whole exposure/secret-hygiene report cluster was previously blocked on.
