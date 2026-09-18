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
    expect(result.accessesByLocalName.get("getEnv")).toEqual([
      { kind: "reference", line: 2, column: 8 },
    ])
  })

  it("records a plain dot-notation property access on a tracked import as a member access, and nothing else", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\npaymentsEnv.STRIPE_KEY;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 1 },
    ])
  })

  it("unwraps a parenthesized base before checking whether it's a tracked import", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";
       (paymentsEnv).STRIPE_KEY;
       (paymentsEnv)["WEBHOOK_SECRET"];`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 8 },
      { kind: "member", member: "WEBHOOK_SECRET", line: 3, column: 8 },
    ])
  })

  it("records a string-literal element-access key on a tracked import as a member access", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";
       paymentsEnv["STRIPE_KEY"];`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 8 },
    ])
  })

  it("parses a .tsx file with the TSX script kind", () => {
    const result = scanFileForDependencies(
      "consumer.tsx",
      `import { paymentsEnv } from "./env.schema.js";
       const el = <div>{paymentsEnv.STRIPE_KEY}</div>;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 25 },
    ])
  })

  it("parses a plain .ts file (not .tsx) with the TS script kind, not TSX -- an old-style angle-bracket cast only parses correctly under TS", () => {
    // `<string>paymentsEnv` is TS's legacy angle-bracket type-assertion
    // syntax -- ambiguous with a JSX opening tag, so under `ScriptKind.TSX`
    // it parses completely differently (a real TypeScript compiler probe
    // confirms 2 parse errors and a `ParenthesizedExpression`, not a member
    // access at all) -- the one shape that actually distinguishes ".ts"
    // from ".tsx" script-kind selection (JSX-free code parses identically
    // under either kind, and the existing .tsx test's own JSX syntax would
    // fail outright under TS, so neither alone proves BOTH directions).
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";
       const key = (<string>paymentsEnv).STRIPE_KEY;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "reference", line: 2, column: 29 },
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
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "dynamic", line: 3, column: 8 },
    ])
    expect(result.accessesByLocalName.get("helpers")).toEqual([
      { kind: "reference", line: 3, column: 20 },
    ])
  })
})

// ADR 0039: object-binding destructuring and one-level `const` aliasing are
// followed as real member access; every shape this pass can't safely follow
// (a computed key, a rest/nested binding, a disqualified alias) emits an
// explicit "escape" site instead of silently recording nothing -- see
// dependency-graph.test.ts for how these feed per-variable status.
describe("local dataflow: destructuring and one-level aliasing (ADR 0039)", () => {
  it("records a shorthand destructured key as a member access, keyed by the property name", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst { STRIPE_KEY } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 9 },
    ])
  })

  it("records a renamed destructured key by its property name, never the local binding name", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst { STRIPE_KEY: key } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 9 },
    ])
  })

  it("records a string-literal computed destructuring key as a member access", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst { ["STRIPE_KEY"]: key } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 9 },
    ])
  })

  it("never infers a key from a non-literal computed destructuring key -- escape, not a guess", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst k = getKey();\nconst { [k]: key } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "computed-key", line: 3, column: 9 },
    ])
  })

  it("recurses into a computed destructuring key that itself references another tracked import", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";
       import { helpers } from "./helpers.js";
       const { [helpers.KEY_NAME]: key } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "computed-key", line: 3, column: 16 },
    ])
    expect(result.accessesByLocalName.get("helpers")).toEqual([
      { kind: "reference", line: 3, column: 17 },
    ])
  })

  it("emits a rest-binding escape alongside a sibling plain key's own proven member access", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst { STRIPE_KEY, ...rest } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 9 },
      { kind: "escape", via: "rest", line: 2, column: 21 },
    ])
  })

  it("emits a nested-pattern escape for a binding element destructured one level too deep", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst { DB: { HOST } } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "nested-pattern", line: 2, column: 9 },
    ])
  })

  it("mixes a proven key, a nested-pattern escape, and a rest escape from one destructuring pattern -- each element judged independently", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst { X, Y: { Z }, ...rest } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "X", line: 2, column: 9 },
      { kind: "escape", via: "nested-pattern", line: 2, column: 12 },
      { kind: "escape", via: "rest", line: 2, column: 22 },
    ])
  })

  it("tracks a file-unique, never-assigned const alias as another local name for the same import -- its member accesses attribute back to the alias's own local name, with no extra reference recorded against the original import", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;`,
    )
    expect(result.imports.get("e")).toEqual(result.imports.get("paymentsEnv"))
    expect(result.accessesByLocalName.get("e")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 3, column: 1 },
    ])
    expect(result.accessesByLocalName.has("paymentsEnv")).toBe(false)
  })

  it("never tracks a let-declared alias -- the declaration's own read of the import still surfaces as an escape via the ordinary bare-reference path", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nlet e = paymentsEnv;\ne.STRIPE_KEY;`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "reference", line: 2, column: 9 },
    ])
    // `e` itself was never registered as a tracked name, so `e.STRIPE_KEY` is invisible to this scan.
    expect(result.accessesByLocalName.has("e")).toBe(false)
  })

  it("disqualifies a const alias that's assigned to after its declaration, emitting exactly one escape against the original import (no duplicate reference)", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne = other;\ne.STRIPE_KEY;`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("disqualifies a const alias name that's declared more than once anywhere in the file (deliberately not scope-aware, matching every other check in this file)", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\nfunction f() {\n  const e = {};\n  return e;\n}`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("tracks a valid alias passed bare as a function argument -- recorded as a reference under the alias's own name, resolving through the same import binding downstream", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\nsomeFn(e);`,
    )
    expect(result.imports.get("e")).toEqual(result.imports.get("paymentsEnv"))
    expect(result.accessesByLocalName.get("e")).toEqual([{ kind: "reference", line: 3, column: 8 }])
  })

  it("records an object-spread of a tracked import as a bare reference, via the ordinary identifier fallback -- no special-casing needed", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst merged = { ...paymentsEnv };`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "reference", line: 2, column: 21 },
    ])
  })

  it("disqualifies a const alias name that collides with a catch clause's own parameter name", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\ntry {\n  risky();\n} catch (e) {\n  console.log(e);\n}`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("treats a numeric-literal destructuring key like a non-string-literal computed key -- not statically resolvable to a declared string variable name", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst { 5: x } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "computed-key", line: 2, column: 9 },
    ])
  })

  it("disqualifies a const alias name reused as a keyword-less for-of loop variable (`for (e of list)`), which reassigns it every iteration", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\nfor (e of list) {\n  console.log(e);\n}`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("disqualifies a const alias name that's later the operand of a postfix increment/decrement", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\ne++;`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("disqualifies a const alias name that's later the operand of a prefix increment/decrement", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\n--e;`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("disqualifies a const alias name that collides with a plain (identifier) function parameter's own name", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\nfunction f(e: string) {\n  return e;\n}`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("disqualifies a const alias name that collides with a destructured function parameter's own binding name", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\nfunction f({ e }: { e: string }) {\n  return e;\n}`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("still records a member access when destructuring FROM a property access on a tracked import -- the binding-pattern fast path only fires for a bare-identifier source", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst { nested } = paymentsEnv.STRIPE_KEY;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 20 },
    ])
  })

  it("when destructuring from a NON-tracked source, still walks each binding element's default value for tracked references -- the fast path requires the source itself to be a tracked import", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst { x = paymentsEnv.STRIPE_KEY } = localObj;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 2, column: 13 },
    ])
  })

  it("disqualifies a const alias name that collides with an elided array-destructuring slot's sibling binding, in a function parameter", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\nfunction f([, e]: [string, string]) {\n  return e;\n}`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("never treats a const declaration as an alias candidate when its initializer isn't itself a tracked import (an ordinary local binding)", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst notAnImport = 5;\nconst copy = notAnImport;\npaymentsEnv.STRIPE_KEY;`,
    )
    expect(result.imports.has("copy")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 4, column: 1 },
    ])
  })

  it("never re-aliases a name that's already a real import binding for a different module -- the parser tolerates the duplicate declaration syntactically even though a type-checker would reject it", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nimport { paymentsEnv as other } from "./other.schema.js";\nconst other = paymentsEnv;\nother.STRIPE_KEY;`,
    )
    // `other` keeps resolving to its own real import ("./other.schema.js"),
    // never silently overwritten by the same-named const declaration below it.
    expect(result.imports.get("other")).toEqual({
      specifier: "./other.schema.js",
      importedName: "paymentsEnv",
    })
  })

  it("disqualifies a const alias name that collides with a function declaration's own name", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\nfunction e() { return 1; }`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("disqualifies a const alias name that collides with a class declaration's own name", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\nclass e {}`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("disqualifies a const alias name that collides with a name bound by an object-destructuring declaration elsewhere", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne.STRIPE_KEY;\nconst { e } = someObj;`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("keeps tracking a const alias that's only ever the operand of a non-`++`/`--` unary (`!e`, `-e`, `typeof e`, ...)", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\nif (!e) throw 0;\ne.STRIPE_KEY;`,
    )
    expect(result.imports.get("e")).toEqual(result.imports.get("paymentsEnv"))
    expect(result.accessesByLocalName.get("e")).toEqual([
      { kind: "reference", line: 3, column: 6 },
      { kind: "member", member: "STRIPE_KEY", line: 4, column: 1 },
    ])
  })

  it("keeps tracking a const alias that's only ever an operand of a non-assignment binary operator (`e === x`)", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\nif (e === undefined) throw 0;\ne.STRIPE_KEY;`,
    )
    expect(result.imports.get("e")).toEqual(result.imports.get("paymentsEnv"))
    expect(result.accessesByLocalName.get("e")).toEqual([
      { kind: "reference", line: 3, column: 5 },
      { kind: "member", member: "STRIPE_KEY", line: 4, column: 1 },
    ])
  })

  it("keeps tracking a const alias on the left of a keyword binary operator (`e instanceof Foo`) -- an operator token past the assignment-token range's upper bound", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\nconst x = e instanceof Foo;\ne.STRIPE_KEY;`,
    )
    expect(result.imports.get("e")).toEqual(result.imports.get("paymentsEnv"))
    expect(result.accessesByLocalName.get("e")).toEqual([
      { kind: "reference", line: 3, column: 11 },
      { kind: "member", member: "STRIPE_KEY", line: 4, column: 1 },
    ])
  })

  it("disqualifies a const alias that's the target of a compound `^=` assignment -- `CaretEqualsToken` is exactly `SyntaxKind.LastAssignment`, the top of the range check", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst e = paymentsEnv;\ne ^= mask;\ne.STRIPE_KEY;`,
    )
    expect(result.imports.has("e")).toBe(false)
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "escape", via: "reassignment", line: 2, column: 7 },
    ])
  })

  it("a chained alias (`const b = a`) is never followed to a second hop -- `a` is recorded as a bare reference for that read, since `b` itself is not tracked", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst a = paymentsEnv;\nconst b = a;\na.STRIPE_KEY;`,
    )
    expect(result.imports.get("a")).toEqual(result.imports.get("paymentsEnv"))
    expect(result.imports.has("b")).toBe(false)
    expect(result.accessesByLocalName.get("a")).toEqual([
      { kind: "reference", line: 3, column: 11 },
      { kind: "member", member: "STRIPE_KEY", line: 4, column: 1 },
    ])
  })

  it("a property access on a tracked import never spuriously counts as a redeclaration of the accessed member's name", () => {
    // `STRIPE_KEY.STRIPE_KEY` -- the property-access node has a `.name`, but
    // it is not a function/class declaration, so it must not be counted as
    // a declaration of "STRIPE_KEY"; the alias stays trackable.
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nconst STRIPE_KEY = paymentsEnv;\nSTRIPE_KEY.STRIPE_KEY;`,
    )
    expect(result.imports.get("STRIPE_KEY")).toEqual(result.imports.get("paymentsEnv"))
    expect(result.accessesByLocalName.get("STRIPE_KEY")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 3, column: 1 },
    ])
  })

  it("walks a destructured binding element's own default-value expression for nested tracked-import references -- like the computed-element-access precedent above, only the default value's own direct children are visited, not the expression as a whole, so a property access within it decomposes into a bare reference on its base rather than a member access", () => {
    const result = scanFileForDependencies(
      "consumer.ts",
      `import { paymentsEnv } from "./env.schema.js";\nimport { fallbackEnv } from "./fallback.schema.js";\nconst { STRIPE_KEY = fallbackEnv.STRIPE_KEY } = paymentsEnv;`,
    )
    expect(result.accessesByLocalName.get("paymentsEnv")).toEqual([
      { kind: "member", member: "STRIPE_KEY", line: 3, column: 9 },
    ])
    expect(result.accessesByLocalName.get("fallbackEnv")).toEqual([
      { kind: "reference", line: 3, column: 22 },
    ])
  })
})
