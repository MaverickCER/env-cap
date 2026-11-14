/**
 * Build your own views of the evidence file (`@maverickcer/env-cap/evidence`).
 *
 * `defineEvidenceProjection()` declares a pure transform from an `EvidenceModel` to a shape you define:
 * a dashboard row, an inventory table or a CI comment. The projectors read the model
 * through a read-only membrane, and `.project()` also returns which model fields fed each output field
 * (ADR 0032). ADR 0031 explains why this is its own entry point.
 *
 * `generateEvidenceModel()` in `@maverickcer/env-cap/build` assembles the model at build time. This
 * module imports no Node module and no TypeScript compiler, and takes the `EvidenceModel` shape as a
 * type only. So a projection can run over a JSON-parsed evidence file outside Node; CI runs this
 * entry under Bun, Deno and a Web-globals bundle.
 *
 * @packageDocumentation
 */
export type { EvidenceModel, EvidenceProvenance } from "../build/evidence-model.js"
export { defineEvidenceProjection } from "./define-projection.js"
export type {
  EvidenceProjection,
  EvidenceProjectionResult,
  EvidenceProjectionSchema,
  EvidenceProjector,
} from "./define-projection.js"
