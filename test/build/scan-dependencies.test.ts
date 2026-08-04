import { describe, expect, it } from "vitest"
import { scanFileForDependencies } from "../../src/build/scan-dependencies.js"

// Exercised indirectly (through buildDependencyGraph) by
// test/build/dependency-graph.test.ts -- this file drives
// scanFileForDependencies() directly for the specific structural cases that
// share doesn't cover: an identifier that merely shares a name with an
// import but was never imported here, a named (non-wildcard) re-export, a
// bare `export {}` with no module specifier, and a property/element access
// whose base isn't a tracked import at all.
describe("scanFileForDependencies", () => {
  it("never records an access for a name that was never imported in this file at all", () => {
    const result = scanFileForDependencies("consumer.ts", `otherEnv.STRIPE_KEY;`)
    expect(result.imports.has("otherEnv")).toBe(false)
    expect(result.accessesByLocalName.has("otherEnv")).toBe(false)
  })

  it("is purely syntactic, not scope-aware: a shadowing local declaration with the same name as an import is still recorded as a reference", () => {
    // record() only checks `imports.has(localName)` -- there's no scope
    // tracking, so a shadowed local variable's own declaration identifier is
    // indistinguishable from a real usage of the imported binding. Documented
    // here as the AST-only tool's actual, if slightly surprising, behavior.
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";
       paymentsEnv.STRIPE_KEY;
       function local() {
         const paymentsEnv = { STRIPE_KEY: "shadowed" };
         return paymentsEnv.STRIPE_KEY;
       }`,
    )
    const sites = result.accessesByLocalName.get("paymentsEnv")
    expect(sites).toHaveLength(3)
    expect(sites?.map((s) => s.kind)).toEqual(["member", "reference", "member"])
  })

  it("flags a bare `export * from` as a wildcard re-export", () => {
    const result = scanFileForDependencies("barrel.ts", `export * from "./env.schema.js";`)
    expect(result.hasWildcardReExport).toBe(true)
  })

  it("does not flag a named re-export (`export { x } from ...`) as a wildcard re-export", () => {
    const result = scanFileForDependencies(
      "named.ts",
      `export { paymentsEnv } from "./env.schema.js";`,
    )
    expect(result.hasWildcardReExport).toBe(false)
  })

  it("does not flag a bare `export {}` with no module specifier as a wildcard re-export", () => {
    const result = scanFileForDependencies("local-export.ts", `const x = 1;\nexport { x };`)
    expect(result.hasWildcardReExport).toBe(false)
  })

  it("does not treat a property access on a call result as a member access -- the callee is still visited as a bare reference via the normal child walk", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { getEnv } from "./env.schema.js";
       getEnv().STRIPE_KEY;`,
    )
    expect(result.accessesByLocalName.get("getEnv")).toEqual([{ kind: "reference", line: 2 }])
  })

  it("unwraps a parenthesized base before checking whether it's a tracked import", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";
       (paymentsEnv).STRIPE_KEY;
       (paymentsEnv)["WEBHOOK_SECRET"];`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2 },
      { kind: "member", member: "WEBHOOK_SECRET", line: 3 },
    ])
  })

  it("records a string-literal element-access key on a tracked import as a member access", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";
       paymentsEnv["STRIPE_KEY"];`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2 },
    ])
  })

  it("parses a .tsx file with the TSX script kind", () => {
    const result = scanFileForDependencies(
      "consumer.tsx",
      `import { paymentsEnv } from "./env.schema.js";
       const el = <div>{paymentsEnv.STRIPE_KEY}</div>;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2 },
    ])
  })

  it("does not record an element access whose base is not a tracked import", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";
       const other = {};
       other["STRIPE_KEY"];`,
    )
    expect(result.accessesByLocalName.has("other")).toBe(false)
    expect(result.imports.has("paymentsEnv")).toBe(true)
  })

  it("recurses into a computed element-access key that itself references another tracked import", () => {
    // The recursive call visits the computed key expression's *own direct
    // children* (via ts.forEachChild), not the key expression as a whole --
    // so a bare identifier key (no children of its own) is never separately
    // recorded, but a property-access key like `helpers.NAME` decomposes
    // into its two child nodes (`helpers`, `NAME`), each passed to `visit`
    // independently -- `helpers` lands as a bare "reference", not a "member"
    // access, since the PropertyAccessExpression node itself is never
    // revisited as a unit.
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";
       import { helpers } from "./helpers.js";
       paymentsEnv[helpers.KEY_NAME];`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([{ kind: "dynamic", line: 3 }])
    expect(result.accessesByLocalName.get("helpers")).toEqual([{ kind: "reference", line: 3 }])
  })
})
