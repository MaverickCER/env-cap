import { defineEvidenceProjection } from "@maverickcer/env-cap/evidence";
import { renderEnvExample } from "@maverickcer/env-cap/build";

/**
 * The ".env.example Artifact" reference projection (env-cap-report-audit.md's
 * report list, plan Phase 15). A thin wrapper: reshapes Contract Model's
 * ContractModelContract[]/ContractModelVariable[] (@maverickcer/env-cap/build,
 * ADR 0025) into the DiscoveredContract[]-compatible shape renderEnvExample()
 * (also @maverickcer/env-cap/build, entirely unchanged) already expects, then
 * calls it directly -- no new rendering logic lives here. `deprecated`/
 * `deprecatedReason`/`removeBy`/`renamedFrom` are stubbed `undefined`:
 * renderEnvExample() never reads them (they're Lifecycle Model's concern,
 * ADR 0029), this reshape only needs to satisfy DiscoveredContract's shape.
 */
export const envExampleProjection = defineEvidenceProjection({
  envExample: (evidence) => {
    const contracts = evidence.contract.contracts.map((contract) => ({
      file: contract.file,
      exportName: contract.exportName,
      contractName: contract.contractName,
      active: contract.active,
      category: contract.category,
      exclusiveGroup: contract.exclusiveGroup,
      owner: contract.owner,
      classification: contract.classification,
      expiresAt: contract.expiresAt,
      deprecated: undefined,
      deprecatedReason: undefined,
      metadata: contract.metadata,
      documented: contract.documented,
      packageOrigin: contract.packageOrigin,
      variables: contract.variables.map((variable) => ({
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
        deprecated: undefined,
        deprecatedReason: undefined,
        removeBy: undefined,
        renamedFrom: undefined,
        extra: variable.extra,
        documented: variable.documented,
      })),
    }));
    return renderEnvExample(contracts);
  },
});
