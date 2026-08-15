import fs from "node:fs/promises"
import path from "node:path"
import type { CompatibilityIssue } from "./compatibility.js"
import { discoverSchemaFiles } from "./discover.js"
import { EnvProjectGenerationError } from "./errors.js"
import {
  computeDocumentation,
  DEFAULT_EXPIRING_WITHIN_DAYS,
  writeDocumentation,
} from "./generate-documentation.js"
import type {
  DocumentationComputation,
  GenerateDocumentationOptions,
  GenerateDocumentationResult,
} from "./generate-documentation.js"
import {
  computeManifest,
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  writeManifest,
} from "./generate-manifest.js"
import type {
  GenerateEnvManifestOptions,
  GenerateEnvManifestResult,
  ManifestComputation,
} from "./generate-manifest.js"
import {
  computeManifestChanges,
  manifestSnapshotPath,
  writeManifestSnapshot,
} from "./manifest-snapshot.js"
import type { ManifestChangesComputation } from "./manifest-snapshot.js"
import { computeUsage, SCAN_INCLUDE, writeUsageReport } from "./generate-usage.js"
import type {
  GenerateUsageReportOptions,
  GenerateUsageReportResult,
  UsageComputation,
} from "./generate-usage.js"
import { linkFiles } from "./link.js"
import type { DiscoveredContract } from "./link.js"
import { resolveLiveExpirationDates } from "./live-expirations.js"
import type { LiveExpirationDates } from "./live-expirations.js"
import type { ParseWarning } from "./parse.js"
import type { ImportResolutionContext } from "./resolution/resolve-import.js"
import {
  mergeLocalAndPackageFiles,
  resolveAllowlistedPackages,
} from "./resolution/resolve-package-schema.js"
import type { PackageSchemaResolutionResult } from "./resolution/resolve-package-schema.js"
import {
  createAliasResolutionCache,
  loadTsconfigPaths,
} from "./resolution/resolve-tsconfig-paths.js"
import { resolveWithinRoot } from "./resolution/resolve-within-root.js"

/** Options for {@link generateEnvArtifacts}. */
export interface GenerateEnvArtifactsOptions {
  /** Directory glob patterns are resolved against, shared across every requested pass. Defaults to `process.cwd()`. */
  root?: string | undefined
  /** Shared schema-discovery glob for the contract graph. Defaults to `["**\/env.schema.ts"]`. */
  include?: string[] | undefined
  /** Glob patterns to exclude, shared across every requested pass. Defaults to node_modules/dist/.git. */
  exclude?: string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`; shared across every requested pass. See ADR 0014. */
  packages?: readonly string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`; shared across every requested pass. See ADR 0023. */
  tsconfig?: string | false | undefined
  /** Manifest pass options, or `false` to skip it entirely. */
  manifest?:
    | Omit<GenerateEnvManifestOptions, "root" | "include" | "exclude" | "packages" | "tsconfig">
    | false
    | undefined
  /** Docs pass options, or `false` to skip it entirely. */
  docs?:
    | Omit<
        GenerateDocumentationOptions,
        "root" | "include" | "exclude" | "packages" | "tsconfig" | "liveExpirationDates"
      >
    | false
    | undefined
  /** Usage-report pass options, or `false` to skip it entirely. */
  usage?:
    | Omit<GenerateUsageReportOptions, "root" | "include" | "exclude" | "packages" | "tsconfig">
    | false
    | undefined
  /**
   * Supplies expiration metadata from a live source (a secrets manager, an
   * internal inventory API, ...) as a post-discovery override applied only to
   * the docs pass. Invoked at most once, only when a `docs` pass is actually
   * requested, with every discovered variable name across all passes' shared
   * contract graph. See `live-expirations.ts` and ADR 0012. Omitted: behavior
   * is unchanged from a purely static `expiresAt`.
   */
  liveExpirationDates?: LiveExpirationDates | undefined
}

/** The result of a completed {@link generateEnvArtifacts} run. */
export interface GenerateEnvArtifactsResult {
  /** Set only when `options.manifest` wasn't `false`. */
  readonly manifest: GenerateEnvManifestResult | undefined
  /** Set only when `options.docs` wasn't `false`. */
  readonly docs: GenerateDocumentationResult | undefined
  /** Set only when `options.usage` wasn't `false`. */
  readonly usage: GenerateUsageReportResult | undefined
}

/**
 * Every intermediate value both the write path (`generateEnvArtifacts()`
 * below) and the drift-check path (`checkEnvArtifacts()` in
 * `check-artifacts.ts`) need, computed exactly once. Internal/Private tier
 * per `VERSIONING.md` -- not re-exported from `./index.ts`.
 */
