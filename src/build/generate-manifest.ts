import path from "node:path"
import { assembleProject } from "./assemble-project.js"
import type { BuildFileSystem } from "./types.js"
import { detectCompatibilityIssues, detectDuplicateVariableShapes } from "./compatibility.js"
import type { CompatibilityIssue } from "./compatibility.js"
import { EnvManifestGenerationError } from "./errors.js"
import { detectExclusiveGroupIssues } from "./exclusive-group.js"
import {
  summarizeContract,
  type DiscoveredContract,
  type DiscoveredContractSummary,
  type LinkResult,
} from "./link.js"
import { renderManifest } from "./manifest.js"
import type { ParseWarning } from "./parse.js"
import { resolveWithinRoot } from "./resolution/resolve-within-root.js"

/** Options for {@link generateEnvManifest}. */
export interface GenerateEnvManifestOptions {
  /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
  fs: BuildFileSystem
  /** Directory glob patterns are resolved against. Defaults to `process.cwd()`. */
  root?: string | undefined
  /** Output path for the generated manifest, relative to `root` (e.g. "src/generated/env.manifest.ts"). */
  location: string
  /** Glob patterns for schema files. Defaults to `["**\/env.schema.ts"]`. */
  include?: string[] | undefined
  /** Glob patterns to exclude. Defaults to node_modules/dist/.git. */
  exclude?: string[] | undefined
  /**
   * Explicit allowlist of installed
   * package names whose declared `"envCap": { "schema": "<path>" }` entry
   * point should also be discovered, so a contract that ships as its own
   * separately-published package (no monorepo required) can be included in
   * the manifest. Opt-in only: a package is never considered unless its
   * exact name appears here. See ADR 0014.
   */
  packages?: readonly string[] | undefined
  /**
   * Path to a tsconfig.json (relative to `root`)
   * whose `compilerOptions.paths`/`baseUrl` resolve aliased import specifiers (e.g.
   * `"@/lib/env.schema.js"`) encountered during static analysis, so a contract or consumer
   * reached only through an alias isn't misreported as abandoned/unresolved. Defaults to
   * `"tsconfig.json"` at `root` -- on automatically, no opt-in required, since (unlike
   * `packages`) this never crosses a trust/versioning boundary: every resolved file is
   * already local, already-trusted project source. Pass `false` to disable entirely. See
   * ADR 0023.
   */
  tsconfig?: string | false | undefined
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
}

/**
 * Default value for {@link GenerateEnvManifestOptions.include}. A function
 * (not a bare module-level `const`) so every call gets its own fresh array
 * -- a shared literal used from many files (`evidence-cache.ts`,
 * `generate-documentation.ts`, `generate-evidence.ts`,
 * `generate-env-artifacts.ts`, `generate-usage.ts`) is a covered-static
 * mutant magnet under Stryker's `coverageAnalysis: perTest` +
 * `ignoreStatic: true` (a mutant on module-load code that's still referenced
 * by a test is run anyway and falsely reported "Survived") -- see this
 * drive's memory for the fully-documented limitation.
 */
export function defaultInclude(): string[] {
  return ["**/env.schema.ts"]
}
/** Default value for {@link GenerateEnvManifestOptions.exclude}. Same reasoning as {@link defaultInclude}. */
export function defaultExclude(): string[] {
  return [
    // `discoverSchemaFiles()`'s own walk (`discover.ts`) hardcodes skipping
    // a directory literally named "node_modules" or ".git" via its own
    // `isAlwaysSkippedDirName()` check, regardless of `exclude` -- it never
    // even descends into either to test a glob pattern against it. These
    // two entries are provably redundant (kept for readers/tooling that
    // inspect `exclude` directly, and as defense if that hardcoding ever
    // changes) -- hand-verified: emptying both and running the full
    // `vitest run` leaves all 1243 tests passing.
    // Stryker disable next-line StringLiteral
    "**/node_modules/**",
    "**/dist/**",
    // Stryker disable next-line StringLiteral
    "**/.git/**",
  ]
}

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
    ...detectDuplicateVariableShapes(activeContracts),
  ]
  const compatibilityErrors = compatibilityIssues.filter((issue) => issue.severity === "error")
  // `--strict` (`onIncompatibility: "throw"`) escalates warnings only.
  // `"info"` issues are observations, never gaps, and are excluded from
  // `blocking` under every setting -- see `detectDuplicateVariableShapes()`.
  const blocking =
    onIncompatibility === "throw"
      ? compatibilityIssues.filter((issue) => issue.severity !== "info")
      : compatibilityErrors

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
  fs: BuildFileSystem,
): Promise<void> {
  const manifestSource = renderManifest(activeContracts, outputPath)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  // `manifestSource` is always a plain string -- fs.writeFile defaults a
  // string write to utf8 regardless of the encoding arg, so "utf8" vs "" is
  // unobservable. Same established equivalence as generate-usage.ts's own
  // `writeUsageReport()`/evidence-cache.ts/env-example.ts's writes.
  // Stryker disable next-line StringLiteral
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
  const include = options.include ?? defaultInclude()
  const exclude = options.exclude ?? defaultExclude()
  // `assembleProject()` threads this straight into
  // `resolveAllowlistedPackages()`, whose very first line is
  // `[...new Set(packages)]` -- `new Set(undefined)` is spec-defined as an
  // EMPTY set, identical to `new Set([])`, so `undefined` and `[]` are
  // observably identical all the way down this call chain: `&&` (giving
  // `undefined` when `options.packages` is omitted) behaves exactly like
  // `??` (giving `[]`). Hand-verified: mutating to `&&` and running the
  // full `vitest run` leaves all 1241 other tests passing (only the
  // unrelated tsc-backed json-schema test fails, a pure type-narrowing
  // regression -- `AssembleProjectOptions.packages` isn't typed optional).
  // Stryker disable next-line LogicalOperator
  const packages = options.packages ?? []
  // `onIncompatibility` is only ever compared via `=== "throw"` inside
  // `computeManifest()` -- any non-"throw" string (including "" here)
  // behaves identically to "warn". The `??` itself is real and already
  // tested (an explicit "throw" must survive, not fall back) -- only the
  // fallback's own literal text is unobservable. Hand-verified: replacing
  // it with "" and running the full `vitest run` leaves all 1240 tests
  // passing (only the unrelated tsc-backed json-schema test fails).
  // Stryker disable next-line StringLiteral
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

  const { linkResult, packageWarnings, tsconfigWarnings } = await assembleProject({
    fs: options.fs,
    root,
    include,
    exclude,
    packages,
    tsconfig: options.tsconfig,
  })

  const computed = computeManifest(root, linkResult, onIncompatibility)
  if (computed.blocking.length > 0) throw new EnvManifestGenerationError(computed.blocking)

  await writeManifest(outputPath, computed.activeContracts, options.fs)

  return {
    outputPath,
    contracts: computed.contractSummaries,
    warnings: computed.warnings,
    parseWarnings: [...packageWarnings, ...tsconfigWarnings, ...linkResult.warnings],
  }
}
