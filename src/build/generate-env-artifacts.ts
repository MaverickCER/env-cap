import path from "node:path"
import { assembleProject } from "./assemble-project.js"
import { buildChangeModel } from "./change-model.js"
import type { CompatibilityIssue } from "./compatibility.js"
import { detectCompatibilityIssues, detectDuplicateVariableShapes } from "./compatibility.js"
import { buildContractModel } from "./contract-model.js"
import { deepFreeze } from "./deep-freeze.js"
import { buildDependencyModel } from "./dependency-model.js"
import { EnvProjectGenerationError } from "./errors.js"
import type { EvidenceModel } from "./evidence-model.js"
import { EVIDENCE_MODEL_SCHEMA_VERSION } from "./evidence-model.js"
import { computeSourceFingerprint, writeEvidenceFingerprint } from "./evidence-cache.js"
import { computeEvidenceChanges, writeEvidenceSnapshot } from "./evidence-snapshot.js"
import type { EvidenceChangesComputation } from "./evidence-snapshot.js"
import { detectExclusiveGroupIssues } from "./exclusive-group.js"
import { buildFindingModel } from "./finding-model.js"
import type { Finding, FindingFamily } from "./finding-model.js"
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
  defaultExclude,
  defaultInclude,
  writeManifest,
} from "./generate-manifest.js"
import type {
  GenerateEnvManifestOptions,
  GenerateEnvManifestResult,
  ManifestComputation,
} from "./generate-manifest.js"
import { computeScanSurface, computeUsage, writeUsageReport } from "./generate-usage.js"
import type {
  GenerateUsageReportOptions,
  GenerateUsageReportResult,
  UsageComputation,
} from "./generate-usage.js"
import type { DiscoveredContract } from "./link.js"
import { buildLifecycleModel } from "./lifecycle-model.js"
import { buildOwnershipModel } from "./ownership-model.js"
import { resolveLiveExpirationDates } from "./live-expirations.js"
import type { LiveExpirationDates } from "./live-expirations.js"
import type { ParseWarning } from "./parse.js"
import { resolveWithinRoot } from "./resolution/resolve-within-root.js"
import { readToolVersion } from "./tool-version.js"
import type { BuildFileSystem } from "./types.js"

/** Options for {@link generateEnvArtifacts}. */
export interface GenerateEnvArtifactsOptions {
  /** The filesystem capability, shared across every requested pass -- `./build` never imports `node:fs` (ADR 0040). */
  fs: BuildFileSystem
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
    | Omit<
        GenerateEnvManifestOptions,
        "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig"
      >
    | false
    | undefined
  /** Docs pass options, or `false` to skip it entirely. */
  docs?:
    | Omit<
        GenerateDocumentationOptions,
        "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig" | "liveExpirationDates"
      >
    | false
    | undefined
  /** Usage-report pass options, or `false` to skip it entirely. */
  usage?:
    | Omit<
        GenerateUsageReportOptions,
        "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig"
      >
    | false
    | undefined
  /**
   * Where to write the persisted evidence artifact (the full, literal
   * `EvidenceModel`, plus a paired `.fingerprint` sidecar -- see
   * `evidence-cache.ts`), e.g. `docs/env.evidence.json`, relative to `root`.
   * Independent of `manifest.location` -- requesting this needs no other
   * pass, and generating a manifest never requires it. `EvidenceModel`
   * itself is always computed regardless of this option (ADR 0038, "free to
   * compute, always real") and always returned as `result.evidence`; this
   * option controls only whether it's also written to disk. Omitted:
   * nothing is written, `result.evidence` is still populated.
   */
  evidence?: { location: string } | false | undefined
  /**
   * Escalates every warning-severity `"documentation"`-family finding
   * (undocumented contracts/variables, stale doc entries, expiring/expired
   * entries, unresolvable `documentEnv()` links) into a blocking error, so a
   * run with any of them writes nothing and throws. Defaults to `"warn"` --
   * ADR 0038's stance, unchanged: documentation gaps never block by default.
   *
   * @remarks
   * Scoped deliberately narrowly, unlike `manifest.onIncompatibility`, which
   * gates only the compatibility family. `"info"`-severity findings are never
   * escalated by either -- see `Finding.severity`.
   */
  onUndocumented?: "warn" | "throw" | undefined
  /**
   * Escalates every warning-severity `"ownership"`-family finding (abandoned
   * contracts, unresolved consumers, unconsumed owned variables,
   * indeterminate ownership, stale/missing `dynamicAccess` citations) into a
   * blocking error. Defaults to `"warn"` -- see {@link onUndocumented}.
   */
  onOwnershipIssue?: "warn" | "throw" | undefined
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
  /** Always populated, regardless of `options.evidence` -- see that option's own doc comment. */
  readonly evidence: EvidenceModel
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
    | Omit<
        GenerateEnvManifestOptions,
        "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig"
      >
    | undefined
  readonly manifestOutputPath: string | undefined
  readonly manifestComputed: ManifestComputation | undefined
  readonly docsOptions:
    | Omit<
        GenerateDocumentationOptions,
        "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig" | "liveExpirationDates"
      >
    | undefined
  readonly docsPath: string | undefined
  readonly envExamplePath: string | undefined
  /** Always computed -- Finding Model needs it regardless of whether a `docs` pass was itself requested. See ADR 0038. */
  readonly docsComputed: DocumentationComputation
  readonly docsContracts: readonly DiscoveredContract[]
  readonly usageOptions:
    | Omit<
        GenerateUsageReportOptions,
        "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig"
      >
    | undefined
  readonly usageReportPath: string | undefined
  /** Always computed -- Finding Model needs it regardless of whether a `usage` pass was itself requested. See ADR 0038. */
  readonly usageComputed: UsageComputation
  readonly evidencePath: string | undefined
  readonly evidence: EvidenceModel
  readonly blocking: readonly CompatibilityIssue[]
  readonly packageWarnings: readonly ParseWarning[]
  readonly linkWarnings: readonly ParseWarning[]
  /** Single timestamp shared by every pass' own time-sensitive computation (`expiringSoon`, `EvidenceModel.provenance.generatedAt`), so all of them agree on exactly the same instant. */
  readonly generatedAt: Date
}