export interface ComputeArtifactsResult {
  readonly root: string
  readonly manifestOptions:
    | Omit<GenerateEnvManifestOptions, "root" | "include" | "exclude" | "packages" | "tsconfig">
    | undefined
  readonly manifestOutputPath: string | undefined
  readonly manifestComputed: ManifestComputation | undefined
  readonly manifestChanges: ManifestChangesComputation | undefined
  readonly docsOptions:
    | Omit<
        GenerateDocumentationOptions,
        "root" | "include" | "exclude" | "packages" | "tsconfig" | "liveExpirationDates"
      >
    | undefined
  readonly docsPath: string | undefined
  readonly envExamplePath: string | undefined
  readonly docsComputed: DocumentationComputation | undefined
  readonly docsContracts: readonly DiscoveredContract[]
  readonly usageOptions:
    | Omit<GenerateUsageReportOptions, "root" | "include" | "exclude" | "packages" | "tsconfig">
    | undefined
  readonly usageReportPath: string | undefined
  readonly usageComputed: UsageComputation | undefined
  readonly blocking: readonly CompatibilityIssue[]
  readonly packageWarnings: readonly ParseWarning[]
  readonly linkWarnings: readonly ParseWarning[]
  /** Single timestamp shared by `computeDocumentation()`'s `expiringSoon` computation and (on the write path) the final `renderDocs()` call, so both agree on exactly the same instant. */
  readonly generatedAt: Date
}

/**
 * Runs schema discovery, linking, and every requested pass's pure `compute*()`
 * step -- but never writes anything to disk. Throws `EnvProjectGenerationError`
 * immediately if any requested output location escapes `root` (same
 * fail-fast-before-any-work guarantee `generateEnvArtifacts()` has always
 * given); otherwise returns every intermediate value without itself checking
 * `blocking` findings, so callers (the write path below, and `--check`'s
 * `checkEnvArtifacts()`) each decide when to throw on those.
 */
export async function computeArtifacts(
  options: GenerateEnvArtifactsOptions,
): Promise<ComputeArtifactsResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? DEFAULT_INCLUDE
  const exclude = options.exclude ?? DEFAULT_EXCLUDE
  const packages = options.packages ?? []

  const manifestOptions = options.manifest === false ? undefined : options.manifest
  const docsOptions = options.docs === false ? undefined : options.docs
  const usageOptions = options.usage === false ? undefined : options.usage

  const pathIssues: CompatibilityIssue[] = []

  let manifestOutputPath: string | undefined
  if (manifestOptions) {
    const result = resolveWithinRoot(
      root,
      manifestOptions.location,
      "manifest.location",
      "generateEnvArtifacts",
    )
    if (result.ok) manifestOutputPath = result.resolved
    else pathIssues.push(result.issue)
  }

  let docsPath: string | undefined
  let envExamplePath: string | undefined
  if (docsOptions) {
    const result = resolveWithinRoot(
      root,
      docsOptions.location,
      "docs.location",
      "generateEnvArtifacts",
    )
    if (result.ok) docsPath = result.resolved
    else pathIssues.push(result.issue)

    if (docsOptions.envExample) {
      const exampleResult = resolveWithinRoot(
        root,
        docsOptions.envExample.location,
        "docs.envExample.location",
        "generateEnvArtifacts",
      )
      if (exampleResult.ok) envExamplePath = exampleResult.resolved
      else pathIssues.push(exampleResult.issue)
    }
  }

  let usageReportPath: string | undefined
  if (usageOptions?.report) {
    const result = resolveWithinRoot(
      root,
      usageOptions.report.location,
      "usage.report.location",
      "generateEnvArtifacts",
    )
    if (result.ok) usageReportPath = result.resolved
    else pathIssues.push(result.issue)
  }

  // Fail fast, before any discovery/parsing work and before any file is
  // written -- same atomicity guarantee `generateEnvManifest()` etc. give
  // standalone, now widened across every requested pass at once.
  if (pathIssues.length > 0) throw new EnvProjectGenerationError(pathIssues)

  // Shared across every requested pass so a file matched by more than one
  // pass's glob (e.g. a schema file, which is also picked up by the usage
  // pass's broader `SCAN_INCLUDE`) is only ever read from disk once.
  const fileCache = new Map<string, Promise<string>>()
  const readFileCached = (filePath: string): Promise<string> => {
    let cached = fileCache.get(filePath)
    if (!cached) {
      cached = fs.readFile(filePath, "utf8")
      fileCache.set(filePath, cached)
    }
    return cached
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
  const { resolution: tsconfigPaths, warning: tsconfigWarning } = await loadTsconfigPaths(
    root,
    options.tsconfig,
  )
  const tsconfigWarnings = tsconfigWarning ? [tsconfigWarning] : []

  const context: ImportResolutionContext = {
    root,
    packages,
    cache: packageCache,
    tsconfigPaths,
    aliasCache: createAliasResolutionCache(),
  }
  const linkResult = await linkFiles(schemaFiles, readFileCached, context, origins)
  const generatedAt = new Date()

  // Invoked at most once, and only when a docs pass is actually requested --
  // no point fetching live expiration metadata that nothing will render.
  const docsContracts = docsOptions
    ? await resolveLiveExpirationDates(linkResult.contracts, options.liveExpirationDates)
    : linkResult.contracts

  const blocking: CompatibilityIssue[] = []

  const manifestComputed = manifestOptions
    ? computeManifest(root, linkResult, manifestOptions.onIncompatibility ?? "warn")
    : undefined
  if (manifestComputed) blocking.push(...manifestComputed.blocking)

  const manifestChanges =
    manifestComputed && manifestOutputPath
      ? await computeManifestChanges(root, manifestOutputPath, manifestComputed.activeContracts)
      : undefined

  const docsComputed = docsOptions
    ? computeDocumentation(
        root,
        { ...linkResult, contracts: docsContracts },
        docsOptions.onUndocumented ?? "warn",
        docsOptions.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS,
        generatedAt,
      )
    : undefined
  if (docsComputed) blocking.push(...docsComputed.blocking)

  let usageComputed: UsageComputation | undefined
  if (usageOptions) {
    const scanFiles = await discoverSchemaFiles({ root, include: SCAN_INCLUDE, exclude })
    usageComputed = await computeUsage(
      root,
      linkResult.contracts,
      scanFiles,
      readFileCached,
      usageOptions.onOwnershipIssue ?? "warn",
      context,
      [...packageWarnings, ...tsconfigWarnings, ...linkResult.warnings],
    )
    blocking.push(...usageComputed.blocking)
  }

  return {
    root,
    manifestOptions,
    manifestOutputPath,
    manifestComputed,
    manifestChanges,
    docsOptions,
    docsPath,
    envExamplePath,
    docsComputed,
    docsContracts,
    usageOptions,
    usageReportPath,
    usageComputed,
    blocking,
    packageWarnings: [...packageWarnings, ...tsconfigWarnings],
    linkWarnings: linkResult.warnings,
    generatedAt,
  }
}

