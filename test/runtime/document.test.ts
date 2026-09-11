import { describe, expect, it } from "vitest"
import { createEnv } from "../../src/runtime/create.js"
import { documentEnv } from "../../src/runtime/document.js"
import type { EnvSchema } from "../../src/runtime/types.js"

describe("documentEnv", () => {
  it("returns undefined and never throws for a well-formed call", () => {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- coercing an unknown raw value to string, same idiom as helpers/processors.ts
    const schema = { STRIPE_KEY: { processor: (v: unknown) => String(v ?? "") } }
    // Deliberately capturing a `void`-typed return to assert it's genuinely
    // undefined -- the whole point of this test (documentEnv() is inert,
    // ADR 0001), not an accidental misuse of a void expression.
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = documentEnv(schema, {
      variables: {
        STRIPE_KEY: {
          description: "Stripe secret key.",
          owner: "payments-team",
          expiresAt: "2026-06-01",
        },
      },
    })
    expect(result).toBeUndefined()
  })

  it("accepts name as a contract-level field", () => {
    const schema = { STRIPE_KEY: {} }
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = documentEnv(schema, { name: "Payments" })
    expect(result).toBeUndefined()
  })

  it("rejects, at compile time, a variables key that doesn't exist on the passed schema", () => {
    const schema = { STRIPE_KEY: {} }
    expect(() => {
      documentEnv(schema, {
        variables: {
          // @ts-expect-error -- "STRIPE_KEY_TYPO" isn't a key of `schema` -- catches a rename/typo statically, before the generator ever has to report it as "stale".
          STRIPE_KEY_TYPO: { description: "typo'd key" },
        },
      })
    }).not.toThrow()
  })

  it("still accepts a documented-but-not-required subset of a schema's keys -- documenting every variable is never mandatory", () => {
    const schema = { A: {}, B: {}, C: {} }
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = documentEnv(schema, {
      variables: { B: { description: "only B is documented" } },
    })
    expect(result).toBeUndefined()
  })

  it("falls back to accepting any string key when schema is explicitly widened to the bare EnvSchema type", () => {
    const schema: EnvSchema = { A: {} }
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = documentEnv(schema, {
      variables: { ANYTHING_AT_ALL: { description: "widened" } },
    })
    expect(result).toBeUndefined()
  })

  it("never throws even for malformed/nonsensical input", () => {
    const schema = { A: {} }
    expect(() => {
      // @ts-expect-error -- deliberately wrong shape (null instead of ContractDocs), to prove the runtime guarantee holds even when TypeScript wouldn't have allowed this call.
      documentEnv(schema, null)
    }).not.toThrow()
    expect(() => {
      // @ts-expect-error -- deliberately wrong shape (null instead of a schema object).
      documentEnv(null, { variables: {} })
    }).not.toThrow()
    expect(() => {
      // @ts-expect-error -- deliberately wrong shape (a string instead of ContractDocs).
      documentEnv(schema, "not an object")
    }).not.toThrow()
    expect(() => {
      documentEnv(schema, {})
    }).not.toThrow()
  })

  it("does not affect createEnv/validateEnv -- calling it, or not, changes nothing observable", async () => {
    const { validateEnv } = await import("../../src/runtime/validate.js")
    const { resetEnvCache } = await import("../../src/runtime/reset.js")
    resetEnvCache()

    const schema = { PORT: { default: 3000, processor: (v: unknown) => Number(v) } }
    const contract = createEnv(schema, { name: "documented" })
    documentEnv(schema, { variables: { PORT: { description: "The port to listen on." } } })

    await validateEnv({ values: {}, manifest: [contract] })
    expect(contract.PORT).toBe(3000)
  })

  it("retains nothing observable -- the docs object is not attached to the contract or any registry the runtime reads", () => {
    const schema = { SECRET: { processor: (v: unknown) => String(v) } }
    const contract = createEnv(schema, { name: "no-retention" })
    documentEnv(schema, { variables: { SECRET: { description: "sensitive-looking-marker-text" } } })

    // Nothing about documentEnv's call should be reachable from the contract itself.
    expect(JSON.stringify(contract)).not.toContain("sensitive-looking-marker-text")
    expect(String(contract)).not.toContain("sensitive-looking-marker-text")
  })
})