/**
 * Adapts every warning-severity finding of one family into the
 * `CompatibilityIssue` shape `blocking`/`EnvProjectGenerationError` speak, so
 * `--strict-docs`/`--strict-ownership` fail through exactly the same path
 * `--strict` already does rather than inventing a second failure mode.
 *
 * @remarks
 * `"info"` findings are filtered out unconditionally and can never be
 * escalated by any flag -- they're observations, not gaps (see
 * `Finding.severity`). `"error"` findings are excluded too: those already
 * block on their own, via the manifest pass, and re-adding them here would
 * report the same violation twice in one error message. `code` is left unset
 * -- `CompatibilityIssueCode` is that check family's own closed vocabulary,
 * and a `FindingCode` from another family is not a member of it.
 */
/** @internal Exported for direct unit coverage -- reached through `generateEnvArtifacts()`'s `--strict-docs`/`--strict-ownership` flags in production, but its filter/mapping logic isn't independently observable through that path alone (every mutant on it still needs a real `computeArtifacts()` call, discovery included, to reach it). */
export function escalatedFindings(
  findings: readonly Finding[],
  family: FindingFamily,
): CompatibilityIssue[] {
  return findings
    .filter((f) => f.family === family && f.severity === "warning")
    .map((f) => ({
      severity: "error" as const,
      variable: findingSubject(f),
      files: findingFiles(f),
      reason: `[${f.code}] ${f.message}`,
    }))
}

/** The variable a finding is about, or a `"(contract) <name>"` label when it's contract-level -- matching `CompatibilityIssue.variable`'s own documented convention.
 * @internal Exported for direct unit coverage -- see {@link escalatedFindings}'s own doc comment for why. */
export function findingSubject(finding: Finding): string {
  const location = finding.location
  if (location.model === "change") return `(artifact) ${location.path}`
  if (location.variable !== undefined) return location.variable
  const name = location.model === "ownership" ? location.contractName : location.exportName
  return `(contract) ${name ?? "unknown"}`
}

/** Every file a finding names, as `CompatibilityIssue.files` -- empty when its location carries none (an ownership finding about a variable, which names no single file).
 * @internal Exported for direct unit coverage -- see {@link escalatedFindings}'s own doc comment for why. */
export function findingFiles(finding: Finding): string[] {
  const location = finding.location
  if (location.model === "change") return [location.path]
  return location.file === undefined ? [] : [location.file]
}

