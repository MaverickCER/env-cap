import path from "node:path"
import type { DiscoveredContract } from "./link.js"
import type { ManifestChangeReport, ManifestVariableRef } from "./manifest-snapshot.js"

/**
 * The sixth of env-cap's seven canonical fact models (ADR 0024) -- what
 * changed since the last committed manifest snapshot. See ADR 0030 (base
 * shape) and ADR 0029 (the `renamedFrom` field this file's rename
 * correlation is gated on).
 *
 * @remarks
 * Wraps the existing `ManifestChangeReport` (ADR 0021) rather than
 * replacing it -- that type, and the manifest-generation consumer surface
 * built on it, stay exactly as they are. This model exists to give the
 * change report a versioned, model-namespaced shape Evidence Model can
 * assemble against, alongside the other six models.
 */

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export const CHANGE_MODEL_SCHEMA_VERSION = 1

/** One `addedVariables`/`removedVariables` pair in `manifest`, correlated into a single rename via the current declaration's `renamedFrom` field (ADR 0029). */
export interface RenamedVariable {
  /** The owning contract's identity (`${file}#${exportName}`) -- a rename never crosses contracts. */
  readonly contractIdentity: string
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  /** The variable's key before the rename -- matches a `manifest.removedVariables` entry. */
  readonly previousKey: string
  /** The variable's key after the rename -- matches a `manifest.addedVariables` entry. */
  readonly currentKey: string
}

export interface ChangeModel {
  readonly schemaVersion: typeof CHANGE_MODEL_SCHEMA_VERSION
  /** The existing manifest change report, unmodified -- see ADR 0021. `addedVariables`/`removedVariables` still list a correlated rename's two halves separately; `renamedVariables` below is an additive, separately-computed view, not a filter over this field. */
  readonly manifest: ManifestChangeReport
  /**
   * Every `addedVariables`/`removedVariables` pair this run's currently
   * declared `renamedFrom` values correlate into a single rename, sorted by
   * contract identity then current key.
   *
   * @remarks
   * Only ever populated from an *authored* `renamedFrom` -- never guessed
   * from name similarity (ADR 0010's "provable, not heuristic" ethos).
   * Variable-level only: Lifecycle Model deliberately has no contract-level
   * `renamedFrom` (ADR 0029), so there is no `renamedContracts` -- a
   * contract-level rename has no field to correlate from.
   */
  readonly renamedVariables: readonly RenamedVariable[]
}

function contractIdentity(file: string, exportName: string): string {
  return `${file}#${exportName}`
}

function byRenameIdentity(a: RenamedVariable, b: RenamedVariable): number {
  if (a.contractIdentity !== b.contractIdentity)
    return a.contractIdentity < b.contractIdentity ? -1 : 1
  return a.currentKey < b.currentKey ? -1 : a.currentKey > b.currentKey ? 1 : 0
}

function findByContractAndKey(
  refs: readonly ManifestVariableRef[],
  contractIdentity: string,
  key: string,
): ManifestVariableRef | undefined {
  return refs.find((ref) => ref.contractIdentity === contractIdentity && ref.key === key)
}

/**
 * Wraps an already-computed `ManifestChangeReport` (e.g.
 * `GenerateEnvManifestResult.changes`) in the Change Model's versioned
 * shape, and correlates renames using the current run's `renamedFrom`
 * declarations. `currentContracts` should be the same contracts the
 * manifest was generated from (active contracts only, matching
 * `renderManifest()`'s own scope -- same as every other input to this
 * report family).
 */
export function buildChangeModel(
  manifest: ManifestChangeReport,
  currentContracts: readonly DiscoveredContract[],
  root: string,
): ChangeModel {
  const renamedVariables: RenamedVariable[] = []

  for (const contract of currentContracts) {
    const relativeFile = path.relative(root, contract.file).split(path.sep).join("/")
    const cIdentity = contractIdentity(relativeFile, contract.exportName)

    for (const variable of contract.variables) {
      if (!variable.renamedFrom) continue

      const addedRef = findByContractAndKey(manifest.addedVariables, cIdentity, variable.key)
      const removedRef = findByContractAndKey(
        manifest.removedVariables,
        cIdentity,
        variable.renamedFrom,
      )
      if (!addedRef || !removedRef) continue

      renamedVariables.push({
        contractIdentity: cIdentity,
        file: addedRef.file,
        exportName: addedRef.exportName,
        contractName: addedRef.contractName,
        previousKey: removedRef.key,
        currentKey: addedRef.key,
      })
    }
  }
  renamedVariables.sort(byRenameIdentity)

  return { schemaVersion: CHANGE_MODEL_SCHEMA_VERSION, manifest, renamedVariables }
}
