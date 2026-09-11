import { displayPath } from "./display-path.js"
import { scanFileForDependencies } from "./scan-dependencies.js"
import type { AccessSite, EscapeReason, FileScanResult } from "./scan-dependencies.js"
import { resolveImportSpecifier } from "./resolution/resolve-import.js"
import type { ImportResolutionContext } from "./resolution/resolve-import.js"
import { isGeneratedFile } from "./generated-banner.js"
import { dynamicAccessVariableIdentity } from "./citation-verification.js"
import type { DiscoveredContract } from "./link.js"
import type { ParseWarning } from "./parse.js"
import type { DynamicAccessAssertion, SourcePosition } from "./source-position.js"

/**
 * What env-cap's static scan could prove about one variable's consumption:
 * it was member-accessed somewhere (`"used"`), it was never accessed at all
 * within the scanned surfaces (`"unconsumed"`), or a computed (dynamic)
 * property access on the owning contract makes the answer unprovable
 * (`"indeterminate"`).
 *
 * @remarks
 * Deliberately narrower than `@maverickcer/data-cap`'s equivalent, which
 * splits the unprovable case further (an unresolved *consumer* vs. an
 * indeterminate *field*). That split exists because a data-cap capability
 * exposes many fields at once, so it has a real "we resolved the consumer,
 * but can't tell which field it touched" state to name. env-cap's
 * consumption model is one value per key: a contract member access either
 * names the key statically (`"used"`) or it doesn't (`"indeterminate"`), and
 * there is no intermediate case where the consumer is known but the thing
 * consumed is ambiguous. Adding a fourth state here would be vocabulary
 * borrowed from a model env-cap doesn't have -- see ADR 0010's
 * "provable, not heuristic" rule. Developer-declared `dynamicAccess`
 * citations stay a wholly separate fact and are never folded into this
 * status (ADR 0037).
 */
export type VariableAccessStatus = "used" | "unconsumed" | "indeterminate"

/**
 * Every reason `deriveOwnershipFindings` can cite for an `indeterminate`
 * variable, cited on the {@link EscapeSite} the scanner actually observed --
 * `EscapeReason` (destructuring/aliasing shapes the scanner declines to
 * follow, see ADR 0039) plus `"reference"` for a tracked import/alias
 * mentioned bare (passed as an argument, spread, assigned elsewhere, ...):
 * a real, provable read of the contract that this single-file walk simply
 * can't attribute to any specific key.
 */
type EscapeVia = EscapeReason | "reference"

/** One position where a tracked contract's value escaped this scanner's local dataflow analysis -- see {@link EscapeVia}. */
interface EscapeSite extends SourcePosition {
  readonly via: EscapeVia
}

interface VariableAccessInfo {
  readonly status: VariableAccessStatus
  /** Internal only, never exposed publicly -- which AST evidence produced
   *  this status, so a future "why does env-cap think this is
   *  unconsumed" bug report is debuggable without re-deriving the AST walk
   *  by hand. */
  readonly evidence: "member-access" | "dynamic-access" | "escape" | "no-access"
  /** Every position where a member access was observed for this variable,
   *  aggregated across every consuming file -- empty unless
   *  `status === "used"`. Previously computed by `scan-dependencies.ts`'s
   *  `AccessSite` and discarded before reaching even this internal type;
   *  threaded through as of ADR 0027 (line only) and ADR 0036 (full
   *  position, one entry per file rather than a flat, file-less list of
   *  line numbers) so `dependency-model.ts` can publish it. */
  readonly positions: readonly SourcePosition[]
  /** Every developer-declared `dynamicAccess` citation's current freshness for this variable -- a wholly separate, independent fact from `status`/`evidence` above, never folded into them. Empty unless the linked `documentEnv()` call declared at least one citation for this key. See ADR 0037. */
  readonly dynamicAccessAssertions: readonly DynamicAccessAssertion[]
}

/** One named surface `buildDependencyGraph()`'s scan actually covered -- the
 *  application's own root, plus one entry per allow-listed `packages` (ADR
 *  0014) name whose source was also scanned. See ADR 0036: a claim like
 *  "no consumer found" is only ever as strong as what was actually
 *  searched, and this is what lets a renderer say so explicitly instead of
 *  implying an unbounded guarantee it can't back up. */