/**
 * Runs schema discovery, linking, and every requested pass's pure `compute*()`
 * step -- but never writes anything to disk. Throws `EnvProjectGenerationError`
 * immediately if any requested output location escapes `root` (same
 * fail-fast-before-any-work guarantee `generateEnvArtifacts()` has always
 * given); otherwise returns every intermediate value without itself checking
 * `blocking` findings, so callers (the write path below, and `--check`'s
 * `checkEnvArtifacts()`) each decide when to throw on those.
 *
 * @remarks
 * The six canonical fact models (Contract/Dependency/Ownership/Lifecycle/
 * Finding/Change -> `EvidenceModel`) are composed on every call,
 * unconditionally, reusing the exact same builders `generateEvidenceModel()`
 * calls -- not a second implementation of the same assembly. See ADR 0038.
 */
export async function computeArtifacts(
  options: GenerateEnvArtifactsOptions,
): Promise<ComputeArtifactsResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? defaultInclude()
  const exclude = options.exclude ?? defaultExclude()
  const packages = options.packages ?? []

  // Every mutant on these four lines (bypassing the `=== false` check
  // entirely, or comparing against `true` instead of `false`) is
  // behaviorally equivalent, not a real gap: every downstream consumer of
  // `manifestOptions`/`docsOptions`/`usageOptions`/`evidenceOptions` only
  // ever truthy-checks it (`if (manifestOptions) {...}`, `manifestOptions ?
  // ... : undefined`) -- it never distinguishes the literal `false` a
  // bypassed/differently-compared ternary could produce from a genuine
  // `undefined`, since both are equally falsy. Hand-verified: mutating all
  // four lines (both variants) and running the real suite passes unchanged.
  // Stryker disable next-line ConditionalExpression,BooleanLiteral
  const manifestOptions = options.manifest === false ? undefined : options.manifest
  // Stryker disable next-line ConditionalExpression,BooleanLiteral
  const docsOptions = options.docs === false ? undefined : options.docs
  // Stryker disable next-line ConditionalExpression,BooleanLiteral
  const usageOptions = options.usage === false ? undefined : options.usage
  // Stryker disable next-line ConditionalExpression,BooleanLiteral
  const evidenceOptions = options.evidence === false ? undefined : options.evidence

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

  let evidencePath: string | undefined
  if (evidenceOptions) {
    const result = resolveWithinRoot(
      root,
      evidenceOptions.location,
      "evidence.location",
      "generateEnvArtifacts",
    )
    if (result.ok) evidencePath = result.resolved
    else pathIssues.push(result.issue)
  }

  // Fail fast, before any discovery/parsing work and before any file is
  // written -- same atomicity guarantee `generateEnvManifest()` etc. give
  // standalone, now widened across every requested pass at once.
  if (pathIssues.length > 0) throw new EnvProjectGenerationError(pathIssues)

  const { readFileCached, linkResult, context, origins, packageWarnings, tsconfigWarnings } =
    await assembleProject({
      fs: options.fs,
      root,
      include,
      exclude,
      packages,
      tsconfig: options.tsconfig,
    })
  const generatedAt = new Date()
  const activeContracts = linkResult.contracts.filter((c) => c.active)

  // Invoked at most once regardless of how many passes below end up wanting
  // live-resolved expiry data -- Lifecycle Model (always built, ADR 0038)
  // and the docs pass (when requested) both read from this same result
  // rather than each triggering their own call.
  const liveExpirationContracts = options.liveExpirationDates
    ? await resolveLiveExpirationDates(linkResult.contracts, options.liveExpirationDates)
    : linkResult.contracts
  const docsContracts = docsOptions ? liveExpirationContracts : linkResult.contracts

  // Manifest is the one pass that still blocks (ADR 0009's provable
  // exclusive-group/compatibility errors) -- docs/ownership never do (ADR
  // 0038: a team that wants to gate CI on either reads `Finding[]` from the
  // evidence artifact and decides for itself).
  const blocking: CompatibilityIssue[] = []
  // `computeManifest()` only ever compares this value `=== "throw"` (see its
  // own body) -- "warn" and any other non-"throw" string (including `""`)
  // take the identical non-throw branch, so the literal fallback text itself
  // is unobservable; only whether the CALLER explicitly passed "throw" (the
  // `??` vs `&&` distinction, tested separately) matters. Hand-verified:
  // mutating "warn" -> "" and running the real suite (`vitest run`, whole
  // package) passes unchanged.
  // Stryker disable StringLiteral
  const manifestComputed = manifestOptions
    ? computeManifest(root, linkResult, manifestOptions.onIncompatibility ?? "warn")
    : undefined
  // Stryker restore StringLiteral
  if (manifestComputed) blocking.push(...manifestComputed.blocking)

  // Computed unconditionally, once each -- Finding Model (part of the
  // always-built EvidenceModel) needs both regardless of whether a `docs`/
  // `usage` pass was itself requested, so this is never a second,
  // differently-parameterized call the way it used to be when
  // `onUndocumented`/`onOwnershipIssue` still existed (both computations are
  // now free of any throw-severity parameter, so there's exactly one shape
  // of result to compute, shared by both the artifact and Finding Model).
  const docsComputed = computeDocumentation(
    root,
    { ...linkResult, contracts: liveExpirationContracts },
    docsOptions?.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS,
    generatedAt,
  )

  const { scanFiles, scannedSurfaces } = await computeScanSurface(
    root,
    exclude,
    origins,
    options.fs,
  )

  const contract = buildContractModel(linkResult.contracts, root)
  const evidenceChanges: EvidenceChangesComputation | undefined = evidencePath
    ? await computeEvidenceChanges(
        root,
        evidencePath,
        activeContracts,
        contract.contracts,
        readFileCached,
        options.fs,
      )
    : undefined

  const usageComputed = await computeUsage(
    root,
    linkResult.contracts,
    scanFiles,
    readFileCached,
    context,
    [...packageWarnings, ...tsconfigWarnings, ...linkResult.warnings],
    scannedSurfaces,
    evidenceChanges?.dynamicAccessAcknowledgments,
  )

  const ownership = buildOwnershipModel(linkResult.contracts, root)
  const lifecycle = buildLifecycleModel(
    liveExpirationContracts,
    docsOptions?.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS,
    generatedAt,
    root,
  )
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
  const dependency = await buildDependencyModel(
    linkResult.contracts,
    scanFiles,
    readFileCached,
    context,
    root,
    scannedSurfaces,
    evidenceChanges?.dynamicAccessAcknowledgments,
  )
  const finding = buildFindingModel({
    root,
    compatibilityIssues: [
      ...detectCompatibilityIssues(activeContracts),
      ...detectDuplicateVariableShapes(activeContracts),
    ],
    exclusiveGroupIssues: detectExclusiveGroupIssues(activeContracts),
    documentation: docsComputed.documentation,
    abandonedContracts: usageComputed.result.abandonedContracts,
    unresolvedConsumers: usageComputed.result.unresolvedConsumers,
    unconsumedOwnedVariables: usageComputed.result.unconsumedOwnedVariables,
    indeterminateOwnership: usageComputed.result.indeterminate,
    dynamicAccessCitationProblems: evidenceChanges?.dynamicAccessCitationProblems ?? [],
  })

  // Docs/ownership findings never block by default (ADR 0038). `--strict-docs`
  // / `--strict-ownership` opt one family in at a time, reusing Finding Model
  // as the single source of what each family contains rather than
  // re-enumerating the finding types here -- a family that later gains a code
  // is covered automatically.
  if (options.onUndocumented === "throw")
    blocking.push(...escalatedFindings(finding.findings, "documentation"))
  if (options.onOwnershipIssue === "throw")
    blocking.push(...escalatedFindings(finding.findings, "ownership"))

  const evidence: EvidenceModel = deepFreeze({
    schemaVersion: EVIDENCE_MODEL_SCHEMA_VERSION,
    provenance: {
      generatedAt: generatedAt.toISOString(),
      toolVersion: readToolVersion(),
      commit: undefined,
    },
    contract,
    dependency,
    ownership,
    lifecycle,
    finding,
    change,
  })

  return {
    root,
    manifestOptions,
    manifestOutputPath,
    manifestComputed,
    docsOptions,
    docsPath,
    envExamplePath,
    docsComputed,
    docsContracts,
    usageOptions,
    usageReportPath,
    usageComputed,
    evidencePath,
    evidence,
    blocking,
    packageWarnings: [...packageWarnings, ...tsconfigWarnings],
    linkWarnings: linkResult.warnings,
    generatedAt,
  }
}

