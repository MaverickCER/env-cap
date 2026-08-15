import path from "node:path"
import { effectiveOwner } from "./link.js"
import type { DiscoveredContract } from "./link.js"

/**
 * The third of env-cap's seven canonical fact models (ADR 0024) -- every
 * contract and variable's effective owner, plus first-class
 * `unownedContracts`/`unownedVariables` arrays. See ADR 0028.
 *
 * @remarks
 * "Unowned" previously existed only as a count (`noOwnerCount`) inside
 * `docs.ts`'s `renderSecurityReview()` -- itemized here as real data for the
 * first time, computed via the same `effectiveOwner()` (variable overrides
 * contract) that ADR 0028 also fixed `usage-report.ts`'s ownership findings
 * to use, so this model can never disagree with either of them about who
 * owns a variable.
 */

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export const OWNERSHIP_MODEL_SCHEMA_VERSION = 1

export interface OwnershipModelVariable {
  readonly key: string
  /** The variable's own `owner`, falling back to the contract's -- see `effectiveOwner()`. */
  readonly owner: string | undefined
}

export interface OwnershipModelContract {
  /** Root-relative, POSIX-separated -- matches `ContractModelContract.file`. */
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  /** The contract's own default owner -- not "effective" the way a variable's is, since there's no level above a contract to fall back to. */
  readonly owner: string | undefined
  readonly variables: readonly OwnershipModelVariable[]
}

export interface OwnershipModelContractRef {
  readonly file: string
  readonly exportName: string
  readonly contractName: string
}

export interface OwnershipModelVariableRef {
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly key: string
}

export interface OwnershipModel {
  readonly schemaVersion: typeof OWNERSHIP_MODEL_SCHEMA_VERSION
  readonly contracts: readonly OwnershipModelContract[]
  /** Every contract with no `owner` set at all. */
  readonly unownedContracts: readonly OwnershipModelContractRef[]
  /** Every variable whose effective owner (its own, falling back to the contract's) is still `undefined`. */
  readonly unownedVariables: readonly OwnershipModelVariableRef[]
}

function relativize(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/")
}

function byIdentity(
  a: { file: string; exportName: string },
  b: { file: string; exportName: string },
): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1
  return a.exportName < b.exportName ? -1 : a.exportName > b.exportName ? 1 : 0
}

/**
 * Projects every discovered contract (active or not, same scope as
 * `renderSecurityReview()`'s `noOwnerCount` this model itemizes) into the
 * Ownership Model's versioned, JSON-serializable shape.
 */
export function buildOwnershipModel(
  contracts: readonly DiscoveredContract[],
  root: string,
): OwnershipModel {
  const modelContracts: OwnershipModelContract[] = contracts.map((contract) => ({
    file: relativize(root, contract.file),
    exportName: contract.exportName,
    contractName: contract.contractName,
    owner: contract.owner,
    variables: [...contract.variables]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((variable) => ({ key: variable.key, owner: effectiveOwner(contract, variable) })),
  }))
  modelContracts.sort(byIdentity)

  const unownedContracts: OwnershipModelContractRef[] = modelContracts
    .filter((c) => c.owner === undefined)
    .map(({ file, exportName, contractName }) => ({ file, exportName, contractName }))

  const unownedVariables: OwnershipModelVariableRef[] = []
  for (const contract of modelContracts) {
    for (const variable of contract.variables) {
      if (variable.owner === undefined) {
        unownedVariables.push({
          file: contract.file,
          exportName: contract.exportName,
          contractName: contract.contractName,
          key: variable.key,
        })
      }
    }
  }

  return {
    schemaVersion: OWNERSHIP_MODEL_SCHEMA_VERSION,
    contracts: modelContracts,
    unownedContracts,
    unownedVariables,
  }
}
