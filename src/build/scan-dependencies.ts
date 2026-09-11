import ts from "typescript"
import { collectImportBindings } from "./parse.js"
import type { ImportBinding } from "./parse.js"
import { positionOf } from "./source-position.js"

/**
 * Why a tracked binding's value flowed somewhere this single-file, syntactic
 * walk cannot follow -- see ADR 0039. Each reason names the exact construct
 * so a downstream "cannot determine whether X is read" message can cite it,
 * rather than a single opaque "escape" label.
 */
export type EscapeReason =
  /** `const { ...rest } = contract` -- a rest element captures every remaining key at once. */
  | "rest"
  /** `const { X: { Y } } = contract` -- the bound value itself gets destructured again, one level too deep for this pass. */
  | "nested-pattern"
  /** `const { [expr]: v } = contract` where `expr` isn't a string literal -- the bound key can't be read without evaluating `expr`. */
  | "computed-key"
  /** `const e = contract` where `e` isn't file-unique/never-assigned (see `resolveAliasTargets`) -- the read is real, but this pass declines to follow `e` any further. */
  | "reassignment"

/** One observed use of a tracked contract binding in a consumer file -- see ADR 0039. Consumed by `dependency-graph.ts`. */
export type AccessSite =
  | {
      readonly kind: "member"
      readonly member: string
      readonly line: number
      readonly column: number
    }
  | { readonly kind: "dynamic"; readonly line: number; readonly column: number }
  | { readonly kind: "reference"; readonly line: number; readonly column: number }
  | {
      readonly kind: "escape"
      readonly via: EscapeReason
      readonly line: number
      readonly column: number
    }

export interface FileScanResult {
  readonly file: string
  readonly imports: ReadonlyMap<string, ImportBinding>
  readonly accessesByLocalName: ReadonlyMap<string, readonly AccessSite[]>
  /** True if this file contains a bare `export * from "..."` -- used only to
   *  flag ambiguous barrel forwarding elsewhere as "unresolved", never to
   *  follow it (see ADR 0010's scope boundary). */
  readonly hasWildcardReExport: boolean
}

function unwrapParens(node: ts.Expression): ts.Expression {
  let current = node
  while (ts.isParenthesizedExpression(current)) current = current.expression
  return current
}

function staticElementKey(node: ts.Expression): string | undefined {
  return ts.isStringLiteralLike(node) ? node.text : undefined
}

/** One `const <name> = <identifier>` declaration -- a candidate one-level alias of `<identifier>`, before file-uniqueness/never-assigned checks (see `resolveAliasTargets`). */
interface AliasCandidate {
  readonly aliasName: string
  readonly baseName: string
  readonly declaration: ts.VariableDeclaration
}

/**
 * Recursively invokes `record` with every identifier name a binding pattern
 * introduces -- used only to make `declarationCounts` (see
 * `collectDeclarationFacts`) count a name shadowed via destructuring
 * elsewhere in the file, so a same-named alias candidate is correctly
 * disqualified rather than silently trusted.
 */
function forEachBindingName(name: ts.BindingName, record: (identifierName: string) => void): void {
  if (ts.isIdentifier(name)) {
    record(name.text)
    return
  }
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue
    forEachBindingName(element.name, record)
  }
}

/**
 * Whether `token` is `=` or a compound-assignment operator (`+=`, `??=`,
 * ...). `ts.isAssignmentOperator()` exists at runtime but isn't part of the
 * public `.d.ts` surface (an internal compiler API), so this uses the
 * public `SyntaxKind.FirstAssignment`/`LastAssignment` boundary markers
 * instead -- every assignment-operator token kind is a contiguous range
 * between them.
 */
function isAssignmentToken(token: ts.SyntaxKind): boolean {
  return token >= ts.SyntaxKind.FirstAssignment && token <= ts.SyntaxKind.LastAssignment
}

/** Records `name` as an assignment target if `expression` (after unwrapping parens) is a bare identifier -- shared by the binary-assignment, increment/decrement, and bare-for-of/for-in cases below. */
function recordIfIdentifierTarget(expression: ts.Expression, assignedNames: Set<string>): void {
  const target = unwrapParens(expression)
  // Removing this guard is behaviorally equivalent, not a real gap: an
  // assignment/increment target that isn't an identifier is a member or
  // element access, neither of which has a `.text` property, so
  // `assignedNames.add(target.text)` would add `undefined` -- harmless,
  // since no candidate alias name is ever `undefined`. Hand-verified:
  // mutating this to `if (true)` and running the real suite passes
  // unchanged.
  // Stryker disable next-line ConditionalExpression
  if (ts.isIdentifier(target)) assignedNames.add(target.text)
}

