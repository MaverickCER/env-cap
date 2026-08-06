import fs from "node:fs/promises"
import path from "node:path"
import type { CompatibilityIssue } from "./compatibility.js"
import { discoverSchemaFiles } from "./discover.js"
import { buildCatalog, computeExpiringEntries, renderDocs } from "./docs.js"
import type { CatalogContract, ExpiringEntry } from "./docs.js"
import { writeEnvExample } from "./env-example.js"
import type { EnvExampleOnExisting, EnvExampleResult } from "./env-example.js"
import { EnvDocumentationGenerationError } from "./errors.js"
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from "./generate-manifest.js"
import { linkFiles, summarizeContract } from "./link.js"
import type { DiscoveredContract, DiscoveredContractSummary, LinkResult } from "./link.js"
import { resolveLiveExpirationDates } from "./live-expirations.js"
import type { LiveExpirationDates } from "./live-expirations.js"
import type { ParseWarning } from "./parse.js"
import type { ImportResolutionContext } from "./resolve-import.js"
import { mergeLocalAndPackageFiles, resolveAllowlistedPackages } from "./resolve-package-schema.js"
import type { PackageSchemaResolutionResult } from "./resolve-package-schema.js"
import { createAliasResolutionCache, loadTsconfigPaths } from "./resolve-tsconfig-paths.js"
import { resolveWithinRoot } from "./resolve-within-root.js"

/** Options for {@link generateDocumentation}. */
export interface GenerateDocumentationOptions {
  /** Project root schema discovery is relative to. Defaults to `process.cwd()`. */
  root?: string | undefined
  /** Output path for the Markdown docs artifact, relative to `root`. */
  location: string
  /** Glob patterns for files to scan. Defaults to `DEFAULT_INCLUDE`. */
  include?: string[] | undefined
  /** Glob patterns for files/directories to prune. Defaults to `DEFAULT_EXCLUDE`. */
  exclude?: string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`; see ADR 0014. */
  packages?: readonly string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`; see ADR 0023. */
  tsconfig?: string | false | undefined
  /**
   * "warn" (default): an undocumented `createEnv()`/variable is reported in
   * `result.documentation` but never blocks generation. "throw": escalates
   * those findings to a hard error too.
   */
  onUndocumented?: "warn" | "throw" | undefined
  /** How many days out counts as "expiring soon". Defaults to 30. */
  expiringWithinDays?: number | undefined
  /**
   * Also emit a `.env.example`-style file, relative to `root`. `onExisting`
   * controls what happens when a file already exists there -- defaults to
   * `"keep-sibling"` (never overwrites; see `EnvExampleOnExisting` and
   * `EnvExampleResult`).
   */
  envExample?:
    | {
        /** Output path for the `.env.example`-style file, relative to `root`. */
        location: string
        /** What to do when a file already exists at `location`. Defaults to `"keep-sibling"`. */
        onExisting?: EnvExampleOnExisting | undefined
      }
    | undefined
  /**
   * Supplies expiration metadata from a live source as a post-discovery
   * override, invoked exactly once with every discovered variable name after
   * linking completes and before rendering. See `live-expirations.ts` and
   * ADR 0012. Omitted: behavior is unchanged from a purely static `expiresAt`.
   */
  liveExpirationDates?: LiveExpirationDates | undefined
}

