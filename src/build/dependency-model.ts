import path from "node:path"
import { buildDependencyGraph } from "./dependency-graph.js"
import type { VariableAccessStatus } from "./dependency-graph.js"
import type { DiscoveredContract } from "./link.js"
import type { ParseWarning } from "./parse.js"
import type { ImportResolutionContext } from "./resolution/resolve-import.js"

/**
 * The second of env-cap's seven canonical fact models (ADR 0024) -- a
 * versioned, JSON-serializable projection of the dependency-ownership
 * engine's graph. See ADR 0027.
 *
 * @remarks
 * `dependency-graph.ts`'s scanning/graph-building internals stay Private,
 * unchanged, per ADR 0010 -- this is a fact-shaped *result* built on top of
 * them, not a relaxation of that boundary. Graph-format rendering (DOT,
 * Mermaid, a `{nodes, edges}` JSON export) is deliberately not here --
 * that's presentation over this model's data, not the model itself.
 */

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export const DEPENDENCY_MODEL_SCHEMA_VERSION = 1

/** One variable's access status within a contract, plus every line it was found member-accessed on, aggregated across every consuming file. */
export interface DependencyModelVariable {
  readonly key: string
  readonly status: VariableAccessStatus
  /** Empty unless `status === "used"`. Previously discarded before reaching any public type -- see ADR 0027. */
  readonly lines: readonly number[]
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
}

/** One contract, as referenced from the inverse (`consumers`) index. */
export interface DependencyModelContractRef {
  readonly file: string
  readonly exportName: string
  readonly contractName: string
}

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
}

function relativize(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/")
}

function byContractIdentity(a: DependencyModelContractRef, b: DependencyModelContractRef): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1
  return a.exportName < b.exportName ? -1 : a.exportName > b.exportName ? 1 : 0
}

/**
 * Runs the dependency-ownership engine (`buildDependencyGraph()`, Private)
 * and projects its result into the Dependency Model's versioned,
 * JSON-serializable shape -- including the inverse file-\>contracts index
 * neither `dependency-graph.ts` nor `usage-report.ts` exposes today.
 */
export async function buildDependencyModel(
  contracts: readonly DiscoveredContract[],
  scanFiles: readonly string[],
  readFile: (filePath: string) => Promise<string>,
  context: ImportResolutionContext,
  root: string,
): Promise<DependencyModel> {
  const graph = await buildDependencyGraph(contracts, scanFiles, readFile, context)

  const modelContracts: DependencyModelContract[] = graph.contracts.map((contract) => ({
    file: relativize(root, contract.file),
    exportName: contract.exportName,
    contractName: contract.contractName,
    imported: contract.imported,
    hasDynamicAccess: contract.hasDynamicAccess,
    variables: [...contract.variables.entries()]
      .map(([key, info]) => ({ key, status: info.status, lines: info.lines }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    consumingFiles: [...contract.consumingFiles].map((f) => relativize(root, f)).sort(),
    ambiguousBarrelFiles: [...contract.ambiguousBarrelFiles].map((f) => relativize(root, f)).sort(),
  }))
  modelContracts.sort(byContractIdentity)

  const byFile = new Map<string, DependencyModelContractRef[]>()
  for (const contract of modelContracts) {
    const ref: DependencyModelContractRef = {
      file: contract.file,
      exportName: contract.exportName,
      contractName: contract.contractName,
    }
    for (const consumingFile of contract.consumingFiles) {
      const refs = byFile.get(consumingFile) ?? []
      refs.push(ref)
      byFile.set(consumingFile, refs)
    }
  }
  const consumers: DependencyModelConsumer[] = [...byFile.entries()]
    .map(([file, refs]) => ({ file, contracts: refs.sort(byContractIdentity) }))
    .sort((a, b) => (a.file < b.file ? -1 : 1))

  return {
    schemaVersion: DEPENDENCY_MODEL_SCHEMA_VERSION,
    contracts: modelContracts,
    consumers,
    warnings: graph.warnings,
  }
}
