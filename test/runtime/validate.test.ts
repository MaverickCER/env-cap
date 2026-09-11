import { beforeEach, describe, expect, it } from "vitest"
import { getState } from "../../src/runtime/cache.js"
import { createEnv } from "../../src/runtime/create.js"
import { EnvNotReadyError, EnvValidationError } from "../../src/runtime/errors.js"
import { resetEnvCache } from "../../src/runtime/reset.js"
import { validateEnv } from "../../src/runtime/validate.js"

// validateEnv() only ever initializes once per process -- every test gets a
// clean slate so it can validate its own scenario from "uninitialized".
beforeEach(() => {
  resetEnvCache()
})

describe("validateEnv pipeline", () => {
  it("applies default only when the raw value is undefined", async () => {
    const contract = createEnv(
      { PORT: { default: 3000, processor: (v) => Number(v) } },
      { name: "defaults" },
    )
    await validateEnv({ values: {}, manifest: [contract] })
    expect(contract.PORT).toBe(3000)
  })

  it("prefers the raw value over the default when present", async () => {
    const contract = createEnv(
      { PORT: { default: 3000, processor: (v) => Number(v) } },
      { name: "defaults-override" },
    )
    await validateEnv({ values: { PORT: "8080" }, manifest: [contract] })
    expect(contract.PORT).toBe(8080)
  })

  it("supports thunk defaults", async () => {
    const contract = createEnv(
      { CREATED_AT: { default: () => "computed", processor: (v) => String(v) } },
      { name: "thunk-defaults" },
    )
    await validateEnv({ values: {}, manifest: [contract] })
    expect(contract.CREATED_AT).toBe("computed")
  })

  it("runs the processor before the validator, in order", async () => {
    const contract = createEnv(
      {
        PORT: {
          processor: (v) => Number(v),
          validator: (v) => (Number.isInteger(v) ? true : "must be an integer"),
        },
      },
      { name: "order" },
    )
    await validateEnv({ values: { PORT: "3000" }, manifest: [contract] })
    expect(contract.PORT).toBe(3000)
  })

  it("passes rawEnv into the validator for conditional validation", async () => {
    const contract = createEnv(
      {
        STRIPE_KEY: {
          // Same "coerce unknown to string" idiom as helpers/processors.ts's
          // own String(value ?? "") -- see that file's lint-config comment.
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          processor: (v) => String(v ?? ""),
          validator: (value: string, rawEnv) => {
            if (rawEnv.PAYMENT_PROVIDER !== "stripe") return true
            return value.length > 0 || "Stripe key is required."
          },
        },
      },
      { name: "conditional" },
    )
    await validateEnv({ values: { PAYMENT_PROVIDER: "paypal" }, manifest: [contract] })
    expect(contract.STRIPE_KEY).toBe("")
  })

  it("aggregates a processor failure and a validator failure from different contracts into one error", async () => {
    const database = createEnv(
      {
        DATABASE_URL: {
          processor: () => {
            throw new Error("Invalid database URL format.")
          },
        },
      },
      { name: "database" },
    )
    const payments = createEnv(
      {
        STRIPE_KEY: {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
          processor: (v) => String(v ?? ""),
          validator: (v: string) => v.length > 0 || "Stripe key is required.",
        },
      },
      { name: "payments" },
    )

    try {
      await validateEnv({ values: {}, manifest: [database, payments] })
      throw new Error("expected validateEnv to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      const validationError = error as EnvValidationError
      expect(validationError.failures).toHaveLength(2)
      expect(validationError.failures[0]?.kind).toBe("processor")
      expect(validationError.failures[0]?.variable).toBe("DATABASE_URL")
      expect(validationError.failures[1]?.kind).toBe("validator")
      expect(validationError.message).toContain("2 configuration errors found")
      expect(validationError.message).toContain("DATABASE_URL")
      expect(validationError.message).toContain("STRIPE_KEY")
      expect(validationError.message).toContain("Source:")
      expect(validationError.message).toContain("database")
    }
  })

  it("does not run the validator after a processor failure", async () => {
    let validatorCalled = false
    const contract = createEnv(
      {
        PORT: {
          processor: () => {
            throw new Error("bad port")
          },
          validator: () => {
            validatorCalled = true
            return true
          },
        },
      },
      { name: "skip-validator" },
    )

    await expect(validateEnv({ values: {}, manifest: [contract] })).rejects.toThrow(
      EnvValidationError,
    )
    expect(validatorCalled).toBe(false)
  })

  it("catches an exception thrown by a validator and reports it as a validation failure", async () => {
    const contract = createEnv(
      {
        PORT: {
          processor: (v) => Number(v),
          validator: () => {
            throw new Error("unexpected validator crash")
          },
        },
      },
      { name: "validator-throws" },
    )

    await expect(validateEnv({ values: { PORT: "80" }, manifest: [contract] })).rejects.toThrow(
      /unexpected validator crash/,
    )
  })

  it("never leaks the raw or processed value into the aggregated error message", async () => {
    const contract = createEnv(
      {
        SECRET_TOKEN: {
          processor: (v) => String(v),
          validator: (v: string) => v.startsWith("sk_") || "Token must start with sk_.",
        },
      },
      { name: "no-leak" },
    )

    try {
      await validateEnv({
        values: { SECRET_TOKEN: "super-secret-value-should-not-appear" },
        manifest: [contract],
      })
      throw new Error("expected validateEnv to throw")
    } catch (error) {
      const validationError = error as EnvValidationError
      expect(validationError.message).not.toContain("super-secret-value-should-not-appear")
    }
  })

  it("reports a bare string thrown from a processor as its exact message (toMessage's String(cause) branch)", async () => {
    const contract = createEnv(
      {
        PORT: {
          processor: () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw "boom"
          },
        },
      },
      { name: "throws-string" },
    )

    try {
      await validateEnv({ values: {}, manifest: [contract] })
      throw new Error("expected validateEnv to throw")
    } catch (error) {
      const validationError = error as EnvValidationError
      expect(validationError.failures[0]?.message).toBe("boom")
    }
  })

  it("reports a number thrown from a processor as its stringified message", async () => {
    const contract = createEnv(
      {
        PORT: {
          processor: () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw 42
          },
        },
      },
      { name: "throws-number" },
    )

    try {
      await validateEnv({ values: {}, manifest: [contract] })
      throw new Error("expected validateEnv to throw")
    } catch (error) {
      const validationError = error as EnvValidationError
      expect(validationError.failures[0]?.message).toBe("42")
    }
  })

  it('reports a plain object (no .message) thrown from a validator as "[object Object]" -- documenting today\'s actual, unideal behavior', async () => {
    const contract = createEnv(
      {
        PORT: {
          processor: (v) => Number(v),
          validator: () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw { code: 1 }
          },
        },
      },
      { name: "throws-object" },
    )

    try {
      await validateEnv({ values: { PORT: "80" }, manifest: [contract] })
      throw new Error("expected validateEnv to throw")
    } catch (error) {
      const validationError = error as EnvValidationError
      // Deliberately exercising the exact stringification this rule warns
      // about -- the test's whole point is proving a thrown non-Error value
      // degrades to this default, not stringifying it safely.
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      expect(validationError.failures[0]?.message).toBe(String({ code: 1 }))
      expect(validationError.failures[0]?.message).toBe("[object Object]")
    }
  })

  it("uses createEnv's source option for the aggregated error's Source: line when provided", async () => {
    const contract = createEnv(
      {
        PORT: {
          processor: () => {
            throw new Error("bad")
          },
        },
      },
      { name: "database", source: "file:///repo/packages/database/env.schema.ts" },
    )

    try {
      await validateEnv({ values: {}, manifest: [contract] })
      throw new Error("expected validateEnv to throw")
    } catch (error) {
      const validationError = error as EnvValidationError
      expect(validationError.message).toContain("file:///repo/packages/database/env.schema.ts")
    }
  })
})