/**
 * Every way this pass recognizes a name as "assigned to" after its
 * declaration: `=`/compound assignment, `++`/`--`, and the keyword-less
 * `for (e of list)`/`for (e in obj)` form (which reuses an existing binding
 * as its loop variable, rather than declaring a fresh one). Deliberately
 * conservative -- missing a real reassignment shape only means a real alias
 * goes untracked (its source binding degrades to an `escape` instead), never
 * the other way around.
 */
function recordAssignmentTargets(node: ts.Node, assignedNames: Set<string>): void {
  if (ts.isBinaryExpression(node) && isAssignmentToken(node.operatorToken.kind)) {
    recordIfIdentifierTarget(node.left, assignedNames)
    return
  }
  if (
    // Widening this to `true` is behaviorally equivalent, not a real gap:
    // only a prefix/postfix unary node carries an `.operator` at all, so on
    // any other node the two `=== PlusPlus/MinusMinus` checks below both
    // read `undefined` and fail. Hand-verified: mutating this compound to
    // `if (true)` and running the real suite passes unchanged.
    // Stryker disable next-line ConditionalExpression
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    recordIfIdentifierTarget(node.operand, assignedNames)
    return
  }
  if (
    (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
    !ts.isVariableDeclarationList(node.initializer)
  ) {
    recordIfIdentifierTarget(node.initializer, assignedNames)
  }
}

/**
 * Counts one declaration-introducing node (a `const`/`let`/`var` declarator,
 * a parameter, or a named function/class) toward `declarationCounts`, and
 * records a plain `const <name> = <identifier>` shape as an alias candidate.
 *
 * A `catch (e)` binding needs no branch of its own -- `CatchClause.
 * variableDeclaration` IS a `ts.VariableDeclaration`, so the walk visits it
 * and the first branch below counts its name like any other.
 */
function recordDeclarationIntroduction(
  node: ts.Node,
  countDeclaration: (name: string) => void,
  constAliasCandidates: AliasCandidate[],
): void {
  if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
    // `forEachBindingName` counts a bare `Identifier` name directly and
    // recurses every identifier a destructuring pattern introduces -- one
    // path for both shapes.
    forEachBindingName(node.name, countDeclaration)
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) return
    if (node.initializer === undefined) return
    const initializer = unwrapParens(node.initializer)
    const isConst = (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) !== 0
    if (isConst && ts.isIdentifier(initializer)) {
      constAliasCandidates.push({
        aliasName: node.name.text,
        baseName: initializer.text,
        declaration: node,
      })
    }
    return
  }
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
    countDeclaration(node.name.text)
  }
}

/**
 * One whole-file pass collecting the three facts `resolveAliasTargets` needs:
 * how many times each name is introduced as *any* kind of binding (a same
 * name declared twice anywhere -- including inside a nested scope, since
 * this pass is deliberately not scope-aware, matching every other check in
 * this file -- disqualifies it as a trackable alias), which names are ever
 * assigned to after their declaration, and every plain `const <name> =
 * <identifier>` declaration as a raw candidate.
 */
function collectDeclarationFacts(sourceFile: ts.SourceFile): {
  readonly declarationCounts: ReadonlyMap<string, number>
  readonly assignedNames: ReadonlySet<string>
  readonly constAliasCandidates: readonly AliasCandidate[]
} {
  const declarationCounts = new Map<string, number>()
  const assignedNames = new Set<string>()
  // A poisoned seed element here is behaviorally equivalent, not a real gap:
  // it would be a plain string, whose `.baseName` reads `undefined`, so
  // `imports.get(undefined)` misses in `resolveAliasTargets` and the entry
  // is skipped before it can reach either the valid or disqualified path.
  // Hand-verified: mutating this and running the real suite passes unchanged.
  // Stryker disable next-line ArrayDeclaration
  const constAliasCandidates: AliasCandidate[] = []

  function countDeclaration(name: string): void {
    declarationCounts.set(name, (declarationCounts.get(name) ?? 0) + 1)
  }

  function walk(node: ts.Node): void {
    recordDeclarationIntroduction(node, countDeclaration, constAliasCandidates)
    recordAssignmentTargets(node, assignedNames)
    ts.forEachChild(node, walk)
  }

  ts.forEachChild(sourceFile, walk)
  return { declarationCounts, assignedNames, constAliasCandidates }
}

/**
 * Narrows raw `const <name> = <identifier>` candidates down to the ones
 * safe to track as a one-level alias of a real tracked import: `<name>`
 * must be declared exactly once anywhere in the file and never assigned to
 * afterward, and `<identifier>` must itself already be a tracked import
 * (never another alias -- deliberately one level, no chains; see ADR 0039).
 * Every candidate that resolves a real import's name but fails the
 * uniqueness/never-assigned check is reported back as an `escape` against
 * that import instead of silently dropped -- `const e = contract` is a real
 * read of `contract` this pass simply declines to follow further.
 */