export interface ScannedSurface {
  /** `"application"` for the local project root, `"package:<name>"` for an allow-listed package's own source. */
  readonly label: string
  /** Root-relative, POSIX-separated. */
  readonly root: string
}

interface ContractDependencySummary {
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
  /** Every computed (dynamic) property-access site observed anywhere on
   *  this contract -- previously collapsed into `hasDynamicAccess` alone
   *  and discarded; threaded through as of ADR 0036 so a finding can cite
   *  exactly where the uncertainty comes from instead of just asserting it
   *  exists. */
  readonly dynamicAccessSites: readonly SourcePosition[]
  /** Every position where the contract's value flowed somewhere this
   *  scanner's local dataflow analysis can't follow -- see {@link
   *  EscapeVia} and ADR 0039. Like `dynamicAccessSites`, this widens every
   *  not-otherwise-accessed variable on the SAME contract to
   *  `indeterminate`, never `unconsumed`. */
  readonly escapeSites: readonly EscapeSite[]
}

export interface DependencyGraph {
  readonly contracts: readonly ContractDependencySummary[]
  readonly warnings: readonly ParseWarning[]
  /** Every surface actually scanned for usage -- see {@link ScannedSurface}. Always has at least one entry (the application root). */
  readonly scannedSurfaces: readonly ScannedSurface[]
}

