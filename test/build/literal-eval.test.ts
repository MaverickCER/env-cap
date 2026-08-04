import { describe, it, expect } from "vitest"
import ts from "typescript"
import { evaluateLiteral } from "../../src/build/literal-eval.js"

function expressionOf(sourceExpression: string): ts.Expression {
  const sourceFile = ts.createSourceFile(
    "test.ts",
    `const __x = ${sourceExpression};`,
    ts.ScriptTarget.Latest,
    true,
  )
  const statement = sourceFile.statements[0]
  if (!ts.isVariableStatement(statement)) throw new Error("expected a variable statement")
  const declaration = statement.declarationList.declarations[0]
  if (!declaration.initializer) throw new Error("expected an initializer")
  return declaration.initializer
}

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
