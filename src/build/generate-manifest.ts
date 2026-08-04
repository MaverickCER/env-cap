import fs from "node:fs/promises"
import path from "node:path"
import { detectCompatibilityIssues } from "./compatibility.js"
import type { CompatibilityIssue } from "./compatibility.js"
import { discoverSchemaFiles } from "./discover.js"
import { EnvManifestGenerationError } from "./errors.js"
import { detectExclusiveGroupIssues } from "./exclusive-group.js"
import {
  linkFiles,
  summarizeContract,
  type DiscoveredContract,
  type DiscoveredContractSummary,
  type LinkResult,
} from "./link.js"
import {
  computeManifestChanges,
  manifestSnapshotPath,
  writeManifestSnapshot,
  type ManifestChangeReport,
} from "./manifest-snapshot.js"
import { renderManifest } from "./manifest.js"
import type { ParseWarning } from "./parse.js"
import type { ImportResolutionContext } from "./resolve-import.js"
import {
  mergeLocalAndPackageFiles,
  resolveAllowlistedPackages,
  type PackageSchemaResolutionResult,
} from "./resolve-package-schema.js"
import { resolveWithinRoot } from "./resolve-within-root.js"

/** Options for {@link generateEnvManifest}. */
export interface GenerateEnvManifestOptions {
  /** Directory glob patterns are resolved against. Defaults to `process.cwd()`. */
  root?: string | undefined
  /** Output path for the generated manifest, relative to `root` (e.g. "src/generated/env.manifest.ts"). */
  location: string
  /** Glob patterns for schema files. Defaults to `["**\/env.schema.ts"]`. */
  include?: string[] | undefined
  /** Glob patterns to exclude. Defaults to node_modules/dist/.git. */
  exclude?: string[] | undefined
  /**
   * **Experimental** (see VERSIONING.md) -- explicit allowlist of installed
   * package names whose declared `"envCap": { "schema": "<path>" }` entry
   * point should also be discovered, so a contract that ships as its own
   * separately-published package (no monorepo required) can be included in
   * the manifest. Opt-in only: a package is never considered unless its
   * exact name appears here. See ADR 0014.
   */
  packages?: readonly string[] | undefined
  /**
   * "warn" (default): only provable incompatibilities (conflicting explicit processor
   * return type annotations) block generation; everything else is reported as a warning.
   * "throw": warnings are escalated to hard errors too, for stricter CI gates.
   */
  onIncompatibility?: "warn" | "throw" | undefined
}

/** The result of a completed {@link generateEnvManifest} run. */
export interface GenerateEnvManifestResult {
  /** Absolute path the manifest file was written to. */
  readonly outputPath: string
  /** Root-relative summary of every discovered contract, active or not. */
  readonly contracts: readonly DiscoveredContractSummary[]
  /** Non-blocking compatibility/exclusive-group issues (severity `"warning"`). */
  readonly warnings: readonly CompatibilityIssue[]
  /** Parse-time warnings collected across every analyzed file (including allow-listed package resolution). */
  readonly parseWarnings: readonly ParseWarning[]
  /** `documentEnv()` metadata added, removed, or changed since the last time this manifest was generated -- see ADR 0021. */
  readonly changes: ManifestChangeReport
}

/** Default value for {@link GenerateEnvManifestOptions.include}. */
export const DEFAULT_INCLUDE = ["**/env.schema.ts"]
/** Default value for {@link GenerateEnvManifestOptions.exclude}. */
export const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/.git/**"]

export interface ManifestComputation {
  readonly activeContracts: readonly DiscoveredContract[]
  readonly contractSummaries: readonly DiscoveredContractSummary[]
  readonly warnings: readonly CompatibilityIssue[]
  readonly blocking: readonly CompatibilityIssue[]
}

/**
 * Pure -- no I/O. Runs compatibility (0005) and exclusive-group (0009,
 * always-error, never gated by `onIncompatibility`) checks against an
 * already-discovered contract graph and applies the `onIncompatibility` gate.
 * Shared by the standalone `generateEnvManifest()` (which discovers its own
 * graph) and `generate-env-artifacts.ts` (which discovers once and reuses it across
 * manifest/docs/usage) -- see ADR 0011.
 */
