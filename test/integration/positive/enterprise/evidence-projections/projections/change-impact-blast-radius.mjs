import { defineEvidenceProjection } from "@maverickcer/env-cap/evidence";

/**
 * The "Configuration Change Impact B (blast-radius correlation)" reference
 * projection (plan Phase 25) -- "the actual Change x Dependency join
 * `computeArtifacts()` never does today." The most complex of the ten by
 * the plan's own estimate: joins every changed contract/variable (Change
 * Model, ADR 0030) against its current real consumers (Dependency Model,
 * ADR 0027), by `${file}#${exportName}` identity, to answer "if this
 * change ships, which files does it actually affect."
 *
 * Known limitation, inherent to what each model can see: a **removed**
 * contract/variable's blast radius always reports `0` here, by
 * construction -- Dependency Model reflects *current* reality, and a
 * removed contract no longer exists in it to have consumers. A file that
 * still imports something just removed shows up as its own, separate
 * concern (an unresolved import) elsewhere, not as blast radius on the
 * removal itself. Blast radius is a meaningful signal for **added** and
 * **updated** contracts/variables, where the current consumer set is
 * exactly the set actually affected.
 */
function consumersFor(dependencyByIdentity, ref) {
  const dependency = dependencyByIdentity.get(`${ref.file}#${ref.exportName}`);
  return dependency?.consumingFiles ?? [];
}

export const blastRadiusProjection = defineEvidenceProjection({
  blastRadius: (evidence) => {
    const dependencyByIdentity = new Map(
      evidence.dependency.contracts.map((contract) => [`${contract.file}#${contract.exportName}`, contract]),
    );

    const changedVariables = [
      ...evidence.change.manifest.addedVariables.map((v) => ({ ...v, changeType: "added" })),
      ...evidence.change.manifest.removedVariables.map((v) => ({ ...v, changeType: "removed" })),
      ...evidence.change.manifest.updatedVariables.map((v) => ({ ...v, changeType: "updated" })),
    ];
    const variables = changedVariables.map((variable) => {
      const consumers = consumersFor(dependencyByIdentity, variable);
      return {
        contractName: variable.contractName,
        key: variable.key,
        changeType: variable.changeType,
        consumers,
        blastRadius: consumers.length,
      };
    });

    const changedContracts = [
      ...evidence.change.manifest.addedContracts.map((c) => ({ ...c, changeType: "added" })),
      ...evidence.change.manifest.removedContracts.map((c) => ({ ...c, changeType: "removed" })),
      ...evidence.change.manifest.updatedContracts.map((c) => ({ ...c, changeType: "updated" })),
    ];
    const contracts = changedContracts.map((contract) => {
      const consumers = consumersFor(dependencyByIdentity, contract);
      return {
        contractName: contract.contractName,
        changeType: contract.changeType,
        consumers,
        blastRadius: consumers.length,
      };
    });

    const distinctFilesAffected = new Set([
      ...variables.flatMap((v) => v.consumers),
      ...contracts.flatMap((c) => c.consumers),
    ]);

    return { variables, contracts, totalDistinctFilesAffected: distinctFilesAffected.size };
  },
});
