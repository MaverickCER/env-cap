import path from "node:path"
import { assembleProject } from "./assemble-project.js"
import type { BuildFileSystem } from "./types.js"
import { buildDependencyGraph, deriveOwnershipFindings } from "./dependency-graph.js"
import type { DependencyGraph, ScannedSurface } from "./dependency-graph.js"
import { displayPath } from "./display-path.js"
import { discoverSchemaFiles } from "./discover.js"
import { EnvUsageAnalysisError } from "./errors.js"
import type { DynamicAccessCitationProblem } from "./citation-verification.js"
import { dynamicAccessVariableIdentity } from "./citation-verification.js"
import { defaultExclude, defaultInclude } from "./generate-manifest.js"
import { effectiveOwner } from "./link.js"
import type { DiscoveredContract } from "./link.js"
import type { ParseWarning } from "./parse.js"
import type { ImportResolutionContext } from "./resolution/resolve-import.js"
import type { PackageOrigin } from "./resolution/resolve-package-schema.js"
import { resolveWithinRoot } from "./resolution/resolve-within-root.js"
import type { DynamicAccessAssertion } from "./source-position.js"
import {
  renderUsageReport,
  type AbandonedContractFinding,
  type AssertedDynamicAccessFinding,
  type IndeterminateOwnershipFinding,
  type OwnershipDependencyEntry,
  type RenderUsageReportOptions,
  type UnconsumedOwnedVariableFinding,
  type UnresolvedConsumerFinding,
} from "./usage-report.js"

/**
 * Computes the full usage-scan surface: the local project root, plus (ADR
 * 0036) each allow-listed `packages` (ADR 0014) name whose schema was
 * successfully resolved -- reusing `origins`' already-resolved
 * `packageDir` (from `resolveAllowlistedPackages()`, already computed by
 * the caller for contract discovery, not re-resolved here) as a bounded
 * scan root, walked with the exact same `discoverSchemaFiles()` +
 * `SCAN_INCLUDE`/`defaultExclude()` policy the local root already uses --
 * never a naive, unbounded walk of the package's whole directory. Shared by
 * `generateUsageReport()` and `generateEvidenceModel()` so both agree on
 * exactly the same scanned surface.
 */
export async function computeScanSurface(
  root: string,
  exclude: readonly string[],
  origins: ReadonlyMap<string, PackageOrigin>,
  fs: BuildFileSystem,
): Promise<{ scanFiles: string[]; scannedSurfaces: ScannedSurface[] }> {
  // Deliberately broader than schema discovery -- usage can occur in any
  // source file, not just `env.schema.ts` files. Not configurable (see ADR
  // 0010's "convention over configuration").
  const localScanFiles = await discoverSchemaFiles({
    fs,
    root,
    include: ["**/*.ts", "**/*.tsx"],
    exclude,
  })
  const scannedSurfaces: ScannedSurface[] = [{ label: "application", root: "." }]
  const scanFiles = [...localScanFiles]

  const seenPackageDirs = new Set<string>()
  for (const origin of origins.values()) {
    if (seenPackageDirs.has(origin.packageDir)) continue // multiple resolved files can share one packageDir; scan it once
    seenPackageDirs.add(origin.packageDir)
    const packageScanFiles = await discoverSchemaFiles({
      fs,
      root: origin.packageDir,
      include: ["**/*.ts", "**/*.tsx"],
      exclude: defaultExclude(),
    })
    scanFiles.push(...packageScanFiles)
    scannedSurfaces.push({
      label: `package:${origin.packageName}`,
      root: displayPath(root, origin.packageDir),
    })
  }

  return { scanFiles, scannedSurfaces }
}

/** Options for {@link generateUsageReport}. */
export interface GenerateUsageReportOptions {
  /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
  fs: BuildFileSystem
  /** Directory glob patterns are resolved against. Defaults to `process.cwd()`. */
  root?: string | undefined
  /** Schema-discovery glob, for the contract graph -- self-sufficient like the other two generator functions. */
  include?: string[] | undefined
  /** Glob patterns to exclude, for both schema discovery and the usage scan. Defaults to node_modules/dist/.git. */
  exclude?: string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`; see ADR 0014. */
  packages?: readonly string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`; see ADR 0023. */
  tsconfig?: string | false | undefined
  /** Also write the rendered Markdown report to this path, relative to `root`. Omitted: the report is only returned, not written. */
  report?:
    | {
        /** Output path for the report, relative to `root`. */
        location: string
      }
    | undefined
}

/**
 * Public result of {@link generateUsageReport}.
 *
 * @remarks
 * Composed from the building-block types `usage-report.ts` (the renderer) owns, the same way
 * `GenerateDocumentationResult` composes from `docs.ts`'s `CatalogContract` --
 * keeps the renderer importable without its orchestrator (see
 * `RenderUsageReportOptions`'s own doc comment).
 */
export interface GenerateUsageReportResult extends RenderUsageReportOptions {
  /** Absolute path the report was written to, or `undefined` if `options.report` wasn't passed. */
  readonly reportPath: string | undefined
}

export interface UsageComputation {
  readonly graph: DependencyGraph
  readonly result: RenderUsageReportOptions
}

