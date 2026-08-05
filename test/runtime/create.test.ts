import util from "node:util"
import { beforeEach, describe, expect, it } from "vitest"
import { createEnv } from "../../src/runtime/create.js"
import { EnvNotReadyError } from "../../src/runtime/errors.js"
import { resetEnvCache } from "../../src/runtime/reset.js"
import { validateEnv } from "../../src/runtime/validate.js"

beforeEach(() => {
  resetEnvCache()
})

describe("createEnv", () => {
  it("throws EnvNotReadyError when a key is read before validateEnv runs", () => {
    const contract = createEnv({ PORT: { processor: (v) => Number(v) } }, { name: "test" })
    expect(() => contract.PORT).toThrow(EnvNotReadyError)
  })

  it("exposes one getter per schema key", () => {
    const contract = createEnv({ A: {}, B: {} }, { name: "multi-key" })
    expect(Object.keys(contract).sort()).toEqual(["A", "B"])
  })

  it("labels anonymous contracts (no name given) without throwing", () => {
    const contract = createEnv({ X: {} })
    expect(() => contract.X).toThrow(EnvNotReadyError)
  })

  it("accepts an optional source (e.g. import.meta.url) alongside name", async () => {
    const contract = createEnv(
      { X: { processor: (v) => String(v) } },
      { name: "sourced", source: "file:///repo/features/x/env.schema.ts" },
    )
    await validateEnv({ values: { X: "ok" }, manifest: [contract] })
    expect(contract.X).toBe("ok")
  })

  it("redacts the whole-object view so accidental logging can't leak values", () => {
    const contract = createEnv({ SECRET: {} }, { name: "redact-test" })
    expect(JSON.stringify(contract)).toBe('"[EnvContract:redact-test]"')
    expect(String(contract)).toBe('EnvContract("redact-test")')
  })

  it("redacts via util.inspect() directly -- the actual mechanism console.log uses", async () => {
    const contract = createEnv({ SECRET: { processor: (v) => String(v) } }, { name: "redact-test" })
    await validateEnv({ values: { SECRET: "sk_live_should_not_appear" }, manifest: [contract] })

    const inspected = util.inspect(contract)
    expect(inspected).toBe('EnvContract("redact-test") { 1 variable(s) }')
    expect(inspected).not.toContain("sk_live_should_not_appear")
  })

  it("redacts via util.inspect() when the contract is nested inside a plain object or an array", async () => {
    const contract = createEnv({ SECRET: { processor: (v) => String(v) } }, { name: "redact-test" })
    await validateEnv({ values: { SECRET: "sk_live_should_not_appear" }, manifest: [contract] })

    const nestedInObject = util.inspect({ config: contract })
    expect(nestedInObject).toContain('EnvContract("redact-test") { 1 variable(s) }')
    expect(nestedInObject).not.toContain("sk_live_should_not_appear")

    const nestedInArray = util.inspect([contract])
    expect(nestedInArray).toContain('EnvContract("redact-test") { 1 variable(s) }')
    expect(nestedInArray).not.toContain("sk_live_should_not_appear")
  })

  it("freezes the returned contract object", () => {
    const contract = createEnv({ A: {} }, { name: "frozen" })
    expect(Object.isFrozen(contract)).toBe(true)
  })

  it("throws the cached validation error (not EnvNotReadyError) when a key is read after validateEnv already failed for this contract", async () => {
    const contract = createEnv(
      {
        PORT: {
          processor: () => {
            throw new Error("bad port")
          },
        },
      },
      { name: "failed-contract" },
    )
    const error = await validateEnv({ values: {}, manifest: [contract] }).catch((e: unknown) => e)

    expect(() => contract.PORT).toThrow(error as Error)
  })

  it("throws EnvNotReadyError (not undefined) reading a key skipped by validation contexts, even after the rest of the contract validated successfully", async () => {
    const contract = createEnv(
      {
        DATABASE_URL: { context: "server", processor: (v) => String(v) },
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
        LOG_LEVEL: { processor: (v) => String(v ?? "info") },
      },
      { name: "context-skip" },
    )
    await validateEnv({ values: {}, manifest: [contract], activeContexts: ["client"] })

    expect(contract.LOG_LEVEL).toBe("info")
    expect(() => contract.DATABASE_URL).toThrow(EnvNotReadyError)
  })

  it("only accepts name/source -- documentation fields live on documentEnv, not here", async () => {
    // CreateEnvOptions has no active/exclusiveGroup/category/metadata anymore --
    // this is a type-level guarantee (see types.test.ts), exercised here just
    // to confirm the minimal runtime option set still works end-to-end.
    const contract = createEnv(
      { DATABASE_URL: { processor: (v) => String(v) } },
      { name: "postgres", source: "file:///repo/features/postgres/env.schema.ts" },
    )
    await validateEnv({
      values: { DATABASE_URL: "postgres://localhost/app" },
      manifest: [contract],
    })
    expect(contract.DATABASE_URL).toBe("postgres://localhost/app")
  })
})
