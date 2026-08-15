import { describe, it, expect } from "vitest"
import { detectCompatibilityIssues } from "../../src/build/compatibility.js"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"

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
    classification: undefined,
    expiresAt: undefined,
    refreshInstructions: undefined,
    required: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    removeBy: undefined,
    renamedFrom: undefined,
    extra: {},
    documented: false,
    ...overrides,
  }
}

function makeContract(
  file: string,
  exportName: string,
  variables: DiscoveredVariable[],
): DiscoveredContract {
  return {
    file,
    exportName,
    contractName: exportName,
    active: true,
    category: undefined,
    exclusiveGroup: undefined,
    owner: undefined,
    classification: undefined,
    expiresAt: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    metadata: undefined,
    variables,
    documented: false,
    packageOrigin: undefined,
  }
}

describe("detectCompatibilityIssues", () => {
  it("does not flag a single declaration of a variable", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasProcessor: true }),
    ])
    expect(detectCompatibilityIssues([a])).toHaveLength(0)
  })

  it("errors when two processors declare explicit, conflicting return types", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasProcessor: true, processorReturnType: "string" }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "PORT", hasProcessor: true, processorReturnType: "number" }),
    ])

    const issues = detectCompatibilityIssues([a, b])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe("error")
    expect(issues[0]?.variable).toBe("PORT")
    expect(issues[0]?.files).toEqual(["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"])
    expect(issues[0]?.code).toBe("processor-return-type-conflict")
  })

  it("warns (not errors) when processors differ without explicit annotations", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "TOKEN", hasProcessor: true, processorSource: "(v) => String(v)" }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({
        key: "TOKEN",
        hasProcessor: true,
        processorSource: "(v) => String(v).trim()",
      }),
    ])

    const issues = detectCompatibilityIssues([a, b])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe("warning")
    expect(issues[0]?.code).toBe("processor-source-conflict")
  })

  it("warns when validators differ, independently of processor compatibility", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasValidator: true, validatorSource: '(v) => v > 0 || "bad"' }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({
        key: "PORT",
        hasValidator: true,
        validatorSource: '(v) => v > 1024 || "bad"',
      }),
    ])

    const issues = detectCompatibilityIssues([a, b])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe("warning")
    expect(issues[0]?.code).toBe("validator-source-conflict")
  })

  it("does not flag identical processor/validator source across files", () => {
    const source = '(v) => v > 0 || "bad"'
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasValidator: true, validatorSource: source }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "PORT", hasValidator: true, validatorSource: source }),
    ])

    expect(detectCompatibilityIssues([a, b])).toHaveLength(0)
  })

  it("does not flag variables that only appear in one contract", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [makeVariable({ key: "ONLY_A" })])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [makeVariable({ key: "ONLY_B" })])

    expect(detectCompatibilityIssues([a, b])).toHaveLength(0)
  })

  describe("duplicate-variable-documentation warning", () => {
    it("warns (never errors) with a stable code when two documented declarations of the same variable disagree", () => {
      const a = makeContract("/repo/notifications/env.schema.ts", "notificationsEnv", [
        makeVariable({
          key: "WEBHOOK_URL",
          documented: true,
          description: "Slack webhook",
          owner: "team-notifications",
          required: true,
        }),
      ])
      const b = makeContract("/repo/audit-log/env.schema.ts", "auditLogEnv", [
        makeVariable({
          key: "WEBHOOK_URL",
          documented: true,
          description: "Audit event webhook",
          owner: "team-security",
          expiresAt: "2027-01-01",
        }),
      ])

      const issues = detectCompatibilityIssues([a, b])
      expect(issues).toHaveLength(1)
      expect(issues[0]?.severity).toBe("warning")
      expect(issues[0]?.code).toBe("duplicate-variable-documentation")
      expect(issues[0]?.variable).toBe("WEBHOOK_URL")
      expect(issues[0]?.reason).toContain("notificationsEnv")
      expect(issues[0]?.reason).toContain("auditLogEnv")
      expect(issues[0]?.reason).toContain("description")
      expect(issues[0]?.reason).toContain("owner")
      expect(issues[0]?.reason).toContain("expiresAt")
      expect(issues[0]?.reason).toContain("required")
    })

    it("flags a diverging extra.<key> field, named specifically", () => {
      const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
        makeVariable({ key: "SHARED", documented: true, extra: { rotationCadence: "30 days" } }),
      ])
      const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
        makeVariable({ key: "SHARED", documented: true, extra: { rotationCadence: "90 days" } }),
      ])

      const issues = detectCompatibilityIssues([a, b])
      expect(issues).toHaveLength(1)
      expect(issues[0]?.reason).toContain("extra.rotationCadence")
    })

    it("does not flag two documented declarations with identical metadata", () => {
      const shared = {
        description: "Shared secret",
        owner: "platform-team",
        extra: { rotationCadence: "30 days" },
      }
      const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
        makeVariable({ key: "SHARED", documented: true, ...shared }),
      ])
      const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
        makeVariable({ key: "SHARED", documented: true, ...shared }),
      ])

      expect(detectCompatibilityIssues([a, b])).toHaveLength(0)
    })

    it("never fires when only one side (or neither) is documented -- nothing meaningful to compare", () => {
      const documented = makeContract("/repo/a/env.schema.ts", "aEnv", [
        makeVariable({ key: "SHARED", documented: true, description: "Documented side" }),
      ])
      const undocumented = makeContract("/repo/b/env.schema.ts", "bEnv", [
        makeVariable({ key: "SHARED", documented: false }),
      ])

      const issues = detectCompatibilityIssues([documented, undocumented])
      expect(
        issues.filter((issue) => issue.code === "duplicate-variable-documentation"),
      ).toHaveLength(0)
    })
  })
})
