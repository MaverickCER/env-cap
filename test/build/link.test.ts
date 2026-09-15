import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { nodeBuildFs } from "../support/build-filesystem.js"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs/promises"
import { effectiveSensitivity, effectiveOwner, linkFiles } from "../../src/build/link.js"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import type { ImportResolutionContext } from "../../src/build/resolution/resolve-import.js"
import type { PackageSchemaResolutionResult } from "../../src/build/resolution/resolve-package-schema.js"
import {
  createAliasResolutionCache,
  loadTsconfigPaths,
} from "../../src/build/resolution/resolve-tsconfig-paths.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-link")

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

const readFile = (filePath: string) => fs.readFile(filePath, "utf8")

// No test in this file (outside the alias-resolution test below) exercises
// cross-package discovery (ADR 0014) or tsconfig alias resolution (ADR 0023).
const context: ImportResolutionContext = {
  fs: nodeBuildFs,
  root: fixtureRoot,
  packages: [],
  cache: new Map<string, Promise<PackageSchemaResolutionResult>>(),
  tsconfigPaths: undefined,
  aliasCache: createAliasResolutionCache(),
}

beforeEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})
afterEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("linkFiles", () => {
  it("links a same-file createEnv + documentEnv pair via a shared local const", async () => {
    const file = await write(
      "payments/env.schema.ts",
      `
      import { createEnv, documentEnv } from "env-cap";
      const paymentsSchema = { STRIPE_KEY: { processor: (v) => String(v) } };
      export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
      documentEnv(paymentsSchema, { variables: { STRIPE_KEY: { description: "Stripe secret key." } } });
      `,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.contracts).toHaveLength(1)
    expect(result.contracts[0]?.documented).toBe(true)
    expect(result.contracts[0]?.variables[0]?.description).toBe("Stripe secret key.")
    expect(result.undocumentedContracts).toHaveLength(0)
    expect(result.undocumentedVariables).toHaveLength(0)
  })

  it("reads each discovered file exactly once, even when it's ALSO the cross-file import target of another discovered file's documentEnv call", async () => {
    // schemaFile is pre-analyzed once in the discoveredFiles pre-pass, then
    // resolved AGAIN as docsFile's import target during linking -- the
    // second lookup must hit `getAnalysis()`'s own cache, not re-read the
    // file from disk.
    const schemaFile = await write(
      "payments/env.schema.ts",
      `export const paymentsSchema = { STRIPE_KEY: {} };
      export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });`,
    )
    const docsFile = await write(
      "docs/payments.docs.ts",
      `import { paymentsSchema } from "../payments/env.schema.js";
      documentEnv(paymentsSchema, { owner: "payments-team" });`,
    )

    const readCounts = new Map<string, number>()
    const countingReadFile = async (filePath: string): Promise<string> => {
      readCounts.set(filePath, (readCounts.get(filePath) ?? 0) + 1)
      return readFile(filePath)
    }

    const result = await linkFiles([schemaFile, docsFile], countingReadFile, context)
    expect(result.contracts[0]?.documented).toBe(true)
    expect(readCounts.get(schemaFile)).toBe(1)
    expect(readCounts.get(docsFile)).toBe(1)
  })

  it("links a cross-file createEnv + documentEnv pair via a named import", async () => {
    const schemaFile = await write(
      "payments/env.schema.ts",
      `
      export const paymentsSchema = { STRIPE_KEY: { processor: (v) => String(v) } };
      export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" });
      `,
    )
    const docsFile = await write(
      "docs/payments.docs.ts",
      `
      import { paymentsSchema } from "../payments/env.schema.js";
      documentEnv(paymentsSchema, { owner: "payments-team", sensitivity: "credential", deprecated: true, deprecatedReason: "Superseded by payments-v2.", variables: { STRIPE_KEY: { description: "Stripe secret key.", sensitivity: "secret", removeBy: "2027-01-01", renamedFrom: "STRIPE_SECRET" } } });
      `,
    )

    const result = await linkFiles([schemaFile, docsFile], readFile, context)
    expect(result.contracts).toHaveLength(1)
    expect(result.contracts[0]?.documented).toBe(true)
    expect(result.contracts[0]?.owner).toBe("payments-team")
    expect(result.contracts[0]?.sensitivity).toBe("credential")
    expect(result.contracts[0]?.deprecated).toBe(true)
    expect(result.contracts[0]?.deprecatedReason).toBe("Superseded by payments-v2.")
    expect(result.contracts[0]?.variables[0]?.description).toBe("Stripe secret key.")
    expect(result.contracts[0]?.variables[0]?.sensitivity).toBe("secret")
    expect(result.contracts[0]?.variables[0]?.removeBy).toBe("2027-01-01")
    expect(result.contracts[0]?.variables[0]?.renamedFrom).toBe("STRIPE_SECRET")
  })

  it("resolves a documentEnv() schema reference imported through a tsconfig path alias (ADR 0023, Experimental)", async () => {
    await write(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["*"] },
          module: "ESNext",
          moduleResolution: "Bundler",
        },
      }),
    )
    const schemaFile = await write(
      "shipping/env.schema.ts",
      `
      export const shippingSchema = { CARRIER_KEY: {} };
      export const shippingEnv = createEnv(shippingSchema, { name: "shipping" });
      `,
    )
    const docsFile = await write(
      "docs/shipping.docs.ts",
      `
      import { shippingSchema } from "@/shipping/env.schema.js";
      documentEnv(shippingSchema, { variables: { CARRIER_KEY: { description: "Carrier API key." } } });
      `,
    )

    const { resolution, warning } = await loadTsconfigPaths(fixtureRoot, undefined, nodeBuildFs)
    expect(warning).toBeUndefined()
    const aliasContext: ImportResolutionContext = {
      ...context,
      tsconfigPaths: resolution,
      aliasCache: createAliasResolutionCache(),
    }

    const result = await linkFiles([schemaFile, docsFile], readFile, aliasContext)
    expect(result.contracts[0]?.documented).toBe(true)
    expect(result.contracts[0]?.variables[0]?.description).toBe("Carrier API key.")
  })

  it("resolves a cross-file import aliased with `as`", async () => {
    const schemaFile = await write(
      "billing/env.schema.ts",
      `
      export const billingSchema = { INVOICE_KEY: {} };
      export const billingEnv = createEnv(billingSchema, { name: "billing" });
      `,
    )
    const docsFile = await write(
      "docs/billing.docs.ts",
      `
      import { billingSchema as schema } from "../billing/env.schema.js";
      documentEnv(schema, { variables: { INVOICE_KEY: { description: "Invoice signing key." } } });
      `,
    )

    const result = await linkFiles([schemaFile, docsFile], readFile, context)
    expect(result.contracts[0]?.documented).toBe(true)
    expect(result.contracts[0]?.variables[0]?.description).toBe("Invoice signing key.")
  })

  it("reports a createEnv with no linked documentEnv as undocumented, at both contract and variable level", async () => {
    const file = await write(
      "orphan/env.schema.ts",
      `export const orphanEnv = createEnv({ A: {}, B: {} }, { name: "orphan" });`,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.undocumentedContracts).toEqual([{ file, exportName: "orphanEnv" }])
    expect(result.undocumentedVariables.map((v) => v.key).sort()).toEqual(["A", "B"])
  })

  it("reports individual undocumented variables even when the contract has a linked documentEnv", async () => {
    const file = await write(
      "partial/env.schema.ts",
      `
      const schema = { DOCUMENTED: {}, UNDOCUMENTED: {} };
      export const partialEnv = createEnv(schema, { name: "partial" });
      documentEnv(schema, { variables: { DOCUMENTED: { description: "This one is documented." } } });
      `,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.undocumentedContracts).toHaveLength(0)
    expect(result.undocumentedVariables).toEqual([
      { file, exportName: "partialEnv", key: "UNDOCUMENTED" },
    ])
    const variables = result.contracts[0]!.variables
    expect(variables.find((v) => v.key === "DOCUMENTED")?.documented).toBe(true)
    expect(variables.find((v) => v.key === "UNDOCUMENTED")?.documented).toBe(false)
  })

  it("reports a stale doc entry for a documented key with no matching schema variable", async () => {
    const file = await write(
      "stale/env.schema.ts",
      `
      const schema = { STILL_HERE: {} };
      export const staleEnv = createEnv(schema, { name: "stale" });
      documentEnv(schema, { variables: { STILL_HERE: {}, LONG_GONE: { description: "No longer in the schema." } } });
      `,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.staleDocEntries).toEqual([{ file, exportName: "staleEnv", key: "LONG_GONE" }])
  })

  it("reports an unresolvable documentEnv() reference (bare/package specifier) as an unresolved link, not a throw", async () => {
    const file = await write(
      "unresolved/docs.ts",
      `
      import { someSchema } from "some-package";
      documentEnv(someSchema, {});
      `,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.unresolvedLinks).toHaveLength(1)
    expect(result.unresolvedLinks[0]?.file).toBe(file)
    expect(result.unresolvedLinks[0]?.reason).toBe(
      "documentEnv() call could not be statically linked to a schema (its first argument isn't an inline object literal or a resolvable local/imported reference).",
    )
    expect(result.contracts).toHaveLength(0)
  })

  it("warns, with the exact message, when a createEnv() call's schema argument isn't statically resolvable", async () => {
    const file = await write(
      "unresolvable-schema/env.ts",
      `
      export const dynamicEnv = createEnv(someFactory(), { name: "dynamic" });
      `,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toEqual({
      file,
      message:
        'createEnv() call for "dynamicEnv" does not pass an inline object literal or a statically-resolvable schema reference; skipping static analysis for this contract.',
    })
    expect(result.contracts).toHaveLength(0)
  })

  it("reports an unresolvable documentEnv() reference to a nonexistent file as an unresolved link", async () => {
    const file = await write(
      "missing-target/docs.ts",
      `
      import { schema } from "./does-not-exist.js";
      documentEnv(schema, {});
      `,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.unresolvedLinks).toHaveLength(1)
  })

  it("an inline schema literal passed directly to createEnv can never be linked (each is uniquely unlinkable)", async () => {
    const file = await write(
      "inline/env.schema.ts",
      `export const inlineEnv = createEnv({ A: {} }, { name: "inline" });`,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.contracts).toHaveLength(1)
    expect(result.contracts[0]?.documented).toBe(false)
    expect(result.undocumentedContracts).toHaveLength(1)
  })

  it("two UNRELATED inline schema literals in the same file (one createEnv, one documentEnv) never coincidentally correlate with each other", async () => {
    // Each inline literal's identity is derived from its own AST node
    // position -- if that were ever collapsed to a constant, two separate
    // inline literals in the same file would collide and wrongly link.
    const file = await write(
      "unrelated-inline/env.schema.ts",
      `export const inlineEnv = createEnv({ A: {} }, { name: "inline" });
      documentEnv({ B: {} }, { owner: "some-other-team" });`,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.contracts).toHaveLength(1)
    expect(result.contracts[0]?.documented).toBe(false)
    expect(result.contracts[0]?.owner).toBeUndefined()
  })

  it("labels a documentEnv() inline schema's own warnings with the exact \"documentEnv() call\" context label -- distinct from createEnv's own label", async () => {
    // A spread element inside the inline schema literal argument triggers
    // extractSchemaVariables()'s "Skipped a non-static schema entry in
    // \"<contextLabel>\"" warning -- the one place `resolveSchema`'s own
    // "documentEnv() call" label (passed only for a documentEnv ref, never
    // a createEnv one) is actually observable.
    const file = await write(
      "docs-inline-spread/env.schema.ts",
      `documentEnv({ ...someSpread, A: {} }, {});`,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.warnings.some((w) => w.message.includes('"documentEnv() call"'))).toBe(true)
  })

  it("surfaces a per-file parse-time warning (an unexported createEnv() call) in the aggregated result.warnings, even with no createEnv/documentEnv resolution work at all", async () => {
    // `parseSchemaFile()`'s own warning for an unexported call is pushed
    // during parsing, completely independent of `linkFiles`'s own
    // createEnv/documentEnv correlation loops (an unexported call is
    // `continue`d before ever being added to `createEnvCalls`) -- the ONLY
    // path this warning can reach `result.warnings` through is the final
    // `for (const analysis of analysisCache.values())` sweep.
    const file = await write(
      "unexported/env.schema.ts",
      `const localEnv = createEnv({ A: {} }, { name: "local" });`,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.contracts).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toEqual({
      file,
      message:
        'createEnv() call for "localEnv" is not exported; it can never be included in a generated manifest, so it\'s skipped entirely.',
    })
  })

  it("rejects with the internal map-utils invariant error when a discovered file can't be read", async () => {
    // getAnalysis()'s own read failure leaves the file uncached (see
    // link.ts's comment on mustGet) -- the outer createEnvCalls/
    // documentEnvCalls loops then call mustGet() on that same file and
    // throw, rather than silently dropping it. Exercises both getAnalysis's
    // catch branch and map-utils.ts's own invariant throw, neither hit by
    // any other test.
    const file = await write(
      "unreadable/env.schema.ts",
      `export const unreadableEnv = createEnv({ A: {} }, { name: "unreadable" });`,
    )
    const alwaysFails = () => Promise.reject(new Error("simulated read failure"))

    await expect(linkFiles([file], alwaysFails, context)).rejects.toThrow(
      /expected key .* to be present in map/,
    )
  })

  it("reports an unresolvable documentEnv() reference to an identifier that is neither a local const nor a tracked import", async () => {
    const file = await write(
      "undeclared/docs.ts",
      `
      documentEnv(someGlobalThing, {});
      `,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.unresolvedLinks).toHaveLength(1)
    expect(result.unresolvedLinks[0]?.file).toBe(file)
    expect(result.contracts).toHaveLength(0)
  })

  it("reports an unresolvable documentEnv() reference when the cross-file import target exists but can't be read", async () => {
    const helperFile = await write("helper/schema-source.ts", `export const schema = { A: {} };`)
    const docsFile = await write(
      "consumer/docs.ts",
      `
      import { schema } from "../helper/schema-source.js";
      documentEnv(schema, {});
      `,
    )

    // helperFile exists on disk (so resolveImportSpecifier's fs.stat-based
    // resolution succeeds) but this reader specifically fails to read it,
    // simulating e.g. a permission error -- distinct from the "nonexistent
    // file" case already covered above.
    const readExceptHelper = (filePath: string) =>
      filePath === helperFile
        ? Promise.reject(new Error("simulated read failure"))
        : readFile(filePath)

    const result = await linkFiles([docsFile], readExceptHelper, context)
    expect(result.unresolvedLinks).toHaveLength(1)
    expect(result.unresolvedLinks[0]?.file).toBe(docsFile)
    expect(result.contracts).toHaveLength(0)
  })

  it("reports an unresolvable documentEnv() reference when the imported name has no matching const in the target file", async () => {
    await write("helper/no-such-export.ts", `export const somethingElse = { A: {} };`)
    const docsFile = await write(
      "consumer2/docs.ts",
      `
      import { schema } from "../helper/no-such-export.js";
      documentEnv(schema, {});
      `,
    )

    const result = await linkFiles([docsFile], readFile, context)
    expect(result.unresolvedLinks).toHaveLength(1)
  })

  it("reports an unresolvable documentEnv() reference when the imported name is a local const in the target file but not exported", async () => {
    await write("helper/not-exported.ts", `const schema = { A: {} };\nexport const other = 1;`)
    const docsFile = await write(
      "consumer3/docs.ts",
      `
      import { schema } from "../helper/not-exported.js";
      documentEnv(schema, {});
      `,
    )

    const result = await linkFiles([docsFile], readFile, context)
    expect(result.unresolvedLinks).toHaveLength(1)
  })

  it("when the same schema has two documentEnv() calls, the first one found wins silently", async () => {
    const file = await write(
      "duplicate/env.schema.ts",
      `
      const schema = { A: {} };
      export const dupEnv = createEnv(schema, { name: "dup" });
      documentEnv(schema, { owner: "first-owner" });
      documentEnv(schema, { owner: "second-owner" });
      `,
    )

    const result = await linkFiles([file], readFile, context)
    expect(result.contracts).toHaveLength(1)
    expect(result.contracts[0]?.owner).toBe("first-owner")
  })

  it("never executes any discovered file", async () => {
    const file = await write(
      "danger/env.schema.ts",
      `
      throw new Error("must never run during linking");
      export const dangerEnv = createEnv({ A: {} }, { name: "danger" });
      `,
    )

    await expect(linkFiles([file], readFile, context)).resolves.toBeDefined()
  })
})

