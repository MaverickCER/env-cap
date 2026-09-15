import { describe, it, expect } from "vitest"
import ts from "typescript"
import {
  parseSchemaFile,
  extractSchemaVariables,
  extractContractDocs,
  extractCreateEnvOptionsName,
} from "../../src/build/parse.js"

describe("parseSchemaFile", () => {
  it("discovers an exported createEnv call with an inline schema literal", () => {
    const source = `
      import { createEnv } from "env-cap";
      export const paymentsEnv = createEnv({ STRIPE_KEY: { processor: (v) => String(v) } }, { name: "payments" });
    `
    const result = parseSchemaFile("/repo/features/payments/env.schema.ts", source)
    expect(result.warnings).toHaveLength(0)
    expect(result.createEnvCalls).toHaveLength(1)
    expect(result.createEnvCalls[0]?.exportName).toBe("paymentsEnv")
    expect(result.createEnvCalls[0]?.schemaRef.kind).toBe("literal")
  })

  it("discovers a createEnv call whose schema argument is an identifier, and records the matching local const", () => {
    const source = `
      const paymentsSchema = { STRIPE_KEY: { processor: (v) => String(v) } };
      export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
    `
    const result = parseSchemaFile("/repo/features/payments/env.schema.ts", source)
    expect(result.createEnvCalls[0]?.schemaRef).toEqual({
      kind: "identifier",
      name: "paymentsSchema",
    })
    expect(result.localConsts.has("paymentsSchema")).toBe(true)
  })

  it("warns and skips a createEnv call that is not assigned to an exported const", () => {
    const source = `const notExported = createEnv({ X: {} });`
    const result = parseSchemaFile("/repo/x.ts", source)
    expect(result.createEnvCalls).toHaveLength(0)
    expect(result.warnings.some((w) => w.message.includes("not exported"))).toBe(true)
  })

  it("treats a variable statement as exported when ANY of its (2+) modifiers is `export`, not only when EVERY modifier is", () => {
    // `declare` alongside `export` is semantically nonsensical for a const
    // WITH an initializer (never a real-world schema file), but the parser
    // itself (this module never type-checks) accepts it fine -- exactly the
    // shape needed to distinguish `modifiers.some(isExport)` from
    // `modifiers.every(isExport)`, which agree on every single-modifier case.
    const source = `export declare const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`
    const result = parseSchemaFile("/repo/x.ts", source)
    expect(result.createEnvCalls).toHaveLength(1)
    expect(result.createEnvCalls[0]?.exportName).toBe("paymentsEnv")
    expect(result.warnings).toHaveLength(0)
  })

  it("does not treat a variable statement as exported just because it HAS a (non-empty) modifiers array -- every modifier must be checked, not just presence", () => {
    // `declare` with no `export` -- a non-empty modifiers array containing
    // NO ExportKeyword. Distinguishes `modifiers.some(m => m.kind ===
    // ExportKeyword)` from a collapsed `modifiers.some(() => true)`, which
    // would agree with the real check whenever modifiers is empty OR
    // actually contains export, but not here.
    const source = `declare const paymentsEnv = createEnv({ STRIPE_KEY: {} }, { name: "payments" });`
    const result = parseSchemaFile("/repo/x.ts", source)
    expect(result.createEnvCalls).toHaveLength(0)
    expect(result.warnings.some((w) => w.message.includes("not exported"))).toBe(true)
  })

  it("discovers a bare documentEnv() statement, unattached to any variable", () => {
    const source = `
      const paymentsSchema = { STRIPE_KEY: {} };
      export const paymentsEnv = createEnv(paymentsSchema);
      documentEnv(paymentsSchema, { variables: { STRIPE_KEY: { description: "Stripe key" } } });
    `
    const result = parseSchemaFile("/repo/features/payments/env.schema.ts", source)
    expect(result.documentEnvCalls).toHaveLength(1)
    expect(result.documentEnvCalls[0]?.schemaRef).toEqual({
      kind: "identifier",
      name: "paymentsSchema",
    })
  })

  it("records named imports for cross-file resolution, accounting for aliasing", () => {
    const source = `
      import { paymentsSchema as schema } from "./schema.js";
      documentEnv(schema, {});
    `
    const result = parseSchemaFile("/repo/docs/payments.docs.ts", source)
    expect(result.imports.get("schema")).toEqual({
      specifier: "./schema.js",
      importedName: "paymentsSchema",
    })
  })

  it("ignores unrelated code and non-createEnv/documentEnv calls", () => {
    const result = parseSchemaFile(
      "/repo/x.ts",
      "export const notAContract = 42; someOtherFunction();",
    )
    expect(result.createEnvCalls).toHaveLength(0)
    expect(result.documentEnvCalls).toHaveLength(0)
  })

  it("never executes the file -- a throwing top-level statement does not throw during parsing", () => {
    const source = `
      throw new Error("this must never run during static analysis");
      export const dangerEnv = createEnv({ X: {} });
    `
    expect(() => parseSchemaFile("/repo/danger/env.schema.ts", source)).not.toThrow()
  })

  it("recognizes createEnv/documentEnv called as a member expression (e.g. envContract.createEnv)", () => {
    const result = parseSchemaFile(
      "/repo/features/member/env.schema.ts",
      `export const memberEnv = envContract.createEnv({ X: {} });`,
    )
    expect(result.createEnvCalls).toHaveLength(1)
  })

  it("does not mistake a member expression call to a DIFFERENT-named method for createEnv/documentEnv", () => {
    const result = parseSchemaFile(
      "/repo/x.ts",
      `export const notAContract = envContract.otherMethod({ X: {} });`,
    )
    expect(result.createEnvCalls).toHaveLength(0)
    expect(result.documentEnvCalls).toHaveLength(0)
  })

  it("records a const assigned from documentEnv(...) the same as a bare statement", () => {
    const source = `
      const paymentsSchema = { STRIPE_KEY: {} };
      const ignoredResult = documentEnv(paymentsSchema, { name: "payments" });
    `
    const result = parseSchemaFile("/repo/features/payments/env.schema.ts", source)
    expect(result.documentEnvCalls).toHaveLength(1)
    expect(result.documentEnvCalls[0]?.schemaRef).toEqual({
      kind: "identifier",
      name: "paymentsSchema",
    })
  })

  it("ignores a const assigned from a call to neither createEnv nor documentEnv", () => {
    const source = `const ignored = someOtherFunction({ X: {} });`
    const result = parseSchemaFile("/repo/x.ts", source)
    expect(result.createEnvCalls).toHaveLength(0)
    expect(result.documentEnvCalls).toHaveLength(0)
  })

  it("skips a destructuring top-level declaration -- its name is not a plain identifier binding", () => {
    const source = `
      const { NODE_ENV } = process.env;
      export const paymentsEnv = createEnv({ X: {} });
    `
    const result = parseSchemaFile("/repo/x.ts", source)
    expect(result.localConsts.size).toBe(0)
    expect(result.createEnvCalls).toHaveLength(1)
  })

  it("skips a plain-identifier declaration with no initializer at all (e.g. `let paymentsEnv;`), without throwing", () => {
    const source = `
      export let paymentsEnv;
      export const otherEnv = createEnv({ X: {} });
    `
    expect(() => parseSchemaFile("/repo/x.ts", source)).not.toThrow()
    const result = parseSchemaFile("/repo/x.ts", source)
    expect(result.localConsts.size).toBe(0)
    expect(result.createEnvCalls).toHaveLength(1)
    expect(result.createEnvCalls[0]?.exportName).toBe("otherEnv")
  })

  it("treats a createEnv() call with no schema argument at all as unresolvable", () => {
    const result = parseSchemaFile("/repo/x.ts", `export const emptyEnv = createEnv();`)
    expect(result.createEnvCalls[0]?.schemaRef).toEqual({ kind: "unresolvable" })
  })

  it("treats a createEnv() call whose schema argument is neither an inline object literal nor a plain identifier (e.g. a function call) as unresolvable", () => {
    const result = parseSchemaFile(
      "/repo/x.ts",
      `export const dynamicEnv = createEnv(buildSchema());`,
    )
    expect(result.createEnvCalls[0]?.schemaRef).toEqual({ kind: "unresolvable" })
  })

  it("does not record import bindings from a malformed (non-string) module specifier", () => {
    // ts.createSourceFile recovers from `from someVar` (an unquoted specifier)
    // rather than throwing, producing an ImportDeclaration whose
    // moduleSpecifier is an Identifier, not a string literal.
    const source = `
      import { schema } from someVar;
      export const paymentsEnv = createEnv({ X: {} }, { name: "payments" });
    `
    const result = parseSchemaFile("/repo/x.ts", source)
    expect(result.imports.size).toBe(0)
    expect(result.createEnvCalls).toHaveLength(1)
  })

  it("does not record import bindings for a default-only import (no named bindings)", () => {
    const result = parseSchemaFile(
      "/repo/x.ts",
      `import config from "./config.js";\ndocumentEnv({}, {});`,
    )
    expect(result.imports.size).toBe(0)
  })

  it("does not record import bindings for a bare side-effect import (no importClause at all)", () => {
    const result = parseSchemaFile("/repo/x.ts", `import "./side-effect.js";\ndocumentEnv({}, {});`)
    expect(result.imports.size).toBe(0)
  })

  it("does not mistake a call via a non-identifier, non-member callee for createEnv/documentEnv", () => {
    const source = `
      (() => {})();
      documentEnv({ X: {} }, {});
    `
    const result = parseSchemaFile("/repo/x.ts", source)
    expect(result.documentEnvCalls).toHaveLength(1)
  })
})