/**
 * Builds the dependency graph and maps it into the public, ownership-framed
 * result. Never blocks -- see `RenderUsageReportOptions`'s finding fields'
 * own doc comments; a team that wants to gate CI on an ownership issue reads
 * `Finding[]` (the "ownership" family) from the persisted evidence artifact
 * and decides for itself. See ADR 0038.
 *
 * @remarks
 * This mapping is the actual API boundary: internal AST vocabulary
 * ("member accessed", "dynamic") becomes ownership vocabulary ("who owns
 * it", "who consumes it", "abandoned", "unresolved"). The result is a
 * renderer-agnostic domain model -- the same computed data a future JSON or
 * SARIF exporter would consume, not something coupled to the Markdown
 * renderer.
 */
export async function computeUsage(
  root: string,
  contracts: readonly DiscoveredContract[],
  scanFiles: readonly string[],
  readFile: (filePath: string) => Promise<string>,
  context: ImportResolutionContext,
  parseWarnings: readonly ParseWarning[],
  scannedSurfaces?: readonly ScannedSurface[],
  dynamicAccessAcknowledgments?: ReadonlyMap<string, readonly DynamicAccessAssertion[]>,
): Promise<UsageComputation> {
  const graph = await buildDependencyGraph(
    contracts,
    scanFiles,
    readFile,
    context,
    scannedSurfaces,
    dynamicAccessAcknowledgments,
  )
  const findings = deriveOwnershipFindings(graph)

  const contractByIdentity = new Map<string, DiscoveredContract>()
  for (const contract of contracts)
    contractByIdentity.set(`${contract.file}#${contract.exportName}`, contract)
  // Contract-level default owner only -- correct for a contract-level
  // finding (dependencyOwnership, abandonedContracts), which has no
  // specific variable to consider a per-variable override for.
  //
  // `file`/`exportName` here always come from `graph.contracts` (via
  // `deriveOwnershipFindings()`), which `buildDependencyGraph()` builds 1:1
  // from this SAME `contracts` array (same identity-key derivation) -- so
  // the lookup can never actually miss. The `?.` only exists for TypeScript's
  // own narrowing; hand-verified by removing it and running the full
  // `vitest run`: only the two tsc-backed json-schema freshness tests fail
  // (a type-narrowing regression, not a behavioral one), every other test
  // (1226) passes unchanged.
  const ownerFor = (file: string, exportName: string): string | undefined =>
    // Stryker disable next-line OptionalChaining
    contractByIdentity.get(`${file}#${exportName}`)?.owner
  // A specific variable's *effective* owner (its own override, falling back
  // to the contract default) -- see ADR 0028. Used only for
  // unconsumedOwnedVariables below, the one finding type that names a
  // specific variable.
  const effectiveOwnerFor = (file: string, exportName: string, key: string): string | undefined => {
    const contract = contractByIdentity.get(`${file}#${exportName}`)
    // Same provably-always-found identity guarantee as `ownerFor` above
    // (`f.file`/`f.exportName` here come from `findings.unconsumedOwned`,
    // itself derived from the same `graph.contracts`) -- hand-verified the
    // same way: bypassing this guard only breaks the two tsc-narrowing
    // tests, not any real behavior.
    // Stryker disable next-line ConditionalExpression
    if (!contract) return undefined
    const variable = contract.variables.find((v) => v.key === key)
    return variable ? effectiveOwner(contract, variable) : contract.owner
  }

  const dependencyOwnership: OwnershipDependencyEntry[] = graph.contracts.map((c) => ({
    contractName: c.contractName,
    file: path.relative(root, c.file),
    owner: ownerFor(c.file, c.exportName),
    variableCount: c.variables.size,
    consumers: c.consumingFiles.map((f) => path.relative(root, f)),
  }))

  const abandonedContracts: AbandonedContractFinding[] = findings.abandoned.map((f) => ({
    contractName: f.contractName,
    file: path.relative(root, f.file),
    owner: ownerFor(f.file, f.exportName),
  }))

  const unresolvedConsumers: UnresolvedConsumerFinding[] = findings.unresolvedConsumers.map(
    (f) => ({
      contractName: f.contractName,
      file: path.relative(root, f.file),
      reason: f.reason,
    }),
  )

  // Every `dynamicAccess` citation for this variable that's currently
  // stale/missing -- the confidence signal `renderUsageReport()` shows
  // alongside "unconsumed"/"indeterminate" (ADR 0038). A variable with a
  // *fresh* assertion never reaches here at all (`deriveOwnershipFindings()`
  // already routed it into `asserted` instead), so every citation found by
  // this lookup is, by construction, one env-cap can no longer vouch for.
  const staleOrMissingCitationsFor = (
    contractName: string,
    file: string,
    exportName: string,
    key: string,
  ): DynamicAccessCitationProblem[] => {
    const relativeFile = displayPath(root, file)
    const identity = dynamicAccessVariableIdentity(relativeFile, exportName, key)
    const problems: DynamicAccessCitationProblem[] = []
    for (const a of dynamicAccessAcknowledgments?.get(identity) ?? []) {
      // Per the doc comment above: unreachable in practice from either real
      // caller (unconsumedOwnedVariables/indeterminate below) -- both only
      // ever call this for a finding `deriveOwnershipFindings()` already
      // decided has NO "fresh" assertion (a "fresh"-containing variable is
      // routed to the separate "asserted" bucket instead, using this exact
      // same identity-keyed map). Hand-verified: forcing this to `if (false)`
      // and running the full `vitest run` leaves all 1232 tests passing.
      // Stryker disable next-line ConditionalExpression, StringLiteral
      if (a.acknowledgment === "fresh") continue
      problems.push({
        contractName,
        file: relativeFile,
        exportName,
        key,
        position: { file: a.file, line: a.line, column: a.column },
        acknowledgment: a.acknowledgment,
      })
    }
    return problems
  }

  const unconsumedOwnedVariables: UnconsumedOwnedVariableFinding[] = findings.unconsumedOwned.map(
    (f) => ({
      contractName: f.contractName,
      owner: effectiveOwnerFor(f.file, f.exportName, f.key),
      key: f.key,
      staleOrMissingCitations: staleOrMissingCitationsFor(
        f.contractName,
        f.file,
        f.exportName,
        f.key,
      ),
    }),
  )

  const indeterminate: IndeterminateOwnershipFinding[] = findings.indeterminate.map((f) => ({
    contractName: f.contractName,
    key: f.key,
    reason: f.reason,
    dynamicAccessSites: f.dynamicAccessSites.map((p) => ({
      ...p,
      file: displayPath(root, p.file),
    })),
    staleOrMissingCitations: staleOrMissingCitationsFor(
      f.contractName,
      f.file,
      f.exportName,
      f.key,
    ),
  }))

  // Assertion positions are already root-relative by citation construction
  // (a `dynamicAccess` entry is a developer-authored relative path), unlike
  // `dynamicAccessSites` above -- no relativizing needed here.
  const asserted: AssertedDynamicAccessFinding[] = findings.asserted.map((f) => ({
    contractName: f.contractName,
    key: f.key,
    wouldBeStatus: f.wouldBeStatus,
    dynamicAccessAssertions: f.dynamicAccessAssertions,
  }))

  return {
    graph,
    result: {
      dependencyOwnership,
      abandonedContracts,
      unresolvedConsumers,
      unconsumedOwnedVariables,
      indeterminate,
      asserted,
      parseWarnings,
      scannedSurfaces: graph.scannedSurfaces,
    },
  }
}

