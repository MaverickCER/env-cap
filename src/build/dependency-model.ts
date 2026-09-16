import { displayPath } from "./display-path.js"
import { byContractIdentity } from "./sort-by-identity.js"
import type { ContractRef } from "./evidence-reference.js"
import { buildDependencyGraph } from "./dependency-graph.js"
import type { ScannedSurface, VariableAccessStatus } from "./dependency-graph.js"
import type { DiscoveredContract } from "./link.js"
import type { ParseWarning } from "./parse.js"
import type { ImportResolutionContext } from "./resolution/resolve-import.js"
import type { DynamicAccessAssertion, SourcePosition } from "./source-position.js"

/**
 * The second of env-cap's seven canonical fact models (ADR 0024) -- a
 * versioned, JSON-serializable projection of the dependency-ownership
 * engine's graph. See ADR 0027 and ADR 0036.
 *
 * @remarks
 * `dependency-graph.ts`'s scanning/graph-building internals stay Private,
 * unchanged, per ADR 0010 -- this is a fact-shaped *result* built on top of
 * them, not a relaxation of that boundary. Graph-format rendering (DOT,
 * Mermaid, a `{nodes, edges}` JSON export) is deliberately not here --
 * that's presentation over this model's data, not the model itself.
 */

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export const DEPENDENCY_MODEL_SCHEMA_VERSION = 2

/**
 * One variable's access status within a contract, plus every position it was found
 * member-accessed at, aggregated across every consuming file.
 *
 * @see {@link ContractModelVariable} -- this same declared variable's canonical starting point.
 */
export interface DependencyModelVariable {
  readonly key: string
  readonly status: VariableAccessStatus
  /** Empty unless `status === "used"`. Previously discarded before reaching any public type -- see ADR 0027 (line only) and ADR 0036 (full position, file included per entry). */
  readonly positions: readonly SourcePosition[]
  /** Every developer-declared `dynamicAccess` citation's current freshness for this variable -- a wholly separate, independent fact from `status` above, never folded into it. Empty when no citation was declared, or when no manifest snapshot baseline was available to check against (the manifest pass wasn't also requested). See ADR 0037. */
  readonly dynamicAccessAssertions: readonly DynamicAccessAssertion[]
}

export interface DependencyModelContract {
  /** Root-relative, POSIX-separated -- matches `ContractModelContract.file`. */
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly imported: boolean
  readonly hasDynamicAccess: boolean
  readonly variables: readonly DependencyModelVariable[]
  /** Every file coupled to this contract -- contract-level "who depends on this," not proof any specific variable was read. */
  readonly consumingFiles: readonly string[]
  /** Files whose import of this contract's name couldn't be verified because it resolved through a file containing an unresolved wildcard re-export. */
  readonly ambiguousBarrelFiles: readonly string[]
  /** Every computed (dynamic) property-access site observed anywhere on this contract -- see ADR 0036. */
  readonly dynamicAccessSites: readonly SourcePosition[]
}

/** One contract, as referenced from the inverse (`consumers`) index -- see {@link ContractRef} for why no `contractName` is carried here. */
export type DependencyModelContractRef = ContractRef

/** One consuming file, and every contract it depends on -- the inverse of `DependencyModelContract.consumingFiles`. */
export interface DependencyModelConsumer {
  /** Root-relative, POSIX-separated. */
  readonly file: string
  readonly contracts: readonly DependencyModelContractRef[]
}

export interface DependencyModel {
  readonly schemaVersion: typeof DEPENDENCY_MODEL_SCHEMA_VERSION
  readonly contracts: readonly DependencyModelContract[]
  /** Inverse of `contracts[].consumingFiles` -- one entry per file that consumes at least one contract, listing which contracts it reads. */
  readonly consumers: readonly DependencyModelConsumer[]
  readonly warnings: readonly ParseWarning[]
  /** Every surface actually scanned for usage -- see ADR 0036. Always has at least one entry (the application root). */
  readonly scannedSurfaces: readonly ScannedSurface[]
}

function relativizePosition(root: string, position: SourcePosition): SourcePosition {
  return { ...position, file: displayPath(root, position.file) }
}

