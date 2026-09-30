// Types for this example's NIST SP 800-53 IA-5 secrets-rotation compliance
// document -- see this directory's README for the full "why a generator
// lives here, application-level, not in the library" story (same reasoning
// as ../generate-docs, C5's own precedent this directory mirrors).
import type { RotationComplianceStatus } from "env-cap/build"

/**
 * One variable that declares at least one of env-cap's rotation-specific
 * lifecycle fields (`authenticatorType`/`rotationPeriod`/`lastRotatedAt`/
 * `rotationTriggerEvents`) -- a row in the rendered log. A variable that
 * declares none of those (env-cap's own computed `rotationStatus:
 * "undeclared"`) never becomes an entry here at all; see `build-model.ts`.
 */
export interface RotationLogEntry {
  /** The environment variable's own key, e.g. "STRIPE_KEY". */
  readonly variable: string
  /** The owning contract's display name. */
  readonly contractName: string
  /** Root-relative path of the schema file declaring this variable. */
  readonly file: string
  readonly authenticatorType: string | undefined
  readonly rotationPeriod: string | undefined
  readonly lastRotatedAt: string | undefined
  readonly expiresAt: string | undefined
  readonly refreshInstructions: string | undefined
  readonly rotationTriggerEvents: readonly string[]
  /**
   * env-cap's own computed compliance status for this variable -- see
   * `computeRotationStatus()` in `env-cap/build` for exactly how it's
   * derived. Never `"undeclared"` here: a variable with nothing rotation-
   * relevant declared never becomes an entry at all (see `build-model.ts`).
   */
  readonly status: Exclude<RotationComplianceStatus, "undeclared">
  /**
   * Whether IA-5's *time-based* trigger (an organization-defined rotation
   * period, or a hard `expiresAt` deadline) is the reason this entry isn't
   * `"compliant"` -- true for both `"overdue"` and `"expired"`, false for
   * `"compliant"`. Derived from `status`, not an independent fact -- kept as
   * its own named field so the rendered table can label the column without
   * every reader having to know `computeRotationStatus()`'s own status enum.
   */
  readonly timeBasedTriggerFired: boolean
  /**
   * Whether IA-5's *event-based* trigger (`rotationTriggerEvents`) was
   * declared for this variable at all -- presence-only, exactly like
   * `rotationTriggerEvents` itself: env-cap has no way to observe whether a
   * listed event (a suspected compromise, a personnel change, ...) actually
   * occurred, so this is "was an event-based trigger declared," never "did
   * one fire."
   */
  readonly eventBasedTriggerDeclared: boolean
}

/** The versioned root of this example's rotation-log document model. */
export interface RotationLogModel {
  readonly schemaVersion: 1
  /** From the source `EvidenceModel.provenance.generatedAt` -- when the evidence this log is built from was generated, not when this document was rendered. */
  readonly generatedAt: string
  readonly entries: readonly RotationLogEntry[]
}
