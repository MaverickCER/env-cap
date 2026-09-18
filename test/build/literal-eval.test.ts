import { describe, it, expect } from "vitest"
import ts from "typescript"
import { evaluateLiteral, getStaticPropertyName } from "../../src/build/literal-eval.js"

function expressionOf(sourceExpression: string): ts.Expression {
  const sourceFile = ts.createSourceFile(
    "test.ts",
    `const __x = ${sourceExpression};`,
    ts.ScriptTarget.Latest,
    true,
  )
  const statement = sourceFile.statements[0]
  if (statement === undefined || !ts.isVariableStatement(statement)) {
    throw new Error("expected a variable statement")
  }
  const declaration = statement.declarationList.declarations[0]
  if (!declaration?.initializer) {
    throw new Error("expected an initializer")
  }
  return declaration.initializer
}

function propertyNameOf(objectLiteralExpression: string): ts.PropertyName {
  const obj = expressionOf(objectLiteralExpression)
  if (!ts.isObjectLiteralExpression(obj)) throw new Error("expected an object literal expression")
  const prop = obj.properties[0]
  if (prop === undefined || !ts.isPropertyAssignment(prop)) {
    throw new Error("expected a property assignment")
  }
  return prop.name
}

describe("getStaticPropertyName", () => {
  it("reads an identifier key's text", () => {
    expect(getStaticPropertyName(propertyNameOf(`{ description: 1 }`))).toBe("description")
  })

  it("reads a string-literal key's text", () => {
    expect(getStaticPropertyName(propertyNameOf(`{ "has spaces": 1 }`))).toBe("has spaces")
  })

  it("reads a numeric-literal key's text", () => {
    expect(getStaticPropertyName(propertyNameOf(`{ 42: 1 }`))).toBe("42")
  })

  it("returns undefined for a computed key", () => {
    expect(getStaticPropertyName(propertyNameOf(`{ [someExpr]: 1 }`))).toBeUndefined()
  })

  it("returns undefined for a private-identifier-shaped key -- syntactically parseable (TS's error-tolerant parser still produces a PrivateIdentifier node here), even though it's not valid outside a class body", () => {
    // Every OTHER recognized `PropertyName` kind (Identifier, StringLiteral,
    // NumericLiteral) happens to share the exact same `.text` semantics, so
    // this is the one input that actually distinguishes "properly matched
    // by its own specific type guard" from "coincidentally read `.text` off
    // whichever guard matched first" -- a `PrivateIdentifier`'s `.text`
    // (`"#foo"`, confirmed via a real parse) is neither `undefined` nor any
    // other branch's value, so only the real, unmutated chain of checks
    // correctly falls through to `undefined` for it.
    expect(getStaticPropertyName(propertyNameOf(`{ #foo: 1 }`))).toBeUndefined()
  })
})

describe("evaluateLiteral", () => {
  it("resolves string, number, boolean, and null literals", () => {
    expect(evaluateLiteral(expressionOf(`"hello"`))).toEqual({ ok: true, value: "hello" })
    expect(evaluateLiteral(expressionOf(`42`))).toEqual({ ok: true, value: 42 })
    expect(evaluateLiteral(expressionOf(`true`))).toEqual({ ok: true, value: true })
    expect(evaluateLiteral(expressionOf(`false`))).toEqual({ ok: true, value: false })
    expect(evaluateLiteral(expressionOf(`null`))).toEqual({ ok: true, value: null })
  })

  it("resolves negative numbers and parenthesized expressions", () => {
    expect(evaluateLiteral(expressionOf(`-1`))).toEqual({ ok: true, value: -1 })
    expect(evaluateLiteral(expressionOf(`("nested")`))).toEqual({ ok: true, value: "nested" })
  })

  it("resolves arrays and nested object literals", () => {
    expect(evaluateLiteral(expressionOf(`["a", "b", 1]`))).toEqual({
      ok: true,
      value: ["a", "b", 1],
    })
    expect(evaluateLiteral(expressionOf(`{ a: 1, b: { c: "x" } }`))).toEqual({
      ok: true,
      value: { a: 1, b: { c: "x" } },
    })
  })

  it("resolves object literals with string-literal keys", () => {
    expect(evaluateLiteral(expressionOf(`{ "description": "hi" }`))).toEqual({
      ok: true,
      value: { description: "hi" },
    })
  })

  it("does not resolve identifiers, calls, or other non-literal expressions", () => {
    expect(evaluateLiteral(expressionOf(`someIdentifier`))).toEqual({ ok: false })
    expect(evaluateLiteral(expressionOf(`someFunction()`))).toEqual({ ok: false })
    expect(evaluateLiteral(expressionOf(`\`template \${value}\``))).toEqual({ ok: false })
  })

  it("does not resolve arrays or objects containing a spread element", () => {
    expect(evaluateLiteral(expressionOf(`[1, ...rest]`))).toEqual({ ok: false })
    expect(evaluateLiteral(expressionOf(`({ a: 1, ...rest })`))).toEqual({ ok: false })
  })

  it("does not resolve an object literal containing a non-literal value", () => {
    expect(evaluateLiteral(expressionOf(`{ a: someIdentifier }`))).toEqual({ ok: false })
  })

  it("does not resolve computed property keys", () => {
    expect(evaluateLiteral(expressionOf(`{ [someKey]: "value" }`))).toEqual({ ok: false })
  })

  it("does not resolve a unary minus applied to a non-number", () => {
    expect(evaluateLiteral(expressionOf(`-someIdentifier`))).toEqual({ ok: false })
    expect(evaluateLiteral(expressionOf(`-"1"`))).toEqual({ ok: false })
  })

  it("does not resolve a DIFFERENT prefix unary operator, even applied to a real number literal -- only a leading minus is a resolvable literal", () => {
    // `+1`/`~1`/`!1` are all `ts.isPrefixUnaryExpression` too; only the
    // specific `MinusToken` operator is meant to resolve.
    expect(evaluateLiteral(expressionOf(`+1`))).toEqual({ ok: false })
    expect(evaluateLiteral(expressionOf(`~1`))).toEqual({ ok: false })
  })

  it("does not resolve an array containing a non-literal, non-spread element", () => {
    expect(evaluateLiteral(expressionOf(`[1, someIdentifier]`))).toEqual({ ok: false })
  })

  it("resolves an object literal with a numeric-literal key", () => {
    expect(evaluateLiteral(expressionOf(`{ 0: "zero" }`))).toEqual({
      ok: true,
      value: { "0": "zero" },
    })
  })
})