export function computeManifest(
  root: string,
  linkResult: LinkResult,
  onIncompatibility: "warn" | "throw",
): ManifestComputation {
  const { contracts } = linkResult
  const activeContracts = contracts.filter((contract) => contract.active)

  const compatibilityIssues = [
    ...detectCompatibilityIssues(activeContracts),
    ...detectExclusiveGroupIssues(activeContracts),
  ]
  const compatibilityErrors = compatibilityIssues.filter((issue) => issue.severity === "error")
  const blocking = onIncompatibility === "throw" ? compatibilityIssues : compatibilityErrors

  return {
    activeContracts,
    contractSummaries: contracts.map((contract) => summarizeContract(contract, root)),
    warnings: compatibilityIssues.filter((issue) => issue.severity === "warning"),
    blocking,
  }
}

/** Writes the manifest file. Callers must have already confirmed `outputPath` is safe and nothing is blocking. */
export async function writeManifest(
  outputPath: string,
  activeContracts: readonly DiscoveredContract[],
): Promise<void> {
  const manifestSource = renderManifest(activeContracts, outputPath)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, manifestSource, "utf8")
}

/**
 * Build-time only. Discovers `env.schema.ts` files, statically analyzes them
 * (never executes them) to link `createEnv()`/`documentEnv()` calls, checks
 * for provable incompatibilities between duplicate variable declarations,
 * and writes a deterministic manifest file that re-exports every discovered
 * active contract.
 *
 * @remarks
 * Never call this at application startup or import it from
 * runtime code -- wire it into an npm script, a bundler plugin, or a CI
 * step instead.
 *
 * @throws {EnvManifestGenerationError} If `location` escapes `root`, or if a blocking compatibility/exclusive-group issue is found.
 */
export async function generateEnvManifest(
  options: GenerateEnvManifestOptions,
): Promise<GenerateEnvManifestResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? DEFAULT_INCLUDE
  const exclude = options.exclude ?? DEFAULT_EXCLUDE
  const packages = options.packages ?? []
  const onIncompatibility = options.onIncompatibility ?? "warn"

  // Fail fast, before any discovery/parsing work and before any file is
  // written -- generation is atomic, same as a compatibility-issue failure.
  const locationResult = resolveWithinRoot(
    root,
    options.location,
    "location",
    "generateEnvManifest",
  )
  if (!locationResult.ok) throw new EnvManifestGenerationError([locationResult.issue])
  const outputPath = locationResult.resolved

  const localFiles = await discoverSchemaFiles({ root, include, exclude })
  const packageCache = new Map<string, Promise<PackageSchemaResolutionResult>>()
  const {
    files: packageFiles,
    origins,
    warnings: packageWarnings,
  } = await resolveAllowlistedPackages(packages, root, packageCache)
  const files = await mergeLocalAndPackageFiles(
    localFiles,
    packageFiles.map((f) => f.file),
  )

  const context: ImportResolutionContext = { root, packages, cache: packageCache }
  const linkResult = await linkFiles(
    files,
    (filePath) => fs.readFile(filePath, "utf8"),
    context,
    origins,
  )

  const computed = computeManifest(root, linkResult, onIncompatibility)
  if (computed.blocking.length > 0) throw new EnvManifestGenerationError(computed.blocking)

  const {
    report: changes,
    snapshot,
    readWarning,
  } = await computeManifestChanges(root, outputPath, computed.activeContracts)

  await writeManifest(outputPath, computed.activeContracts)
  await writeManifestSnapshot(manifestSnapshotPath(outputPath), snapshot)

  return {
    outputPath,
    contracts: computed.contractSummaries,
    warnings: computed.warnings,
    parseWarnings: readWarning
      ? [...packageWarnings, ...linkResult.warnings, readWarning]
      : [...packageWarnings, ...linkResult.warnings],
    changes,
  }
}
