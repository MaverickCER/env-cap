import path from "node:path"
import {
  extractContractDocs,
  extractCreateEnvOptionsName,
  extractSchemaVariables,
  parseSchemaFile,
} from "./parse.js"
import type {
  DiscoveredClassification,
  DiscoveredSchemaVariable,
  DiscoveredVariableDocs,
  FileParseResult,
  ParseWarning,
  SchemaRef,
} from "./parse.js"
import { mustGet } from "./map-utils.js"
import { resolveImportSpecifier } from "./resolve-import.js"
import type { ImportResolutionContext } from "./resolve-import.js"
import type { PackageOrigin } from "./resolve-package-schema.js"

/** One schema variable, merged with its linked `documentEnv()` documentation (if any). */
export interface DiscoveredVariable extends DiscoveredSchemaVariable {
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly description: string | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any -- individual-variable override of the contract's own `owner`. */
  readonly owner: string | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any -- individual-variable override of the contract's own `classification`. */
  readonly classification: DiscoveredClassification | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly expiresAt: string | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly refreshInstructions: string | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly required: boolean | undefined
  /** Fields other than the known {@link runtime.VariableDocs} keys, keyed by field name. */
  readonly extra: Readonly<Record<string, string>>
  /** Whether this specific key had a matching entry in the linked `documentEnv()` call, if any. */
  readonly documented: boolean
}

/** One `createEnv()` contract, merged with its linked `documentEnv()` documentation (if any). */
export interface DiscoveredContract {
  /** Absolute path of the file declaring the `createEnv()` call. */
  readonly file: string
  /** The binding name the `createEnv()` result is exported as. */
  readonly exportName: string
  /** Resolved display name: linked `documentEnv()`'s `name`, else `createEnv()`'s own `name` option, else `exportName`. */
  readonly contractName: string
  /** From the linked `documentEnv()`'s `active` option. Defaults to `true` when omitted or undocumented. */
  readonly active: boolean
  /** From the linked `documentEnv()` call, if any. */
  readonly category: string | undefined
  /** From the linked `documentEnv()` call, if any -- see {@link runtime.ContractDocs.exclusiveGroup}. */
  readonly exclusiveGroup: string | undefined
  /** Contract-level default owner -- individual variables may override via their own `owner`. */
  readonly owner: string | undefined
  /** Contract-level default classification -- individual variables may override via their own `classification`. */
  readonly classification: DiscoveredClassification | undefined
  /** From the linked `documentEnv()` call, if any. */
  readonly expiresAt: string | undefined
  /** From the linked `documentEnv()` call, if any. */
  readonly metadata: Readonly<Record<string, string>> | undefined
  /** Every variable declared in the schema, merged with its linked documentation. */
  readonly variables: readonly DiscoveredVariable[]
  /** Whether *any* `documentEnv()` call is linked to this contract at all. */
  readonly documented: boolean
  /** Set when this contract was discovered via an allow-listed package's
   *  declared schema entry point rather than local discovery -- the bare
   *  package name `renderManifest()` must import from instead of computing a
   *  relative path to the (analysis-only) resolved file. See ADR 0014. */
  readonly packageOrigin: PackageOrigin | undefined
}

/** A `documentEnv()` call that could not be statically linked back to a `createEnv()` schema. */
export interface UnresolvedLink {
  /** Absolute path of the file containing the unlinkable call. */
  readonly file: string
  /** Human-readable explanation of why the link couldn't be resolved. */
  readonly reason: string
}

/** The full result of {@link linkFiles}: every linked contract, plus every category of thing that didn't link cleanly. */
export interface LinkResult {
  /** Every `createEnv()` contract found, merged with its documentation. */
  readonly contracts: readonly DiscoveredContract[]
  /** Parse-time warnings collected across every analyzed file. */
  readonly warnings: readonly ParseWarning[]
  /** `documentEnv()` calls that couldn't be statically linked to a schema. */
  readonly unresolvedLinks: readonly UnresolvedLink[]
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
}

/**
 * Parses every discovered file, then resolves and links `createEnv`/
 * `documentEnv` calls into the merged, docs-enriched contract shape the rest
 * of the generator (`compatibility.ts`, `exclusive-group.ts`, `manifest.ts`,
 * `docs.ts`, `env-example.ts`) consumes.
 *
 * @remarks
 * Cross-file linking is deliberately narrow (see `resolveImportSpecifier`):
 * a `documentEnv()` call's schema reference resolves either to a `const` in
 * its own file, to a directly-imported named export of another file's
 * `const`, or (since ADR 0014) to an allow-listed package's declared schema
 * entry point. Anything else -- a re-export barrel, a namespace import, an
 * unlisted bare package specifier -- becomes an `unresolvedLinks` entry
 * rather than a throw or a guess, exactly like every other static-analysis
 * boundary in this codebase.
 *
 * `packageOrigins` (from `resolveAllowlistedPackages()`) tags any discovered
 * contract whose `file` matches a package-resolved path with that package's
 * origin -- purely a lookup; `discoveredFiles` must already include those
 * files (merged in by the caller via `mergeLocalAndPackageFiles()`).
 *
 * @param context - See `ImportResolutionContext`; drives how a resolved import specifier maps back to a file on disk.
 */
