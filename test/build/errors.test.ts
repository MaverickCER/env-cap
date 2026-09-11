import { afterEach, describe, it, expect } from "vitest"
import {
  EnvManifestGenerationError,
  EnvDocumentationGenerationError,
  EnvUsageAnalysisError,
  EnvProjectGenerationError,
} from "../../src/build/errors.js"
import type { CompatibilityIssue } from "../../src/build/compatibility.js"

function issue(overrides: Partial<CompatibilityIssue> = {}): CompatibilityIssue {
  return {
    severity: "error",
    variable: "SHARED_FLAG",
    files: ["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"],
    reason: "Processor return types are declared incompatible.",
    ...overrides,
  }
}

describe("EnvManifestGenerationError", () => {
  it("reports a singular count for exactly one issue", () => {
    const error = new EnvManifestGenerationError([issue()])
    expect(error.name).toBe("EnvManifestGenerationError")
    expect(error.code).toBe("ENV_MANIFEST_GENERATION_FAILED")
    expect(error.message).toContain(
      "Environment manifest generation failed.\n\n1 incompatible declaration found",
    )
    expect(error.issues).toHaveLength(1)
  })

  it("reports a plural count for multiple issues", () => {
    const error = new EnvManifestGenerationError([issue(), issue({ variable: "OTHER" })])
    expect(error.message).toContain("2 incompatible declarations found")
  })

  it("includes the variable name, severity, reason, and every declaring file", () => {
    const error = new EnvManifestGenerationError([issue()])
    expect(error.message).toContain("SHARED_FLAG")
    expect(error.message).toContain("[error]")
    expect(error.message).toContain("Processor return types are declared incompatible.")
    expect(error.message).toContain("/repo/a/env.schema.ts")
    expect(error.message).toContain("/repo/b/env.schema.ts")
  })
})

describe("EnvDocumentationGenerationError", () => {
  it("carries a stable code", () => {
    const error = new EnvDocumentationGenerationError([issue()])
    expect(error.name).toBe("EnvDocumentationGenerationError")
    expect(error.code).toBe("ENV_DOCUMENTATION_GENERATION_FAILED")
    expect(error.issues).toHaveLength(1)
  })

  it("reports its own singular/plural counted header, distinct from every other error class", () => {
    expect(new EnvDocumentationGenerationError([issue()]).message).toContain(
      "Environment documentation generation failed.\n\n1 documentation issue found:",
    )
    expect(
      new EnvDocumentationGenerationError([issue(), issue({ variable: "OTHER" })]).message,
    ).toContain("2 documentation issues found:")
  })
})

describe("EnvUsageAnalysisError", () => {
  it("carries a stable code", () => {
    const error = new EnvUsageAnalysisError([issue()])
    expect(error.name).toBe("EnvUsageAnalysisError")
    expect(error.code).toBe("ENV_USAGE_ANALYSIS_FAILED")
    expect(error.issues).toHaveLength(1)
  })

  it("reports its own singular/plural counted header, distinct from every other error class", () => {
    expect(new EnvUsageAnalysisError([issue()]).message).toContain(
      "Dependency ownership report generation failed.\n\n1 ownership issue found:",
    )
    expect(new EnvUsageAnalysisError([issue(), issue({ variable: "OTHER" })]).message).toContain(
      "2 ownership issues found:",
    )
  })
})

describe("EnvProjectGenerationError", () => {
  it("carries a stable code", () => {
    const error = new EnvProjectGenerationError([issue()])
    expect(error.name).toBe("EnvProjectGenerationError")
    expect(error.code).toBe("ENV_PROJECT_GENERATION_FAILED")
    expect(error.issues).toHaveLength(1)
  })

  it("reports its own singular/plural counted header, distinct from every other error class", () => {
    expect(new EnvProjectGenerationError([issue()]).message).toContain(
      "Project generation failed.\n\n1 blocking issue found:",
    )
    expect(
      new EnvProjectGenerationError([issue(), issue({ variable: "OTHER" })]).message,
    ).toContain("2 blocking issues found:")
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
    expect(() => new EnvManifestGenerationError([issue()])).not.toThrow()
    expect(() => new EnvDocumentationGenerationError([issue()])).not.toThrow()
    expect(() => new EnvUsageAnalysisError([issue()])).not.toThrow()
    expect(() => new EnvProjectGenerationError([issue()])).not.toThrow()
  })
})
