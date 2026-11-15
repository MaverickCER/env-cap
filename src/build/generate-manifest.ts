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
  /** The filesystem capability: `./build` never imports `node:fs` (ADR 0040). */
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
   * Explicit allowlist of installed package names whose declared
   * `"envCap": { "schema": "<path>" }` entry point is also discovered. It lets
   * the manifest include a contract published as a separate package, with no
   * monorepo required. Opt-in only: a package is never considered unless its
   * exact name appears here. See ADR 0014.
   */
  packages?: readonly string[] | undefined
  /**
   * Path to a tsconfig.json (relative to `root`)
   * whose `compilerOptions.paths`/`baseUrl` resolve aliased import specifiers (e.g.
   * `"@/lib/env.schema.js"`) encountered during static analysis, so a contract or consumer
   * reached only through an alias isn't misreported as abandoned/unresolved. Defaults to
   * `"tsconfig.json"` at `root`, so it is on with no opt-in. Unlike `packages`, it never
   * crosses a trust or versioning boundary: every resolved file is local, trusted project
   * source. Pass `false` to disable entirely. See
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
 * (not a bare module-level `const`) so every call gets its own fresh array.
 * A shared literal used from many files (`evidence-cache.ts`,
 * `generate-documentation.ts`, `generate-evidence.ts`,
 * `generate-env-artifacts.ts`, `generate-usage.ts`) attracts covered-static
 * mutants under Stryker's `coverageAnalysis: perTest` + `ignoreStatic: true`.
 * A mutant on module-load code that a test still references is run anyway
 * and falsely reported "Survived".
 */
export function defaultInclude(): string[] {
  return ["**/env.schema.ts"]
}
/** Default value for {@link GenerateEnvManifestOptions.exclude}. Same reasoning as {@link defaultInclude}. */
export function defaultExclude(): string[] {
  return [
    // The walk in `discoverSchemaFiles()` (`discover.ts`) never descends into a
    // directory named "node_modules" or ".git", whatever `exclude` says
    // (`isAlwaysSkippedDirName()`). So these two entries are redundant, and
    // emptying both leaves every test passing. They stay for readers and tools
    // that inspect `exclude`, and as a fallback if that skip ever changes.
    "**/node_modules/**",
    "**/dist/**",
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
 * Pure: no I/O. Runs compatibility (0005) and exclusive-group (0009,
 * always-error, never gated by `onIncompatibility`) checks against an
 * already-discovered contract graph and applies the `onIncompatibility` gate.
 * Shared by the standalone `generateEnvManifest()` (which discovers its own
 * graph) and `generate-env-artifacts.ts` (which discovers once and reuses it across
 * manifest/docs/usage): see ADR 0011.
 */
export function computeManifest(
  root: string,
  linkResult: LinkResult,
  onIncompatibility: "warn" | "throw" | undefined,
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
  // `blocking` under every setting: see `detectDuplicateVariableShapes()`.
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
  // `manifestSource` is always a plain string: fs.writeFile defaults a
  // string write to utf8 regardless of the encoding arg, so "utf8" vs "" is
  // unobservable. Same established equivalence as generate-usage.ts's own
  // `writeUsageReport()`/evidence-cache.ts/env-example.ts's writes.
  await fs.writeFile(outputPath, manifestSource, "utf8")
}

/**
 * Build-time only. Discovers `env.schema.ts` files and analyzes them
 * statically, never executing them, to link `createEnv()`/`documentEnv()`
 * calls. It checks duplicate variable declarations for provable
 * incompatibilities. Then it writes a deterministic manifest file that
 * re-exports every discovered active contract.
 *
 * @remarks
 * Run it from an npm script, a bundler plugin or a CI step. Application
 * startup and runtime code never call or import it.
 *
 * @throws {EnvManifestGenerationError} If `location` escapes `root`, or if a blocking compatibility/exclusive-group issue is found.
 */
export async function generateEnvManifest(
  options: GenerateEnvManifestOptions,
): Promise<GenerateEnvManifestResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? defaultInclude()
  const exclude = options.exclude ?? defaultExclude()

  // Fail fast, before any discovery/parsing work and before any file is
  // written: generation is atomic, same as a compatibility-issue failure.
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
    packages: options.packages,
    tsconfig: options.tsconfig,
  })

  const computed = computeManifest(root, linkResult, options.onIncompatibility)
  if (computed.blocking.length > 0) throw new EnvManifestGenerationError(computed.blocking)

  await writeManifest(outputPath, computed.activeContracts, options.fs)

  return {
    outputPath,
    contracts: computed.contractSummaries,
    warnings: computed.warnings,
    parseWarnings: [...packageWarnings, ...tsconfigWarnings, ...linkResult.warnings],
  }
}
