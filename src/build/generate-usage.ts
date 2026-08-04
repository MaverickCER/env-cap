import fs from "node:fs/promises"
import path from "node:path"
import type { CompatibilityIssue } from "./compatibility.js"
import { buildDependencyGraph, deriveOwnershipFindings } from "./dependency-graph.js"
import type { DependencyGraph } from "./dependency-graph.js"
import { discoverSchemaFiles } from "./discover.js"
import { EnvUsageAnalysisError } from "./errors.js"
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from "./generate-manifest.js"
import { linkFiles } from "./link.js"
import type { DiscoveredContract } from "./link.js"
import type { ParseWarning } from "./parse.js"
import type { ImportResolutionContext } from "./resolve-import.js"
import {
  mergeLocalAndPackageFiles,
  resolveAllowlistedPackages,
  type PackageSchemaResolutionResult,
} from "./resolve-package-schema.js"
import { resolveWithinRoot } from "./resolve-within-root.js"
import {
  renderUsageReport,
  type AbandonedContractFinding,
  type IndeterminateOwnershipFinding,
  type OwnershipDependencyEntry,
  type RenderUsageReportOptions,
  type UnconsumedOwnedVariableFinding,
  type UnresolvedConsumerFinding,
} from "./usage-report.js"

/** Deliberately broader than schema discovery -- usage can occur in any
 *  source file, not just `env.schema.ts` files. Not configurable (see ADR
 *  0010's "convention over configuration"). Note this never reaches
 *  `node_modules` (see `discover.ts`) -- a package-resolved contract's
 *  *consumer* is always project-local source, which this already covers;
 *  the contract's own declaration file is what `packages` resolves. */
export const SCAN_INCLUDE = ["**/*.ts", "**/*.tsx"]

/** Options for {@link generateUsageReport}. */
export interface GenerateUsageReportOptions {
  /** Directory glob patterns are resolved against. Defaults to `process.cwd()`. */
  root?: string | undefined
  /** Schema-discovery glob, for the contract graph -- self-sufficient like the other two generator functions. */
  include?: string[] | undefined
  /** Glob patterns to exclude, for both schema discovery and the usage scan. Defaults to node_modules/dist/.git. */
  exclude?: string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`; see ADR 0014. */
  packages?: readonly string[] | undefined
  /** Escalates `abandonedContracts`/`unconsumedOwnedVariables` to a hard
   *  error. Never escalates `unresolvedConsumers` or `indeterminate` --
   *  both are "we don't know" states, at any setting. */
  onOwnershipIssue?: "warn" | "throw" | undefined
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
  readonly blocking: readonly CompatibilityIssue[]
}

/**
 * Builds the dependency graph and maps it into the public, ownership-framed result.
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
  onOwnershipIssue: "warn" | "throw",
  context: ImportResolutionContext,
  parseWarnings: readonly ParseWarning[],
): Promise<UsageComputation> {
  const graph = await buildDependencyGraph(contracts, scanFiles, readFile, context)
  const findings = deriveOwnershipFindings(graph)

  const ownerByIdentity = new Map<string, string | undefined>()
  for (const contract of contracts)
    ownerByIdentity.set(`${contract.file}#${contract.exportName}`, contract.owner)
  const ownerFor = (file: string, exportName: string): string | undefined =>
    ownerByIdentity.get(`${file}#${exportName}`)

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

  const unconsumedOwnedVariables: UnconsumedOwnedVariableFinding[] = findings.unconsumedOwned.map(
    (f) => ({
      contractName: f.contractName,
      owner: ownerFor(f.file, f.exportName),
      key: f.key,
    }),
  )

  const indeterminate: IndeterminateOwnershipFinding[] = findings.indeterminate.map((f) => ({
    contractName: f.contractName,
    key: f.key,
    reason: f.reason,
  }))

  const blocking: CompatibilityIssue[] =
    onOwnershipIssue === "throw"
      ? [
          ...findings.abandoned.map((f) => ({
            severity: "error" as const,
            variable: `(contract) ${f.contractName}`,
            files: [path.relative(root, f.file)],
            reason: `"${f.contractName}" is never imported anywhere in the scanned repository -- abandoned ownership.`,
          })),
          ...findings.unconsumedOwned.map((f) => ({
            severity: "error" as const,
            variable: f.key,
            files: [path.relative(root, f.file)],
            reason: `"${f.key}" (owned by "${f.contractName}") has no consumer found in the scanned repository -- unconsumed owned dependency.`,
          })),
        ]
      : []

  return {
    graph,
    result: {
      dependencyOwnership,
      abandonedContracts,
      unresolvedConsumers,
      unconsumedOwnedVariables,
      indeterminate,
      parseWarnings,
    },
    blocking,
  }
}

/** Writes the Dependency & Ownership Report. Callers must have already confirmed `reportPath` is safe and nothing is blocking. */
export async function writeUsageReport(
  reportPath: string,
  computed: Omit<GenerateUsageReportResult, "reportPath">,
): Promise<void> {
  const source = renderUsageReport(computed)
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
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
 * @throws {EnvUsageAnalysisError} If `report.location` escapes `root`, or if a blocking ownership issue is found.
 */
export async function generateUsageReport(
  options: GenerateUsageReportOptions,
): Promise<GenerateUsageReportResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? DEFAULT_INCLUDE
  const exclude = options.exclude ?? DEFAULT_EXCLUDE
  const packages = options.packages ?? []
  const onOwnershipIssue = options.onOwnershipIssue ?? "warn"

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

  const localSchemaFiles = await discoverSchemaFiles({ root, include, exclude })
  const packageCache = new Map<string, Promise<PackageSchemaResolutionResult>>()
  const {
    files: packageFiles,
    origins,
    warnings: packageWarnings,
  } = await resolveAllowlistedPackages(packages, root, packageCache)
  const schemaFiles = await mergeLocalAndPackageFiles(
    localSchemaFiles,
    packageFiles.map((f) => f.file),
  )

  const context: ImportResolutionContext = { root, packages, cache: packageCache }
  const linkResult = await linkFiles(
    schemaFiles,
    (filePath) => fs.readFile(filePath, "utf8"),
    context,
    origins,
  )

  const scanFiles = await discoverSchemaFiles({ root, include: SCAN_INCLUDE, exclude })

  const computed = await computeUsage(
    root,
    linkResult.contracts,
    scanFiles,
    (filePath) => fs.readFile(filePath, "utf8"),
    onOwnershipIssue,
    context,
    [...packageWarnings, ...linkResult.warnings],
  )
  if (computed.blocking.length > 0) throw new EnvUsageAnalysisError(computed.blocking)

  if (reportPath) await writeUsageReport(reportPath, computed.result)

  return { reportPath, ...computed.result }
}
