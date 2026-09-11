import { defineEvidenceProjection } from "env-cap/evidence";

/**
 * The "Configuration Lifecycle" reference projection (plan Phase 19) --
 * "absorbs Expiration + Deprecation into one projection." Lifecycle Model
 * (ADR 0029) already unifies both concerns structurally (every contract/
 * variable that has *any* lifecycle data set, plus a pre-computed
 * `expiring` list) -- this projection's own job is filtering that into two
 * clearly-named, flat views a consumer doesn't have to derive themselves:
 * everything expiring soon (already computed, passed through unchanged),
 * and everything deprecated (filtered here, since Lifecycle Model doesn't
 * pre-compute a flat deprecated list the way it does for `expiring`).
 *
 * Like `docs.ts`'s private `renderLifecycleReport()` (never re-exported,
 * same boundary as `renderUsageReport()`/`buildCatalog()`), this doesn't
 * reproduce Markdown -- it produces the data a consumer's own renderer,
 * dashboard, or compliance export needs.
 */
export const lifecycleProjection = defineEvidenceProjection({
  lifecycle: (evidence) => {
    const deprecatedContracts = evidence.lifecycle.contracts
      .filter((contract) => contract.deprecated)
      .map((contract) => ({
        contractName: contract.contractName,
        file: contract.file,
        exportName: contract.exportName,
        reason: contract.deprecatedReason,
      }));

    const deprecatedVariables = evidence.lifecycle.contracts.flatMap((contract) =>
      contract.variables
        .filter((variable) => variable.deprecated)
        .map((variable) => ({
          contractName: contract.contractName,
          file: contract.file,
          exportName: contract.exportName,
          key: variable.key,
          reason: variable.deprecatedReason,
          removeBy: variable.removeBy,
          renamedFrom: variable.renamedFrom,
        })),
    );

    return {
      expiring: evidence.lifecycle.expiring,
      deprecatedContracts,
      deprecatedVariables,
    };
  },
});