function makeVariable(
  overrides: Partial<DiscoveredVariable> & { key: string },
): DiscoveredVariable {
  return {
    hasDefault: false,
    defaultValue: undefined,
    hasProcessor: false,
    processorSource: undefined,
    processorReturnType: undefined,
    hasValidator: false,
    validatorSource: undefined,
    context: undefined,
    description: undefined,
    owner: undefined,
    sensitivity: undefined,
    expiresAt: undefined,
    refreshInstructions: undefined,
    setupInstructions: undefined,
    required: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    removeBy: undefined,
    renamedFrom: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    evidence: undefined,
    documented: true,
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    ...overrides,
  }
}

function makeContract(
  overrides: Partial<DiscoveredContract> & { file: string; exportName: string },
): DiscoveredContract {
  return {
    contractName: overrides.exportName,
    active: true,
    category: undefined,
    exclusiveGroup: undefined,
    owner: undefined,
    sensitivity: undefined,
    expiresAt: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    variables: [],
    documented: true,
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    documentation: undefined,
    packageOrigin: undefined,
    ...overrides,
  }
}

describe("effectiveOwner", () => {
  it("returns the variable's own owner when it sets one, even if the contract also sets one", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      owner: "contract-team",
    })
    const variable = makeVariable({ key: "KEY", owner: "variable-team" })
    expect(effectiveOwner(contract, variable)).toBe("variable-team")
  })

  it("falls back to the contract's owner when the variable doesn't set one", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      owner: "contract-team",
    })
    const variable = makeVariable({ key: "KEY" })
    expect(effectiveOwner(contract, variable)).toBe("contract-team")
  })

  it("returns undefined when neither the variable nor the contract sets an owner", () => {
    const contract = makeContract({ file: "/repo/a/env.schema.ts", exportName: "aEnv" })
    const variable = makeVariable({ key: "KEY" })
    expect(effectiveOwner(contract, variable)).toBeUndefined()
  })
})

describe("effectiveSensitivity", () => {
  it("falls back to the contract's sensitivity when the variable doesn't set one", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      sensitivity: "secret",
    })
    const variable = makeVariable({ key: "KEY" })
    expect(effectiveSensitivity(contract, variable)).toBe("secret")
  })

  it("returns the variable's own sensitivity when it overrides the contract's", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      sensitivity: "secret",
    })
    const variable = makeVariable({ key: "KEY", sensitivity: "config" })
    expect(effectiveSensitivity(contract, variable)).toBe("config")
  })

  it("returns the variable's own sensitivity when the contract sets none", () => {
    const contract = makeContract({ file: "/repo/a/env.schema.ts", exportName: "aEnv" })
    const variable = makeVariable({ key: "KEY", sensitivity: "secret" })
    expect(effectiveSensitivity(contract, variable)).toBe("secret")
  })
})
