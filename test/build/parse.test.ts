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

  it("skips a destructuring top-level declaration -- its name is not a plain identifier binding", () => {
    const source = `
      const { NODE_ENV } = process.env;
      export const paymentsEnv = createEnv({ X: {} });
    `
    const result = parseSchemaFile("/repo/x.ts", source)
    expect(result.localConsts.size).toBe(0)
    expect(result.createEnvCalls).toHaveLength(1)
  })

  it("treats a createEnv() call with no schema argument at all as unresolvable", () => {
    const result = parseSchemaFile("/repo/x.ts", `export const emptyEnv = createEnv();`)
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
    const decl = (sourceFile.statements[0] as ts.VariableStatement).declarationList.declarations[0]
    return decl.initializer as ts.ObjectLiteralExpression
  }

  it("extracts processor/validator/default presence and the processor's explicit return type", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{
        STRIPE_KEY: { processor: (value): string => String(value), validator: (value) => value.length > 0 },
        PORT: { default: 3000, processor: (value): number => Number(value) },
      }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
    )
    expect(warnings).toHaveLength(0)
    const stripeKey = variables.find((v) => v.key === "STRIPE_KEY")!
    expect(stripeKey.hasProcessor).toBe(true)
    expect(stripeKey.processorReturnType).toBe("string")
    expect(stripeKey.hasValidator).toBe(true)

    const port = variables.find((v) => v.key === "PORT")!
    expect(port.hasDefault).toBe(true)
    expect(port.defaultValue).toEqual({ ok: true, value: 3000 })
    expect(port.processorReturnType).toBe("number")
  })

  it("warns and skips a schema entry that is not an inline object literal", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ TOKEN: shared }`),
      "/repo/x.ts",
      "weirdEnv",
      warnings,
    )
    expect(variables).toHaveLength(0)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it("warns and skips a quoted key that is not a valid environment variable name", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ "FOO=BAR\\nEVIL_KEY": {}, GOOD_KEY: {} }`),
      "/repo/x.ts",
      "injectedEnv",
      warnings,
    )
    expect(variables.map((v) => v.key)).toEqual(["GOOD_KEY"])
    expect(warnings.some((w) => w.message.includes("not a valid environment variable name"))).toBe(
      true,
    )
  })

  it("warns and skips a spread element in a schema object literal", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ ...shared, GOOD_KEY: {} }`),
      "/repo/x.ts",
      "spreadEnv",
      warnings,
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
    )
    expect(variables[0]?.hasProcessor).toBe(true)
  })

  it("extracts a processor defined as a function expression (not an arrow function) with an explicit return type", () => {
    const variables = extractSchemaVariables(
      literal(`{ STRIPE_KEY: { processor: function (v): string { return String(v); } } }`),
      "/repo/x.ts",
      "testEnv",
      [],
    )
    expect(variables[0]?.hasProcessor).toBe(true)
    expect(variables[0]?.processorReturnType).toBe("string")
  })

  it("extracts a variable's validation context from a string literal", () => {
    const warnings: { file: string; message: string }[] = []
    const variables = extractSchemaVariables(
      literal(`{ DATABASE_URL: { context: "server", processor: (v) => v } }`),
      "/repo/x.ts",
      "testEnv",
      warnings,
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
    )
    expect(variables[0]?.context).toBeUndefined()
    expect(
      warnings.some((w) => w.message.includes("not a statically-resolvable string literal")),
    ).toBe(true)
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
    const decl = (sourceFile.statements[0] as ts.VariableStatement).declarationList.declarations[0]
    return decl.initializer!
  }

  it("defaults to active: true and undefined fields when no docs argument is given", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(undefined, "/repo/x.ts", "plain", warnings)
    expect(docs.active).toBe(true)
    expect(docs.category).toBeUndefined()
    expect(docs.exclusiveGroup).toBeUndefined()
    expect(docs.owner).toBeUndefined()
    expect(docs.classification).toBeUndefined()
    expect(docs.expiresAt).toBeUndefined()
    expect(docs.variables.size).toBe(0)
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
        classification: "credential",
        expiresAt: "2026-01-01",
        metadata: { runbook: "https://wiki.internal/postgres" },
        variables: {
          DATABASE_URL: {
            description: "Postgres connection string.",
            owner: "data-platform",
            classification: "secret",
            expiresAt: "2026-06-01",
            refreshInstructions: "Rotate in the RDS console.",
            required: true,
            setup: "Ask #data-platform for a connection string.",
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
      classification: "credential",
      expiresAt: "2026-01-01",
      metadata: { runbook: "https://wiki.internal/postgres" },
    })
    const dbUrl = docs.variables.get("DATABASE_URL")!
    expect(dbUrl.description).toBe("Postgres connection string.")
    expect(dbUrl.owner).toBe("data-platform")
    expect(dbUrl.classification).toBe("secret")
    expect(dbUrl.expiresAt).toBe("2026-06-01")
    expect(dbUrl.refreshInstructions).toBe("Rotate in the RDS console.")
    expect(dbUrl.required).toBe(true)
    expect(dbUrl.extra).toEqual({ setup: "Ask #data-platform for a connection string." })
  })

  it("warns and ignores classification when not one of the known values", async () => {
    const warnings: { file: string; message: string }[] = []
    const docs = extractContractDocs(
      objectLiteral(`{ classification: "top-secret" }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.classification).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"classification"'))).toBe(true)
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

  it("warns and ignores metadata when not a statically-resolvable string record", async () => {
    const warnings: { file: string; message: string }[] = []
    // `null` is a statically-evaluable literal, so it reaches isStringRecord()
    // rather than being rejected earlier by evaluateLiteral() -- exercising
    // isStringRecord's own "not an object" rejection.
    const docs = extractContractDocs(
      objectLiteral(`{ metadata: null }`),
      "/repo/x.ts",
      "weird",
      warnings,
    )
    expect(docs.metadata).toBeUndefined()
    expect(warnings.some((w) => w.message.includes('"metadata"'))).toBe(true)
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

  it("silently skips (never warns on) per-variable fields that aren't statically evaluable or are wrong-typed, and drops non-string extra fields", async () => {
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
    expect(dbUrl.extra).toEqual({ setup: "Ask #data-platform." })
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
    const decl = (sourceFile.statements[0] as ts.VariableStatement).declarationList.declarations[0]
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
})
