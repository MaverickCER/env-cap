import { describe, it, expect } from "vitest"
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
    expect(error.message).toContain("1 incompatible declaration found")
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
})

describe("EnvUsageAnalysisError", () => {
  it("carries a stable code", () => {
    const error = new EnvUsageAnalysisError([issue()])
    expect(error.name).toBe("EnvUsageAnalysisError")
    expect(error.code).toBe("ENV_USAGE_ANALYSIS_FAILED")
    expect(error.issues).toHaveLength(1)
  })
})

describe("EnvProjectGenerationError", () => {
  it("carries a stable code", () => {
    const error = new EnvProjectGenerationError([issue()])
    expect(error.name).toBe("EnvProjectGenerationError")
    expect(error.code).toBe("ENV_PROJECT_GENERATION_FAILED")
    expect(error.issues).toHaveLength(1)
  })
})
