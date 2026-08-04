import ts from "typescript"

/**
 * The result of a literal evaluation: either a real JS value, or `{ ok: false }` when the AST
 * expression wasn't a literal (or contained a non-literal element/property).
 */
export type LiteralEvalResult = { ok: true; value: unknown } | { ok: false }

/**
 * Structurally evaluates a *literal* AST expression (strings, numbers, booleans, null, arrays,
 * and object literals of the same) into a real JS value -- without ever executing code.
 *
 * @remarks
 * Anything that isn't a literal (identifiers, calls, imports, template expressions with
 * interpolation) resolves to `{ ok: false }` rather than being guessed at.
 */
export function evaluateLiteral(node: ts.Expression): LiteralEvalResult {
  if (ts.isStringLiteralLike(node)) return { ok: true, value: node.text }
  if (ts.isNumericLiteral(node)) return { ok: true, value: Number(node.text) }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { ok: true, value: true }
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { ok: true, value: false }
  if (node.kind === ts.SyntaxKind.NullKeyword) return { ok: true, value: null }

  if (ts.isParenthesizedExpression(node)) return evaluateLiteral(node.expression)

  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const operand = evaluateLiteral(node.operand)
    return operand.ok && typeof operand.value === "number"
      ? { ok: true, value: -operand.value }
      : { ok: false }
  }

  if (ts.isArrayLiteralExpression(node)) {
    const values: unknown[] = []
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) return { ok: false }
      const result = evaluateLiteral(element)
      if (!result.ok) return { ok: false }
      values.push(result.value)
    }
    return { ok: true, value: values }
  }

  if (ts.isObjectLiteralExpression(node)) {
    const record: Record<string, unknown> = {}
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) return { ok: false }
      const key = getStaticPropertyName(prop.name)
      if (key === undefined) return { ok: false }
      const result = evaluateLiteral(prop.initializer)
      if (!result.ok) return { ok: false }
      record[key] = result.value
    }
    return { ok: true, value: record }
  }

  return { ok: false }
}

/** Reads a property name statically (identifier, string literal, or numeric literal) -- a computed key (e.g. `[expr]`) resolves to `undefined` rather than being guessed at. */
export function getStaticPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteralLike(name)) return name.text
  if (ts.isNumericLiteral(name)) return name.text
  return undefined
}
