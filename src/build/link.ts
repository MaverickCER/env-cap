import path from "node:path"
import {
  extractContractDocs,
  extractCreateEnvOptionsName,
  extractSchemaVariables,
  parseSchemaFile,
} from "./parse.js"
import type {
  DiscoveredSchemaVariable,
  DiscoveredVariableEvidence,
  DiscoveredVariableDocs,
  FileParseResult,
  ParseWarning,
  SchemaRef,
} from "./parse.js"
import type { EnvGovernanceFields } from "./governance-fields.js"
import { mustGet } from "./map-utils.js"
import { resolveImportSpecifier } from "./resolution/resolve-import.js"
import type { ImportResolutionContext } from "./resolution/resolve-import.js"
import type { PackageOrigin } from "./resolution/resolve-package-schema.js"
import { positionOf } from "./source-position.js"
import type { SourcePosition } from "./source-position.js"

/** One schema variable, merged with its linked `documentEnv()` documentation (if any). */
/**
 * One schema variable merged with its linked `documentEnv()` documentation. Its
 * governance fields (`owner` .. `metadata`) are {@link EnvGovernanceFields} --
 * each an individual-variable override of the contract's own value, from the
 * linked `documentEnv()` call's matching `variables` entry, or `undefined`.
 */
export interface DiscoveredVariable extends DiscoveredSchemaVariable, EnvGovernanceFields {
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly description: string | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly refreshInstructions: string | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly setupInstructions: string | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly required: boolean | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly deprecated: boolean | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly deprecatedReason: string | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
  readonly removeBy: string | undefined
  /** From the linked `documentEnv()` call's matching `variables` entry, if any -- the previous variable name this one renames, if this declaration is the result of a rename. */
  readonly renamedFrom: string | undefined
  /** The linked `documentEnv()` entry's `evidence` sub-object -- the re-verified-every-run half of this variable's documentation, deliberately not flattened in alongside the declared-only fields above. See {@link runtime.VariableEvidenceDocs} and ADR 0037. */
  readonly evidence: DiscoveredVariableEvidence | undefined
  /** Whether this specific key had a matching entry in the linked `documentEnv()` call, if any. */
  readonly documented: boolean
  // `declaration: SourcePosition` is inherited from `DiscoveredSchemaVariable` --
  // where this variable's own schema property is declared. See ADR 0036.
}

/** One `createEnv()` contract, merged with its linked `documentEnv()` documentation (if any). Its governance fields (`owner` .. `metadata`) are {@link EnvGovernanceFields} -- contract-level defaults that individual variables may override. */
export interface DiscoveredContract extends EnvGovernanceFields {
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
  /** From the linked `documentEnv()` call, if any. */
  readonly deprecated: boolean | undefined
  /** From the linked `documentEnv()` call, if any. */
  readonly deprecatedReason: string | undefined
  /** Every variable declared in the schema, merged with its linked documentation. */
  readonly variables: readonly DiscoveredVariable[]
  /** Whether *any* `documentEnv()` call is linked to this contract at all. */
  readonly documented: boolean
  /** Set when this contract was discovered via an allow-listed package's
   *  declared schema entry point rather than local discovery -- the bare
   *  package name `renderManifest()` must import from instead of computing a
   *  relative path to the (analysis-only) resolved file. See ADR 0014. */
  readonly packageOrigin: PackageOrigin | undefined
  /** Where this contract's `createEnv(...)` call is declared. Always present -- every discovered contract has one, by definition. See ADR 0036. */
  readonly declaration: SourcePosition
  /** Where this contract's `documentEnv(...)` call is declared, if one exists. Undefined for a contract that's never been documented. See ADR 0036. */
  readonly documentation: SourcePosition | undefined
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
    // Equivalent even if this check is bypassed entirely: `SchemaRef`'s
    // "unresolvable" variant carries only `kind` (no `.name`/`.node`), and
    // every subsequent step in this function is a `Map.get(ref.name)`-style
    // lookup (or a lookup keyed off one) -- `ref.name` on the real,
    // no-such-field "unresolvable" object reads `undefined` at runtime, and
    // a `Map.get(undefined)` miss safely falls through to this SAME
    // function's own later `if (!imported) return undefined`, with no
    // warning or other side effect pushed anywhere along the way. Confirmed
    // by tracing every step by hand; not something a black-box test on
    // `resolveSchema`'s return value or `warnings`/`unresolvedLinks` could
    // ever distinguish.
    // Stryker disable next-line StringLiteral,ConditionalExpression
    if (ref.kind === "unresolvable") return undefined

    // `inFile` is always the loop variable from `discoveredFiles` below,
    // already analyzed (and cached) by the pre-pass above -- `mustGet` makes
    // that invariant explicit instead of a silent, unreachable `undefined`
    // fallback (see the identical pattern the two loops below already use).
    const inFileAnalysis = mustGet(analysisCache, inFile)

    if (ref.kind === "literal") {
      // Unique per AST node position -- an inline schema literal can never be
      // referenced by anything else, so it can never be linked to a
      // documentEnv() call elsewhere. That's expected, not a bug: documenting
      // a schema requires giving it a name.
      return {
        identity: `${inFile}#<inline:${ref.node.pos}>`,
        variables: extractSchemaVariables(
          ref.node,
          inFile,
          contextLabel,
          warnings,
          inFileAnalysis.sourceFile,
        ),
      }
    }

    const local = inFileAnalysis.localConsts.get(ref.name)
    if (local) {
      return {
        identity: `${inFile}#${ref.name}`,
        variables: extractSchemaVariables(
          local,
          inFile,
          contextLabel,
          warnings,
          inFileAnalysis.sourceFile,
        ),
      }
    }

