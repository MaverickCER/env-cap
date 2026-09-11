/**
 * env-cap Evidence Model entry point (`env-cap/evidence`).
 *
 * `defineEvidenceProjection()` is the extensibility mechanism the seven
 * canonical fact models (ADR 0024) exist to serve. A projection is a named,
 * pure transform from the immutable `EvidenceModel` -- assembled at build
 * time by `generateEvidenceModel()`, `env-cap/build` -- to any
 * consumer-defined output shape, with automatic read-only enforcement and
 * field-level provenance. See ADR 0031 (why a 5th entry point) and ADR 0032
 * (the Proxy-based mechanism itself).
 *
 * This module is deliberately isomorphic: no `node:fs`, no `typescript`, no
 * knowledge of how an `EvidenceModel` gets built -- it only imports that
 * shape as a type (erased at compile time, mirroring `helpers`' one
 * sanctioned cross-folder edge onto `runtime` -- see
 * `specs/architecture.md`). A dashboard backend, an edge function, or a CI
 * step can run a projection over a previously-generated,
 * JSON-deserialized `EvidenceModel` with zero Node dependency.
 */
export type { EvidenceModel, EvidenceProvenance } from "../build/evidence-model.js"
export { defineEvidenceProjection } from "./define-projection.js"
export type {
  EvidenceProjection,
  EvidenceProjectionResult,
  EvidenceProjectionSchema,
  EvidenceProjector,
} from "./define-projection.js"