function resolveAliasTargets(
  candidates: readonly AliasCandidate[],
  declarationCounts: ReadonlyMap<string, number>,
  assignedNames: ReadonlySet<string>,
  imports: ReadonlyMap<string, ImportBinding>,
): {
  readonly aliasBindings: ReadonlyMap<string, ImportBinding>
  readonly disqualified: readonly AliasCandidate[]
  /** Every candidate declaration whose base is a real tracked import -- resolved or not. The main walk must not ALSO walk these as a generic bare reference (see the call site). A `const b = a` chained onto a resolved alias `a` is NOT in here: its base `a` isn't a real import, so it stays a normal walk -- correctly recording `a` as an escape, since this pass never follows the second hop. */
  readonly handledDeclarations: ReadonlySet<ts.Node>
} {
  const aliasBindings = new Map<string, ImportBinding>()
  const disqualified: AliasCandidate[] = []
  const handledDeclarations = new Set<ts.Node>()

  for (const candidate of candidates) {
    const baseBinding = imports.get(candidate.baseName)
    if (baseBinding === undefined || imports.has(candidate.aliasName)) continue
    handledDeclarations.add(candidate.declaration)
    // `declarationCounts.get(candidate.aliasName)` is never `undefined` here --
    // `recordDeclarationIntroduction` always counts a declaration in the same
    // branch where it pushes a `constAliasCandidates` entry for it, so every
    // candidate's own name was counted at least once. `undefined === 1` would
    // evaluate to `false` regardless, so no `?? 0` fallback is needed.
    const isFileUnique = declarationCounts.get(candidate.aliasName) === 1
    const isNeverAssigned = !assignedNames.has(candidate.aliasName)
    if (isFileUnique && isNeverAssigned) {
      aliasBindings.set(candidate.aliasName, baseBinding)
    } else {
      disqualified.push(candidate)
    }
  }

  return { aliasBindings, disqualified, handledDeclarations }
}

/**
 * The property key one object-binding element reads from its (tracked)
 * source: a `string` when it's statically knowable (`{ X }`, `{ X: y }`,
 * `{ "X": y }`, `{ ["X"]: y }`), or the key `ts.Expression` itself when it
 * can't be read without evaluating something (`{ [k]: y }`, `{ [f()]: y }`,
 * `{ 5: y }`) -- the caller records an `escape` and walks that expression
 * for nested tracked references.
 */
function bindingElementKey(element: ts.BindingElement): string | ts.Expression {
  if (element.propertyName === undefined) {
    // Shorthand form (`{ X }`) -- guaranteed an Identifier by the caller's own `ts.isIdentifier(element.name)` check before reaching here for the shorthand case; a renamed shorthand-less form always sets propertyName instead.
    return (element.name as ts.Identifier).text
  }
  if (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)) {
    return element.propertyName.text
  }
  if (ts.isComputedPropertyName(element.propertyName)) {
    const inner = element.propertyName.expression
    return ts.isStringLiteralLike(inner) ? inner.text : inner
  }
  // A NumericLiteral (or any other) propertyName -- mirrors staticElementKey()'s own
  // string-literal-only rule for element access: not statically resolvable to the string keys a
  // contract actually declares.
  return element.propertyName
}

