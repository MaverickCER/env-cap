import { describe, expect, it } from "vitest"
import {
  EnvNotReadyError,
  EnvValidationError,
  type VariableFailure,
} from "../../src/runtime/errors.js"

function failure(overrides: Partial<VariableFailure> = {}): VariableFailure {
  return {
    variable: "STRIPE_KEY",
    contractName: "payments",
    source: undefined,
    kind: "validator",
    message: "Stripe key is required.",
    ...overrides,
  }
}

describe("EnvValidationError", () => {
  it("reports a singular count for exactly one failure", () => {
    const error = new EnvValidationError([failure()])
    expect(error.message).toContain("1 configuration error found")
    expect(error.name).toBe("EnvValidationError")
    expect(error.code).toBe("ENV_VALIDATION_FAILED")
    expect(error.failures).toHaveLength(1)
  })

  it("reports a plural count for multiple failures", () => {
    const error = new EnvValidationError([failure(), failure({ variable: "PORT" })])
    expect(error.message).toContain("2 configuration errors found")
  })

  it("labels processor failures and validator failures differently", () => {
    const processorError = new EnvValidationError([
      failure({ kind: "processor", message: "bad format" }),
    ])
    expect(processorError.message).toContain("Processor failed:")
    expect(processorError.message).not.toContain("Validation failed:")

    const validatorError = new EnvValidationError([failure({ kind: "validator" })])
    expect(validatorError.message).toContain("Validation failed:")
    expect(validatorError.message).not.toContain("Processor failed:")
  })

  it("uses source for the Source: line when present, falling back to contractName otherwise", () => {
    const withSource = new EnvValidationError([
      failure({ source: "file:///repo/features/payments/env.schema.ts" }),
    ])
    expect(withSource.message).toContain("Source:\nfile:///repo/features/payments/env.schema.ts")

    const withoutSource = new EnvValidationError([
      failure({ source: undefined, contractName: "payments" }),
    ])
    expect(withoutSource.message).toContain("Source:\npayments")
  })

  it("never includes anything beyond variable/contract/source/message -- no documentation data reaches the runtime error", () => {
    // documentEnv() is build-time-only and never retained anywhere validateEnv()
    // could read it back out; VariableFailure has no field for it at all.
    const error = new EnvValidationError([failure({ message: "Value must be non-empty." })])
    expect(error.message).not.toContain("Description:")
    expect(error.message).not.toContain("Owner:")
  })
})

describe("EnvNotReadyError", () => {
  it("names the contract and key in its message", () => {
    const error = new EnvNotReadyError("payments", "STRIPE_KEY")
    expect(error.name).toBe("EnvNotReadyError")
    expect(error.code).toBe("ENV_NOT_READY")
    expect(error.message).toContain('"payments".STRIPE_KEY')
    expect(error.message).toContain("validateEnv()")
  })
})
