import ts from "typescript"
import { evaluateLiteral, getStaticPropertyName } from "./literal-eval.js"

/**
 * A quoted or computed property name (e.g. `"FOO\nBAR"`) can hold arbitrary
 * text, not just a valid identifier. Since a discovered key is later written
 * verbatim into generated docs/.env.example (as `KEY=` lines and Markdown
 * headings) and is used as the schema's own object key at runtime, reject
 * anything that isn't a plausible env var name up front rather than letting
 * stray whitespace/`=`/etc. propagate into generated files.
 */
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** A recoverable issue found while statically parsing or linking one schema file -- never fatal, always surfaced to the caller as data. */
export interface ParseWarning {
  /** Absolute path of the file the warning applies to. */
  readonly file: string
  /** Human-readable explanation of what was skipped and why. */
  readonly message: string
}

/**
 * How a `createEnv`/`documentEnv` call's first argument resolves, before any
 * cross-file linking is attempted (that's `link.ts`'s job, not this file's --
 * this module only ever looks at one file's own AST).
 */
export type SchemaRef =
  | {
      /** Discriminant: the schema argument is an inline object literal. */
      readonly kind: "literal"
      /** The object literal AST node itself. */
      readonly node: ts.ObjectLiteralExpression
    }
  | {
      /** Discriminant: the schema argument is a bare identifier referencing a local `const`. */
      readonly kind: "identifier"
      /** The referenced identifier's name, not yet resolved to a declaration. */
      readonly name: string
    }
  | {
      /** Discriminant: the schema argument isn't statically resolvable (not a literal or identifier). */
      readonly kind: "unresolvable"
    }

/** One `createEnv(...)` call site, as found by {@link parseSchemaFile}, before cross-file linking. */
export interface RawCreateEnvCall {
  /** The binding name the call result is assigned to (must be exported to be usable -- see {@link parseSchemaFile}). */
  readonly exportName: string
  /** How the first (schema) argument resolves within this file. */
  readonly schemaRef: SchemaRef
  /** The second (options) argument expression, if the call passes one. */
  readonly optionsArg: ts.Expression | undefined
  /** The full call expression AST node. */
  readonly node: ts.CallExpression
}

/** One `documentEnv(...)` call site, as found by {@link parseSchemaFile}, before cross-file linking. */
export interface RawDocumentEnvCall {
  /** How the first (schema) argument resolves within this file. */
  readonly schemaRef: SchemaRef
  /** The second (docs) argument expression, if the call passes one. */
  readonly docsArg: ts.Expression | undefined
  /** The full call expression AST node. */
  readonly node: ts.CallExpression
}

/** One named import binding, tracked only for relative specifiers (see {@link FileParseResult.imports}). */
export interface ImportBinding {
  /** The raw module specifier as written in the import (e.g. `"./payments.schema.js"`). */
  readonly specifier: string
  /** The name as exported by the source module -- accounts for `import { real as local }`. */
  readonly importedName: string
}

/** The raw, single-file facts extracted by {@link parseSchemaFile}. */
export interface FileParseResult {
  /** Absolute path of the parsed file. */
  readonly file: string
  /** The TypeScript AST for this file, reused by callers that need to inspect it further. */
  readonly sourceFile: ts.SourceFile
  /** Top-level `const NAME = {...}` object-literal declarations, whether exported or not. */
  readonly localConsts: ReadonlyMap<string, ts.ObjectLiteralExpression>
  /** Names of top-level `const` declarations that are exported (a subset of {@link localConsts}'s keys, plus non-object-literal exports). */
  readonly exportedConstNames: ReadonlySet<string>
  /** Local binding name -> where it came from. Only named imports of a relative specifier are tracked (namespace/default/bare-package imports are irrelevant to schema linking). */
  readonly imports: ReadonlyMap<string, ImportBinding>
  /** Every `createEnv(...)` call site found at the top level of this file. */
  readonly createEnvCalls: readonly RawCreateEnvCall[]
  /** Every `documentEnv(...)` call site found at the top level of this file. */
  readonly documentEnvCalls: readonly RawDocumentEnvCall[]
  /** Recoverable issues found while parsing this file. */
  readonly warnings: readonly ParseWarning[]
}

/**
 * Structurally parses one file's AST for everything the generator needs:
 * `createEnv(...)`/`documentEnv(...)` call sites, the local `const`
 * declarations and imports needed to resolve an identifier passed to either
 * of them.
 *
 * @remarks
 * Never type-checks or executes the file -- see `link.ts` for how
 * these raw facts get resolved into actual schema/docs data, including
 * across files.
 */