export function scanFileForDependencies(filePath: string, sourceText: string): FileScanResult {
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    // Load-bearing, unlike before: `ts.getCombinedNodeFlags()` (used to tell
    // a `const` declaration apart from `let`/`var` when resolving alias
    // candidates) walks parent pointers internally. Flipping this to `false`
    // now breaks const-detection silently rather than merely being an
    // unobserved no-op -- do not remove parent-pointer tracking here.
    true,
    scriptKind,
  )

  const imports = new Map<string, ImportBinding>()
  let hasWildcardReExport = false
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImportBindings(statement, imports)
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.exportClause &&
      statement.moduleSpecifier
    ) {
      hasWildcardReExport = true
    }
  }

  const accesses = new Map<string, AccessSite[]>()

  // Every call site below already checks `imports.has(name)` before calling
  // this -- record() trusts that instead of re-checking it.
  function record(localName: string, site: AccessSite): void {
    const sites = accesses.get(localName) ?? []
    sites.push(site)
    accesses.set(localName, sites)
  }

  const { declarationCounts, assignedNames, constAliasCandidates } =
    collectDeclarationFacts(sourceFile)
  const { aliasBindings, disqualified, handledDeclarations } = resolveAliasTargets(
    constAliasCandidates,
    declarationCounts,
    assignedNames,
    imports,
  )
  // A validated one-level alias is registered as "just another local name
  // for the same import" -- the main walk below, and every downstream
  // consumer (dependency-graph.ts's pass 1 in particular), then treats
  // `e.X` exactly like `paymentsEnv.X` with zero further special-casing.
  for (const [aliasName, binding] of aliasBindings) {
    imports.set(aliasName, binding)
  }
  for (const candidate of disqualified) {
    record(candidate.baseName, {
      kind: "escape",
      via: "reassignment",
      ...positionOf(sourceFile, candidate.declaration),
    })
  }
  // Every candidate whose base really is a tracked import is now fully
  // accounted for above -- a valid one via its own registered alias name
  // (whose future accesses the main walk records normally), a disqualified
  // one via the explicit `escape` just recorded. Either way, the main walk
  // below must not ALSO record a generic bare "reference" for the
  // declaration's own initializer, which would double-report the exact same
  // read (harmlessly, but redundantly) for a valid alias and, worse, mask
  // WHERE a disqualified one's escape is by duplicating it under a less
  // specific site kind. `handledDeclarations` is exactly that set (see its
  // own doc comment for why a `const b = a` chain is deliberately NOT in it).

  function recordObjectBindingAccesses(pattern: ts.ObjectBindingPattern, localName: string): void {
    for (const element of pattern.elements) {
      if (element.dotDotDotToken) {
        record(localName, { kind: "escape", via: "rest", ...positionOf(sourceFile, element) })
      } else if (!ts.isIdentifier(element.name)) {
        record(localName, {
          kind: "escape",
          via: "nested-pattern",
          ...positionOf(sourceFile, element),
        })
      } else {
        const key = bindingElementKey(element)
        if (typeof key === "string") {
          record(localName, { kind: "member", member: key, ...positionOf(sourceFile, element) })
        } else {
          record(localName, {
            kind: "escape",
            via: "computed-key",
            ...positionOf(sourceFile, element),
          })
          // The computed key expression itself might reference other tracked names.
          ts.forEachChild(key, visit)
        }
      }
      // The guard is a defensive micro-optimization only -- `ts.forEachChild`
      // returns `undefined` for a nullish node without throwing, so dropping
      // the check is behaviorally equivalent. Hand-verified: mutating this to
      // `if (true)` and running the real suite passes unchanged. The
      // block-removal mutant, by contrast, IS caught (a binding element WITH
      // a default value that references a tracked import -- see the test).
      // Stryker disable next-line ConditionalExpression
      if (element.initializer) ts.forEachChild(element.initializer, visit)
    }
  }

  /** `x.MEMBER` / `x["MEMBER"]` / `x[expr]` on a tracked local name `x`. Returns whether a site was recorded (so `visit` stops descending). */
  function tryRecordPropertyOrElementAccess(node: ts.Node): boolean {
    const isProperty = ts.isPropertyAccessExpression(node)
    if (!isProperty && !ts.isElementAccessExpression(node)) return false
    const base = unwrapParens(node.expression)
    if (!ts.isIdentifier(base) || !imports.has(base.text)) return false
    if (isProperty) {
      record(base.text, { kind: "member", member: node.name.text, ...positionOf(sourceFile, node) })
      return true
    }
    const key = staticElementKey(node.argumentExpression)
    record(
      base.text,
      key !== undefined
        ? { kind: "member", member: key, ...positionOf(sourceFile, node) }
        : { kind: "dynamic", ...positionOf(sourceFile, node) },
    )
    ts.forEachChild(node.argumentExpression, visit) // the computed key itself might reference other tracked names
    return true
  }

  function visit(node: ts.Node): void {
    // Import/export declarations are already accounted for (imports /
    // wildcard-re-export); never descend into either, so an import/export
    // specifier's own identifier is never mistaken for a real usage. A
    // VariableDeclaration in `handledDeclarations` is a resolved-or-
    // disqualified alias whose own read of the import is already recorded --
    // see that set's doc comment.
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      (ts.isVariableDeclaration(node) && handledDeclarations.has(node))
    ) {
      return
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const base = unwrapParens(node.initializer)
      if (ts.isIdentifier(base) && imports.has(base.text)) {
        recordObjectBindingAccesses(node.name, base.text)
        return
      }
    }

    if (tryRecordPropertyOrElementAccess(node)) return

    if (ts.isIdentifier(node) && imports.has(node.text)) {
      record(node.text, { kind: "reference", ...positionOf(sourceFile, node) })
      return
    }

    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)

  return { file: filePath, imports, accessesByLocalName: accesses, hasWildcardReExport }
}