/**
 * Orchestrates {@link generateEnvManifest}/{@link generateDocumentation}/
 * {@link generateUsageReport} by composing their shared private compute/write
 * pipeline directly, running schema discovery+linking exactly once
 * regardless of how many passes are requested -- an orchestrator, not a new
 * analysis engine (see ADR 0011).
 *
 * @remarks
 * Two distinct atomicity guarantees, not one:
 *  - **Compute atomicity (guaranteed)**: every requested pass's blocking
 *    findings are checked, across all passes, before any pass writes
 *    anything.
 *  - **Write atomicity (NOT guaranteed, and not attempted)**: once writes
 *    begin, each `fs.writeFile` is independent. A real I/O failure partway
 *    through (disk full, permissions changed mid-run) can leave some
 *    artifacts on disk and not others. Transactional (temp-file + rename)
 *    writes across all three artifacts were considered and rejected as
 *    disproportionate machinery for a rare failure mode -- see ADR 0011.
 *
 * @throws {EnvProjectGenerationError} If any requested output location escapes `root`, or if any requested pass reports a blocking finding.
 */
export async function generateEnvArtifacts(
  options: GenerateEnvArtifactsOptions,
): Promise<GenerateEnvArtifactsResult> {
  const computed = await computeArtifacts(options)
  const {
    manifestOptions,
    manifestOutputPath,
    manifestComputed,
    manifestChanges,
    docsOptions,
    docsPath,
    envExamplePath,
    docsComputed,
    docsContracts,
    usageOptions,
    usageReportPath,
    usageComputed,
    blocking,
    packageWarnings,
    linkWarnings,
    root,
    generatedAt,
  } = computed

  if (blocking.length > 0) throw new EnvProjectGenerationError(blocking)

  let manifestResult: GenerateEnvManifestResult | undefined
  if (manifestOptions && manifestComputed && manifestOutputPath && manifestChanges) {
    await writeManifest(manifestOutputPath, manifestComputed.activeContracts)
    await writeManifestSnapshot(manifestSnapshotPath(manifestOutputPath), manifestChanges.snapshot)
    const manifestParseWarnings = manifestChanges.readWarning
      ? [...packageWarnings, ...linkWarnings, manifestChanges.readWarning]
      : [...packageWarnings, ...linkWarnings]
    manifestResult = {
      outputPath: manifestOutputPath,
      contracts: manifestComputed.contractSummaries,
      warnings: manifestComputed.warnings,
      parseWarnings: manifestParseWarnings,
      changes: manifestChanges.report,
    }
  }

  let docsResult: GenerateDocumentationResult | undefined
  if (docsOptions && docsComputed && docsPath) {
    const { envExample } = await writeDocumentation(
      docsPath,
      envExamplePath,
      root,
      docsContracts,
      docsComputed.documentation,
      docsOptions.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS,
      generatedAt,
      docsOptions.envExample?.onExisting,
    )
    docsResult = {
      docsPath,
      envExample,
      contracts: docsComputed.contractSummaries,
      catalog: docsComputed.catalog,
      parseWarnings: [...packageWarnings, ...linkWarnings],
      documentation: docsComputed.documentation,
    }
  }

  let usageResult: GenerateUsageReportResult | undefined
  if (usageOptions && usageComputed) {
    if (usageReportPath) await writeUsageReport(usageReportPath, usageComputed.result)
    usageResult = { reportPath: usageReportPath, ...usageComputed.result }
  }

  return { manifest: manifestResult, docs: docsResult, usage: usageResult }
}
