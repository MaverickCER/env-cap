import { scanFileForDependencies } from "./scan-dependencies.js"
import type { FileScanResult } from "./scan-dependencies.js"
import { resolveImportSpecifier } from "./resolve-import.js"
import type { ImportResolutionContext } from "./resolve-import.js"
import { hasGeneratedBanner } from "./generated-banner.js"
import type { DiscoveredContract } from "./link.js"
import type { ParseWarning } from "./parse.js"

export type VariableAccessStatus = "used" | "unconsumed" | "indeterminate"

export interface VariableAccessInfo {
  readonly status: VariableAccessStatus
  /** Internal only, never exposed publicly -- which AST evidence produced
   *  this status, so a future "why does env-cap think this is
   *  unconsumed" bug report is debuggable without re-deriving the AST walk
   *  by hand. */
  readonly evidence: "member-access" | "dynamic-access" | "no-access"
}

export interface ContractDependencySummary {
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly imported: boolean
  readonly hasDynamicAccess: boolean
  /** Every declared key is always present. */
  readonly variables: ReadonlyMap<string, VariableAccessInfo>
  /** Every file coupled to this contract -- contract-level "who depends on
   *  this," not proof any specific variable was read. See the
   *  consumer-vs-variable-access semantics note in `deriveOwnershipFindings`. */
  readonly consumingFiles: readonly string[]
  /** Files whose import of this contract's name couldn't be verified
   *  because it resolved through a file containing an unresolved wildcard
   *  re-export. */
  readonly ambiguousBarrelFiles: readonly string[]
}

export interface DependencyGraph {
  readonly contracts: readonly ContractDependencySummary[]
  readonly warnings: readonly ParseWarning[]
}

interface BuildingContract {
  file: string
  exportName: string
  contractName: string
  imported: boolean
  hasDynamicAccess: boolean
  variables: Map<string, { hasMemberAccess: boolean }>
  consumingFiles: Set<string>
  ambiguousBarrelFiles: Set<string>
}

/**
 * Builds the dependency graph: for every discovered contract, which files
 * import it and which of its variables are actually read. Resolves import
 * specifiers via `resolveImportSpecifier` (relative imports, plus -- since
 * ADR 0023 -- a bare specifier matching the project's own `tsconfig.json`
 * `paths`/`baseUrl`, plus -- since ADR 0014 -- a bare specifier matching an
 * allow-listed package) -- same identity shape `link.ts` already uses
 * (`file#exportName`), no new scheme. Wiring `resolveImportSpecifier` in
 * here (not just `link.ts`) is load-bearing, not optional: without it, a
 * contract's consumer reached only through an alias (`import { x } from
 * "@/contracts/x"`) or a cross-package import (`import { x } from
 * "@acme/pkg"`) could never resolve, and the contract would be misreported
 * as `abandoned` by `deriveOwnershipFindings` below. Never executes any
 * scanned file.
 */
export async function buildDependencyGraph(
  contracts: readonly DiscoveredContract[],
  scanFiles: readonly string[],
  readFile: (filePath: string) => Promise<string>,
  context: ImportResolutionContext,
): Promise<DependencyGraph> {
  const warnings: ParseWarning[] = []

  const scanResults: FileScanResult[] = []
  for (const file of scanFiles) {
    let text: string
    try {
      text = await readFile(file)
    } catch {
      continue
    }
    if (hasGeneratedBanner(text)) continue
    scanResults.push(scanFileForDependencies(file, text))
  }
  const scanByFile = new Map(scanResults.map((result) => [result.file, result]))

  const byIdentity = new Map<string, BuildingContract>()
  for (const contract of contracts) {
    const variables = new Map<string, { hasMemberAccess: boolean }>()
    for (const variable of contract.variables)
      variables.set(variable.key, { hasMemberAccess: false })
    byIdentity.set(`${contract.file}#${contract.exportName}`, {
      file: contract.file,
      exportName: contract.exportName,
      contractName: contract.contractName,
      imported: false,
      hasDynamicAccess: false,
      variables,
      consumingFiles: new Set(),
      ambiguousBarrelFiles: new Set(),
    })
  }

  // Pass 1: direct resolution -- import specifier resolves to a file that
  // itself declares the requested export name as a known contract.
  for (const scan of scanResults) {
    for (const [localName, binding] of scan.imports) {
      const resolvedFile = await resolveImportSpecifier(scan.file, binding.specifier, context)
      if (!resolvedFile) continue // bare/package specifier or nonexistent file -- unresolvable, skip silently

      const building = byIdentity.get(`${resolvedFile}#${binding.importedName}`)
      if (!building) continue // handled in pass 2 if this turns out to be an ambiguous barrel forward

      building.imported = true
      building.consumingFiles.add(scan.file)

      for (const site of scan.accessesByLocalName.get(localName) ?? []) {
        if (site.kind === "dynamic") {
          building.hasDynamicAccess = true
        } else if (site.kind === "member") {
          const variable = building.variables.get(site.member)
          if (variable) variable.hasMemberAccess = true
        }
        // "reference" sites only prove contract-level coupling (recorded above), never a specific variable's access.
      }
    }
  }

  // Pass 2: ambiguous barrel forwarding -- for contracts never directly
  // resolved, check whether any scanned file imports a name matching this
  // contract's exportName through a specifier that resolves to a file
  // containing an unresolved `export * from "..."`. This is a name-based
  // heuristic, not a resolved link -- there's no way to prove the barrel is
  // actually forwarding this exact contract without following the
  // re-export chain, which is out of scope (ADR 0010).
  for (const scan of scanResults) {
    for (const [, binding] of scan.imports) {
      const resolvedFile = await resolveImportSpecifier(scan.file, binding.specifier, context)
      if (!resolvedFile) continue
      const targetScan = scanByFile.get(resolvedFile)
      if (!targetScan?.hasWildcardReExport) continue

      for (const building of byIdentity.values()) {
        if (building.imported) continue
        if (building.exportName !== binding.importedName) continue
        building.ambiguousBarrelFiles.add(scan.file)
      }
    }
  }

  const finalContracts: ContractDependencySummary[] = []
  for (const building of byIdentity.values()) {
    const variables = new Map<string, VariableAccessInfo>()
    for (const [key, info] of building.variables) {
      if (info.hasMemberAccess) {
        variables.set(key, { status: "used", evidence: "member-access" })
      } else if (building.hasDynamicAccess) {
        variables.set(key, { status: "indeterminate", evidence: "dynamic-access" })
      } else {
        variables.set(key, { status: "unconsumed", evidence: "no-access" })
      }
    }
    finalContracts.push({
      file: building.file,
      exportName: building.exportName,
      contractName: building.contractName,
      imported: building.imported,
      hasDynamicAccess: building.hasDynamicAccess,
      variables,
      consumingFiles: [...building.consumingFiles].sort(),
      ambiguousBarrelFiles: [...building.ambiguousBarrelFiles].sort(),
    })
  }

  return { contracts: finalContracts, warnings }
}