export function parseSchemaFile(filePath: string, sourceText: string): FileParseResult {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const warnings: ParseWarning[] = []

  const localConsts = new Map<string, ts.ObjectLiteralExpression>()
  const exportedConstNames = new Set<string>()
  const imports = new Map<string, ImportBinding>()
  const createEnvCalls: RawCreateEnvCall[] = []
  const documentEnvCalls: RawDocumentEnvCall[] = []

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImportBindings(statement, imports)
      continue
    }

    if (!ts.isVariableStatement(statement)) continue
    const isExported =
      statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false

    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
      const bindingName = decl.name.text

      if (ts.isObjectLiteralExpression(decl.initializer)) {
        localConsts.set(bindingName, decl.initializer)
        if (isExported) exportedConstNames.add(bindingName)
        continue
      }

      if (ts.isCallExpression(decl.initializer)) {
        if (isCallToName(decl.initializer, "createEnv")) {
          if (!isExported) {
            warnings.push({
              file: filePath,
              message: `createEnv() call for "${bindingName}" is not exported; it can never be included in a generated manifest, so it's skipped entirely.`,
            })
            continue
          }
          const [schemaArg, optionsArg] = decl.initializer.arguments
          createEnvCalls.push({
            exportName: bindingName,
            schemaRef: resolveSchemaRef(schemaArg),
            optionsArg,
            node: decl.initializer,
          })
        } else if (isCallToName(decl.initializer, "documentEnv")) {
          // `const x = documentEnv(...)` is unusual (it returns void) but not
          // an error -- treat it the same as a bare statement below.
          const [schemaArg, docsArg] = decl.initializer.arguments
          documentEnvCalls.push({
            schemaRef: resolveSchemaRef(schemaArg),
            docsArg,
            node: decl.initializer,
          })
        }
      }
    }
  }

  // documentEnv is normally a bare top-level statement: `documentEnv(schema, {...});`
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) continue
    const expr = statement.expression
    if (!ts.isCallExpression(expr) || !isCallToName(expr, "documentEnv")) continue
    const [schemaArg, docsArg] = expr.arguments
    documentEnvCalls.push({ schemaRef: resolveSchemaRef(schemaArg), docsArg, node: expr })
  }

  return {
    file: filePath,
    sourceFile,
    localConsts,
    exportedConstNames,
    imports,
    createEnvCalls,
    documentEnvCalls,
    warnings,
  }
}

function resolveSchemaRef(node: ts.Expression | undefined): SchemaRef {
  if (!node) return { kind: "unresolvable" }
  if (ts.isObjectLiteralExpression(node)) return { kind: "literal", node }
  if (ts.isIdentifier(node)) return { kind: "identifier", name: node.text }
  return { kind: "unresolvable" }
}

/**
 * Collects named import bindings from one `import` statement into `imports`, keyed by local name.
 *
 * @remarks
 * Exported for reuse by `scan-dependencies.ts`, which needs the same
 * alias-aware named-import tracking this file already does for schema
 * linking, just applied to arbitrary application source instead of schema
 * files.
 *
 * @param imports - Mutated in place; a binding re-collected under the same local name overwrites the previous entry.
 */
export function collectImportBindings(
  statement: ts.ImportDeclaration,
  imports: Map<string, ImportBinding>,
): void {
  if (!ts.isStringLiteralLike(statement.moduleSpecifier)) return
  const specifier = statement.moduleSpecifier.text
  const namedBindings = statement.importClause?.namedBindings
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return

  for (const element of namedBindings.elements) {
    const localName = element.name.text
    const importedName = element.propertyName?.text ?? localName
    imports.set(localName, { specifier, importedName })
  }
}

function isCallToName(call: ts.CallExpression, name: string): boolean {
  const expr = call.expression
  if (ts.isIdentifier(expr)) return expr.text === name
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === name
  return false
}

/**
 * A quoted or computed property name (e.g. `"FOO\nBAR"`) can hold arbitrary
 * text -- reject anything that isn't a plausible env var name rather than
 * letting it propagate into generated files.
 */
export function isValidEnvKey(key: string): boolean {
  return ENV_KEY_PATTERN.test(key)
}