/** Everything {@link generateDocumentation} found that isn't fully documented or up to date, regardless of `onUndocumented`. */
export interface DocumentationFindings {
  /** Contracts with no linked `documentEnv()` call at all. */
  readonly undocumentedContracts: readonly {
    /** Absolute path of the file declaring the contract. */
    readonly file: string
    /** The contract's exported binding name. */
    readonly exportName: string
  }[]
  /** Schema variables with no matching entry in their contract's linked documentation. */
  readonly undocumentedVariables: readonly {
    /** Absolute path of the file declaring the contract. */
    readonly file: string
    /** The contract's exported binding name. */
    readonly exportName: string
    /** The undocumented environment variable name. */
    readonly key: string
  }[]
  /** Documented variable entries with no matching schema variable (the schema key was removed or renamed). */
  readonly staleDocEntries: readonly {
    /** Absolute path of the file declaring the contract. */
    readonly file: string
    /** The contract's exported binding name. */
    readonly exportName: string
    /** The stale documented variable name. */
    readonly key: string
  }[]
  /** Variables whose `expiresAt` falls within the configured window. */
  readonly expiringSoon: readonly ExpiringEntry[]
  /** `documentEnv()` calls that couldn't be statically linked to a schema. */
  readonly unresolvedLinks: readonly {
    /** Absolute path of the file containing the unlinkable call. */
    readonly file: string
    /** Human-readable explanation of why the link couldn't be resolved. */
    readonly reason: string
  }[]
}

/** The result of a completed {@link generateDocumentation} run. */
export interface GenerateDocumentationResult {
  /** Absolute path the Markdown docs artifact was written to. */
  readonly docsPath: string
  /** Set only when `options.envExample` was passed. */
  readonly envExample: EnvExampleResult | undefined
  /** Root-relative summary of every discovered contract, active or not. */
  readonly contracts: readonly DiscoveredContractSummary[]
  /** Same descriptive content as the generated Markdown Catalog, reshaped for
   *  programmatic consumers -- see `buildCatalog()` in `docs.ts`. */
  readonly catalog: readonly CatalogContract[]
  /** Parse-time warnings collected across every analyzed file (including allow-listed package resolution). */
  readonly parseWarnings: readonly ParseWarning[]
  /** Everything found that isn't fully documented or up to date. */
  readonly documentation: DocumentationFindings
}

/** Default value for {@link GenerateDocumentationOptions.expiringWithinDays}. */
export const DEFAULT_EXPIRING_WITHIN_DAYS = 30

function documentationIssues(
  undocumentedContracts: DocumentationFindings["undocumentedContracts"],
  undocumentedVariables: DocumentationFindings["undocumentedVariables"],
): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = []
  for (const c of undocumentedContracts) {
    issues.push({
      severity: "warning",
      variable: `(contract) ${c.exportName}`,
      files: [c.file],
      reason: `"${c.exportName}" has no documentEnv() call linked to it.`,
    })
  }
  for (const v of undocumentedVariables) {
    issues.push({
      severity: "warning",
      variable: v.key,
      files: [v.file],
      reason: `"${v.key}" (declared by "${v.exportName}") has no matching entry in a linked documentEnv()'s "variables".`,
    })
  }
  return issues
}

export interface DocumentationComputation {
  readonly contractSummaries: readonly DiscoveredContractSummary[]
  readonly catalog: readonly CatalogContract[]
  readonly documentation: DocumentationFindings
  readonly blocking: readonly CompatibilityIssue[]
}

/**
 * Pure -- no I/O. Computes undocumented/stale/expiring findings against an
 * already-discovered contract graph (active and inactive alike -- docs
 * document everything, unlike the manifest) and applies the `onUndocumented`
 * gate. Shared by the standalone `generateDocumentation()` and `generate-env-artifacts.ts`.
 */
export function computeDocumentation(
  root: string,
  linkResult: LinkResult,
  onUndocumented: "warn" | "throw",
  expiringWithinDays: number,
  generatedAt: Date,
): DocumentationComputation {
  const { contracts } = linkResult
  const docIssues = documentationIssues(
    linkResult.undocumentedContracts,
    linkResult.undocumentedVariables,
  )
  const blocking = onUndocumented === "throw" ? docIssues : []

  return {
    contractSummaries: contracts.map((contract) => summarizeContract(contract, root)),
    catalog: buildCatalog(contracts),
    documentation: {
      undocumentedContracts: linkResult.undocumentedContracts,
      undocumentedVariables: linkResult.undocumentedVariables,
      staleDocEntries: linkResult.staleDocEntries,
      expiringSoon: computeExpiringEntries(contracts, expiringWithinDays, generatedAt),
      unresolvedLinks: linkResult.unresolvedLinks,
    },
    blocking,
  }
}

