import { displayPath } from "./display-path.js"
import type { DiscoveredContract } from "./link.js"
import type { ManifestChangeReport, ManifestVariableRef } from "./evidence-snapshot.js"

/**
 * The sixth of env-cap's seven canonical fact models (ADR 0024) -- what
 * changed since the last persisted evidence snapshot (ADR 0038; previously
 * a manifest-scoped snapshot, ADR 0021). See ADR 0030 (base shape) and ADR
 * 0029 (the `renamedFrom` field this file's rename correlation is gated
 * on).
 *
 * @remarks
 * Wraps `ManifestChangeReport` (`evidence-snapshot.ts`) rather than
 * replacing it -- this model exists to give the change report a versioned,
 * model-namespaced shape Evidence Model can assemble against, alongside the
 * other six models. Empty (no adds/removes/updates) whenever no previous
 * evidence snapshot location was configured for this run -- there is
 * nothing to diff against, which is a genuinely different state from a
 * first-ever run *with* tracking configured (where everything reads as
 * added).
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
  return (
    a.contractIdentity.localeCompare(b.contractIdentity) || a.currentKey.localeCompare(b.currentKey)
  )
}

function findByContractAndKey(
  refs: readonly ManifestVariableRef[],
  file: string,
  exportName: string,
  key: string,
): ManifestVariableRef | undefined {
  return refs.find((ref) => ref.file === file && ref.exportName === exportName && ref.key === key)
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
    const relativeFile = displayPath(root, contract.file)
    const cIdentity = contractIdentity(relativeFile, contract.exportName)

    for (const variable of contract.variables) {
      // Runtime-equivalent without this guard: `findByContractAndKey(...,
      // variable.renamedFrom)` with `renamedFrom === undefined` searches for
      // `ref.key === undefined`, which a real `ManifestVariableRef.key`
      // (always a defined string) can never match -- `removedRef` stays
      // `undefined`, and the `if (!addedRef || !removedRef) continue` two
      // lines down already skips it. Load-bearing for TypeScript's own
      // narrowing of `variable.renamedFrom` to `string` below, though --
      // hand-verified by bypassing it and running the full `vitest run`:
      // only the tsc-backed json-schema freshness test fails, all 1233
      // others pass unchanged.
      // Stryker disable next-line ConditionalExpression
      if (!variable.renamedFrom) continue

      const addedRef = findByContractAndKey(
        manifest.addedVariables,
        relativeFile,
        contract.exportName,
        variable.key,
      )
      const removedRef = findByContractAndKey(
        manifest.removedVariables,
        relativeFile,
        contract.exportName,
        variable.renamedFrom,
      )
      if (!addedRef || !removedRef) continue

      renamedVariables.push({
        contractIdentity: cIdentity,
        file: addedRef.file,
        exportName: addedRef.exportName,
        // Resolved from the contract this rename was declared on, not carried
        // on the ref -- see `ContractRef` (`evidence-reference.ts`).
        contractName: contract.contractName,
        previousKey: removedRef.key,
        currentKey: addedRef.key,
      })
    }
  }
  renamedVariables.sort(byRenameIdentity)

  return { schemaVersion: CHANGE_MODEL_SCHEMA_VERSION, manifest, renamedVariables }
}
