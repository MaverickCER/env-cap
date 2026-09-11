/**
 * Used by `env-example.mjs`, which wraps `env-cap/build`'s
 * `renderEnvExample()` -- still `DiscoveredContract[]`-based (ADR 0038 only
 * migrated `renderDocs()`/`buildCatalog()` to Contract Model's own shape,
 * not `renderEnvExample()`). Reshapes Contract Model + Lifecycle Model back
 * into that shape. Joined by `${file}#${exportName}` identity, the same
 * join key `effectiveOwner()`'s own callers use elsewhere in this codebase.
 *
 * `file` is passed through unchanged (Contract Model's own root-relative,
 * POSIX-separated value) -- `renderEnvExample()` only ever compares `.file`
 * for identity/sorting, never resolves it against a `root`, so a relative
 * value here is already exactly what it needs.
 *
 * `deprecated`/`deprecatedReason`/`removeBy`/`renamedFrom` come from
 * Lifecycle Model (ADR 0029), not Contract Model -- every other field comes
 * from Contract Model (ADR 0025) directly.
 */
export function toDiscoveredContracts(evidence) {
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
      sensitivity: contract.sensitivity,
      expiresAt: contract.expiresAt,
      deprecated: lifecycle?.deprecated,
      deprecatedReason: lifecycle?.deprecatedReason,
      purpose: contract.purpose,
      legalBasis: contract.legalBasis,
      retention: contract.retention,
      dataResidency: contract.dataResidency,
      auditRequired: contract.auditRequired,
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
          sensitivity: variable.sensitivity,
          expiresAt: variable.expiresAt,
          refreshInstructions: variable.refreshInstructions,
          setupInstructions: variable.setupInstructions,
          required: variable.required,
          deprecated: lifecycleVariable?.deprecated,
          deprecatedReason: lifecycleVariable?.deprecatedReason,
          removeBy: lifecycleVariable?.removeBy,
          renamedFrom: lifecycleVariable?.renamedFrom,
          purpose: variable.purpose,
          legalBasis: variable.legalBasis,
          retention: variable.retention,
          dataResidency: variable.dataResidency,
          auditRequired: variable.auditRequired,
          metadata: variable.metadata,
          documented: variable.documented,
        };
      }),
    };
  });
}