/** Writes the docs artifact and, if requested, the `.env.example` file. Callers must have already confirmed both output paths are safe and nothing is blocking. */
export async function writeDocumentation(
  docsPath: string,
  envExamplePath: string | undefined,
  root: string,
  contracts: readonly DiscoveredContract[],
  documentation: DocumentationFindings,
  expiringWithinDays: number,
  generatedAt: Date,
  envExampleOnExisting?: EnvExampleOnExisting,
): Promise<{ envExample: EnvExampleResult | undefined }> {
  let previousContent: string | undefined
  try {
    previousContent = await fs.readFile(docsPath, "utf8")
  } catch {
    previousContent = undefined
  }

  const docsSource = renderDocs(contracts, root, {
    expiringWithinDays,
    undocumentedContracts: documentation.undocumentedContracts,
    undocumentedVariables: documentation.undocumentedVariables,
    generatedAt,
    previousContent,
  })
  await fs.mkdir(path.dirname(docsPath), { recursive: true })
  await fs.writeFile(docsPath, docsSource, "utf8")

  const envExample = envExamplePath
    ? await writeEnvExample(contracts, envExamplePath, { onExisting: envExampleOnExisting })
    : undefined
  return { envExample }
}

/**
 * Build-time only. Discovers and links `env.schema.ts` files (same static
 * analysis as {@link generateEnvManifest}) and writes the rich Markdown "Catalog" --
 * every variable, its description, default, processor/validator flags,
 * owner, and expiry -- the single onboarding reference application
 * developers use to see what configuration a feature needs and how to set
 * it up. Optionally also writes a reconciling `.env.example`.
 *
 * @remarks
 * Documents every discovered contract, active or not, unlike {@link generateEnvManifest}.
 *
 * @throws {EnvDocumentationGenerationError} If `location`/`envExample.location` escape `root`, or if `onUndocumented: "throw"` and something is undocumented.
 */
export async function generateDocumentation(
  options: GenerateDocumentationOptions,
): Promise<GenerateDocumentationResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? DEFAULT_INCLUDE
  const exclude = options.exclude ?? DEFAULT_EXCLUDE
  const packages = options.packages ?? []
  const onUndocumented = options.onUndocumented ?? "warn"
  const expiringWithinDays = options.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS

  const docsLocationResult = resolveWithinRoot(
    root,
    options.location,
    "location",
    "generateDocumentation",
  )
  if (!docsLocationResult.ok) throw new EnvDocumentationGenerationError([docsLocationResult.issue])
  const docsPath = docsLocationResult.resolved

  let envExamplePath: string | undefined
  if (options.envExample) {
    const envExampleResult = resolveWithinRoot(
      root,
      options.envExample.location,
      "envExample.location",
      "generateDocumentation",
    )
    if (!envExampleResult.ok) throw new EnvDocumentationGenerationError([envExampleResult.issue])
    envExamplePath = envExampleResult.resolved
  }

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
  const linkResult = await linkFiles(
    files,
    (filePath) => fs.readFile(filePath, "utf8"),
    context,
    origins,
  )
  const docsContracts = await resolveLiveExpirationDates(
    linkResult.contracts,
    options.liveExpirationDates,
  )

  const generatedAt = new Date()
  const computed = computeDocumentation(
    root,
    { ...linkResult, contracts: docsContracts },
    onUndocumented,
    expiringWithinDays,
    generatedAt,
  )
  if (computed.blocking.length > 0) throw new EnvDocumentationGenerationError(computed.blocking)

  const { envExample } = await writeDocumentation(
    docsPath,
    envExamplePath,
    root,
    docsContracts,
    computed.documentation,
    expiringWithinDays,
    generatedAt,
    options.envExample?.onExisting,
  )

  return {
    docsPath,
    envExample,
    contracts: computed.contractSummaries,
    catalog: computed.catalog,
    parseWarnings: [...packageWarnings, ...tsconfigWarnings, ...linkResult.warnings],
    documentation: computed.documentation,
  }
}
