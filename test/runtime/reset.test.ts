import { beforeEach, describe, expect, it } from "vitest"
import { createEnv } from "../../src/runtime/create.js"
import { EnvNotReadyError } from "../../src/runtime/errors.js"
import { resetEnvCache } from "../../src/runtime/reset.js"
import { validateEnv } from "../../src/runtime/validate.js"

// Each test starts from a clean slate, regardless of what the previous test
// (in this same file, exercising resetEnvCache itself) left the global state as.
beforeEach(() => {
  resetEnvCache()
})

describe("resetEnvCache", () => {
  it("clears cached values so contracts throw EnvNotReadyError again", async () => {
    const contract = createEnv({ A: { processor: (v) => String(v) } }, { name: "reset-all" })
    await validateEnv({ values: { A: "1" }, manifest: [contract] })
    expect(contract.A).toBe("1")

    resetEnvCache()

    expect(() => contract.A).toThrow(EnvNotReadyError)
  })

  it("allows validating again with different values after a reset", async () => {
    const contract = createEnv({ A: { processor: (v) => String(v) } }, { name: "revalidate" })
    await validateEnv({ values: { A: "first" }, manifest: [contract] })
    expect(contract.A).toBe("first")

    resetEnvCache()
    await validateEnv({ values: { A: "second" }, manifest: [contract] })
    expect(contract.A).toBe("second")
  })

  it("clears a cached failure too, allowing a subsequent call to succeed", async () => {
    const contract = createEnv(
      { A: { validator: (v) => (v ? true : "required") } },
      { name: "clear-failure" },
    )

    await expect(validateEnv({ values: {}, manifest: [contract] })).rejects.toThrow()

    resetEnvCache()

    await validateEnv({ values: { A: "present" }, manifest: [contract] })
    expect(contract.A).toBe("present")
  })
})
