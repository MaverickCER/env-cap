import path from "node:path"
import { assembleProject } from "./assemble-project.js"
import { buildContractModel } from "./contract-model.js"
import { displayPath } from "./display-path.js"
import type { ContractModelContract } from "./contract-model.js"
import { buildCatalog, computeExpiringEntries, renderDocs } from "./docs.js"
import type {
  CatalogContract,
  ExpiringEntry,
  UndocumentedContractRef,
  UndocumentedVariableRef,
} from "./docs.js"
import { writeEnvExample } from "./env-example.js"
import type { EnvExampleOnExisting, EnvExampleResult } from "./env-example.js"
import { EnvDocumentationGenerationError } from "./errors.js"
import { defaultExclude, defaultInclude } from "./generate-manifest.js"
import { summarizeContract } from "./link.js"
import type { DiscoveredContract, DiscoveredContractSummary, LinkResult } from "./link.js"
import { resolveLiveExpirationDates } from "./live-expirations.js"
import type { LiveExpirationDates } from "./live-expirations.js"
import type { ParseWarning } from "./parse.js"
import { resolveWithinRoot } from "./resolution/resolve-within-root.js"
import type { BuildFileSystem } from "./types.js"

/** Options for {@link generateDocumentation}. */
export interface GenerateDocumentationOptions {
  /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
  fs: BuildFileSystem
  /** Project root schema discovery is relative to. Defaults to `process.cwd()`. */
  root?: string | undefined
  /** Output path for the Markdown docs artifact, relative to `root`. */
  location: string
  /** Glob patterns for files to scan. Defaults to `defaultInclude()`. */
  include?: string[] | undefined
  /** Glob patterns for files/directories to prune. Defaults to `defaultExclude()`. */
  exclude?: string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`; see ADR 0014. */
  packages?: readonly string[] | undefined
  /** **Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`; see ADR 0023. */
  tsconfig?: string | false | undefined
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

/** Everything {@link generateDocumentation} found that isn't fully documented or up to date -- never blocks generation; a team that wants to gate CI on this reads `Finding[]` (the "documentation" family) from the persisted evidence artifact and decides for itself. See ADR 0038. */
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
  /** Contract- or variable-level `sensitivity` values outside {@link STANDARD_SENSITIVITY_LEVELS}. Advisory only -- the declared level is always honored verbatim; this exists purely so vocabulary drift across a repo stays visible. */
  readonly nonstandardSensitivityLevels: readonly NonstandardSensitivityEntry[]
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

/**
 * The sensitivity vocabulary env-cap's own docs, examples, and `.env.example`
 * comments are written around. Purely advisory: `sensitivity` is an open
 * `string` (see {@link runtime.VariableDocs.sensitivity}), any value is
 * honored verbatim, and nothing here ever drops or rewrites a declared level.
 * A level outside this set only produces a non-blocking
 * `NONSTANDARD_SENSITIVITY_LEVEL` finding, so a team that deliberately runs
 * its own vocabulary sees one advisory line rather than silent data loss --
 * and a team that meant to write `"secret"` and typo'd `"secrets"` finds out.
 */
// A module-load `const` referenced directly by `documentation-generate.test.ts`
// (which iterates its exact members) is the documented covered-static
// false-Survived class: Stryker's dry-run coverage analysis marks a mutant
// here `static: true`, runs it anyway, and reports "Survived" even with
// real, passing test coverage -- `ignoreStatic` only ignores a static
// mutant with ZERO coverage. Can't fix with the usual "inline into its one
// consumer" move here (this is consumed across a module boundary, by both
// this file's own `findNonstandardSensitivityLevels()` AND the test file's
// own enumeration of "every standard level") -- same "shared public
// sentinel" class as data-cap's `UNOWNED`/`FIELD_MARKER`. Hand-verified:
// corrupting each individual string (one at a time) and running
// `vitest run test/build/documentation-generate.test.ts` directly fails a
// real test every time, proving genuine coverage.
// Stryker disable ArrayDeclaration, StringLiteral
export const STANDARD_SENSITIVITY_LEVELS: ReadonlySet<string> = new Set([
  "secret",
  "credential",
  "pii",
  "config",
])
// Stryker restore ArrayDeclaration, StringLiteral

/** One contract- or variable-level `sensitivity` declaring a level outside {@link STANDARD_SENSITIVITY_LEVELS}. */
export interface NonstandardSensitivityEntry {
  /** Absolute path of the file declaring the contract. */
  readonly file: string
  /** The contract's exported binding name. */
  readonly exportName: string
  /** `undefined` for a contract-level `sensitivity`, set for a per-variable one. */
  readonly key: string | undefined
  /** The declared level, exactly as written. */
  readonly sensitivity: string
}

/**
 * Every contract- or variable-level `sensitivity` outside the standard set,
 * in declaration order (contract first, then its own variables by key).
 *
 * @remarks
 * A variable's *own* declared level only -- never the contract-inherited one
 * `effectiveSensitivity()` would resolve to. Reporting the inherited value
 * would fire this same finding once per variable on a contract that already
 * produced its own contract-level entry, turning one real vocabulary
 * question into N duplicates of it.
 */
export function findNonstandardSensitivityLevels(
  contracts: readonly DiscoveredContract[],
): NonstandardSensitivityEntry[] {
  const entries: NonstandardSensitivityEntry[] = []
  for (const contract of contracts) {
    if (
      contract.sensitivity !== undefined &&
      !STANDARD_SENSITIVITY_LEVELS.has(contract.sensitivity)
    )
      entries.push({
        file: contract.file,
        exportName: contract.exportName,
        key: undefined,
        sensitivity: contract.sensitivity,
      })
    for (const variable of [...contract.variables].sort((a, b) => a.key.localeCompare(b.key))) {
      if (variable.sensitivity === undefined) continue
      if (STANDARD_SENSITIVITY_LEVELS.has(variable.sensitivity)) continue
      entries.push({
        file: contract.file,
        exportName: contract.exportName,
        key: variable.key,
        sensitivity: variable.sensitivity,
      })
    }
  }
  return entries
}

export interface DocumentationComputation {
  readonly contractSummaries: readonly DiscoveredContractSummary[]
  readonly catalog: readonly CatalogContract[]
  readonly documentation: DocumentationFindings
  /** `ContractModel`'s own projection of the same contracts, built once here and reused by `writeDocumentation()` -- the shape `renderDocs()` itself takes (ADR 0038). */
  readonly contractModelContracts: readonly ContractModelContract[]
}

/** Root-relative, POSIX-separated -- `RenderDocsOptions`'s own convention, matching `ContractModel`'s `file`. Exported so `check-artifacts.ts`'s drift check can convert the same `documentation.undocumentedContracts`/`undocumentedVariables` fields for its own `renderDocs()` call, identically. Delegates to `displayPath()` so this can never disagree with the `ContractModel` `file` values it's matched against by identity. */
export function relativizeRef<T extends { file: string }>(root: string, ref: T): T {
  return { ...ref, file: displayPath(root, ref.file) }
}

/**
 * Pure -- no I/O. Computes undocumented/stale/expiring findings against an
 * already-discovered contract graph (active and inactive alike -- docs
 * document everything, unlike the manifest). Never blocks -- see
 * `DocumentationFindings`'s own doc comment. Shared by the standalone
 * `generateDocumentation()` and `generate-env-artifacts.ts` (which also
 * reuses this same call for Finding Model's documentation-family findings,
 * ADR 0038 -- one computation, not two).
 */
export function computeDocumentation(
  root: string,
  linkResult: LinkResult,
  expiringWithinDays: number,
  generatedAt: Date,
): DocumentationComputation {
  const { contracts } = linkResult
  return {
    contractSummaries: contracts.map((contract) => summarizeContract(contract, root)),
    catalog: buildCatalog(contracts),
    documentation: {
      undocumentedContracts: linkResult.undocumentedContracts,
      undocumentedVariables: linkResult.undocumentedVariables,
      staleDocEntries: linkResult.staleDocEntries,
      expiringSoon: computeExpiringEntries(contracts, expiringWithinDays, generatedAt),
      nonstandardSensitivityLevels: findNonstandardSensitivityLevels(contracts),
      unresolvedLinks: linkResult.unresolvedLinks,
    },
    contractModelContracts: buildContractModel(contracts, root).contracts,
  }
}

/** Writes the docs artifact and, if requested, the `.env.example` file. Callers must have already confirmed both output paths are safe and nothing is blocking. */
export async function writeDocumentation(
  docsPath: string,
  envExamplePath: string | undefined,
  root: string,
  contracts: readonly DiscoveredContract[],
  contractModelContracts: readonly ContractModelContract[],
  documentation: DocumentationFindings,
  expiringWithinDays: number,
  generatedAt: Date,
  fs: BuildFileSystem,
  envExampleOnExisting?: EnvExampleOnExisting,
): Promise<{ envExample: EnvExampleResult | undefined }> {
  let previousContent: string | undefined
  try {
    previousContent = await fs.readFile(docsPath, "utf8")
  } catch {
    // Empty -- `previousContent` already starts `undefined`; re-assigning
    // it here is a no-op (no BlockStatement mutant on a trailing `{}`).
  }

  const docsSource = renderDocs(contractModelContracts, {
    expiringWithinDays,
    undocumentedContracts: documentation.undocumentedContracts.map((ref): UndocumentedContractRef =>
      relativizeRef(root, ref),
    ),
    // `RenderDocsOptions.undocumentedVariables` is consumed by `renderDocs()`
    // ONLY via `.length` (the security-review counter) -- never by content
    // or identity, unlike its `undocumentedContracts` sibling above (matched
    // by identity against the catalog for the "Undocumented." marker).
    // `.map()` always preserves length regardless of what each element
    // transforms to, so this specific `relativizeRef()` call's own output is
    // unobservable through this call site. Hand-verified: mapping every
    // entry to `undefined` instead and running the full `vitest run` leaves
    // all tests passing.
    // Stryker disable next-line ArrowFunction
    undocumentedVariables: documentation.undocumentedVariables.map((ref): UndocumentedVariableRef =>
      relativizeRef(root, ref),
    ),
    generatedAt,
    previousContent,
  })
  await fs.mkdir(path.dirname(docsPath), { recursive: true })
  // `docsSource` is always a plain string -- fs.writeFile defaults a string
  // write to utf8 regardless of the encoding arg, so "utf8" vs "" is
  // unobservable. Same established equivalence as this drive's other
  // writeX() functions.
  // Stryker disable next-line StringLiteral
  await fs.writeFile(docsPath, docsSource, "utf8")

  const envExample = envExamplePath
    ? // exactOptionalPropertyTypes: omit the key rather than set it to
      // `undefined` when the caller didn't supply one. writeEnvExample
      // itself does `options.onExisting ?? "keep-sibling"`, so passing
      // `onExisting: undefined` explicitly (what always-spreading here
      // would do) is behaviorally identical to omitting the key.
      // Hand-verified: forcing this guard to `true` and running the real
      // suite passes unchanged.
      await writeEnvExample(contracts, envExamplePath, fs, {
        // Stryker disable next-line ConditionalExpression
        ...(envExampleOnExisting === undefined ? {} : { onExisting: envExampleOnExisting }),
      })
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
 * @throws {EnvDocumentationGenerationError} If `location`/`envExample.location` escape `root`.
 */
export async function generateDocumentation(
  options: GenerateDocumentationOptions,
): Promise<GenerateDocumentationResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? defaultInclude()
  const exclude = options.exclude ?? defaultExclude()
  const packages = options.packages ?? []
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

  const { linkResult, packageWarnings, tsconfigWarnings } = await assembleProject({
    fs: options.fs,
    root,
    include,
    exclude,
    packages,
    tsconfig: options.tsconfig,
  })
  const docsContracts = await resolveLiveExpirationDates(
    linkResult.contracts,
    options.liveExpirationDates,
  )

  const generatedAt = new Date()
  const computed = computeDocumentation(
    root,
    { ...linkResult, contracts: docsContracts },
    expiringWithinDays,
    generatedAt,
  )

  const { envExample } = await writeDocumentation(
    docsPath,
    envExamplePath,
    root,
    docsContracts,
    computed.contractModelContracts,
    computed.documentation,
    expiringWithinDays,
    generatedAt,
    options.fs,
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
