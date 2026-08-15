---
"@maverickcer/env-cap": minor
---

Adds a 5th public entry point, `@maverickcer/env-cap/evidence` (Experimental), exporting `defineEvidenceProjection()` -- a pure, isomorphic transform from the immutable `EvidenceModel` (ADR 0024) to any consumer-defined output shape. Every projector's `EvidenceModel` argument is wrapped in a read-only tracking Proxy that throws on any mutation attempt and automatically records which field paths were read, surfaced via the projection's `.project(evidence)` method alongside the computed value. See ADR 0031 (the new entry point) and ADR 0032 (the provenance mechanism, including why it clones rather than relying on `Object.freeze()`).
