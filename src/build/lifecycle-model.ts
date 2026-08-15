import path from "node:path"
import { computeExpiringEntries } from "./docs.js"
import type { ExpiringEntry } from "./docs.js"
import type { DiscoveredContract, DiscoveredVariable } from "./link.js"

/**
 * The fifth of env-cap's seven canonical fact models (ADR 0024) -- every
 * contract and variable's lifecycle data (expiry, deprecation, rename
 * correlation), promoting `ExpiringEntry`/`computeExpiringEntries()`
 * (already a good precedent -- real, exported, reused across `renderDocs()`
 * and `generate-documentation.ts`) into a canonical, versioned shape
 * alongside the new deprecation/rename fields. See ADR 0029.
 */

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export const LIFECYCLE_MODEL_SCHEMA_VERSION = 1

export interface LifecycleModelVariable {
  readonly key: string
  readonly expiresAt: string | undefined
  readonly refreshInstructions: string | undefined
  readonly deprecated: boolean | undefined
  readonly deprecatedReason: string | undefined
  readonly removeBy: string | undefined
  /** The previous variable name this one renames, if set -- see `ManifestChangeReport`'s rename correlation (ADR 0029/0030). */
  readonly renamedFrom: string | undefined
}

export interface LifecycleModelContract {
  /** Root-relative, POSIX-separated -- matches `ContractModelContract.file`. */
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly expiresAt: string | undefined
  readonly deprecated: boolean | undefined
  readonly deprecatedReason: string | undefined
  /** Only variables with at least one lifecycle field set (`expiresAt`, `refreshInstructions`, `deprecated`, `removeBy`, `renamedFrom`) -- same "only what's relevant" scope `renderLifecycleReport()` already uses for its rows. */
  readonly variables: readonly LifecycleModelVariable[]
}

export interface LifecycleModel {
  readonly schemaVersion: typeof LIFECYCLE_MODEL_SCHEMA_VERSION
  /** Only contracts with at least one lifecycle-relevant field set, at the contract level or on at least one variable. */
  readonly contracts: readonly LifecycleModelContract[]
  /**
   * Every contract-/variable-level `expiresAt` within the configured window,
   * soonest-first -- see `computeExpiringEntries()`. `file` is root-relative
   * and POSIX-separated here, matching `LifecycleModelContract.file`/every
   * other canonical model -- unlike `ExpiringEntry`'s own doc comment, which
   * describes its shape in `computeExpiringEntries()`'s other direct
   * consumers (e.g. `DocumentationFindings.expiringSoon`), where `file`
   * stays the absolute path `renderDocs()` itself expects.
   */
  readonly expiring: readonly ExpiringEntry[]
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

function hasLifecycleData(variable: DiscoveredVariable): boolean {
  return (
    variable.expiresAt !== undefined ||
    variable.refreshInstructions !== undefined ||
    variable.deprecated !== undefined ||
    variable.removeBy !== undefined ||
    variable.renamedFrom !== undefined
  )
}

/**
 * Projects every discovered contract with at least one lifecycle-relevant
 * field set into the Lifecycle Model's versioned, JSON-serializable shape,
 * plus the already-established `expiring` view.
 */
export function buildLifecycleModel(
  contracts: readonly DiscoveredContract[],
  expiringWithinDays: number,
  now: Date,
  root: string,
): LifecycleModel {
  const modelContracts: LifecycleModelContract[] = []

  for (const contract of contracts) {
    const variables: LifecycleModelVariable[] = [...contract.variables]
      .filter(hasLifecycleData)
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((variable) => ({
        key: variable.key,
        expiresAt: variable.expiresAt,
        refreshInstructions: variable.refreshInstructions,
        deprecated: variable.deprecated,
        deprecatedReason: variable.deprecatedReason,
        removeBy: variable.removeBy,
        renamedFrom: variable.renamedFrom,
      }))

    const hasContractLevelData =
      contract.expiresAt !== undefined ||
      contract.deprecated !== undefined ||
      contract.deprecatedReason !== undefined

    if (!hasContractLevelData && variables.length === 0) continue

    modelContracts.push({
      file: relativize(root, contract.file),
      exportName: contract.exportName,
      contractName: contract.contractName,
      expiresAt: contract.expiresAt,
      deprecated: contract.deprecated,
      deprecatedReason: contract.deprecatedReason,
      variables,
    })
  }
  modelContracts.sort(byIdentity)

  return {
    schemaVersion: LIFECYCLE_MODEL_SCHEMA_VERSION,
    contracts: modelContracts,
    expiring: computeExpiringEntries(contracts, expiringWithinDays, now).map((entry) => ({
      ...entry,
      file: relativize(root, entry.file),
    })),
  }
}