describe("validateEnv idempotency", () => {
  it("only initializes once; later calls do not reprocess", async () => {
    let callCount = 0
    const contract = createEnv(
      {
        PORT: {
          processor: (v) => {
            callCount += 1
            return Number(v)
          },
        },
      },
      { name: "idempotent" },
    )

    const first = await validateEnv({ values: { PORT: "3000" }, manifest: [contract] })
    const second = await validateEnv({ values: { PORT: "9999" }, manifest: [contract] })

    expect(callCount).toBe(1)
    expect(second).toEqual(first)
    expect(contract.PORT).toBe(3000)
  })

  it("re-throws the same cached failure on subsequent calls without reprocessing", async () => {
    let callCount = 0
    const contract = createEnv(
      {
        PORT: {
          processor: () => {
            callCount += 1
            throw new Error("always fails")
          },
        },
      },
      { name: "cached-failure" },
    )

    const firstError = await validateEnv({ values: {}, manifest: [contract] }).catch(
      (e: unknown) => e,
    )
    const secondError = await validateEnv({ values: {}, manifest: [contract] }).catch(
      (e: unknown) => e,
    )

    expect(callCount).toBe(1)
    expect(firstError).toBe(secondError)
  })

  it("returns the shared in-flight run's result instead of starting a new one, when a run is already underway", async () => {
    // `runValidation()` has no internal `await`, so under any REAL caller
    // its whole body (including settling `state.status`) completes
    // synchronously before another call could ever observe `inFlight` as
    // the relevant branch -- this manufactures the state directly (as
    // `runtime/cache.ts`'s own exported `getState()` is meant to allow) to
    // exercise the defensive "share an underway run" branch on its own
    // terms, distinct from idempotency-after-completion (already covered
    // below) and from `Promise.all` (which, per the same reasoning, never
    // actually reaches this branch either).
    const fakeResult = { contractCount: 999, variableCount: 999 }
    const state = getState()
    state.status = "validating"
    state.inFlight = Promise.resolve(fakeResult)

    const result = await validateEnv({ values: {}, manifest: [] })
    expect(result).toEqual(fakeResult)
  })

  it("clears inFlight once a run settles, so a later call doesn't see a stale reference", async () => {
    const contract = createEnv({ PORT: { default: 3000 } }, { name: "clears-inflight" })
    await validateEnv({ values: {}, manifest: [contract] })
    expect(getState().inFlight).toBeUndefined()
  })

  it("does not double-process when two calls are issued back-to-back (e.g. via Promise.all)", async () => {
    let callCount = 0
    const contract = createEnv(
      {
        PORT: {
          processor: (v) => {
            callCount += 1
            return Number(v)
          },
        },
      },
      { name: "concurrent" },
    )

    const [a, b] = await Promise.all([
      validateEnv({ values: { PORT: "3000" }, manifest: [contract] }),
      validateEnv({ values: { PORT: "3000" }, manifest: [contract] }),
    ])

    expect(callCount).toBe(1)
    expect(a).toEqual(b)
  })
})