/** One schema entry's statically-discoverable shape -- presence facts, never evaluated/executed values. */
export interface DiscoveredSchemaVariable {
  /** The environment variable name (the schema's object key). */
  readonly key: string
  /** Whether the entry declares a `default`. */
  readonly hasDefault: boolean
  /** The default's statically-evaluated literal value, if `hasDefault` and it was a literal we could evaluate -- `{ ok: false }` when present but not statically resolvable, `undefined` when absent. */
  readonly defaultValue:
    | {
        /** Always `true` in this branch. */
        ok: true
        /** The evaluated literal value. */
        value: unknown
      }
    | {
        /** Always `false` in this branch: present but not statically resolvable. */
        ok: false
      }
    | undefined
  /** Whether the entry declares a `processor`. */
  readonly hasProcessor: boolean
  /** The processor function's source text, normalized to single-line, if `hasProcessor`. */
  readonly processorSource: string | undefined
  /** Only present when the processor has an explicit `: T` return type annotation -- the one thing we treat as provable. */
  readonly processorReturnType: string | undefined
  /** Whether the entry declares a `validator`. */
  readonly hasValidator: boolean
  /** The validator function's source text, normalized to single-line, if `hasValidator`. */
  readonly validatorSource: string | undefined
  /** The variable's statically-resolved `context`, if set to a non-empty string literal (see ADR 0022). `undefined` when absent, non-literal, or empty. */
  readonly context: string | undefined
}

/**
 * Extracts one schema object literal's variables (processor/validator/default presence); never
 * evaluates or executes the schema.
 *
 * @param contextLabel - Used only to build human-readable warning messages (e.g. the contract's export name).
 * @param warnings - Mutated in place: one entry is pushed per skipped (non-static, invalid-key, or non-literal) property.
 */
export function extractSchemaVariables(
  schemaLiteral: ts.ObjectLiteralExpression,
  filePath: string,
  contextLabel: string,
  warnings: ParseWarning[],
): DiscoveredSchemaVariable[] {
  const variables: DiscoveredSchemaVariable[] = []

  for (const prop of schemaLiteral.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      warnings.push({
        file: filePath,
        message: `Skipped a non-static schema entry in "${contextLabel}" (spread or computed key are not statically analyzable).`,
      })
      continue
    }
    const key = getStaticPropertyName(prop.name)
    if (key === undefined) continue

    if (!isValidEnvKey(key)) {
      warnings.push({
        file: filePath,
        message: `Skipped "${key}" in "${contextLabel}": not a valid environment variable name (expected ${ENV_KEY_PATTERN.toString()}); it will never appear in generated docs or .env.example output.`,
      })
      continue
    }

    if (!ts.isObjectLiteralExpression(prop.initializer)) {
      warnings.push({
        file: filePath,
        message: `Definition for "${key}" in "${contextLabel}" is not an inline object literal; skipping static analysis for this variable.`,
      })
      continue
    }

    variables.push(extractSchemaVariable(key, prop.initializer, filePath, contextLabel, warnings))
  }

  return variables
}

function extractSchemaVariable(
  key: string,
  definition: ts.ObjectLiteralExpression,
  filePath: string,
  contextLabel: string,
  warnings: ParseWarning[],
): DiscoveredSchemaVariable {
  let hasDefault = false
  let defaultValue: DiscoveredSchemaVariable["defaultValue"]
  let hasProcessor = false
  let processorSource: string | undefined
  let processorReturnType: string | undefined
  let hasValidator = false
  let validatorSource: string | undefined
  let context: string | undefined

  for (const prop of definition.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const name = getStaticPropertyName(prop.name)

    if (name === "default") {
      hasDefault = true
      defaultValue = evaluateLiteral(prop.initializer)
    } else if (name === "processor") {
      hasProcessor = true
      processorSource = normalizeSource(prop.initializer.getText())
      processorReturnType = extractReturnType(prop.initializer)
    } else if (name === "validator") {
      hasValidator = true
      validatorSource = normalizeSource(prop.initializer.getText())
    } else if (name === "context") {
      // Never executed (ADR 0002) -- a non-literal (e.g. `context:
      // getContext()`) is skipped entirely, same "warn/skip, never guess,
      // never execute" policy as every other field here.
      const evaluated = evaluateLiteral(prop.initializer)
      if (evaluated.ok && typeof evaluated.value === "string" && evaluated.value.length > 0) {
        context = evaluated.value
      } else {
        warnings.push({
          file: filePath,
          message:
            evaluated.ok && evaluated.value === ""
              ? `"context" for "${key}" in "${contextLabel}" is an empty string; ignoring it -- validation contexts must be non-empty.`
              : `"context" for "${key}" in "${contextLabel}" is not a statically-resolvable string literal; ignoring it.`,
        })
      }
    }
  }

  return {
    key,
    hasDefault,
    defaultValue,
    hasProcessor,
    processorSource,
    processorReturnType,
    hasValidator,
    validatorSource,
    context,
  }
}