/** Writes the Dependency & Ownership Report. Callers must have already confirmed `reportPath` is safe and nothing is blocking. */
export async function writeUsageReport(
  reportPath: string,
  computed: Omit<GenerateUsageReportResult, "reportPath">,
  fs: BuildFileSystem,
): Promise<void> {
  const source = renderUsageReport(computed)
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  // `source` is always a plain string (renderUsageReport()'s return type) --
  // fs.writeFile defaults a string write to utf8 regardless of the encoding
  // arg, so "utf8" vs "" is unobservable. Same established equivalence as
  // evidence-cache.ts/evidence-fingerprint.ts/env-example.ts's own writes.
  // Stryker disable next-line StringLiteral
  await fs.writeFile(reportPath, source, "utf8")
}

/**
 * Build-time only. Answers who owns each contract, which features depend on
 * it, and what the blast radius is if it changes -- the mirror image of
 * {@link generateEnvManifest}'s "safer migrations" story: a schema that was never
 * wired up, or was abandoned mid-removal, shows up here instead of sitting
 * unnoticed.
 *
 * @remarks
 * This is an additional, separate artifact, not a replacement for
 * {@link generateDocumentation}'s Catalog -- the two serve different audiences
 * (see ADR 0010).
 *
 * @throws {EnvUsageAnalysisError} If `report.location` escapes `root`.
 */
export async function generateUsageReport(
  options: GenerateUsageReportOptions,
): Promise<GenerateUsageReportResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? defaultInclude()
  const exclude = options.exclude ?? defaultExclude()
  const packages = options.packages ?? []

  let reportPath: string | undefined
  if (options.report) {
    const result = resolveWithinRoot(
      root,
      options.report.location,
      "report.location",
      "generateUsageReport",
    )
    if (!result.ok) throw new EnvUsageAnalysisError([result.issue])
    reportPath = result.resolved
  }

  const { readFileCached, linkResult, context, origins, packageWarnings, tsconfigWarnings } =
    await assembleProject({
      fs: options.fs,
      root,
      include,
      exclude,
      packages,
      tsconfig: options.tsconfig,
    })

  const { scanFiles, scannedSurfaces } = await computeScanSurface(
    root,
    exclude,
    origins,
    options.fs,
  )

  const computed = await computeUsage(
    root,
    linkResult.contracts,
    scanFiles,
    readFileCached,
    context,
    [...packageWarnings, ...tsconfigWarnings, ...linkResult.warnings],
    scannedSurfaces,
  )

  if (reportPath) await writeUsageReport(reportPath, computed.result, options.fs)

  return { reportPath, ...computed.result }
}