export interface AbandonedOwnershipFinding {
  readonly file: string
  readonly exportName: string
  readonly contractName: string
}
export interface UnresolvedConsumerOwnershipFinding extends AbandonedOwnershipFinding {
  readonly reason: string
}
export interface UnconsumedOwnedVariableOwnershipFinding extends AbandonedOwnershipFinding {
  readonly key: string
}
export interface IndeterminateOwnershipFinding extends AbandonedOwnershipFinding {
  readonly key: string
  readonly reason: string
}

export interface OwnershipFindings {
  readonly abandoned: readonly AbandonedOwnershipFinding[]
  readonly unresolvedConsumers: readonly UnresolvedConsumerOwnershipFinding[]
  readonly unconsumedOwned: readonly UnconsumedOwnedVariableOwnershipFinding[]
  readonly indeterminate: readonly IndeterminateOwnershipFinding[]
}

/**
 * Derives ownership findings from the graph. This is where the epistemic
 * rules that matter most live:
 *  - A contract never imported anywhere, with no ambiguous barrel path
 *    either, is `abandoned` -- a feature's schema outliving the feature.
 *  - A contract never *directly* imported, but reachable only through an
 *    unresolved barrel re-export, is `unresolvedConsumers` -- never
 *    `abandoned`. Claiming "abandoned" here would be a false positive with
 *    real consequences.
 *  - A variable with no member access anywhere, on a contract with no
 *    dynamic access anywhere, is `unconsumedOwned` -- "no consumer found in
 *    this repository," not "provably dead."
 *  - A variable with no member access, but dynamic access observed
 *    *somewhere* on that contract, is `indeterminate` -- never
 *    `unconsumedOwned`. Uncertainty is never promoted to certainty in either
 *    direction.
 */
export function deriveOwnershipFindings(graph: DependencyGraph): OwnershipFindings {
  const abandoned: AbandonedOwnershipFinding[] = []
  const unresolvedConsumers: UnresolvedConsumerOwnershipFinding[] = []
  const unconsumedOwned: UnconsumedOwnedVariableOwnershipFinding[] = []
  const indeterminate: IndeterminateOwnershipFinding[] = []

  for (const contract of graph.contracts) {
    const identity = {
      file: contract.file,
      exportName: contract.exportName,
      contractName: contract.contractName,
    }

    if (!contract.imported) {
      if (contract.ambiguousBarrelFiles.length > 0) {
        unresolvedConsumers.push({
          ...identity,
          reason:
            `Not directly imported anywhere, but ${contract.ambiguousBarrelFiles.length} file(s) import ` +
            `"${contract.exportName}" through a specifier that resolves to a file containing an unresolved ` +
            `"export * from" re-export -- cannot determine whether this contract is forwarded by it. ` +
            `Files: ${contract.ambiguousBarrelFiles.join(", ")}.`,
        })
      } else {
        abandoned.push(identity)
      }
      continue
    }

    for (const [key, info] of contract.variables) {
      if (info.status === "unconsumed") {
        unconsumedOwned.push({ ...identity, key })
      } else if (info.status === "indeterminate") {
        indeterminate.push({
          ...identity,
          key,
          reason: `Dynamic (computed) property access was observed on "${contract.exportName}" -- cannot determine whether "${key}" is read.`,
        })
      }
    }
  }

  return { abandoned, unresolvedConsumers, unconsumedOwned, indeterminate }
}
