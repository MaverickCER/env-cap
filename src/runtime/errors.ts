/**
 * Every error type here is constructed only from: the variable name, the
 * declaring contract's name, the failure kind, and a message string that the
 * *developer's own* processor/validator produced. Raw or processed environment
 * values are never read into an error -- see the Security section in the README.
 *
 * Documentation (description, owner, etc.) never appears here, even when a
 * {@link documentEnv} call exists for this variable -- `documentEnv` is
 * build-time-only and its data is never retained anywhere {@link validateEnv}
 * could read it back out. This is a deliberate consequence of keeping the
 * runtime minimal, not an oversight.
 */

/** One variable's processing or validation failure, as recorded by {@link validateEnv}. */
export interface VariableFailure {
  /** The schema key that failed. */
  readonly variable: string
  /** The declaring contract's `name` (see {@link CreateEnvOptions}). */
  readonly contractName: string
  /** `import.meta.url` (or similar) passed to `createEnv`'s `source` option, if any. Falls back to `contractName` when absent. */
  readonly source: string | undefined
  /** Which stage produced the failure. */
  readonly kind: "processor" | "validator"
  /** The error message from the developer's own processor/validator, or the thrown error's message. */
  readonly message: string
}

function formatFailure(failure: VariableFailure): string {
  const heading = failure.kind === "processor" ? "Processor failed:" : "Validation failed:"
  const lines = [
    failure.variable,
    "-".repeat(Math.max(failure.variable.length, 3)),
    heading,
    failure.message,
  ]

  lines.push("", "Source:", failure.source ?? failure.contractName)

  return lines.join("\n")
}

function formatReport(failures: readonly VariableFailure[]): string {
  const count = failures.length
  const noun = count === 1 ? "configuration error" : "configuration errors"
  const header = `Environment validation failed.\n\n${count} ${noun} found:`
  const blocks = failures.map(formatFailure)
  return [header, ...blocks].join("\n\n")
}

/**
 * Thrown by {@link validateEnv} when one or more variables fail processing or
 * validation. Aggregates every failure across every contract in the batch --
 * the caller sees the whole picture in one error, not one-at-a-time.
 *
 * @remarks
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export class EnvValidationError extends Error {
  /** Stable discriminant for programmatic handling; always `"ENV_VALIDATION_FAILED"`. */
  readonly code = "ENV_VALIDATION_FAILED"
  /** Every variable failure across every contract in the batch. */
  readonly failures: readonly VariableFailure[]

  constructor(failures: readonly VariableFailure[]) {
    super(formatReport(failures))
    this.name = "EnvValidationError"
    this.failures = failures
    Error.captureStackTrace?.(this, EnvValidationError)
  }
}

/**
 * Thrown when a contract's value is accessed via property access before
 * {@link validateEnv} has completed successfully for it.
 *
 * @remarks
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export class EnvNotReadyError extends Error {
  /** Stable discriminant for programmatic handling; always `"ENV_NOT_READY"`. */
  readonly code = "ENV_NOT_READY"

  constructor(contractName: string, key: string) {
    const target = `"${contractName}".${key}`
    super(
      `Environment contract ${target} has not been validated yet. ` +
        "Call validateEnv() during application startup before accessing environment values.",
    )
    this.name = "EnvNotReadyError"
    Error.captureStackTrace?.(this, EnvNotReadyError)
  }
}