describe("extractSchemaVariables", () => {
  function literal(source: string): ts.ObjectLiteralExpression {
    const sourceFile = ts.createSourceFile(
      "/repo/x.ts",
      `const x = ${source};`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const decl = (sourceFile.statements[0] as ts.VariableStatement).declarationList.declarations[0]! // single "const x = ..." declaration, always exactly one
    return decl.initializer as ts.ObjectLiteralExpression
  }

  // These tests assert on processor/validator/default presence, never on
  // `declaration` -- a shared placeholder source file (not the literal's own
  // real one) is deliberately good enough here; `link.ts`'s own tests are
  // where `declaration` positions are actually exercised against a real,
  // matching source file.
  const placeholderSourceFile = ts.createSourceFile(
    "/repo/placeholder.ts",
    "",
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  it("extracts processor/validator/default presence and the processor's explicit return type", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{
        STRIPE_KEY: { processor: (value): string => String(value), validator: (value) => value.length > 0 },
        PORT: { default: 3000, processor: (value): number => Number(value) },
        BARE_VAR: {},
      }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(warnings).toHaveLength(0)
    const stripeKey = variables.find((v) => v.key === "STRIPE_KEY")!
    expect(stripeKey.hasProcessor).toBe(true)
    expect(stripeKey.processorReturnType).toBe("string")
    expect(stripeKey.hasValidator).toBe(true)
    // STRIPE_KEY declares no `default` -- proves `hasDefault`'s own initial
    // value is genuinely `false`, not just never flipped to `true`.
    expect(stripeKey.hasDefault).toBe(false)

    const port = variables.find((v) => v.key === "PORT")!
    expect(port.hasDefault).toBe(true)
    expect(port.defaultValue).toEqual({ ok: true, value: 3000 })
    expect(port.processorReturnType).toBe("number")
    // PORT declares no `validator`.
    expect(port.hasValidator).toBe(false)

    // No default/processor/validator at all -- every presence flag starts
    // (and stays) false.
    const bareVar = variables.find((v) => v.key === "BARE_VAR")!
    expect(bareVar.hasDefault).toBe(false)
    expect(bareVar.hasProcessor).toBe(false)
    expect(bareVar.hasValidator).toBe(false)
  })

  it("warns and skips a schema entry that is not an inline object literal", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ TOKEN: shared }`),
      "/repo/x.ts",
      "weirdEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables).toHaveLength(0)
    expect(warnings).toEqual([
      {
        file: "/repo/x.ts",
        message:
          'Definition for "TOKEN" in "weirdEnv" is not an inline object literal; skipping static analysis for this variable.',
      },
    ])
  })

  it("warns and skips a quoted key that is not a valid environment variable name", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ "FOO=BAR\\nEVIL_KEY": {}, GOOD_KEY: {} }`),
      "/repo/x.ts",
      "injectedEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables.map((v) => v.key)).toEqual(["GOOD_KEY"])
    expect(warnings).toEqual([
      {
        file: "/repo/x.ts",
        message:
          'Skipped "FOO=BAR\nEVIL_KEY" in "injectedEnv": not a valid environment variable name (expected /^[A-Za-z_][A-Za-z0-9_]*$/); it will never appear in generated docs or .env.example output.',
      },
    ])
    expect(warnings.some((w) => w.message.includes("not a valid environment variable name"))).toBe(
      true,
    )
  })

  it("rejects an otherwise-valid key with a leading invalid character (anchor-removal boundary)", () => {
    const variables = extractSchemaVariables(
      literal(`{ "1FOO": {}, GOOD_KEY: {} }`),
      "/repo/x.ts",
      "leadingEnv",
      [],
      placeholderSourceFile,
    )
    expect(variables.map((v) => v.key)).toEqual(["GOOD_KEY"])
  })

  it("rejects an otherwise-valid key with a trailing invalid character (anchor-removal boundary)", () => {
    const variables = extractSchemaVariables(
      literal(`{ "FOO!": {}, GOOD_KEY: {} }`),
      "/repo/x.ts",
      "trailingEnv",
      [],
      placeholderSourceFile,
    )
    expect(variables.map((v) => v.key)).toEqual(["GOOD_KEY"])
  })

  it("warns and skips a spread element in a schema object literal", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ ...shared, GOOD_KEY: {} }`),
      "/repo/x.ts",
      "spreadEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables.map((v) => v.key)).toEqual(["GOOD_KEY"])
    expect(warnings.some((w) => w.message.includes("spread or computed key"))).toBe(true)
  })

  it("skips a computed property key that isn't statically resolvable", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ [computeKey()]: {}, GOOD_KEY: {} }`),
      "/repo/x.ts",
      "computedEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables.map((v) => v.key)).toEqual(["GOOD_KEY"])
  })

  it("skips a spread element within a single variable's own definition object", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ STRIPE_KEY: { ...sharedFlags, processor: (v) => v } }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables[0]?.hasProcessor).toBe(true)
  })

  it("extracts a processor defined as a function expression (not an arrow function) with an explicit return type", () => {
    const variables = extractSchemaVariables(
      literal(`{ STRIPE_KEY: { processor: function (v): string { return String(v); } } }`),
      "/repo/x.ts",
      "testEnv",
      [],
      placeholderSourceFile,
    )
    expect(variables[0]?.hasProcessor).toBe(true)
    expect(variables[0]?.processorReturnType).toBe("string")
  })

  it("leaves processorReturnType undefined when the processor has no explicit return type annotation", () => {
    const variables = extractSchemaVariables(
      literal(`{ STRIPE_KEY: { processor: (v) => String(v) } }`),
      "/repo/x.ts",
      "testEnv",
      [],
      placeholderSourceFile,
    )
    expect(variables[0]?.processorReturnType).toBeUndefined()
  })

  it("leaves processorReturnType undefined for a non-function expression that nonetheless carries a `.type` node (an `as` assertion) -- the function-shape guard, not just the `.type` presence check, is load-bearing", () => {
    const variables = extractSchemaVariables(
      literal(`{ STRIPE_KEY: { processor: someExternalFn as (v: unknown) => string } }`),
      "/repo/x.ts",
      "testEnv",
      [],
      placeholderSourceFile,
    )
    expect(variables[0]?.hasProcessor).toBe(true)
    expect(variables[0]?.processorReturnType).toBeUndefined()
  })

  it("leaves processorReturnType undefined (without crashing) when the processor isn't a function/arrow expression at all (e.g. a bare identifier reference)", () => {
    expect(() =>
      extractSchemaVariables(
        literal(`{ STRIPE_KEY: { processor: someExternalFn } }`),
        "/repo/x.ts",
        "testEnv",
        [],
        placeholderSourceFile,
      ),
    ).not.toThrow()
    const variables = extractSchemaVariables(
      literal(`{ STRIPE_KEY: { processor: someExternalFn } }`),
      "/repo/x.ts",
      "testEnv",
      [],
      placeholderSourceFile,
    )
    expect(variables[0]?.hasProcessor).toBe(true)
    expect(variables[0]?.processorReturnType).toBeUndefined()
  })

  it("strips internal whitespace from a multi-word return type annotation", () => {
    const variables = extractSchemaVariables(
      literal(
        `{ STRIPE_KEY: { processor: (v): string | undefined => v ? String(v) : undefined } }`,
      ),
      "/repo/x.ts",
      "testEnv",
      [],
      placeholderSourceFile,
    )
    expect(variables[0]?.processorReturnType).toBe("string|undefined")
  })

  it("normalizes processorSource/validatorSource: collapses internal whitespace/newlines to single spaces and trims", () => {
    const variables = extractSchemaVariables(
      literal(`{
        STRIPE_KEY: {
          processor: (v) => {
            return   String(v);
          },
          validator: (v) =>
            v.length > 0,
        },
      }`),
      "/repo/x.ts",
      "testEnv",
      [],
      placeholderSourceFile,
    )
    expect(variables[0]?.processorSource).toBe("(v) => { return String(v); }")
    expect(variables[0]?.validatorSource).toBe("(v) => v.length > 0")
  })

  it("extracts a variable's validation context from a string literal", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ DATABASE_URL: { context: "server", processor: (v) => v } }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(warnings).toHaveLength(0)
    expect(variables[0]?.context).toBe("server")
  })

  it("warns and ignores an empty-string validation context", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ DATABASE_URL: { context: "" } }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables[0]?.context).toBeUndefined()
    expect(warnings.some((w) => w.message.includes("empty string"))).toBe(true)
  })

  it("treats a non-literal validation context (e.g. a function call) as unresolvable: warns and leaves context undefined, same ADR 0002 'never execute' policy as every other field", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ DATABASE_URL: { context: getContext() } }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables[0]?.context).toBeUndefined()
    expect(
      warnings.some((w) => w.message.includes("not a statically-resolvable string literal")),
    ).toBe(true)
  })

  it("treats a statically-resolvable but non-string context (e.g. a number literal) as unresolvable, distinct from an empty string or a non-literal", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ DATABASE_URL: { context: 42 } }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables[0]?.context).toBeUndefined()
    expect(
      warnings.some((w) => w.message.includes("not a statically-resolvable string literal")),
    ).toBe(true)
  })

  it('rejects a non-string context value that itself has a truthy `.length` (an array), distinguishing `evaluated.ok && typeof === "string"` from a collapsed `||`', () => {
    // An array is statically resolvable (ok: true) with a non-string typeof
    // AND a real, positive `.length` -- the one shape that could slip past a
    // `||`-corrupted guard (which would let `ok: true` alone satisfy the
    // first two clauses) and still pass the trailing `.length > 0` check,
    // unlike a number or boolean (whose `.length` is `undefined`).
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ DATABASE_URL: { context: ["a", "b"] } }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables[0]?.context).toBeUndefined()
    expect(
      warnings.some((w) => w.message.includes("not a statically-resolvable string literal")),
    ).toBe(true)
  })

  it("ignores an unrecognized field name entirely (never mistakes it for 'context')", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ DATABASE_URL: { unknownField: "not context" } }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
      placeholderSourceFile,
    )
    expect(variables[0]?.context).toBeUndefined()
    expect(warnings).toHaveLength(0)
  })
})