export async function linkFiles(
  discoveredFiles: readonly string[],
  readFile: (filePath: string) => Promise<string>,
  context: ImportResolutionContext,
  packageOrigins: ReadonlyMap<string, PackageOrigin> = new Map(),
): Promise<LinkResult> {
  const analysisCache = new Map<string, FileParseResult>()

  async function getAnalysis(filePath: string): Promise<FileParseResult | undefined> {
    const cached = analysisCache.get(filePath)
    if (cached) return cached
    let text: string
    try {
      text = await readFile(filePath)
    } catch {
      return undefined
    }
    const parsed = parseSchemaFile(filePath, text)
    analysisCache.set(filePath, parsed)
    return parsed
  }

  for (const file of discoveredFiles) {
    await getAnalysis(file)
  }

  const warnings: ParseWarning[] = []
  const unresolvedLinks: UnresolvedLink[] = []

  async function resolveSchema(
    ref: SchemaRef,
    inFile: string,
    contextLabel: string,
  ): Promise<{ identity: string; variables: DiscoveredSchemaVariable[] } | undefined> {
    if (ref.kind === "unresolvable") return undefined

    if (ref.kind === "literal") {
      // Unique per AST node position -- an inline schema literal can never be
      // referenced by anything else, so it can never be linked to a
      // documentEnv() call elsewhere. That's expected, not a bug: documenting
      // a schema requires giving it a name.
      return {
        identity: `${inFile}#<inline:${ref.node.pos}>`,
        variables: extractSchemaVariables(ref.node, inFile, contextLabel, warnings),
      }
    }

    // `inFile` is always the loop variable from `discoveredFiles` below,
    // already analyzed (and cached) by the pre-pass above -- `mustGet` makes
    // that invariant explicit instead of a silent, unreachable `undefined`
    // fallback (see the identical pattern the two loops below already use).
    const inFileAnalysis = mustGet(analysisCache, inFile)

    const local = inFileAnalysis.localConsts.get(ref.name)
    if (local) {
      return {
        identity: `${inFile}#${ref.name}`,
        variables: extractSchemaVariables(local, inFile, contextLabel, warnings),
      }
    }

    const imported = inFileAnalysis.imports.get(ref.name)
    if (!imported) return undefined

    const targetFile = await resolveImportSpecifier(inFile, imported.specifier, context)
    if (!targetFile) return undefined

    const targetAnalysis = await getAnalysis(targetFile)
    if (!targetAnalysis) return undefined

    const targetLocal = targetAnalysis.localConsts.get(imported.importedName)
    if (!targetLocal || !targetAnalysis.exportedConstNames.has(imported.importedName))
      return undefined

    return {
      identity: `${targetFile}#${imported.importedName}`,
      variables: extractSchemaVariables(targetLocal, targetFile, contextLabel, warnings),
    }
  }

  interface CreateEnvEntry {
    file: string
    exportName: string
    identity: string
    variables: DiscoveredSchemaVariable[]
    optionsName: string | undefined
  }
  const createEnvEntries: CreateEnvEntry[] = []

  for (const file of discoveredFiles) {
    const analysis = mustGet(analysisCache, file)
    for (const call of analysis.createEnvCalls) {
      const resolved = await resolveSchema(call.schemaRef, file, call.exportName)
      if (!resolved) {
        warnings.push({
          file,
          message: `createEnv() call for "${call.exportName}" does not pass an inline object literal or a statically-resolvable schema reference; skipping static analysis for this contract.`,
        })
        continue
      }
      createEnvEntries.push({
        file,
        exportName: call.exportName,
        identity: resolved.identity,
        variables: resolved.variables,
        optionsName: extractCreateEnvOptionsName(call.optionsArg),
      })
    }
  }

  interface DocumentEnvEntry {
    identity: string
    docs: ReturnType<typeof extractContractDocs>
  }
  const documentEnvByIdentity = new Map<string, DocumentEnvEntry>()

  for (const file of discoveredFiles) {
    const analysis = mustGet(analysisCache, file)
    for (const call of analysis.documentEnvCalls) {
      const resolved = await resolveSchema(call.schemaRef, file, "documentEnv() call")
      if (!resolved) {
        unresolvedLinks.push({
          file,
          reason:
            "documentEnv() call could not be statically linked to a schema (its first argument isn't an inline object literal or a resolvable local/imported reference).",
        })
        continue
      }
      if (documentEnvByIdentity.has(resolved.identity)) {
        // Multiple documentEnv() calls for the same schema -- the first one
        // found (in discovery order) wins, silently. Unusual enough not to
        // warrant its own warning category.
        continue
      }
      const docs = extractContractDocs(call.docsArg, file, resolved.identity, warnings)
      documentEnvByIdentity.set(resolved.identity, { identity: resolved.identity, docs })
    }
  }

  const contracts: DiscoveredContract[] = []
  const undocumentedContracts: LinkResult["undocumentedContracts"][number][] = []
  const undocumentedVariables: LinkResult["undocumentedVariables"][number][] = []
  const staleDocEntries: LinkResult["staleDocEntries"][number][] = []

  for (const entry of createEnvEntries) {
    const linked = documentEnvByIdentity.get(entry.identity)
    const docs = linked?.docs

    if (!docs) {
      undocumentedContracts.push({ file: entry.file, exportName: entry.exportName })
    }

    const schemaKeys = new Set(entry.variables.map((v) => v.key))
    const docsVariables = docs?.variables ?? new Map<string, DiscoveredVariableDocs>()

    for (const key of schemaKeys) {
      if (!docsVariables.has(key))
        undocumentedVariables.push({ file: entry.file, exportName: entry.exportName, key })
    }
    for (const key of docsVariables.keys()) {
      if (!schemaKeys.has(key))
        staleDocEntries.push({ file: entry.file, exportName: entry.exportName, key })
    }

    const variables: DiscoveredVariable[] = entry.variables.map((v) => {
      const vd = docsVariables.get(v.key)
      return {
        ...v,
        description: vd?.description,
        owner: vd?.owner,
        classification: vd?.classification,
        expiresAt: vd?.expiresAt,
        refreshInstructions: vd?.refreshInstructions,
        required: vd?.required,
        extra: vd?.extra ?? {},
        documented: vd !== undefined,
      }
    })

    contracts.push({
      file: entry.file,
      exportName: entry.exportName,
      contractName: docs?.name ?? entry.optionsName ?? entry.exportName,
      active: docs?.active ?? true,
      category: docs?.category,
      exclusiveGroup: docs?.exclusiveGroup,
      owner: docs?.owner,
      classification: docs?.classification,
      expiresAt: docs?.expiresAt,
      metadata: docs?.metadata,
      packageOrigin: packageOrigins.get(entry.file),
      variables,
      documented: docs !== undefined,
    })
  }

  for (const analysis of analysisCache.values()) {
    warnings.push(...analysis.warnings)
  }

  return {
    contracts,
    warnings,
    unresolvedLinks,
    undocumentedContracts,
    undocumentedVariables,
    staleDocEntries,
  }
}