    const imported = inFileAnalysis.imports.get(ref.name)
    if (!imported) return undefined

    const targetFile = await resolveImportSpecifier(inFile, imported.specifier, context)
    // Equivalent even if bypassed: `getAnalysis(undefined as unknown as
    // string)` below misses `analysisCache` (a Map, safe for any key),
    // attempts `readFile(undefined)`, which every real (and test-double)
    // `readFile` implementation here rejects rather than resolves, is
    // caught by `getAnalysis`'s own `try { ... } catch { return undefined
    // }`, and returns `undefined` -- reaching this function's OWN later
    // `if (!targetAnalysis) return undefined` regardless, with no warning
    // or other side effect pushed either way.
    // Stryker disable next-line ConditionalExpression
    if (!targetFile) return undefined

    const targetAnalysis = await getAnalysis(targetFile)
    if (!targetAnalysis) return undefined

    const targetLocal = targetAnalysis.localConsts.get(imported.importedName)
    if (!targetLocal || !targetAnalysis.exportedConstNames.has(imported.importedName))
      return undefined

    return {
      identity: `${targetFile}#${imported.importedName}`,
      variables: extractSchemaVariables(
        targetLocal,
        targetFile,
        contextLabel,
        warnings,
        targetAnalysis.sourceFile,
      ),
    }
  }

  interface CreateEnvEntry {
    file: string
    exportName: string
    identity: string
    variables: DiscoveredSchemaVariable[]
    optionsName: string | undefined
    declaration: SourcePosition
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
        declaration: { file, ...positionOf(analysis.sourceFile, call.node) },
      })
    }
  }

  interface DocumentEnvEntry {
    identity: string
    docs: ReturnType<typeof extractContractDocs>
    documentation: SourcePosition
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
      const documentation: SourcePosition = { file, ...positionOf(analysis.sourceFile, call.node) }
      documentEnvByIdentity.set(resolved.identity, {
        identity: resolved.identity,
        docs,
        documentation,
      })
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
        sensitivity: vd?.sensitivity,
        expiresAt: vd?.expiresAt,
        refreshInstructions: vd?.refreshInstructions,
        setupInstructions: vd?.setupInstructions,
        required: vd?.required,
        deprecated: vd?.deprecated,
        deprecatedReason: vd?.deprecatedReason,
        removeBy: vd?.removeBy,
        renamedFrom: vd?.renamedFrom,
        purpose: vd?.purpose,
        legalBasis: vd?.legalBasis,
        retention: vd?.retention,
        dataResidency: vd?.dataResidency,
        auditRequired: vd?.auditRequired,
        metadata: vd?.metadata,
        evidence: vd?.evidence,
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
      sensitivity: docs?.sensitivity,
      expiresAt: docs?.expiresAt,
      deprecated: docs?.deprecated,
      deprecatedReason: docs?.deprecatedReason,
      purpose: docs?.purpose,
      legalBasis: docs?.legalBasis,
      retention: docs?.retention,
      dataResidency: docs?.dataResidency,
      auditRequired: docs?.auditRequired,
      metadata: docs?.metadata,
      packageOrigin: packageOrigins.get(entry.file),
      variables,
      documented: docs !== undefined,
      declaration: entry.declaration,
      documentation: linked?.documentation,
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
 *
 * Structurally typed (not pinned to `DiscoveredContract`/`DiscoveredVariable`)
 * so the same one resolution rule also serves `ContractModelContract`/
 * `ContractModelVariable` (`contract-model.ts`) -- both shapes carry the same
 * field, and this rule must never have two independent implementations.
 */
export function effectiveOwner(
  contract: { readonly owner: string | undefined },
  variable: { readonly owner: string | undefined },
): string | undefined {
  return variable.owner ?? contract.owner
}

/** A variable's sensitivity, falling back to its contract's default -- see {@link effectiveOwner}. */
export function effectiveSensitivity(
  contract: { readonly sensitivity: string | undefined },
  variable: { readonly sensitivity: string | undefined },
): string | undefined {
  return variable.sensitivity ?? contract.sensitivity
}

/** A variable's purpose, falling back to its contract's default -- see {@link effectiveOwner}. */
export function effectivePurpose(
  contract: { readonly purpose: string | undefined },
  variable: { readonly purpose: string | undefined },
): string | undefined {
  return variable.purpose ?? contract.purpose
}

/** A variable's legal basis, falling back to its contract's default -- see {@link effectiveOwner}. */
export function effectiveLegalBasis(
  contract: { readonly legalBasis: string | undefined },
  variable: { readonly legalBasis: string | undefined },
): string | undefined {
  return variable.legalBasis ?? contract.legalBasis
}

/** A variable's retention policy, falling back to its contract's default -- see {@link effectiveOwner}. */
export function effectiveRetention(
  contract: { readonly retention: string | undefined },
  variable: { readonly retention: string | undefined },
): string | undefined {
  return variable.retention ?? contract.retention
}

/** A variable's data residency, falling back to its contract's default -- see {@link effectiveOwner}. */
export function effectiveDataResidency(
  contract: { readonly dataResidency: string | readonly string[] | undefined },
  variable: { readonly dataResidency: string | readonly string[] | undefined },
): string | readonly string[] | undefined {
  return variable.dataResidency ?? contract.dataResidency
}

/** A variable's audit-required assertion, falling back to its contract's default -- see {@link effectiveOwner}. */
export function effectiveAuditRequired(
  contract: { readonly auditRequired: boolean | undefined },
  variable: { readonly auditRequired: boolean | undefined },
): boolean | undefined {
  return variable.auditRequired ?? contract.auditRequired
}