/**
 * Orchestrates {@link generateEnvManifest}/{@link generateDocumentation}/
 * {@link generateUsageReport}, plus the persisted evidence artifact, by
 * composing their shared private compute/write pipeline directly, running
 * schema discovery+linking exactly once regardless of how many outputs are
 * requested -- an orchestrator, not a new analysis engine (see ADR 0011).
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
    docsOptions,
    docsPath,
    envExamplePath,
    docsComputed,
    docsContracts,
    usageOptions,
    usageReportPath,
    usageComputed,
    evidencePath,
    evidence,
    blocking,
    packageWarnings,
    linkWarnings,
    root,
    generatedAt,
  } = computed

  if (blocking.length > 0) throw new EnvProjectGenerationError(blocking)

  let manifestResult: GenerateEnvManifestResult | undefined
  // All three of these are structurally correlated, not independently
  // reachable in every combination: `manifestComputed` is only ever set
  // (line 353) inside `manifestOptions ? computeManifest(...) : undefined`,
  // and `manifestOutputPath` is only ever set (line 277) inside `if
  // (manifestOptions) {...}`, after a `resolveWithinRoot()` call whose
  // failure pushes to `pathIssues` -- which, if non-empty, makes
  // `computeArtifacts()` throw before this function ever runs (line 332). So
  // by the time this line executes, `manifestOutputPath` truthy already
  // implies both `manifestOptions` and `manifestComputed` are truthy too, and
  // vice versa -- every mutant on this compound guard (either `&&`/`||` swap,
  // or collapsing a clause to `true`) is behaviorally equivalent. Hand
  // hand-verified: mutating this line (both the LogicalOperator and
  // ConditionalExpression variants Stryker reports) and running the real
  // suite (`vitest run`, whole package) passes unchanged -- but note the
  // three-way `&&` is still load-bearing for TypeScript's own control-flow
  // narrowing inside this block (`manifestComputed.activeContracts` etc.
  // below need all three narrowed to defined), so this must stay a disable,
  // never a restructure to `||`/a subset of the checks.
  // Stryker disable next-line LogicalOperator,ConditionalExpression
  if (manifestOptions && manifestComputed && manifestOutputPath) {
    await writeManifest(manifestOutputPath, manifestComputed.activeContracts, options.fs)
    manifestResult = {
      outputPath: manifestOutputPath,
      contracts: manifestComputed.contractSummaries,
      warnings: manifestComputed.warnings,
      parseWarnings: [...packageWarnings, ...linkWarnings],
    }
  }

  let docsResult: GenerateDocumentationResult | undefined
  // Same structural correlation as the manifest guard above: `docsPath` is
  // only ever set (line 290) inside `if (docsOptions) {...}`, past a
  // `resolveWithinRoot()` call whose own failure would have already thrown
  // via `pathIssues` before this function runs -- so `docsPath` truthy here
  // already implies `docsOptions` truthy, and vice versa. Hand-verified:
  // mutating `&&` to `||` and running the real suite (`vitest run`, whole
  // package) passes unchanged -- kept as `&&`, not restructured, since
  // TypeScript's narrowing of `docsOptions.expiringWithinDays` etc. below
  // still needs both operands checked.
  // Stryker disable next-line LogicalOperator
  if (docsOptions && docsPath) {
    const { envExample } = await writeDocumentation(
      docsPath,
      envExamplePath,
      root,
      docsContracts,
      docsComputed.contractModelContracts,
      docsComputed.documentation,
      docsOptions.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS,
      generatedAt,
      options.fs,
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
  if (usageOptions) {
    if (usageReportPath) await writeUsageReport(usageReportPath, usageComputed.result, options.fs)
    usageResult = { reportPath: usageReportPath, ...usageComputed.result }
  }

  if (evidencePath) {
    await writeEvidenceSnapshot(evidencePath, evidence, options.fs)
    const fingerprint = await computeSourceFingerprint({
      fs: options.fs,
      root,
      include: options.include ?? defaultInclude(),
      exclude: options.exclude ?? defaultExclude(),
      packages: options.packages ?? [],
    })
    await writeEvidenceFingerprint(evidencePath, fingerprint, options.fs)
  }

  return { manifest: manifestResult, docs: docsResult, usage: usageResult, evidence }
}