interface BuildingContract {
  file: string
  exportName: string
  contractName: string
  imported: boolean
  variables: Map<string, { hasMemberAccess: boolean; positions: SourcePosition[] }>
  consumingFiles: Set<string>
  ambiguousBarrelFiles: Set<string>
  dynamicAccessSites: SourcePosition[]
  escapeSites: EscapeSite[]
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
 *
 * @param scannedSurfaces - Every surface `scanFiles` was drawn from (ADR
 * 0036) -- the caller (`generate-usage.ts`'s `computeScanSurface()`) is
 * responsible for actually walking each surface and merging the resulting
 * file lists into `scanFiles`; this function only records the labels for
 * downstream reporting, exactly as given.
 * @param dynamicAccessAcknowledgments - Every current `dynamicAccess`
 * citation's freshness, keyed by `dynamicAccessVariableIdentity()` (ADR
 * 0037) -- the caller (`evidence-snapshot.ts`'s
 * `computeDynamicAccessAcknowledgments()`) is responsible for actually
 * computing it; omitted entirely (never partially computed) when no
 * previous evidence snapshot location was configured, since there's no
 * committed baseline to check freshness against without one.
 */
/** Reads and statically scans every file, skipping unreadable and generated ones. */
async function scanAllFiles(
  scanFiles: readonly string[],
  readFile: (filePath: string) => Promise<string>,
): Promise<FileScanResult[]> {
  const scanResults: FileScanResult[] = []
  for (const file of scanFiles) {
    let text: string
    try {
      text = await readFile(file)
    } catch {
      continue
    }
    if (isGeneratedFile(text)) continue
    scanResults.push(scanFileForDependencies(file, text))
  }
  return scanResults
}

/** One empty `BuildingContract` per discovered contract, keyed `file#exportName`. */
function initBuildingContracts(
  contracts: readonly DiscoveredContract[],
): Map<string, BuildingContract> {
  const byIdentity = new Map<string, BuildingContract>()
  for (const contract of contracts) {
    const variables = new Map<string, { hasMemberAccess: boolean; positions: SourcePosition[] }>()
    for (const variable of contract.variables)
      variables.set(variable.key, { hasMemberAccess: false, positions: [] })
    byIdentity.set(`${contract.file}#${contract.exportName}`, {
      file: contract.file,
      exportName: contract.exportName,
      contractName: contract.contractName,
      imported: false,
      variables,
      consumingFiles: new Set(),
      ambiguousBarrelFiles: new Set(),
      dynamicAccessSites: [],
      escapeSites: [],
    })
  }
  return byIdentity
}

/**
 * Folds one consuming file's access sites for one tracked local name into
 * `building`. A `dynamic` site records a contract-level computed-access
 * position; a `member` site marks a specific variable read; a `reference`
 * (bare mention) or `escape` (rest/nested/computed-key binding, or an alias
 * this scan declined to follow -- ADR 0039) both record a contract-level
 * escape position, which `deriveOwnershipFindings` widens every
 * not-otherwise-read variable to `indeterminate` on, exactly as
 * `dynamicAccessSites` already does. A proven member access on the same key
 * still wins (see `classifyVariable`).
 */
function attributeAccessSites(
  building: BuildingContract,
  scanFile: string,
  // A poisoned fallback element here is behaviorally equivalent, not a real
  // gap: a plain string's `.kind` reads `undefined`, matching none of the
  // branches below. Hand-verified: mutating the `?? []` and running the
  // real suite passes unchanged.
  // Stryker disable next-line ArrayDeclaration
  sites: readonly AccessSite[] = [],
): void {
  for (const site of sites) {
    if (site.kind === "dynamic") {
      building.dynamicAccessSites.push({ file: scanFile, line: site.line, column: site.column })
    } else if (site.kind === "member") {
      const variable = building.variables.get(site.member)
      if (variable) {
        variable.hasMemberAccess = true
        variable.positions.push({ file: scanFile, line: site.line, column: site.column })
      }
    } else {
      building.escapeSites.push({
        file: scanFile,
        line: site.line,
        column: site.column,
        via: site.kind === "escape" ? site.via : "reference",
      })
    }
  }
}

/**
 * Sorts two positions by file, then line. The `a.line - b.line` tiebreak
 * (only reached when `a.file === b.file`) is unreachable-to-differ from `+`:
 * every position for ONE variable in ONE file is pushed by a single
 * top-to-bottom AST walk of that file's source, so same-file positions are
 * always ALREADY in non-decreasing line order by construction. Hand-verified:
 * mutating `-` to `+` and running the real suite passes unchanged.
 */
// Stryker disable ArithmeticOperator
function byPosition(a: SourcePosition, b: SourcePosition): number {
  return a.file.localeCompare(b.file) || a.line - b.line
}
// Stryker restore ArithmeticOperator

/** One variable's final access status: a proven member access is always `used`; otherwise a contract-level dynamic access or escape makes it `indeterminate`; otherwise `unconsumed`. */
function classifyVariable(
  info: { hasMemberAccess: boolean; positions: readonly SourcePosition[] },
  hasDynamicAccess: boolean,
  hasEscape: boolean,
  dynamicAccessAssertions: readonly DynamicAccessAssertion[],
): VariableAccessInfo {
  if (info.hasMemberAccess) {
    return {
      status: "used",
      evidence: "member-access",
      positions: [...info.positions].sort(byPosition),
      dynamicAccessAssertions,
    }
  }
  const evidence: VariableAccessInfo["evidence"] = hasDynamicAccess
    ? "dynamic-access"
    : hasEscape
      ? "escape"
      : "no-access"
  return {
    status: hasDynamicAccess || hasEscape ? "indeterminate" : "unconsumed",
    evidence,
    positions: [],
    dynamicAccessAssertions,
  }
}

/** Maps one fully-populated `BuildingContract` into its immutable public summary. */
function finalizeContract(
  building: BuildingContract,
  root: string,
  dynamicAccessAcknowledgments: ReadonlyMap<string, readonly DynamicAccessAssertion[]> | undefined,
): ContractDependencySummary {
  const hasDynamicAccess = building.dynamicAccessSites.length > 0
  const hasEscape = building.escapeSites.length > 0
  const relativeFile = displayPath(root, building.file)
  const variables = new Map<string, VariableAccessInfo>()
  for (const [key, info] of building.variables) {
    const dynamicAccessAssertions =
      dynamicAccessAcknowledgments?.get(
        dynamicAccessVariableIdentity(relativeFile, building.exportName, key),
      ) ?? []
    variables.set(key, classifyVariable(info, hasDynamicAccess, hasEscape, dynamicAccessAssertions))
  }
  return {
    file: building.file,
    exportName: building.exportName,
    contractName: building.contractName,
    imported: building.imported,
    hasDynamicAccess,
    variables,
    consumingFiles: [...building.consumingFiles].sort(),
    ambiguousBarrelFiles: [...building.ambiguousBarrelFiles].sort(),
    dynamicAccessSites: [...building.dynamicAccessSites].sort(byPosition),
    escapeSites: [...building.escapeSites].sort(byPosition),
  }
}

export async function buildDependencyGraph(
  contracts: readonly DiscoveredContract[],
  scanFiles: readonly string[],
  readFile: (filePath: string) => Promise<string>,
  context: ImportResolutionContext,
  scannedSurfaces: readonly ScannedSurface[] = [{ label: "application", root: "." }],
  dynamicAccessAcknowledgments?: ReadonlyMap<string, readonly DynamicAccessAssertion[]>,
): Promise<DependencyGraph> {
  const warnings: ParseWarning[] = []
  const scanResults = await scanAllFiles(scanFiles, readFile)
  const scanByFile = new Map(scanResults.map((result) => [result.file, result]))
  const byIdentity = initBuildingContracts(contracts)

  // Pass 1: direct resolution -- import specifier resolves to a file that
  // itself declares the requested export name as a known contract.
  for (const scan of scanResults) {
    for (const [localName, binding] of scan.imports) {
      const resolvedFile = await resolveImportSpecifier(scan.file, binding.specifier, context)
      // Bypassing this guard is behaviorally equivalent for any realistic
      // fixture, not a real gap: an undefined `resolvedFile` makes the
      // lookup key `` `undefined#${binding.importedName}` ``, which the next
      // `if (!building) continue` guard already absorbs. Hand-verified:
      // mutating this and running the real suite passes unchanged.
      // Stryker disable next-line ConditionalExpression
      if (!resolvedFile) continue // bare/package specifier or nonexistent file -- unresolvable, skip silently

      const building = byIdentity.get(`${resolvedFile}#${binding.importedName}`)
      if (!building) continue // handled in pass 2 if this turns out to be an ambiguous barrel forward

      building.imported = true
      building.consumingFiles.add(scan.file)
      attributeAccessSites(building, scan.file, scan.accessesByLocalName.get(localName))
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
      // Same equivalence as pass 1's identical guard above: `resolvedFile`
      // undefined makes `scanByFile.get(resolvedFile)` below return
      // `undefined` (its keys are always real scanned file paths, never
      // "undefined"), which the very next `!targetScan?.hasWildcardReExport`
      // guard already absorbs. Hand-verified: mutating this and running the
      // real suite passes unchanged.
      // Stryker disable next-line ConditionalExpression
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

  const finalContracts = [...byIdentity.values()].map((building) =>
    finalizeContract(building, context.root, dynamicAccessAcknowledgments),
  )

  return { contracts: finalContracts, warnings, scannedSurfaces }
}

interface AbandonedOwnershipFinding {
  readonly file: string
  readonly exportName: string
  readonly contractName: string
}
interface UnresolvedConsumerOwnershipFinding extends AbandonedOwnershipFinding {
  readonly reason: string
}
interface UnconsumedOwnedVariableOwnershipFinding extends AbandonedOwnershipFinding {
  readonly key: string
}
interface IndeterminateAccessOwnershipFinding extends AbandonedOwnershipFinding {
  readonly key: string
  readonly reason: string
  /** Every AST-observed dynamic-access site on this contract -- see ADR 0036. */
  readonly dynamicAccessSites: readonly SourcePosition[]
  /** Every AST-observed escape site on this contract -- see {@link EscapeVia} and ADR 0039. */
  readonly escapeSites: readonly EscapeSite[]
}
/** A variable that would otherwise be `unconsumedOwned`/`indeterminate`, but has at least one `"fresh"` developer-declared `dynamicAccess` assertion -- the "asserted" category (ADR 0037). Never silently dropped: the raw `wouldBeStatus` is always shown alongside the assertion, per Design 7's "never let a claim overwrite an observation" rule. */
interface AssertedOwnershipFinding extends AbandonedOwnershipFinding {
  readonly key: string
  readonly wouldBeStatus: "unconsumed" | "indeterminate"
  readonly dynamicAccessAssertions: readonly DynamicAccessAssertion[]
}

export interface OwnershipFindings {
  readonly abandoned: readonly AbandonedOwnershipFinding[]
  readonly unresolvedConsumers: readonly UnresolvedConsumerOwnershipFinding[]
  readonly unconsumedOwned: readonly UnconsumedOwnedVariableOwnershipFinding[]
  readonly indeterminate: readonly IndeterminateAccessOwnershipFinding[]
  readonly asserted: readonly AssertedOwnershipFinding[]
}

function formatSurfaces(surfaces: readonly ScannedSurface[]): string {
  return surfaces.map((s) => s.label).join(", ")
}

function formatSites(sites: readonly SourcePosition[]): string {
  return sites.map((s) => `${s.file}:${s.line}:${s.column}`).join(", ")
}

function formatEscapeSites(sites: readonly EscapeSite[]): string {
  return sites.map((s) => `${s.file}:${s.line}:${s.column} (${s.via})`).join(", ")
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
 *    this repository," not "provably dead." The scanned surfaces are named
 *    explicitly in the reason, per ADR 0036, so the claim is exactly as
 *    strong as what was actually searched.
 *  - A variable with no member access, but dynamic access observed
 *    *somewhere* on that contract, is `indeterminate` -- never
 *    `unconsumedOwned`. Uncertainty is never promoted to certainty in either
 *    direction. Every candidate dynamic-access site is cited by name.
 *  - A variable with at least one `"fresh"` {@link DynamicAccessAssertion}
 *    (ADR 0037) gets neither `unconsumedOwned` nor `indeterminate`, regardless
 *    of `status` -- a developer has re-acknowledged the access exists. The
 *    Dependency Model itself still keeps `status` and the assertion side by
 *    side, unedited; only *this* finding-suppression decision reads them
 *    together.
 */
export function deriveOwnershipFindings(graph: DependencyGraph): OwnershipFindings {
  const abandoned: AbandonedOwnershipFinding[] = []
  const unresolvedConsumers: UnresolvedConsumerOwnershipFinding[] = []
  const unconsumedOwned: UnconsumedOwnedVariableOwnershipFinding[] = []
  const indeterminate: IndeterminateAccessOwnershipFinding[] = []
  const asserted: AssertedOwnershipFinding[] = []
  const surfaces = formatSurfaces(graph.scannedSurfaces)
  const hasFreshAssertion = (info: VariableAccessInfo): boolean =>
    info.dynamicAccessAssertions.some((a) => a.acknowledgment === "fresh")

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
      if (hasFreshAssertion(info)) {
        if (info.status === "unconsumed" || info.status === "indeterminate") {
          asserted.push({
            ...identity,
            key,
            wouldBeStatus: info.status,
            dynamicAccessAssertions: info.dynamicAccessAssertions,
          })
        }
        continue
      }
      if (info.status === "unconsumed") {
        unconsumedOwned.push({ ...identity, key })
      } else if (info.status === "indeterminate") {
        const reason =
          info.evidence === "dynamic-access"
            ? `Dynamic (computed) property access was observed on "${contract.exportName}" -- cannot ` +
              `determine whether "${key}" is read. Searched: ${surfaces}. Dynamic access observed at: ` +
              `${formatSites(contract.dynamicAccessSites)}.`
            : `Contract "${contract.exportName}" is used in a way this scanner's local dataflow ` +
              `analysis cannot follow (a rest binding, nested destructuring, a computed key, an ` +
              `ambiguous alias, or the contract passed/referenced directly) -- cannot determine ` +
              `whether "${key}" is read. Searched: ${surfaces}. Escaped at: ` +
              `${formatEscapeSites(contract.escapeSites)}.`
        indeterminate.push({
          ...identity,
          key,
          reason,
          dynamicAccessSites: contract.dynamicAccessSites,
          escapeSites: contract.escapeSites,
        })
      }
    }
  }

  return { abandoned, unresolvedConsumers, unconsumedOwned, indeterminate, asserted }
}