/** Root-relative projection of a {@link DiscoveredContract}, as returned by {@link generateEnvManifest}/{@link generateDocumentation}. */
export interface DiscoveredContractSummary {
  /** Root-relative, POSIX-separated file path. */
  readonly file: string
  /** The binding name the `createEnv()` result is exported as. */
  readonly exportName: string
  /** Resolved display name (see {@link DiscoveredContract.contractName}). */
  readonly contractName: string
  /** Number of variables declared in this contract's schema. */
  readonly variableCount: number
  /** Whether this contract was included in the generated manifest (`active` defaults to true). */
  readonly active: boolean
  /** Whether a `documentEnv()` call is linked to this contract. */
  readonly documented: boolean
}

/**
 * Projects a {@link DiscoveredContract} (absolute `file`) into the root-relative
 * summary shape returned by {@link generateEnvManifest}/{@link generateDocumentation}.
 *
 * @remarks
 * Pulled out here, rather than duplicated in both, since it's a pure
 * projection with no manifest- or docs-specific behavior.
 */
export function summarizeContract(
  contract: DiscoveredContract,
  root: string,
): DiscoveredContractSummary {
  return {
    file: path.relative(root, contract.file),
    exportName: contract.exportName,
    contractName: contract.contractName,
    variableCount: contract.variables.length,
    active: contract.active,
    documented: contract.documented,
  }
}

/**
 * A variable's owner, falling back to its contract's default when the
 * variable itself doesn't set one.
 *
 * @remarks
 * The one place this resolution rule should live -- see ADR 0028. Every
 * caller that needs "who owns this variable" (the docs Catalog/ownership
 * matrix/security review, and, as of ADR 0028, the usage report's
 * variable-level ownership findings) must go through this, not
 * `variable.owner` or `contract.owner` alone, so two call sites can never
 * again disagree about who owns a variable the way `docs.ts` and
 * `usage-report.ts` once did.
 */
export function effectiveOwner(
  contract: DiscoveredContract,
  variable: DiscoveredVariable,
): string | undefined {
  return variable.owner ?? contract.owner
}