/**
 * Runs the dependency-ownership engine (`buildDependencyGraph()`, Private)
 * and projects its result into the Dependency Model's versioned,
 * JSON-serializable shape -- including the inverse file-\>contracts index
 * neither `dependency-graph.ts` nor `usage-report.ts` exposes today.
 *
 * @param scannedSurfaces - See `buildDependencyGraph()`'s own parameter of
 * the same name -- passed straight through to the published model.
 * @param dynamicAccessAcknowledgments - See `buildDependencyGraph()`'s own
 * parameter of the same name (ADR 0037) -- passed straight through.
 */
export async function buildDependencyModel(
  contracts: readonly DiscoveredContract[],
  scanFiles: readonly string[],
  readFile: (filePath: string) => Promise<string>,
  context: ImportResolutionContext,
  root: string,
  scannedSurfaces?: readonly ScannedSurface[],
  dynamicAccessAcknowledgments?: ReadonlyMap<string, readonly DynamicAccessAssertion[]>,
): Promise<DependencyModel> {
  const graph = await buildDependencyGraph(
    contracts,
    scanFiles,
    readFile,
    context,
    scannedSurfaces,
    dynamicAccessAcknowledgments,
  )

  const modelContracts: DependencyModelContract[] = graph.contracts.map((contract) => ({
    file: displayPath(root, contract.file),
    exportName: contract.exportName,
    contractName: contract.contractName,
    imported: contract.imported,
    hasDynamicAccess: contract.hasDynamicAccess,
    variables: [...contract.variables.entries()]
      .map(([key, info]) => ({
        key,
        status: info.status,
        positions: info.positions.map((p) => relativizePosition(root, p)),
        dynamicAccessAssertions: info.dynamicAccessAssertions,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    consumingFiles: [...contract.consumingFiles].map((f) => displayPath(root, f)).sort(),
    ambiguousBarrelFiles: [...contract.ambiguousBarrelFiles]
      .map((f) => displayPath(root, f))
      // `.sort()` here is a defensive no-op, not a real gap: dependency-graph.ts's
      // own `ambiguousBarrelFiles` is already `[...building.ambiguousBarrelFiles].sort()`
      // before this projection ever sees it (see that file's own comment).
      // Hand-verified: dropping this `.sort()` and running the real suite
      // passes unchanged.
      // Stryker disable next-line MethodExpression
      .sort(),
    dynamicAccessSites: contract.dynamicAccessSites.map((p) => relativizePosition(root, p)),
  }))
  modelContracts.sort(byContractIdentity)

  const byFile = new Map<string, DependencyModelContractRef[]>()
  for (const contract of modelContracts) {
    const ref: DependencyModelContractRef = {
      file: contract.file,
      exportName: contract.exportName,
    }
    for (const consumingFile of contract.consumingFiles) {
      const refs = byFile.get(consumingFile) ?? []
      refs.push(ref)
      byFile.set(consumingFile, refs)
    }
  }
  // No `.sort(byContractIdentity)` on `refs` here -- `modelContracts` (just
  // above) is already sorted by identity before this file's loop ever runs,
  // so each file's `refs` are necessarily appended in that same sorted
  // order already; re-sorting an already-sorted list is a no-op.
  // Stryker's `MethodExpression` mutator here only re-serializes this exact
  // chain call with different whitespace (one line vs. broken across lines,
  // the object literal's properties on one line vs. separate ones) -- same
  // method, same arguments, same object shape, not a semantic change at all.
  // Hand-verified: mutating to the reported replacement and running the real
  // suite passes unchanged.
  // Stryker disable next-line MethodExpression
  const consumers: DependencyModelConsumer[] = [...byFile.entries()]
    .map(([file, refs]) => ({ file, contracts: refs }))
    .sort((a, b) => a.file.localeCompare(b.file))

  return {
    schemaVersion: DEPENDENCY_MODEL_SCHEMA_VERSION,
    contracts: modelContracts,
    consumers,
    warnings: graph.warnings,
    scannedSurfaces: graph.scannedSurfaces,
  }
}
