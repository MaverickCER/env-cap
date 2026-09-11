import path from "node:path"
import { assembleProject } from "./assemble-project.js"
import { buildChangeModel } from "./change-model.js"
import { detectCompatibilityIssues } from "./compatibility.js"
import { buildContractModel } from "./contract-model.js"
import { deepFreeze } from "./deep-freeze.js"
import { buildDependencyModel } from "./dependency-model.js"
import { EnvProjectGenerationError } from "./errors.js"
import type { EvidenceModel } from "./evidence-model.js"
import { EVIDENCE_MODEL_SCHEMA_VERSION } from "./evidence-model.js"
import { computeEvidenceChanges } from "./evidence-snapshot.js"
import { detectExclusiveGroupIssues } from "./exclusive-group.js"
import { buildFindingModel } from "./finding-model.js"
import { computeDocumentation, DEFAULT_EXPIRING_WITHIN_DAYS } from "./generate-documentation.js"
import { defaultExclude, defaultInclude } from "./generate-manifest.js"
import { computeScanSurface, computeUsage } from "./generate-usage.js"
import { buildLifecycleModel } from "./lifecycle-model.js"
import { buildOwnershipModel } from "./ownership-model.js"
import { resolveWithinRoot } from "./resolution/resolve-within-root.js"
import { resolveLiveExpirationDates } from "./live-expirations.js"
import type { LiveExpirationDates } from "./live-expirations.js"
import { readToolVersion } from "./tool-version.js"
import type { BuildFileSystem } from "./types.js"

/** Options for {@link generateEvidenceModel}. */
export interface GenerateEvidenceModelOptions {
  /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
  fs: BuildFileSystem
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
   * Where a previously-persisted evidence artifact lives, relative to
   * `root` -- read (never written) as the baseline Change Model diffs
   * against and dynamic-access citation freshness (ADR 0037) compares
   * content hashes to. Independent of any `.ts` manifest a project may or
   * may not also generate -- there is no derivation from a manifest's own
   * location. Omitted: treated as the normal first-run state (everything
   * reads as added, no citation-freshness baseline to compare against),
   * never an error.
   */
  previousSnapshotLocation?: string | undefined
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
 * discovery and linking once (via `assembleProject()`, shared with
 * `computeArtifacts()`), then builds all seven canonical fact models by
 * calling each model's own public builder directly -- this function
 * introduces no derivation logic of its own, only sequencing and the shared
 * discovery/linking every builder needs. The result is `deepFreeze()`-d
 * before being returned.
 *
 * @remarks
 * Deliberately never throws on a data-quality finding (a compatibility
 * issue, an undocumented variable, an abandoned contract, ...) -- every one
 * of those becomes a `Finding` in the returned model's `finding` field
 * instead. This is a real difference from `generateEnvManifest()`, which
 * throws by default: that's a "should I write this artifact" gate, while
 * Evidence Model assembly is a read-only snapshot whose entire purpose is
 * representing such issues as data for a consumer's own projection to act
 * on (see ADR 0024's mission statement). It still throws
 * `EnvProjectGenerationError` for a genuine configuration error --
 * `previousSnapshotLocation` escaping `root`.
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
  const include = options.include ?? defaultInclude()
  const exclude = options.exclude ?? defaultExclude()
  // `??`-vs-`||` is unobservable here: `packages?: readonly string[]` is
  // either `undefined` or a real array, never another falsy value (`0`,
  // `""`, `false`) the two operators would treat differently -- and even an
  // `undefined` that slipped through both defaults, `new Set(undefined)`
  // downstream in `resolveAllowlistedPackages`, is spec-defined to produce
  // an empty Set, identical to `new Set([])`. A garbage non-empty fallback
  // (`["Stryker was here"]`) is equally unobservable -- empirically
  // confirmed (see `evidence-cache.ts`'s identical fallback) that an
  // unresolvable package name contributes zero files to anything
  // downstream, since `resolveAllowlistedPackages` never throws for one.
  // Stryker disable next-line LogicalOperator,ArrayDeclaration
  const packages = options.packages ?? []
  const expiringWithinDays = options.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS

  let snapshotPath: string | undefined
  if (options.previousSnapshotLocation !== undefined) {
    const result = resolveWithinRoot(
      root,
      options.previousSnapshotLocation,
      "previousSnapshotLocation",
      "generateEvidenceModel",
    )
    if (!result.ok) throw new EnvProjectGenerationError([result.issue])
    snapshotPath = result.resolved
  }

  const assembled = await assembleProject({
    fs: options.fs,
    root,
    include,
    exclude,
    packages,
    tsconfig: options.tsconfig,
  })
  const { readFileCached, linkResult, context, origins, packageWarnings, tsconfigWarnings } =
    assembled

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

  const evidenceChanges = snapshotPath
    ? await computeEvidenceChanges(
        root,
        snapshotPath,
        activeContracts,
        contract.contracts,
        readFileCached,
        options.fs,
      )
    : undefined
  const change = buildChangeModel(
    evidenceChanges?.report ?? {
      addedContracts: [],
      removedContracts: [],
      addedVariables: [],
      removedVariables: [],
      updatedContracts: [],
      updatedVariables: [],
    },
    linkResult.contracts,
    root,
  )

  const { scanFiles, scannedSurfaces } = await computeScanSurface(
    root,
    exclude,
    origins,
    options.fs,
  )
  const dependency = await buildDependencyModel(
    linkResult.contracts,
    scanFiles,
    readFileCached,
    context,
    root,
    scannedSurfaces,
    evidenceChanges?.dynamicAccessAcknowledgments,
  )

  const documentationComputed = computeDocumentation(
    root,
    { ...linkResult, contracts: lifecycleContracts },
    expiringWithinDays,
    generatedAt,
  )
  // This array feeds `computeUsage()`'s `parseWarnings` parameter, which
  // (checked: it's used nowhere else in `computeUsage`'s own body besides
  // this) is pure pass-through data, echoed straight into `usageComputed
  // .result.parseWarnings` -- a field this function never reads (only
  // `.abandonedContracts`/`.unresolvedConsumers`/`.unconsumedOwnedVariables`
  // /`.indeterminate` feed the returned EvidenceModel's `finding`, below).
  // Mutating this array to `[]` changes nothing `generateEvidenceModel`
  // itself ever returns.
  const usageComputed = await computeUsage(
    root,
    linkResult.contracts,
    scanFiles,
    readFileCached,
    context,
    // Stryker disable next-line ArrayDeclaration
    [...packageWarnings, ...tsconfigWarnings, ...linkResult.warnings],
    scannedSurfaces,
    evidenceChanges?.dynamicAccessAcknowledgments,
  )

  const finding = buildFindingModel({
    compatibilityIssues: detectCompatibilityIssues(activeContracts),
    exclusiveGroupIssues: detectExclusiveGroupIssues(activeContracts),
    documentation: documentationComputed.documentation,
    abandonedContracts: usageComputed.result.abandonedContracts,
    unresolvedConsumers: usageComputed.result.unresolvedConsumers,
    unconsumedOwnedVariables: usageComputed.result.unconsumedOwnedVariables,
    indeterminateOwnership: usageComputed.result.indeterminate,
    // `buildFindingModel` (finding-model.ts) has its own `?? []` fallback
    // on this exact same field, so even an `undefined` that slipped past
    // this one (e.g. `??`-vs-`&&` on `evidenceChanges?.…`) is caught there
    // identically -- belt-and-suspenders, not independently observable.
    // Stryker disable next-line LogicalOperator
    dynamicAccessCitationProblems: evidenceChanges?.dynamicAccessCitationProblems ?? [],
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