describe("extractContractDocs", () => {
  function objectLiteral(source: string): ts.Expression {
    const sourceFile = ts.createSourceFile(
      "/repo/x.ts",
      `const x = ${source};`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const decl = (sourceFile.statements[0] as ts.VariableStatement).declarationList.declarations[0]! // single "const x = ..." declaration, always exactly one
    return decl.initializer!
  }

  it("defaults to active: true and undefined fields when no docs argument is given", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(undefined, "/repo/x.ts", "plain", warnings)
    expect(docs.active).toBe(true)
    expect(docs.category).toBeUndefined()
    expect(docs.exclusiveGroup).toBeUndefined()
    expect(docs.owner).toBeUndefined()
    expect(docs.sensitivity).toBeUndefined()
    expect(docs.expiresAt).toBeUndefined()
    expect(docs.variables.size).toBe(0)
    // No docsArg at all -- distinct from one present but malformed, which
    // DOES warn (see "warns when docsArg is present but not an inline object
    // literal" below).
    expect(warnings).toHaveLength(0)
  })

  it("extracts every contract-level field plus per-variable docs when statically resolvable", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{
        name: "postgres",
        active: false,
        category: "database",
        exclusiveGroup: "database",
        owner: "data-platform",
        sensitivity: "credential",
        expiresAt: "2026-01-01",
        deprecated: true,
        deprecatedReason: "Superseded by the payments-v2 contract.",
        purpose: "Store application state.",
        legalBasis: "Legitimate interest.",
        retention: "Delete after 90 days.",
        dataResidency: ["EU", "US"],
        auditRequired: true,
        metadata: { runbook: "https://wiki.internal/postgres" },
        variables: {
          DATABASE_URL: {
            description: "Postgres connection string.",
            owner: "data-platform",
            sensitivity: "secret",
            expiresAt: "2026-06-01",
            refreshInstructions: "Rotate in the RDS console.",
            setupInstructions: "Provision a Postgres instance and paste its connection string.",
            required: true,
            deprecated: true,
            deprecatedReason: "Use POSTGRES_URL instead.",
            removeBy: "2027-01-01",
            renamedFrom: "DB_URL",
            purpose: "Connect to the primary database.",
            legalBasis: "Contractual necessity.",
            retention: "Delete after 30 days.",
            dataResidency: "EU",
            auditRequired: true,
            metadata: { setup: "Ask #data-platform for a connection string." },
            evidence: { dynamicAccess: ["scripts/migrate.sh:12:4"] },
          },
        },
      }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    expect(warnings).toHaveLength(0)
    expect(docs).toMatchObject({
      name: "postgres",
      active: false,
      category: "database",
      exclusiveGroup: "database",
      owner: "data-platform",
      sensitivity: "credential",
      expiresAt: "2026-01-01",
      deprecated: true,
      deprecatedReason: "Superseded by the payments-v2 contract.",
      purpose: "Store application state.",
      legalBasis: "Legitimate interest.",
      retention: "Delete after 90 days.",
      dataResidency: ["EU", "US"],
      auditRequired: true,
      metadata: { runbook: "https://wiki.internal/postgres" },
    })
    const dbUrl = docs.variables.get("DATABASE_URL")!
    expect(dbUrl.description).toBe("Postgres connection string.")
    expect(dbUrl.owner).toBe("data-platform")
    expect(dbUrl.sensitivity).toBe("secret")
    expect(dbUrl.expiresAt).toBe("2026-06-01")
    expect(dbUrl.refreshInstructions).toBe("Rotate in the RDS console.")
    expect(dbUrl.setupInstructions).toBe(
      "Provision a Postgres instance and paste its connection string.",
    )
    expect(dbUrl.required).toBe(true)
    expect(dbUrl.deprecated).toBe(true)
    expect(dbUrl.deprecatedReason).toBe("Use POSTGRES_URL instead.")
    expect(dbUrl.removeBy).toBe("2027-01-01")
    expect(dbUrl.renamedFrom).toBe("DB_URL")
    expect(dbUrl.purpose).toBe("Connect to the primary database.")
    expect(dbUrl.legalBasis).toBe("Contractual necessity.")
    expect(dbUrl.retention).toBe("Delete after 30 days.")
    expect(dbUrl.dataResidency).toBe("EU")
    expect(dbUrl.auditRequired).toBe(true)
    expect(dbUrl.metadata).toEqual({ setup: "Ask #data-platform for a connection string." })
    expect(dbUrl.evidence?.dynamicAccess).toEqual(["scripts/migrate.sh:12:4"])
  })

  it("keeps well-formed evidence.dynamicAccess citations and drops malformed ones with a warning, per entry", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{
        variables: {
          DATABASE_URL: {
            evidence: {
              dynamicAccess: [
                "scripts/migrate.sh:12:4",
                "not-a-citation",
                "scripts/other.sh:0:1",
                "scripts/other.sh:1:0",
                123,
              ],
            },
          },
        },
      }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    const dbUrl = docs.variables.get("DATABASE_URL")!
    expect(dbUrl.evidence?.dynamicAccess).toEqual(["scripts/migrate.sh:12:4"])
    expect(warnings).toHaveLength(4)
    expect(warnings.every((w) => w.message.includes('"evidence.dynamicAccess"'))).toBe(true)
  })

  it("leaves evidence undefined when the declaration has no evidence key at all", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ variables: { DATABASE_URL: { description: "x" } } }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    expect(docs.variables.get("DATABASE_URL")?.evidence).toBeUndefined()
  })

  it("distinguishes an evidence object with no citations from no evidence object at all", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ variables: { DATABASE_URL: { evidence: {} } } }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    // The sub-object exists (the author wrote one), but declares nothing.
    expect(docs.variables.get("DATABASE_URL")?.evidence).toEqual({ dynamicAccess: undefined })
    expect(warnings).toEqual([])
  })

  it("ignores evidence when it's statically resolvable but not a record (e.g. a number)", async () => {
    const docs = extractContractDocs(
      objectLiteral(`{ variables: { DATABASE_URL: { evidence: 123 } } }`),
      "/repo/x.ts",
      "postgres",
      [],
    )
    expect(docs.variables.get("DATABASE_URL")?.evidence).toBeUndefined()
  })

  it("does not mistake a differently-named record-valued field for 'evidence' (fieldName === \"evidence\" && isRecord(...), not ||)", async () => {
    const docs = extractContractDocs(
      objectLiteral(
        `{ variables: { DATABASE_URL: { metadata: { dynamicAccess: ["scripts/x.sh:1:1"] } } } }`,
      ),
      "/repo/x.ts",
      "postgres",
      [],
    )
    expect(docs.variables.get("DATABASE_URL")?.evidence).toBeUndefined()
    expect(docs.variables.get("DATABASE_URL")?.metadata).toEqual({
      dynamicAccess: ["scripts/x.sh:1:1"],
    })
  })

  it("ignores per-variable metadata when it's statically resolvable but not a record (e.g. a number)", async () => {
    const docs = extractContractDocs(
      objectLiteral(`{ variables: { DATABASE_URL: { metadata: 123 } } }`),
      "/repo/x.ts",
      "postgres",
      [],
    )
    expect(docs.variables.get("DATABASE_URL")?.metadata).toBeUndefined()
  })

  it("warns and ignores dataResidency when not a statically-resolvable string or string array", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ dataResidency: 123 }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.dataResidency).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"dataResidency"'))).toBe(true)
  })

  it("warns and ignores dataResidency when it's an array but not EVERY element is a string", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ dataResidency: ["EU", 123] }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.dataResidency).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"dataResidency"'))).toBe(true)
  })

  it("accepts dataResidency as either a single string or an array of strings", async () => {
    const warnings: { file: string; message: string }[] = []
    const single = extractContractDocs(
      objectLiteral(`{ dataResidency: "EU" }`),
      "/repo/x.ts",
      "single",
      warnings,
    )
    const multiple = extractContractDocs(
      objectLiteral(`{ dataResidency: ["EU", "US"] }`),
      "/repo/x.ts",
      "multiple",
      warnings,
    )
    expect(warnings).toHaveLength(0)
    expect(single.dataResidency).toBe("EU")
    expect(multiple.dataResidency).toEqual(["EU", "US"])
  })

  it("warns and ignores deprecated when not a statically-resolvable boolean literal", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ deprecated: Math.random() > 0.5 }`),
      "/repo/x.ts",
      "flaky",
      warnings,
    )
    expect(docs.deprecated).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"deprecated"'))).toBe(true)
  })

  it("warns and ignores deprecated when it IS statically resolvable but not a boolean (e.g. a string literal)", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ deprecated: "yes" }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.deprecated).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"deprecated"'))).toBe(true)
  })

  it("keeps a nonstandard sensitivity level verbatim, without warning (an open vocabulary, not a closed union)", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ sensitivity: "top-secret" }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    // Honored exactly as written -- the standard-vocabulary check is a
    // separate, non-blocking NONSTANDARD_SENSITIVITY_LEVEL finding
    // (`generate-documentation.ts`), never a parse-time drop.
    expect(docs.sensitivity).toBe("top-secret")
    expect(warnings).toEqual([])
  })

  it("warns and ignores sensitivity when it isn't a statically-resolvable string literal", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ sensitivity: someRuntimeValue }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.sensitivity).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"sensitivity"'))).toBe(true)
  })

  it("warns and ignores sensitivity when it IS statically resolvable but not a string (e.g. a number literal)", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ sensitivity: 123 }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.sensitivity).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"sensitivity"'))).toBe(true)
  })

  it("warns and defaults to active: true when active is not a statically-resolvable boolean literal", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ active: Math.random() > 0.5 }`),
      "/repo/x.ts",
      "flaky",
      warnings,
    )
    expect(docs.active).toBe(true)
    expect(warnings.some((w) => w.message.includes('"active"'))).toBe(true)
  })

  it("warns and defaults to active: true when active IS statically resolvable but not a boolean (e.g. a string literal)", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ active: "yes" }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.active).toBe(true)
    expect(warnings.some((w) => w.message.includes('"active"'))).toBe(true)
  })

  it("warns and ignores category when not a statically-resolvable string literal", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ category: "data" + "base" }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.category).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"category"'))).toBe(true)
  })

  it("warns and ignores category when it IS statically resolvable but not a string (e.g. a number literal)", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ category: 123 }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.category).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"category"'))).toBe(true)
  })

  it("warns when docsArg is present but not an inline object literal", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`sharedDocsRef`),
      "/repo/x.ts",
      "shared",
      warnings,
    )
    expect(docs.name).toBeUndefined()
    expect(warnings.some((w) => w.message.includes("does not pass an inline object literal"))).toBe(
      true,
    )
  })

  it("skips a spread element among docsArg's own top-level properties", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ ...shared, name: "postgres" }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    expect(docs.name).toBe("postgres")
  })

  it("warns and ignores exclusiveGroup when not a statically-resolvable string literal", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ exclusiveGroup: \`db-\${suffix}\` }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.exclusiveGroup).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"exclusiveGroup"'))).toBe(true)
  })

  it("warns and ignores exclusiveGroup when it IS statically resolvable but not a string (e.g. a number literal)", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ exclusiveGroup: 123 }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.exclusiveGroup).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"exclusiveGroup"'))).toBe(true)
  })

  it("warns and ignores expiresAt when not a statically-resolvable string literal", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ expiresAt: 20260101 }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.expiresAt).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"expiresAt"'))).toBe(true)
  })

  it("warns and ignores metadata when not a statically-resolvable object literal", async () => {
    const warnings: { file: string; message: string }[] = []
    // `null` is a statically-evaluable literal, so it reaches isRecord()
    // rather than being rejected earlier by evaluateLiteral() -- exercising
    // isRecord's own "not an object" rejection.
    const docs = extractContractDocs(
      objectLiteral(`{ metadata: null }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.metadata).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"metadata"'))).toBe(true)
  })

  it('warns and ignores metadata when it\'s a statically-resolvable non-object primitive (e.g. a number) -- distinct from `null`, which is `typeof "object"` too', async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ metadata: 123 }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.metadata).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"metadata"'))).toBe(true)
  })

  it("silently ignores (never warns on) contract-level fields with no dedicated warning branch when they're statically resolvable but wrong-typed -- each field's own `evaluated.ok && typeof value === ...` guard is independently load-bearing", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{
        name: 123,
        owner: 123,
        deprecatedReason: 123,
        purpose: 123,
        legalBasis: 123,
        retention: 123,
        auditRequired: "yes",
      }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(warnings).toHaveLength(0)
    expect(docs.name).toBeUndefined()
    expect(docs.owner).toBeUndefined()
    expect(docs.deprecatedReason).toBeUndefined()
    expect(docs.purpose).toBeUndefined()
    expect(docs.legalBasis).toBeUndefined()
    expect(docs.retention).toBeUndefined()
    expect(docs.auditRequired).toBeUndefined()
  })

  it("warns and skips variables when not an inline object literal", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ variables: sharedVarsRef }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.variables.size).toBe(0)
    expect(warnings.some((w) => w.message.includes('"variables"'))).toBe(true)
  })

  it("ignores an unrecognized top-level docsArg key entirely -- never mistakes it for 'variables' (the last else-if in the chain)", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ unknownTopLevelField: "test" }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.variables.size).toBe(0)
    expect(warnings).toHaveLength(0)
  })

  it("skips a spread element among the variables map's own keys", async () => {
    const docs = extractContractDocs(
      objectLiteral(`{ variables: { ...shared, DATABASE_URL: { description: "x" } } }`),
      "/repo/x.ts",
      "postgres",
      [],
    )
    expect(docs.variables.get("DATABASE_URL")?.description).toBe("x")
  })

  it("skips a variables map entry with a computed (non-static) key", async () => {
    const docs = extractContractDocs(
      objectLiteral(
        `{ variables: { [computeKey()]: { description: "x" }, DATABASE_URL: { description: "y" } } }`,
      ),
      "/repo/x.ts",
      "postgres",
      [],
    )
    expect(docs.variables.size).toBe(1)
    expect(docs.variables.get("DATABASE_URL")?.description).toBe("y")
  })

  it("warns and skips a per-variable docs entry that is not an inline object literal", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ variables: { DATABASE_URL: sharedFieldsRef } }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    expect(docs.variables.size).toBe(0)
    expect(warnings.some((w) => w.message.includes("not an inline object literal"))).toBe(true)
  })

  it("skips a spread element within a single variable's own docs fields", async () => {
    const docs = extractContractDocs(
      objectLiteral(`{ variables: { DATABASE_URL: { ...shared, description: "x" } } }`),
      "/repo/x.ts",
      "postgres",
      [],
    )
    expect(docs.variables.get("DATABASE_URL")?.description).toBe("x")
  })

  it("skips a computed (non-static) field name within a single variable's docs", async () => {
    const docs = extractContractDocs(
      objectLiteral(`{ variables: { DATABASE_URL: { [computeField()]: "x", description: "y" } } }`),
      "/repo/x.ts",
      "postgres",
      [],
    )
    expect(docs.variables.get("DATABASE_URL")?.description).toBe("y")
  })

  it("silently skips (never warns on) per-variable fields that aren't statically evaluable or are wrong-typed, and never sweeps an unrecognized top-level key into metadata (ADR 0035 -- no more catch-all)", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{
        variables: {
          DATABASE_URL: {
            description: getDescription(),
            required: "yes",
            customFlag: 123,
            setup: "Ask #data-platform.",
          },
        },
      }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    expect(warnings).toHaveLength(0)
    const dbUrl = docs.variables.get("DATABASE_URL")!
    expect(dbUrl.description).toBeUndefined()
    expect(dbUrl.required).toBeUndefined()
    // Neither "customFlag" nor "setup" is nested under a literal `metadata: {...}`
    // key, so neither is captured anywhere -- unlike the pre-ADR-0035 catch-all,
    // an unrecognized top-level key is never swept up automatically anymore.
    expect(dbUrl.metadata).toBeUndefined()
  })

  it("silently skips EVERY other per-variable field when it's statically resolvable but wrong-typed -- each field's own `fieldName === ... && typeof value === ...` guard is independently load-bearing", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{
        variables: {
          DATABASE_URL: {
            description: 123,
            owner: 123,
            sensitivity: 123,
            expiresAt: 123,
            refreshInstructions: 123,
            setupInstructions: 123,
            required: 123,
            deprecated: "yes",
            deprecatedReason: 123,
            removeBy: 123,
            renamedFrom: 123,
            purpose: 123,
            legalBasis: 123,
            retention: 123,
            dataResidency: 123,
            auditRequired: "yes",
          },
        },
      }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    expect(warnings).toHaveLength(0)
    const dbUrl = docs.variables.get("DATABASE_URL")!
    expect(dbUrl.description).toBeUndefined()
    expect(dbUrl.required).toBeUndefined()
    expect(dbUrl.owner).toBeUndefined()
    expect(dbUrl.sensitivity).toBeUndefined()
    expect(dbUrl.expiresAt).toBeUndefined()
    expect(dbUrl.refreshInstructions).toBeUndefined()
    expect(dbUrl.setupInstructions).toBeUndefined()
    expect(dbUrl.deprecated).toBeUndefined()
    expect(dbUrl.deprecatedReason).toBeUndefined()
    expect(dbUrl.removeBy).toBeUndefined()
    expect(dbUrl.renamedFrom).toBeUndefined()
    expect(dbUrl.purpose).toBeUndefined()
    expect(dbUrl.legalBasis).toBeUndefined()
    expect(dbUrl.retention).toBeUndefined()
    expect(dbUrl.dataResidency).toBeUndefined()
    expect(dbUrl.auditRequired).toBeUndefined()
  })

  it("metadata accepts any primitive or object value per key, not just strings (ADR 0035)", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{
        variables: {
          DATABASE_URL: {
            metadata: {
              setup: "Ask #data-platform.",
              retryCount: 3,
              enabled: true,
              controls: { encryption: true, keyRotationDays: 90 },
            },
          },
        },
      }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    expect(warnings).toHaveLength(0)
    const dbUrl = docs.variables.get("DATABASE_URL")!
    expect(dbUrl.metadata).toEqual({
      setup: "Ask #data-platform.",
      retryCount: 3,
      enabled: true,
      controls: { encryption: true, keyRotationDays: 90 },
    })
  })

  it("does not sweep an unrecognized per-variable field into `auditRequired`/`evidence` just because its value has the right shape -- each branch's `fieldName === ...` half is load-bearing, not only its type guard", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{
        variables: {
          DATABASE_URL: {
            someUnknownFlag: true,
            someUnknownRecord: { dynamicAccess: ["scripts/x.sh:1:1"] },
          },
        },
      }`),
      "/repo/x.ts",
      "postgres",
      warnings,
    )
    expect(warnings).toHaveLength(0)
    const dbUrl = docs.variables.get("DATABASE_URL")!
    expect(dbUrl.auditRequired).toBeUndefined()
    expect(dbUrl.evidence).toBeUndefined()
    expect(dbUrl.metadata).toBeUndefined()
  })
})

describe("extractCreateEnvOptionsName", () => {
  function objectLiteral(source: string): ts.Expression {
    const sourceFile = ts.createSourceFile(
      "/repo/x.ts",
      `const x = ${source};`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const decl = (sourceFile.statements[0] as ts.VariableStatement).declarationList.declarations[0]! // single "const x = ..." declaration, always exactly one
    return decl.initializer!
  }

  it("returns undefined when there is no options argument", () => {
    expect(extractCreateEnvOptionsName(undefined)).toBeUndefined()
  })

  it("returns undefined immediately when the options argument is not an inline object literal", () => {
    expect(extractCreateEnvOptionsName(objectLiteral(`sharedOptionsRef`))).toBeUndefined()
  })

  it("skips a spread element among the options object's own properties", () => {
    expect(extractCreateEnvOptionsName(objectLiteral(`{ ...shared, name: "payments" }`))).toBe(
      "payments",
    )
  })

  it('returns undefined when no property is named "name"', () => {
    expect(extractCreateEnvOptionsName(objectLiteral(`{ source: "runtime" }`))).toBeUndefined()
  })

  it("ignores name when it is not a statically-resolvable string literal", () => {
    expect(extractCreateEnvOptionsName(objectLiteral(`{ name: getName() }`))).toBeUndefined()
  })

  it("ignores name when it IS statically resolvable but not a string (e.g. a number literal)", () => {
    expect(extractCreateEnvOptionsName(objectLiteral(`{ name: 123 }`))).toBeUndefined()
  })
})
