---
"@maverickcer/env-cap": minor
---

Adds `generateEvidenceModel()` (`@maverickcer/env-cap/build`, Experimental) -- the assembly orchestrator that runs schema discovery and linking once, then builds all seven canonical fact models (Contract, Dependency, Ownership, Lifecycle, Finding, Change, Evidence) by calling each model's own public builder directly, `deepFreeze()`s the result, and stamps provenance (a fresh `generatedAt`, env-cap's own `toolVersion`, and an optional caller-supplied `commit`). Unlike `generateEnvManifest()`/`generateDocumentation()`/`generateUsageReport()`/`generateEnvArtifacts()`, it never throws on a data-quality finding -- every compatibility issue, undocumented variable, abandoned contract, and similar shows up as a `Finding` in the returned model instead, by design.
