import ts from "typescript"
import { collectImportBindings } from "./parse.js"
import type { ImportBinding } from "./parse.js"

export type AccessSite =
  | { readonly kind: "member"; readonly member: string; readonly line: number }
  | { readonly kind: "dynamic"; readonly line: number }
  | { readonly kind: "reference"; readonly line: number }

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

/**
 * Full recursive AST walk of one arbitrary source file -- unlike `parse.ts`
 * (which only inspects top-level statements for schema-authoring patterns),
 * this needs to see property/element access nested anywhere in the file.
 * Never executes anything; purely structural. Records an access site only
 * for local names the file actually imports -- an identifier that happens to
 * share a name with an imported contract, but was never imported here, is
 * never recorded (no cross-file guessing).
 */
export function scanFileForDependencies(filePath: string, sourceText: string): FileScanResult {
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )

  const imports = new Map<string, ImportBinding>()
  const accesses = new Map<string, AccessSite[]>()
  let hasWildcardReExport = false

  // Every call site below already checks `imports.has(name)` before calling
  // this -- record() trusts that instead of re-checking it.
  function record(localName: string, site: AccessSite): void {
    const sites = accesses.get(localName) ?? []
    sites.push(site)
    accesses.set(localName, sites)
  }

  function lineOf(node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      collectImportBindings(node, imports)
      return
    }

    if (ts.isExportDeclaration(node) && !node.exportClause && node.moduleSpecifier) {
      hasWildcardReExport = true
      return
    }

    if (ts.isPropertyAccessExpression(node)) {
      const base = unwrapParens(node.expression)
      if (ts.isIdentifier(base) && imports.has(base.text)) {
        record(base.text, { kind: "member", member: node.name.text, line: lineOf(node) })
        return // don't also walk `node.expression` as a bare reference
      }
    }

    if (ts.isElementAccessExpression(node)) {
      const base = unwrapParens(node.expression)
      if (ts.isIdentifier(base) && imports.has(base.text)) {
        const key = staticElementKey(node.argumentExpression)
        record(
          base.text,
          key !== undefined
            ? { kind: "member", member: key, line: lineOf(node) }
            : { kind: "dynamic", line: lineOf(node) },
        )
        ts.forEachChild(node.argumentExpression, visit) // the computed key itself might reference other tracked names
        return
      }
    }

    if (ts.isIdentifier(node) && imports.has(node.text)) {
      record(node.text, { kind: "reference", line: lineOf(node) })
      return
    }

    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)

  return { file: filePath, imports, accessesByLocalName: accesses, hasWildcardReExport }
}