describe("validation contexts", () => {
  it("participates by default when no context is set, regardless of activeContexts", async () => {
    const contract = createEnv(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
      { LOG_LEVEL: { processor: (v) => String(v ?? "info") } },
      { name: "no-context" },
    )
    await validateEnv({ values: {}, manifest: [contract] })
    expect(contract.LOG_LEVEL).toBe("info")
  })

  it("skips a context-scoped variable when activeContexts is omitted entirely", async () => {
    const contract = createEnv(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
      { DATABASE_URL: { context: "server", processor: (v) => String(v ?? "") } },
      { name: "no-active-contexts" },
    )
    await validateEnv({ values: { DATABASE_URL: "postgres://x" }, manifest: [contract] })
    expect(() => contract.DATABASE_URL).toThrow(EnvNotReadyError)
  })

  it("validates a variable whose context is in a single active context", async () => {
    const contract = createEnv(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
      { DATABASE_URL: { context: "server", processor: (v) => String(v ?? "") } },
      { name: "single-context" },
    )
    await validateEnv({
      values: { DATABASE_URL: "postgres://x" },
      manifest: [contract],
      activeContexts: ["server"],
    })
    expect(contract.DATABASE_URL).toBe("postgres://x")
  })

  it("validates a variable whose context matches one of several simultaneously active contexts", async () => {
    const contract = createEnv(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
      { DATABASE_URL: { context: "server", processor: (v) => String(v ?? "") } },
      { name: "multi-context" },
    )
    await validateEnv({
      values: { DATABASE_URL: "postgres://x" },
      manifest: [contract],
      activeContexts: ["client", "server"],
    })
    expect(contract.DATABASE_URL).toBe("postgres://x")
  })

  it("skips a variable whose context doesn't match any active context", async () => {
    const contract = createEnv(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
      { DATABASE_URL: { context: "server", processor: (v) => String(v ?? "") } },
      { name: "unmatched-context" },
    )
    await validateEnv({
      values: { DATABASE_URL: "postgres://x" },
      manifest: [contract],
      activeContexts: ["client"],
    })
    expect(() => contract.DATABASE_URL).toThrow(EnvNotReadyError)
  })

  it("treats a duplicated entry in activeContexts identically to a single entry (Set-based matching, not array scanning)", async () => {
    const contract = createEnv(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
      { DATABASE_URL: { context: "production", processor: (v) => String(v ?? "") } },
      { name: "duplicate-active-context" },
    )
    await validateEnv({
      values: { DATABASE_URL: "x" },
      manifest: [contract],
      activeContexts: ["production", "production"],
    })
    expect(contract.DATABASE_URL).toBe("x")
  })

  it("skips the entire pipeline for an out-of-context variable: default/processor/validator never run", async () => {
    let processorCalled = false
    let validatorCalled = false
    const contract = createEnv(
      {
        DATABASE_URL: {
          context: "server",
          default: "should-not-apply",
          processor: () => {
            processorCalled = true
            return "processed"
          },
          validator: () => {
            validatorCalled = true
            return true
          },
        },
      },
      { name: "skip-pipeline" },
    )
    await validateEnv({ values: {}, manifest: [contract], activeContexts: ["client"] })
    expect(processorCalled).toBe(false)
    expect(validatorCalled).toBe(false)
    expect(() => contract.DATABASE_URL).toThrow(EnvNotReadyError)
  })

  it("excludes skipped variables from variableCount", async () => {
    const contract = createEnv(
      {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
        LOG_LEVEL: { processor: (v) => String(v ?? "info") },
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
        DATABASE_URL: { context: "server", processor: (v) => String(v ?? "") },
      },
      { name: "variable-count" },
    )
    const result = await validateEnv({
      values: {},
      manifest: [contract],
      activeContexts: ["client"],
    })
    expect(result.variableCount).toBe(1)
  })

  it("applies independent context filtering per contract within one manifest", async () => {
    const server = createEnv(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
      { DATABASE_URL: { context: "server", processor: (v) => String(v ?? "") } },
      { name: "server-contract" },
    )
    const client = createEnv(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
      { PUBLIC_API_URL: { context: "client", processor: (v) => String(v ?? "") } },
      { name: "client-contract" },
    )
    const shared = createEnv(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
      { LOG_LEVEL: { processor: (v) => String(v ?? "info") } },
      { name: "shared-contract" },
    )
    await validateEnv({
      values: { DATABASE_URL: "postgres://x", PUBLIC_API_URL: "https://api.example.com" },
      manifest: [server, client, shared],
      activeContexts: ["server"],
    })
    expect(server.DATABASE_URL).toBe("postgres://x")
    expect(shared.LOG_LEVEL).toBe("info")
    expect(() => client.PUBLIC_API_URL).toThrow(EnvNotReadyError)
  })

  it("does not include a skipped variable in the aggregated failure report of its own contract", async () => {
    const contract = createEnv(
      {
        DATABASE_URL: {
          context: "server",
          processor: () => {
            throw new Error("bad database url")
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
        PUBLIC_API_URL: { context: "client", processor: (v) => String(v ?? "") },
      },
      { name: "failure-with-skip" },
    )

    try {
      await validateEnv({ values: {}, manifest: [contract], activeContexts: ["server"] })
      throw new Error("expected validateEnv to throw")
    } catch (error) {
      const validationError = error as EnvValidationError
      expect(validationError.failures).toHaveLength(1)
      expect(validationError.failures[0]?.variable).toBe("DATABASE_URL")
    }
  })

  it("isolates context participation across independent validateEnv runs, each simulating a separate process", async () => {
    const contract = createEnv(
      {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
        DATABASE_URL: { context: "server", processor: (v) => String(v ?? "") },
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the identical idiom in helpers/processors.ts
        PUBLIC_API_URL: { context: "client", processor: (v) => String(v ?? "") },
      },
      { name: "isolation" },
    )
    const values = { DATABASE_URL: "postgres://x", PUBLIC_API_URL: "https://api.example.com" }

    await validateEnv({ values, manifest: [contract], activeContexts: ["server"] })
    expect(contract.DATABASE_URL).toBe("postgres://x")
    expect(() => contract.PUBLIC_API_URL).toThrow(EnvNotReadyError)

    // Simulates a fresh process (server and client never share one in
    // practice) -- validateEnv() itself stays one-shot per process; this
    // is not a supported "switch contexts mid-process" API.
    resetEnvCache()

    await validateEnv({ values, manifest: [contract], activeContexts: ["client"] })
    expect(contract.PUBLIC_API_URL).toBe("https://api.example.com")
    expect(() => contract.DATABASE_URL).toThrow(EnvNotReadyError)
  })
})
