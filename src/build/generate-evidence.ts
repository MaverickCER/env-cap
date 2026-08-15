import { readFileSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { buildChangeModel } from "./change-model.js"
import { detectCompatibilityIssues } from "./compatibility.js"
import { buildContractModel } from "./contract-model.js"
import { deepFreeze } from "./deep-freeze.js"
import { buildDependencyModel } from "./dependency-model.js"
import { discoverSchemaFiles } from "./discover.js"
import { EnvProjectGenerationError } from "./errors.js"
import type { EvidenceModel } from "./evidence-model.js"
import { EVIDENCE_MODEL_SCHEMA_VERSION } from "./evidence-model.js"
import { detectExclusiveGroupIssues } from "./exclusive-group.js"
import { buildFindingModel } from "./finding-model.js"
import { computeDocumentation, DEFAULT_EXPIRING_WITHIN_DAYS } from "./generate-documentation.js"
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from "./generate-manifest.js"
import { computeUsage, SCAN_INCLUDE } from "./generate-usage.js"
import { buildLifecycleModel } from "./lifecycle-model.js"
import { linkFiles } from "./link.js"
import type { ImportResolutionContext } from "./resolution/resolve-import.js"
import { computeManifestChanges } from "./manifest-snapshot.js"
import { buildOwnershipModel } from "./ownership-model.js"
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
import { resolveLiveExpirationDates } from "./live-expirations.js"
import type { LiveExpirationDates } from "./live-expirations.js"

// Resolved via import.meta.url (not process.cwd()) so it always reflects the
// installed package's own version, the same intent as src/cli/json.ts's
// TOOL_VERSION -- but computed lazily, and trying two different relative
// depths, for a reason that pattern doesn't have to deal with: tsup bundles
// the ./build entry point into one flat dist/build.js directly under the
// package root (see tsup.config.ts), not into dist/build/index.js the way it
// preserves a subdirectory for ./cli and ./eslint-plugin -- so this file
// sits one directory level deep from the package root when bundled, but two
// levels deep in source (src/build/generate-evidence.ts). A single
// hardcoded relative path can't reach package.json correctly from both.
// Lazy (not module-top-level) so this never runs for a consumer who imports
// some other @maverickcer/env-cap/build export and never calls
// generateEvidenceModel() at all -- the whole ./build entry point is one
// shared bundle, per the comment above.
let toolVersion: string | undefined
function readToolVersion(): string {
  if (toolVersion !== undefined) return toolVersion
  for (const candidate of ["../package.json", "../../package.json"]) {
    try {
      const parsed = JSON.parse(readFileSync(new URL(candidate, import.meta.url), "utf8")) as {
        version: string
      }
      toolVersion = parsed.version
      return toolVersion
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
    }
  }
  throw new Error("generateEvidenceModel(): could not locate env-cap's own package.json.")
}

/** Options for {@link generateEvidenceModel}. */
export interface GenerateEvidenceModelOptions {
  /** Directory glob patterns are resolved against. Defaults to `process.cwd()`. */
  root?: string | undefined
  /** Schema-discovery glob for the contract graph. Defaults to `["**\/env.schema.ts"]`. */
  include?: string[] | undefined
  /** Glob patterns to exclude, shared across every pass. Defaults to node_modules/dist/.git. */
  exclude?: string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`. See ADR 0014. */
  packages?: readonly string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`. See ADR 0023. */
  tsconfig?: string | false | undefined
  /**
   * Where the persisted manifest snapshot lives (the same path a
   * `generateEnvManifest({ location })` call for this project uses), relative
   * to `root` -- Change Model diffs against the sidecar snapshot file
   * `manifestSnapshotPath()` derives from this path. Required: unlike
   * `generateEnvManifest()`'s own `location`, there is no honest default env-cap
   * could guess at, and Evidence Model always assembles all seven models, never
   * a partial subset.
   */
  manifestLocation: string
  /** Feeds Lifecycle Model's `expiring` list. Defaults to 30. */
  expiringWithinDays?: number | undefined
  /**
   * Supplies expiration metadata from a live source as a post-discovery
   * override, applied to Lifecycle Model's (and Finding Model's
   * `expiring-soon` findings') data only -- Contract Model still reflects the
   * schema's own static `expiresAt`. See `live-expirations.ts` and ADR 0012.
   */
  liveExpirationDates?: LiveExpirationDates | undefined
  /**
   * Resolves the commit SHA to stamp onto `EvidenceModel.provenance.commit`.
   * Invoked at most once, after discovery/linking completes. env-cap never
   * shells out to `git` itself -- see ADR 0012's callback precedent. Omitted:
   * `commit` is `undefined`.
   */
  commit?: (() => Promise<string | undefined>) | undefined
}

/**
 * Node-only assembly orchestrator (ADR 0024, ADR 0031): runs schema
 * discovery and linking once, then builds all seven canonical fact models by
 * calling each model's own public builder directly -- this function
 * introduces no derivation logic of its own, only sequencing and the shared
 * discovery/linking every builder needs. The result is `deepFreeze()`-d
 * before being returned.
 *
 * @remarks
 * Deliberately never throws on a data-quality finding (a compatibility
 * issue, an undocumented variable, an abandoned contract, ...) -- every one
 * of those becomes a `Finding` in the returned model's `finding` field
 * instead. This is a real difference from `generateEnvManifest()`/
 * `generateDocumentation()`/`generateUsageReport()`, which each throw by
 * default: those are "should I write this artifact" gates, while Evidence
 * Model assembly is a read-only snapshot whose entire purpose is
 * representing such issues as data for a consumer's own projection to act
 * on (see ADR 0024's mission statement). It still throws
 * `EnvProjectGenerationError` for a genuine configuration error --
 * `manifestLocation` escaping `root`.
 *
 * The dependency-graph scan underlying Dependency Model (via
 * `buildDependencyModel()`) and the one underlying Finding Model's
 * ownership-related findings (via `computeUsage()`) each run their own,
 * independent pass over the repository -- a real, accepted cost of calling
 * each half's already-tested public building block directly rather than
 * hand-deriving a second copy of either's logic here. Both are Node-only,
 * dev/CI-time-only work (never a runtime hot path), so the redundant I/O is
 * an honest tradeoff, not an oversight.
 */
export async function generateEvidenceModel(
  options: GenerateEvidenceModelOptions,
): Promise<EvidenceModel> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? DEFAULT_INCLUDE
  const exclude = options.exclude ?? DEFAULT_EXCLUDE
  const packages = options.packages ?? []
  const expiringWithinDays = options.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS

  const manifestLocationResult = resolveWithinRoot(
    root,
    options.manifestLocation,
    "manifestLocation",
    "generateEvidenceModel",
  )
  if (!manifestLocationResult.ok)
    throw new EnvProjectGenerationError([manifestLocationResult.issue])
  const manifestOutputPath = manifestLocationResult.resolved

  // Shared across schema linking, the dependency-graph scan, and the docs/
  // usage computations below, so a file matched by more than one pass is
  // only ever read from disk once -- mirrors computeArtifacts()'s own cache.
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
  const activeContracts = linkResult.contracts.filter((c) => c.active)

  // Lifecycle Model (and Finding Model's expiring-soon findings) reflect the
  // freshest live-resolved expiry data, mirroring the docs pass -- Contract
  // Model below still reflects the schema's own static `expiresAt`.
  const lifecycleContracts = options.liveExpirationDates
    ? await resolveLiveExpirationDates(linkResult.contracts, options.liveExpirationDates)
    : linkResult.contracts

  const contract = buildContractModel(linkResult.contracts, root)
  const ownership = buildOwnershipModel(linkResult.contracts, root)
  const lifecycle = buildLifecycleModel(lifecycleContracts, expiringWithinDays, generatedAt, root)

  const scanFiles = await discoverSchemaFiles({ root, include: SCAN_INCLUDE, exclude })
  const dependency = await buildDependencyModel(
    linkResult.contracts,
    scanFiles,
    readFileCached,
    context,
    root,
  )

  const manifestChanges = await computeManifestChanges(root, manifestOutputPath, activeContracts)
  const change = buildChangeModel(manifestChanges.report, linkResult.contracts, root)

  const documentationComputed = computeDocumentation(
    root,
    { ...linkResult, contracts: lifecycleContracts },
    "warn",
    expiringWithinDays,
    generatedAt,
  )
  const usageComputed = await computeUsage(
    root,
    linkResult.contracts,
    scanFiles,
    readFileCached,
    "warn",
    context,
    [...packageWarnings, ...tsconfigWarnings, ...linkResult.warnings],
  )

  const finding = buildFindingModel({
    compatibilityIssues: detectCompatibilityIssues(activeContracts),
    exclusiveGroupIssues: detectExclusiveGroupIssues(activeContracts),
    documentation: documentationComputed.documentation,
    abandonedContracts: usageComputed.result.abandonedContracts,
    unresolvedConsumers: usageComputed.result.unresolvedConsumers,
    unconsumedOwnedVariables: usageComputed.result.unconsumedOwnedVariables,
    indeterminateOwnership: usageComputed.result.indeterminate,
  })

  const commit = options.commit ? await options.commit() : undefined

  return deepFreeze({
    schemaVersion: EVIDENCE_MODEL_SCHEMA_VERSION,
    provenance: { generatedAt: generatedAt.toISOString(), toolVersion: readToolVersion(), commit },
    contract,
    dependency,
    ownership,
    lifecycle,
    finding,
    change,
  })
}
