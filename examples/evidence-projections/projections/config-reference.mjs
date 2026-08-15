import { defineEvidenceProjection } from "@maverickcer/env-cap/evidence";
import { renderDocs } from "@maverickcer/env-cap/build";

/**
 * Reshapes Contract Model + Lifecycle Model back into the DiscoveredContract[]-
 * compatible shape renderDocs() expects. Unlike env-example.mjs's adapter,
 * this one genuinely needs two models, not one: renderDocs()'s Lifecycle
 * report reads `deprecated`/`deprecatedReason`/`removeBy`/`renamedFrom`,
 * which live in Lifecycle Model (ADR 0029), not Contract Model -- joined
 * here by `${file}#${exportName}` identity, the same join key
 * effectiveOwner()'s own callers use elsewhere in this codebase.
 *
 * `file` is passed through unchanged (Contract Model's own root-relative,
 * POSIX-separated value) paired with `root: ""` at the render call site --
 * docs.ts's relativeTo() is a pure string-prefix-strip (see its own doc
 * comment: "Avoids a hard node:path dependency"), so stripping an empty
 * prefix from an already-relative path reproduces the exact same display
 * path the original absolute-root/absolute-file pair would have, without
 * this projection needing to know what the real generation root was.
 */
function toDiscoveredContracts(evidence) {
  const lifecycleByIdentity = new Map(
    evidence.lifecycle.contracts.map((contract) => [`${contract.file}#${contract.exportName}`, contract]),
  );

  return evidence.contract.contracts.map((contract) => {
    const lifecycle = lifecycleByIdentity.get(`${contract.file}#${contract.exportName}`);
    const lifecycleVariablesByKey = new Map(
      (lifecycle?.variables ?? []).map((variable) => [variable.key, variable]),
    );

    return {
      file: contract.file,
      exportName: contract.exportName,
      contractName: contract.contractName,
      active: contract.active,
      category: contract.category,
      exclusiveGroup: contract.exclusiveGroup,
      owner: contract.owner,
      classification: contract.classification,
      expiresAt: contract.expiresAt,
      deprecated: lifecycle?.deprecated,
      deprecatedReason: lifecycle?.deprecatedReason,
      metadata: contract.metadata,
      documented: contract.documented,
      packageOrigin: contract.packageOrigin,
      variables: contract.variables.map((variable) => {
        const lifecycleVariable = lifecycleVariablesByKey.get(variable.key);
        return {
          key: variable.key,
          hasDefault: variable.hasDefault,
          defaultValue: variable.defaultValue,
          hasProcessor: variable.hasProcessor,
          processorSource: variable.processorSource,
          processorReturnType: variable.processorReturnType,
          hasValidator: variable.hasValidator,
          validatorSource: variable.validatorSource,
          context: variable.context,
          description: variable.description,
          owner: variable.owner,
          classification: variable.classification,
          expiresAt: variable.expiresAt,
          refreshInstructions: variable.refreshInstructions,
          required: variable.required,
          deprecated: lifecycleVariable?.deprecated,
          deprecatedReason: lifecycleVariable?.deprecatedReason,
          removeBy: lifecycleVariable?.removeBy,
          renamedFrom: lifecycleVariable?.renamedFrom,
          extra: variable.extra,
          documented: variable.documented,
        };
      }),
    };
  });
}

/** `undocumented-contract`/`undocumented-variable` Finding Model entries, reshaped into renderDocs()'s expected ref shapes. */
function toUndocumentedRefs(evidence) {
  const undocumentedContracts = [];
  const undocumentedVariables = [];
  for (const finding of evidence.finding.findings) {
    if (finding.code === "undocumented-contract") {
      undocumentedContracts.push({
        file: finding.location.file,
        exportName: finding.location.exportName,
      });
    } else if (finding.code === "undocumented-variable") {
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
 * `@maverickcer/env-cap/build`'s own `DEFAULT_EXPIRING_WITHIN_DAYS`.
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
 */
export function createConfigReferenceProjection(expiringWithinDays = 30) {
  return defineEvidenceProjection({
    configReference: (evidence) => {
      const contracts = toDiscoveredContracts(evidence);
      const { undocumentedContracts, undocumentedVariables } = toUndocumentedRefs(evidence);
      return renderDocs(contracts, "", {
        expiringWithinDays,
        undocumentedContracts,
        undocumentedVariables,
        generatedAt: new Date(evidence.provenance.generatedAt),
        previousContent: undefined,
      });
    },
  });
}
