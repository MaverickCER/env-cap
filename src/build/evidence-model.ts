import type { ChangeModel } from "./change-model.js"
import type { ContractModel } from "./contract-model.js"
import type { DependencyModel } from "./dependency-model.js"
import type { FindingModel } from "./finding-model.js"
import type { LifecycleModel } from "./lifecycle-model.js"
import type { OwnershipModel } from "./ownership-model.js"

/**
 * Bump only when a reader could misinterpret the new shape of `EvidenceModel`
 * itself. Each sub-model's `<MODEL>_SCHEMA_VERSION` is versioned separately.
 * Every other canonical model follows the same rule.
 */
export const EVIDENCE_MODEL_SCHEMA_VERSION = 1

/**
 * Who/when/what produced a given `EvidenceModel` instance. Caller-supplied,
 * never ambient-detected: `generateEvidenceModel()` never shells out to
 * `git` itself, mirroring ADR 0012's live-expiration-callback precedent.
 */
export interface EvidenceProvenance {
  readonly generatedAt: string
  readonly toolVersion: string
  readonly commit: string | undefined
}

/**
 * The seventh canonical fact model (ADR 0024): the assembled union of the
 * other six, plus provenance, the immutable input every
 * `defineEvidenceProjection()` projector runs over (`@maverickcer/env-cap/evidence`,
 * ADR 0031).
 *
 * @remarks
 * This type is the one exception to the rule that nothing imports across
 * `src/build/`. `src/evidence/` imports it with `import type` only, which
 * `verbatimModuleSyntax` erases at compile time. The sanctioned edge from
 * `helpers` onto `runtime` has the same shape (see `specs/architecture.md`). `src/evidence/` never imports a *value* from
 * here, only this shape, so it stays isomorphic and Node-free. An actual
 * `EvidenceModel` instance is produced by {@link generateEvidenceModel}
 * (`@maverickcer/env-cap/build`, Node-only), which runs discovery once,
 * builds all six sub-models, and `deepFreeze()`s the result.
 */
export interface EvidenceModel {
  readonly schemaVersion: typeof EVIDENCE_MODEL_SCHEMA_VERSION
  readonly provenance: EvidenceProvenance
  readonly contract: ContractModel
  readonly dependency: DependencyModel
  readonly ownership: OwnershipModel
  readonly lifecycle: LifecycleModel
  readonly finding: FindingModel
  readonly change: ChangeModel
}
