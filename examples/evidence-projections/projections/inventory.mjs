import { defineEvidenceProjection } from "@maverickcer/env-cap/evidence";
import { effectiveOwner } from "@maverickcer/env-cap/build";

/**
 * The "Configuration Inventory" reference projection (plan Phase 17). The
 * JSON-consumer-facing sibling of config-reference.mjs's "## Catalog"
 * section (`docs.ts`'s own `buildCatalog()`/`CatalogContract` are
 * documented as "Same data renderCatalog() renders to Markdown, reshaped
 * for JSON/programmatic consumers instead of prose" -- but neither is
 * exported from the public `@maverickcer/env-cap/build` barrel, so this
 * projection reproduces that same reshape here instead of calling it).
 *
 * Unlike every other projection in this example, this one needs no
 * `DiscoveredContract[]` reconstruction at all: the one piece of real logic
 * involved -- resolving a variable's *effective* owner (its own override,
 * falling back to the contract's) -- is `effectiveOwner()`, which is
 * exported publicly (`@maverickcer/env-cap/build`, ADR 0028) and only ever
 * reads `.owner` off whatever `{contract, variable}` pair it's given.
 * `ContractModelContract`/`ContractModelVariable` already carry `.owner`
 * directly, so this operates on Contract Model's own shape unmodified.
 *
 * Known, documented divergences from `buildCatalog()`'s own direct-call
 * output (see README.md) -- both intentional properties of Contract Model,
 * not bugs: `.file` is root-relative and POSIX-separated (portable,
 * serializable -- ADR 0025) rather than an absolute filesystem path, and
 * variables render in Contract Model's canonical alphabetical order rather
 * than the schema's original declaration order (same divergence
 * `config-reference.mjs` documents).
 */
export const inventoryProjection = defineEvidenceProjection({
  inventory: (evidence) => {
    const sorted = [...evidence.contract.contracts].sort((a, b) =>
      a.contractName < b.contractName ? -1 : a.contractName > b.contractName ? 1 : 0,
    );

    return sorted.map((contract) => {
      const variables = {};
      for (const variable of contract.variables) {
        variables[variable.key] = {
          description: variable.description,
          owner: effectiveOwner(contract, variable),
          expiresAt: variable.expiresAt,
          refreshInstructions: variable.refreshInstructions,
          required: variable.required,
          hasDefault: variable.hasDefault,
          hasProcessor: variable.hasProcessor,
          processorReturnType: variable.processorReturnType,
          hasValidator: variable.hasValidator,
          documented: variable.documented,
          context: variable.context,
          extra: variable.extra,
        };
      }

      return {
        file: contract.file,
        exportName: contract.exportName,
        contractName: contract.contractName,
        active: contract.active,
        documented: contract.documented,
        category: contract.category,
        exclusiveGroup: contract.exclusiveGroup,
        owner: contract.owner,
        expiresAt: contract.expiresAt,
        metadata: contract.metadata,
        variables,
      };
    });
  },
});
