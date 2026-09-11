import { afterEach, describe, expect, it } from "vitest"
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

  it("underlines the variable name with exactly as many dashes as it has, when longer than 3 characters", () => {
    const error = new EnvValidationError([failure({ variable: "A_LONG_VARIABLE_NAME" })])
    // "A_LONG_VARIABLE_NAME" is 20 characters -- Math.max(20, 3) = 20, not
    // Math.min(20, 3) = 3, so this also kills a mutant that swaps max<->min.
    expect(error.message).toContain(`A_LONG_VARIABLE_NAME\n${"-".repeat(20)}\n`)
  })

  it("pads the underline to a minimum of 3 dashes for a variable name shorter than that", () => {
    const error = new EnvValidationError([failure({ variable: "AB" })])
    expect(error.message).toContain("AB\n---\n")
  })

  it("separates the failure block from its Source: line with a blank line", () => {
    const error = new EnvValidationError([failure({ message: "Value must be non-empty." })])
    expect(error.message).toContain("Value must be non-empty.\n\nSource:")
  })

  it("separates multiple failure blocks from each other, and from the header, with a blank line each", () => {
    const error = new EnvValidationError([
      failure({ variable: "A", message: "first failure" }),
      failure({ variable: "B", message: "second failure" }),
    ])
    expect(error.message).toContain("2 configuration errors found:\n\nA\n---\n")
    // The blank line that ends block "A" (before its own Source: line) and
    // the blank line that separates block "A" from block "B" are adjacent --
    // this only holds if `formatReport`'s own `.join("\n\n")` is real (a
    // `.join("")` mutant collapses it to a single blank line here instead).
    expect(error.message).toContain("Source:\npayments\n\nB\n---\n")
  })
})

describe("Error.captureStackTrace availability", () => {
  // `Error.captureStackTrace` is a V8-only extension -- guarded with `?.()`
  // in every constructor above so a non-V8 engine still constructs the error
  // successfully, just without the trimmed stack trace. Deleting it here
  // simulates that engine directly, rather than trusting V8 (always present
  // under Node/vitest) to exercise the guard's false path on its own.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- storing the whole static method to restore later, never calling it detached from Error
  const originalCaptureStackTrace = Error.captureStackTrace

  afterEach(() => {
    Error.captureStackTrace = originalCaptureStackTrace
  })

  it("every error class still constructs successfully when Error.captureStackTrace is unavailable", () => {
    // @ts-expect-error -- deliberately simulating a non-V8 engine
    delete Error.captureStackTrace
    expect(() => new EnvValidationError([failure()])).not.toThrow()
    expect(() => new EnvNotReadyError("payments", "STRIPE_KEY")).not.toThrow()
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
