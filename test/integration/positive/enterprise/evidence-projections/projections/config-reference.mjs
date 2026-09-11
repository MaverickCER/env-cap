import { defineEvidenceProjection } from "env-cap/evidence";
import { renderDocs } from "env-cap/build";

/** `undocumented-contract`/`undocumented-variable` Finding Model entries, reshaped into renderDocs()'s expected ref shapes. `finding.location.file` is already root-relative, POSIX-separated -- every canonical model (Finding Model included) shares that one convention, so no adapter is needed here. */
function toUndocumentedRefs(evidence) {
  const undocumentedContracts = [];
  const undocumentedVariables = [];
  for (const finding of evidence.finding.findings) {
    if (finding.code === "UNDOCUMENTED_CONTRACT") {
      undocumentedContracts.push({
        file: finding.location.file,
        exportName: finding.location.exportName,
      });
    } else if (finding.code === "UNDOCUMENTED_VARIABLE") {
      undocumentedVariables.push({
        file: finding.location.file,
        exportName: finding.location.exportName,
        key: finding.location.variable,
      });
    }
  }
  return { undocumentedContracts, undocumentedVariables };
}

/**
 * The "Environment Configuration Reference" reference projection (plan
 * Phase 16). `expiringWithinDays` is a factory parameter, not part of the
 * projector's own signature -- `defineEvidenceProjection()`'s projectors
 * only ever take `evidence` (ADR 0032), so a real caller configures this the
 * same way any other closed-over constant would be: at definition time,
 * matching whatever value they passed to `generateEvidenceModel()` itself
 * (see scripts/project-config-reference.mjs). Defaults to 30, matching
 * `env-cap/build`'s own `DEFAULT_EXPIRING_WITHIN_DAYS`.
 *
 * Known limitations (see README.md):
 *  - `previousContent` is always `undefined` -- a pure projection has no
 *    access to a previously-rendered docs file, so "Changes since last
 *    report" always reads as a first-time render.
 *  - Variables render in Contract Model's canonical alphabetical order
 *    (`buildContractModel()`'s own deterministic-JSON ordering, ADR 0025),
 *    not necessarily the schema's original declaration order --
 *    `DiscoveredContract` preserves declaration order, `ContractModel`
 *    deliberately doesn't. This projection's output therefore isn't
 *    byte-identical to `generateDocumentation()`'s direct-call output for a
 *    schema whose declaration order differs from alphabetical; it's
 *    identical in every fact, just not row order.
 *
 * As of ADR 0038, `renderDocs()` itself takes Contract Model's own shape
 * directly (`evidence.contract.contracts`, no `root` argument, no
 * `DiscoveredContract[]` adapter needed) -- this projection is now a
 * genuinely direct call, not a reshape-then-call.
 */
export function createConfigReferenceProjection(expiringWithinDays = 30) {
  return defineEvidenceProjection({
    configReference: (evidence) => {
      const { undocumentedContracts, undocumentedVariables } = toUndocumentedRefs(evidence);
      return renderDocs(evidence.contract.contracts, {
        expiringWithinDays,
        undocumentedContracts,
        undocumentedVariables,
        generatedAt: new Date(evidence.provenance.generatedAt),
        previousContent: undefined,
      });
    },
  });
}
