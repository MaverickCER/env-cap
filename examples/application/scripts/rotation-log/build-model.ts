// Pure projection: `EvidenceModel` (env-cap's own real, Stable evidence --
// see ADR 0031/0038) -> this document's own `RotationLogModel` JSON shape.
// No filesystem/CLI concerns at all -- `run.ts` is the only file in this
// directory that touches either; an org that just wants the key values
// (e.g. to feed its own dashboard, or a different renderer entirely) can
// call this directly against any `EvidenceModel` it already has on hand.
import type { EvidenceModel } from "env-cap/build"
import type { RotationLogEntry, RotationLogModel } from "./types.js"

/**
 * Projects every variable that declares at least one rotation-specific
 * field into a `RotationLogEntry` -- "at least one declared" is exactly
 * `env-cap`'s own computed `rotationStatus !== "undeclared"` (see
 * `computeRotationStatus()`/`buildLifecycleModel()` in `src/build/
 * lifecycle-model.ts`): a variable that declares none of
 * `authenticatorType`/`rotationPeriod`/`lastRotatedAt`/
 * `rotationTriggerEvents` has nothing to report here and is skipped, not
 * rendered as an empty row.
 *
 * @remarks
 * Deliberately reads `evidence.lifecycle` rather than re-running discovery
 * (unlike `../generate-docs/run.ts`, which calls `generateDocumentation()`/
 * `generateUsageReport()` directly for output evidence.json can't carry) --
 * the Lifecycle Model already carries every rotation field plus the
 * computed `rotationStatus`, so this function is a straight, cheap
 * projection over data `npm run docs` already produced.
 */
export function buildRotationLogModel(evidence: EvidenceModel): RotationLogModel {
  const entries: RotationLogEntry[] = []

  for (const contract of evidence.lifecycle.contracts) {
    for (const variable of contract.variables) {
      if (variable.rotationStatus === "undeclared") continue

      entries.push({
        variable: variable.key,
        contractName: contract.contractName,
        file: contract.file,
        authenticatorType: variable.authenticatorType,
        rotationPeriod: variable.rotationPeriod,
        lastRotatedAt: variable.lastRotatedAt,
        expiresAt: variable.expiresAt,
        refreshInstructions: variable.refreshInstructions,
        rotationTriggerEvents: variable.rotationTriggerEvents ?? [],
        status: variable.rotationStatus,
        timeBasedTriggerFired: variable.rotationStatus !== "compliant",
        eventBasedTriggerDeclared:
          variable.rotationTriggerEvents !== undefined && variable.rotationTriggerEvents.length > 0,
      })
    }
  }

  // Deterministic, human-friendly order: worst status first (expired before
  // overdue before compliant), then alphabetically by variable within a
  // status, so a reader's eye goes straight to what needs attention.
  const statusRank: Record<RotationLogEntry["status"], number> = {
    expired: 0,
    overdue: 1,
    compliant: 2,
  }
  entries.sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.variable.localeCompare(b.variable))

  return {
    schemaVersion: 1,
    generatedAt: evidence.provenance.generatedAt,
    entries,
  }
}
