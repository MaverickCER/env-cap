---
"@maverickcer/env-cap": minor
---

Add the Dependency Model: `buildDependencyModel()`/`DependencyModel` publish a versioned, JSON-serializable fact-shaped result over the dependency-ownership engine, including an inverse `consumers` index (file -> which contracts it reads, the inverse of the existing contract -> consuming-files view) and per-access-site line numbers that were previously computed but discarded before reaching any type. `dependency-graph.ts`/`scan-dependencies.ts`'s scanning internals stay unexported, unchanged, per [ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md) -- see [ADR 0027](specs/decisions/0027-dependency-model-fact-shape-not-engine-access.md) for why publishing this fact doesn't relax that boundary.
