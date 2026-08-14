import path from "node:path"
import type { DiscoveredContract } from "./link.js"
import type { DiscoveredClassification } from "./parse.js"
import type { PackageOrigin } from "./resolution/resolve-package-schema.js"

/**
 * The first of env-cap's seven canonical fact models (ADR 0024) -- a
 * versioned, JSON-serializable projection of every declared environment
 * variable's structural and documentation contract. See ADR 0025.
 *
 * @remarks
 * Deliberately broader than `manifest-snapshot.ts`'s `ManifestSnapshot`:
 * that snapshot is scoped to *active* contracts and *only* the
 * `documentEnv()`-sourced fields, matching `renderManifest()`'s own scope
 * (ADR 0021). This model includes every discovered contract regardless of
 * `active`, plus the AST-derived schema facts (`hasDefault`/`hasProcessor`/
 * etc.) the snapshot deliberately excludes -- both are load-bearing for
 * downstream Finding/Evidence Model work.
 */

/** Bump only when a reader could misinterpret the new shape (a field changes
 *  type/meaning, or is removed) -- NOT for every additive field. Same
 *  discipline `manifest-snapshot.ts`'s `MANIFEST_SNAPSHOT_SCHEMA_VERSION` and
 *  `src/cli/json.ts`'s `JSON_SCHEMA_VERSION` already document. */
export const CONTRACT_MODEL_SCHEMA_VERSION = 1

/** One variable's full statically-discoverable contract: schema-shaped facts plus linked documentation. */
export interface ContractModelVariable {
  readonly key: string
  readonly hasDefault: boolean
  readonly defaultValue:
    { readonly ok: true; readonly value: unknown } | { readonly ok: false } | undefined
  readonly hasProcessor: boolean
  readonly processorSource: string | undefined
  readonly processorReturnType: string | undefined
  readonly hasValidator: boolean
  readonly validatorSource: string | undefined
  readonly context: string | undefined
  readonly description: string | undefined
  readonly owner: string | undefined
  readonly classification: DiscoveredClassification | undefined
  readonly expiresAt: string | undefined
  readonly refreshInstructions: string | undefined
  readonly required: boolean | undefined
  readonly extra: Readonly<Record<string, string>>
  readonly documented: boolean
}

/** One `createEnv()` contract's full statically-discoverable contract, active or not. */
export interface ContractModelContract {
  /** Root-relative, POSIX-separated -- matches `DiscoveredContractSummary.file`. */
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly active: boolean
  readonly category: string | undefined
  readonly exclusiveGroup: string | undefined
  readonly owner: string | undefined
  readonly classification: DiscoveredClassification | undefined
  readonly expiresAt: string | undefined
  readonly metadata: Readonly<Record<string, string>> | undefined
  readonly variables: readonly ContractModelVariable[]
  readonly documented: boolean
  readonly packageOrigin: PackageOrigin | undefined
}

export interface ContractModel {
  readonly schemaVersion: typeof CONTRACT_MODEL_SCHEMA_VERSION
  readonly contracts: readonly ContractModelContract[]
}

/**
 * Projects every discovered contract (active or not) into the Contract
 * Model's versioned, JSON-serializable shape.
 *
 * @remarks
 * Sorted deterministically (by file, then exportName, then variable key),
 * same discipline `buildManifestSnapshot()` already follows, so
 * `JSON.stringify` output is stable and diffs cleanly wherever this is
 * persisted.
 */
export function buildContractModel(
  contracts: readonly DiscoveredContract[],
  root: string,
): ContractModel {
  const projected: ContractModelContract[] = contracts.map((contract) => ({
    file: path.relative(root, contract.file).split(path.sep).join("/"),
    exportName: contract.exportName,
    contractName: contract.contractName,
    active: contract.active,
    category: contract.category,
    exclusiveGroup: contract.exclusiveGroup,
    owner: contract.owner,
    classification: contract.classification,
    expiresAt: contract.expiresAt,
    metadata: contract.metadata,
    documented: contract.documented,
    packageOrigin: contract.packageOrigin,
    variables: [...contract.variables]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((variable) => ({
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
        extra: variable.extra,
        documented: variable.documented,
      })),
  }))

  projected.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1
    return a.exportName < b.exportName ? -1 : a.exportName > b.exportName ? 1 : 0
  })

  return { schemaVersion: CONTRACT_MODEL_SCHEMA_VERSION, contracts: projected }
}
