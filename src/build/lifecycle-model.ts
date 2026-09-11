import { displayPath } from "./display-path.js"
import { byContractIdentity } from "./sort-by-identity.js"
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
export const LIFECYCLE_MODEL_SCHEMA_VERSION = 2

/**
 * One variable's lifecycle data (expiry, deprecation, rename correlation).
 *
 * @see {@link ContractModelVariable} -- this same declared variable's canonical starting point.
 */
export interface LifecycleModelVariable {
  readonly key: string
  readonly expiresAt: string | undefined
  readonly refreshInstructions: string | undefined
  readonly deprecated: boolean | undefined
  readonly deprecatedReason: string | undefined
  readonly removeBy: string | undefined
  /** The previous variable name this one renames, if set -- see `ManifestChangeReport`'s rename correlation (ADR 0029/0030). */
  readonly renamedFrom: string | undefined
  /** Descriptive retention policy (e.g. "delete after 90 days") -- a policy statement, never computed or parsed, deliberately independent of `expiresAt`'s actual temporal constraint. See ADR 0035. */
  readonly retention: string | undefined
}

export interface LifecycleModelContract {
  /** Root-relative, POSIX-separated -- matches `ContractModelContract.file`. */
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly expiresAt: string | undefined
  readonly deprecated: boolean | undefined
  readonly deprecatedReason: string | undefined
  /** See {@link LifecycleModelVariable.retention}. */
  readonly retention: string | undefined
  /** Only variables with at least one lifecycle field set (`expiresAt`, `refreshInstructions`, `deprecated`, `removeBy`, `renamedFrom`, `retention`) -- same "only what's relevant" scope `renderLifecycleReport()` already uses for its rows. */
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

function hasLifecycleData(variable: DiscoveredVariable): boolean {
  return (
    variable.expiresAt !== undefined ||
    variable.refreshInstructions !== undefined ||
    variable.deprecated !== undefined ||
    variable.removeBy !== undefined ||
    variable.renamedFrom !== undefined ||
    variable.retention !== undefined
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
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((variable) => ({
        key: variable.key,
        expiresAt: variable.expiresAt,
        refreshInstructions: variable.refreshInstructions,
        deprecated: variable.deprecated,
        deprecatedReason: variable.deprecatedReason,
        removeBy: variable.removeBy,
        renamedFrom: variable.renamedFrom,
        retention: variable.retention,
      }))

    const hasContractLevelData =
      contract.expiresAt !== undefined ||
      contract.deprecated !== undefined ||
      contract.deprecatedReason !== undefined ||
      contract.retention !== undefined

    if (!hasContractLevelData && variables.length === 0) continue

    modelContracts.push({
      file: displayPath(root, contract.file),
      exportName: contract.exportName,
      contractName: contract.contractName,
      expiresAt: contract.expiresAt,
      deprecated: contract.deprecated,
      deprecatedReason: contract.deprecatedReason,
      retention: contract.retention,
      variables,
    })
  }
  modelContracts.sort(byContractIdentity)

  return {
    schemaVersion: LIFECYCLE_MODEL_SCHEMA_VERSION,
    contracts: modelContracts,
    expiring: computeExpiringEntries(contracts, expiringWithinDays, now).map((entry) => ({
      ...entry,
      file: displayPath(root, entry.file),
    })),
  }
}