function extractReturnType(node: ts.Expression): string | undefined {
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.type) {
    return node.type.getText().replace(/\s+/g, "")
  }
  return undefined
}

function normalizeSource(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** One variable's statically-extracted `documentEnv()` documentation, as declared in that call's `variables` entry for this key. */
export interface DiscoveredVariableDocs {
  /** The environment variable name this documentation applies to. */
  readonly key: string
  /** Statically-resolved `description`, if set to a string literal. */
  readonly description: string | undefined
  /** Statically-resolved `owner`, if set to a string literal. */
  readonly owner: string | undefined
  /** Statically-resolved `expiresAt`, if set to a string literal. */
  readonly expiresAt: string | undefined
  /** Statically-resolved `refreshInstructions`, if set to a string literal. */
  readonly refreshInstructions: string | undefined
  /** Statically-resolved `required`, if set to a boolean literal. */
  readonly required: boolean | undefined
  /** Fields other than the known {@link runtime.VariableDocs} keys, keyed by field name. */
  readonly extra: Readonly<Record<string, string>>
}

/** A contract's statically-extracted `documentEnv()` documentation. */
export interface DiscoveredContractDocs {
  /** Statically-resolved `name`, if set to a string literal. */
  readonly name: string | undefined
  /** Statically-resolved `category`, if set to a string literal. */
  readonly category: string | undefined
  /** Statically-resolved `exclusiveGroup`, if set to a string literal. */
  readonly exclusiveGroup: string | undefined
  /** Defaults to `true` when the call's `active` field is absent or not statically resolvable. */
  readonly active: boolean
  /** Statically-resolved `owner`, if set to a string literal. */
  readonly owner: string | undefined
  /** Statically-resolved `expiresAt`, if set to a string literal. */
  readonly expiresAt: string | undefined
  /** Statically-resolved `metadata`, if set to a string-valued object literal. */
  readonly metadata: Readonly<Record<string, string>> | undefined
  /** Per-variable documentation, keyed by variable name. */
  readonly variables: ReadonlyMap<string, DiscoveredVariableDocs>
}

const KNOWN_VARIABLE_DOC_KEYS = new Set([
  "description",
  "owner",
  "expiresAt",
  "refreshInstructions",
  "required",
])

/**
 * Reads a `documentEnv()` call's second argument (the {@link runtime.ContractDocs} shape).
 *
 * @remarks
 * Anything not a statically-resolvable literal warns and is skipped (falls back to
 * "not set") rather than guessed at, same policy as schema-entry parsing.
 *
 * @param contextLabel - Used only to build human-readable warning messages.
 * @param warnings - Mutated in place: one entry is pushed per unresolvable field.
 */
export function extractContractDocs(
  docsArg: ts.Expression | undefined,
  filePath: string,
  contextLabel: string,
  warnings: ParseWarning[],
): DiscoveredContractDocs {
  let name: string | undefined
  let category: string | undefined
  let exclusiveGroup: string | undefined
  let active = true
  let owner: string | undefined
  let expiresAt: string | undefined
  let metadata: Record<string, string> | undefined
  const variables = new Map<string, DiscoveredVariableDocs>()

  if (!docsArg || !ts.isObjectLiteralExpression(docsArg)) {
    if (docsArg) {
      warnings.push({
        file: filePath,
        message: `documentEnv() call for "${contextLabel}" does not pass an inline object literal as its second argument; skipping it entirely.`,
      })
    }
    return { name, category, exclusiveGroup, active, owner, expiresAt, metadata, variables }
  }

  for (const prop of docsArg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const propName = getStaticPropertyName(prop.name)

    if (propName === "name") {
      const evaluated = evaluateLiteral(prop.initializer)
      if (evaluated.ok && typeof evaluated.value === "string") name = evaluated.value
    } else if (propName === "category") {
      const evaluated = evaluateLiteral(prop.initializer)
      if (evaluated.ok && typeof evaluated.value === "string") {
        category = evaluated.value
      } else {
        warnings.push({
          file: filePath,
          message: `"category" for "${contextLabel}" is not a statically-resolvable string literal; ignoring it.`,
        })
      }
    } else if (propName === "exclusiveGroup") {
      const evaluated = evaluateLiteral(prop.initializer)
      if (evaluated.ok && typeof evaluated.value === "string") {
        exclusiveGroup = evaluated.value
      } else {
        warnings.push({
          file: filePath,
          message: `"exclusiveGroup" for "${contextLabel}" is not a statically-resolvable string literal; ignoring it.`,
        })
      }
    } else if (propName === "active") {
      const evaluated = evaluateLiteral(prop.initializer)
      if (evaluated.ok && typeof evaluated.value === "boolean") {
        active = evaluated.value
      } else {
        warnings.push({
          file: filePath,
          message: `"active" for "${contextLabel}" is not a statically-resolvable boolean literal; defaulting to active: true.`,
        })
      }
    } else if (propName === "owner") {
      const evaluated = evaluateLiteral(prop.initializer)
      if (evaluated.ok && typeof evaluated.value === "string") owner = evaluated.value
    } else if (propName === "expiresAt") {
      const evaluated = evaluateLiteral(prop.initializer)
      if (evaluated.ok && typeof evaluated.value === "string") {
        expiresAt = evaluated.value
      } else {
        warnings.push({
          file: filePath,
          message: `"expiresAt" for "${contextLabel}" is not a statically-resolvable string literal; ignoring it.`,
        })
      }
    } else if (propName === "metadata") {
      const evaluated = evaluateLiteral(prop.initializer)
      if (evaluated.ok && isStringRecord(evaluated.value)) {
        metadata = evaluated.value
      } else {
        warnings.push({
          file: filePath,
          message: `"metadata" for "${contextLabel}" is not a statically-resolvable string record; ignoring it.`,
        })
      }
    } else if (propName === "variables") {
      if (ts.isObjectLiteralExpression(prop.initializer)) {
        extractVariableDocsMap(prop.initializer, filePath, contextLabel, warnings, variables)
      } else {
        warnings.push({
          file: filePath,
          message: `"variables" for "${contextLabel}" is not an inline object literal; per-variable documentation is skipped entirely.`,
        })
      }
    }
  }

  return { name, category, exclusiveGroup, active, owner, expiresAt, metadata, variables }
}

function extractVariableDocsMap(
  variablesLiteral: ts.ObjectLiteralExpression,
  filePath: string,
  contextLabel: string,
  warnings: ParseWarning[],
  out: Map<string, DiscoveredVariableDocs>,
): void {
  for (const prop of variablesLiteral.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const key = getStaticPropertyName(prop.name)
    if (key === undefined) continue
    if (!ts.isObjectLiteralExpression(prop.initializer)) {
      warnings.push({
        file: filePath,
        message: `documentEnv() variable docs for "${key}" in "${contextLabel}" is not an inline object literal; skipped.`,
      })
      continue
    }

    let description: string | undefined
    let owner: string | undefined
    let expiresAt: string | undefined
    let refreshInstructions: string | undefined
    let required: boolean | undefined
    const extra: Record<string, string> = {}

    for (const field of prop.initializer.properties) {
      if (!ts.isPropertyAssignment(field)) continue
      const fieldName = getStaticPropertyName(field.name)
      if (fieldName === undefined) continue
      const evaluated = evaluateLiteral(field.initializer)
      if (!evaluated.ok) continue

      if (fieldName === "description" && typeof evaluated.value === "string")
        description = evaluated.value
      else if (fieldName === "owner" && typeof evaluated.value === "string") owner = evaluated.value
      else if (fieldName === "expiresAt" && typeof evaluated.value === "string")
        expiresAt = evaluated.value
      else if (fieldName === "refreshInstructions" && typeof evaluated.value === "string")
        refreshInstructions = evaluated.value
      else if (fieldName === "required" && typeof evaluated.value === "boolean")
        required = evaluated.value
      else if (!KNOWN_VARIABLE_DOC_KEYS.has(fieldName) && typeof evaluated.value === "string")
        extra[fieldName] = evaluated.value
    }

    out.set(key, { key, description, owner, expiresAt, refreshInstructions, required, extra })
  }
}

/** Reads `createEnv`'s second argument (the {@link runtime.CreateEnvOptions} shape) for just `name`, if it's a statically-resolvable string literal. Used only for the docs fallback chain (`documentEnv`'s `name` wins if set); `source` is runtime-only and never read here. */
export function extractCreateEnvOptionsName(
  optionsArg: ts.Expression | undefined,
): string | undefined {
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return undefined
  for (const prop of optionsArg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (getStaticPropertyName(prop.name) !== "name") continue
    const evaluated = evaluateLiteral(prop.initializer)
    if (evaluated.ok && typeof evaluated.value === "string") return evaluated.value
  }
  return undefined
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  return Object.values(value).every((v) => typeof v === "string")
}
