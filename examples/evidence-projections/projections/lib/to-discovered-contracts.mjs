/**
 * Shared by every projection in ../*.mjs that wraps a `@maverickcer/env-cap/build`
 * renderer/builder expecting `DiscoveredContract[]` (`renderEnvExample()`,
 * `renderDocs()`, `buildCatalog()`, ...): reshapes Contract Model + Lifecycle
 * Model back into that shape. Joined by `${file}#${exportName}` identity,
 * the same join key `effectiveOwner()`'s own callers use elsewhere in this
 * codebase.
 *
 * `file` is passed through unchanged (Contract Model's own root-relative,
 * POSIX-separated value). Every target this feeds either only compares
 * `.file` for identity/sorting (safe with any consistent string) or pairs
 * it with `root: ""` at the render call site -- `docs.ts`'s `relativeTo()`
 * is a pure string-prefix-strip (see its own doc comment: "Avoids a hard
 * node:path dependency"), so stripping an empty prefix from an
 * already-relative path reproduces the exact display path the original
 * absolute-root/absolute-file pair would have, without any projection here
 * needing to know what the real generation root was.
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
