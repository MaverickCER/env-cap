import { defineEvidenceProjection } from "env-cap/evidence";

/**
 * The "Configuration Change Impact A (--since history)" reference
 * projection (plan Phase 24) -- absorbs the audit's "Audit Trail" report
 * type. Scoped to "since the one committed manifest snapshot" (already
 * supported by Change Model), not true N-run history -- the plan's own
 * guidance, since a real multi-run audit trail is new scope beyond ADR
 * 0021's single-snapshot design, not something to invent here.
 *
 * A thin reshape of `evidence.change` (already the full since-the-snapshot
 * diff) plus one human-readable `summary` line -- no new derivation logic,
 * every field comes straight from Change Model (ADR 0024/0030).
 */
export const auditTrailProjection = defineEvidenceProjection({
  auditTrail: (evidence) => {
    const manifest = evidence.change.manifest;
    const renames = evidence.change.renamedVariables;

    const totalContractChanges =
      manifest.addedContracts.length + manifest.removedContracts.length + manifest.updatedContracts.length;
    const totalVariableChanges =
      manifest.addedVariables.length +
      manifest.removedVariables.length +
      manifest.updatedVariables.length +
      renames.length;

    return {
      addedContracts: manifest.addedContracts,
      removedContracts: manifest.removedContracts,
      updatedContracts: manifest.updatedContracts,
      addedVariables: manifest.addedVariables,
      removedVariables: manifest.removedVariables,
      updatedVariables: manifest.updatedVariables,
      renamedVariables: renames,
      summary:
        totalContractChanges === 0 && totalVariableChanges === 0
          ? "No changes since the committed manifest snapshot."
          : `${totalContractChanges} contract change(s), ${totalVariableChanges} variable change(s) since the committed manifest snapshot.`,
    };
  },
});
