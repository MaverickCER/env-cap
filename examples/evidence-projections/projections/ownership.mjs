import { defineEvidenceProjection } from "@maverickcer/env-cap/evidence";

/**
 * The "Configuration Ownership" reference projection (plan Phase 18).
 *
 * Unlike env-example.mjs/config-reference.mjs, this one's output is data
 * (the same shape `usage-report.ts`'s private `RenderUsageReportOptions`
 * describes -- `dependencyOwnership`/`abandonedContracts`/
 * `unresolvedConsumers`/`unconsumedOwnedVariables`/`indeterminate`/
 * `parseWarnings`, every one of those five finding-shape types publicly
 * exported from `@maverickcer/env-cap/build`), not rendered Markdown --
 * `renderUsageReport()` itself is a private implementation detail of
 * `generateUsageReport()`'s orchestration (ADR 0010's boundary), never
 * re-exported. This projection's job is producing the *data* a consumer's
 * own renderer needs, the same relationship `inventory.mjs` has to
 * `docs.ts`'s (also private) `buildCatalog()`.
 *
 * `dependencyOwnership` (every contract, not just problematic ones) is
 * built directly from Contract Model + Dependency Model, joined by
 * `${file}#${exportName}` identity. The four finding arrays are recovered
 * from Finding Model's `"ownership"`-family findings (ADR 0026) -- each
 * `OwnershipEvidenceReference` carries `contractName`/`file`/`variable`,
 * but not the owner a `AbandonedContractFinding`/`UnconsumedOwnedVariableFinding`
 * also needs, so those are looked up from Ownership Model by `contractName`
 * (this codebase's `contractName` is a resolved *display* name, not a
 * structural identity key like `file`+`exportName` -- a real edge case with
 * two same-named contracts would collide here; a limitation worth noting,
 * not a scope this reference projection tries to solve).
 */
export const ownershipProjection = defineEvidenceProjection({
  ownership: (evidence) => {
    const dependencyByIdentity = new Map(
      evidence.dependency.contracts.map((contract) => [`${contract.file}#${contract.exportName}`, contract]),
    );
    const ownershipByContractName = new Map(
      evidence.ownership.contracts.map((contract) => [contract.contractName, contract]),
    );

    const dependencyOwnership = evidence.contract.contracts.map((contract) => {
      const dependency = dependencyByIdentity.get(`${contract.file}#${contract.exportName}`);
      return {
        contractName: contract.contractName,
        file: contract.file,
        owner: contract.owner,
        variableCount: contract.variables.length,
        consumers: dependency?.consumingFiles ?? [],
      };
    });

    const abandonedContracts = [];
    const unresolvedConsumers = [];
    const unconsumedOwnedVariables = [];
    const indeterminate = [];

    for (const finding of evidence.finding.findings) {
      const location = finding.location;
      if (finding.code === "abandoned-contract") {
        abandonedContracts.push({
          contractName: location.contractName,
          file: location.file,
          owner: ownershipByContractName.get(location.contractName)?.owner,
        });
      } else if (finding.code === "unresolved-consumer") {
        unresolvedConsumers.push({
          contractName: location.contractName,
          file: location.file,
          reason: finding.message,
        });
      } else if (finding.code === "unconsumed-owned-variable") {
        const owner = ownershipByContractName
          .get(location.contractName)
          ?.variables.find((variable) => variable.key === location.variable)?.owner;
        unconsumedOwnedVariables.push({
          contractName: location.contractName,
          owner,
          key: location.variable,
        });
      } else if (finding.code === "indeterminate-ownership") {
        indeterminate.push({
          contractName: location.contractName,
          key: location.variable,
          reason: finding.message,
        });
      }
    }

    return {
      dependencyOwnership,
      abandonedContracts,
      unresolvedConsumers,
      unconsumedOwnedVariables,
      indeterminate,
      parseWarnings: evidence.dependency.warnings,
    };
  },
});
