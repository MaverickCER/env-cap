import { describe, expect, it } from "vitest"
import { buildFindingModel, FINDING_MODEL_SCHEMA_VERSION } from "../../src/build/finding-model.js"
import type { CompatibilityIssue } from "../../src/build/compatibility.js"
import type { ArtifactCheckFinding } from "../../src/build/check-artifacts.js"
import type { DocumentationFindings } from "../../src/build/generate-documentation.js"

describe("buildFindingModel", () => {
  it("carries the current schema version and produces no findings for an empty input", () => {
    const model = buildFindingModel({})
    expect(model.schemaVersion).toBe(FINDING_MODEL_SCHEMA_VERSION)
    expect(model.findings).toEqual([])
  })

  it("adapts a compatibility issue, reusing its own code", () => {
    const issue: CompatibilityIssue = {
      severity: "error",
      variable: "PORT",
      files: ["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"],
      reason: "Processor return types are declared incompatible.",
      code: "processor-return-type-conflict",
    }
    const model = buildFindingModel({ compatibilityIssues: [issue] })
    expect(model.findings).toEqual([
      {
        severity: "error",
        code: "processor-return-type-conflict",
        family: "compatibility",
        message: issue.reason,
        location: {
          model: "contract",
          file: "/repo/a/env.schema.ts",
          exportName: undefined,
          variable: "PORT",
        },
      },
    ])
  })

  it("falls back to duplicate-variable-documentation when a compatibility issue has no code at all", () => {
    const issue: CompatibilityIssue = {
      severity: "warning",
      variable: "PORT",
      files: ["/repo/a/env.schema.ts"],
      reason: "unlikely, but defended against",
    }
    const model = buildFindingModel({ compatibilityIssues: [issue] })
    expect(model.findings[0]?.code).toBe("duplicate-variable-documentation")
  })

  it("synthesizes exclusive-group-violation for exclusiveGroupIssues, which never set their own code", () => {
    const issue: CompatibilityIssue = {
      severity: "error",
      variable: 'Exclusive group "database"',
      files: ["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"],
      reason: "Both active and both declare exclusiveGroup.",
    }
    const model = buildFindingModel({ exclusiveGroupIssues: [issue] })
    expect(model.findings).toHaveLength(1)
    expect(model.findings[0]?.code).toBe("exclusive-group-violation")
    expect(model.findings[0]?.family).toBe("compatibility")
  })

  it("skips ok artifact-check findings, and maps stale/missing to a change-model reference", () => {
    const findings: ArtifactCheckFinding[] = [
      { artifact: "manifest", path: "/repo/env.manifest.ts", status: "ok" },
      {
        artifact: "docs",
        path: "/repo/ENVIRONMENT.md",
        status: "stale",
        detail: "generated content differs from what's committed",
      },
      {
        artifact: "usage",
        path: "/repo/OWNERSHIP.md",
        status: "missing",
        detail: "not yet generated",
      },
    ]
    const model = buildFindingModel({ artifactCheckFindings: findings })
    expect(model.findings).toHaveLength(2)
    expect(model.findings.map((f) => f.code)).toEqual(["artifact-stale", "artifact-missing"])
    expect(model.findings[0]?.location).toEqual({ model: "change", path: "/repo/ENVIRONMENT.md" })
  })

  it("synthesizes a message for an artifact-check finding with no detail", () => {
    const findings: ArtifactCheckFinding[] = [
      { artifact: "manifest", path: "/repo/env.manifest.ts", status: "stale" },
    ]
    const model = buildFindingModel({ artifactCheckFindings: findings })
    expect(model.findings[0]?.message).toBe("manifest artifact is stale.")
  })

  it("adapts every DocumentationFindings array", () => {
    const documentation: DocumentationFindings = {
      undocumentedContracts: [{ file: "/repo/a/env.schema.ts", exportName: "aEnv" }],
      undocumentedVariables: [{ file: "/repo/a/env.schema.ts", exportName: "aEnv", key: "KEY" }],
      staleDocEntries: [{ file: "/repo/a/env.schema.ts", exportName: "aEnv", key: "OLD_KEY" }],
      expiringSoon: [
        {
          file: "/repo/a/env.schema.ts",
          exportName: "aEnv",
          key: "EXPIRED_KEY",
          expiresAt: "2025-01-01",
          daysRemaining: -10,
        },
        {
          file: "/repo/a/env.schema.ts",
          exportName: "aEnv",
          key: "SOON_KEY",
          expiresAt: "2026-01-15",
          daysRemaining: 5,
        },
      ],
      unresolvedLinks: [{ file: "/repo/a/docs.ts", reason: "could not be statically linked" }],
    }
    const model = buildFindingModel({ documentation })
    expect(model.findings.map((f) => f.code)).toEqual([
      "undocumented-contract",
      "undocumented-variable",
      "stale-doc-entry",
      "expired",
      "expiring-soon",
      "unresolved-documentenv-link",
    ])
    expect(model.findings.every((f) => f.family === "documentation")).toBe(true)
    expect(model.findings[3]?.message).toContain("10 day(s) ago")
    expect(model.findings[4]?.message).toContain("expires in 5 day(s)")
  })

  it("falls back to exportName in the message for a contract-level (key: undefined) expiring entry", () => {
    const documentation: DocumentationFindings = {
      undocumentedContracts: [],
      undocumentedVariables: [],
      staleDocEntries: [],
      expiringSoon: [
        {
          file: "/repo/a/env.schema.ts",
          exportName: "aEnv",
          key: undefined,
          expiresAt: "2026-01-15",
          daysRemaining: 5,
        },
      ],
      unresolvedLinks: [],
    }
    const model = buildFindingModel({ documentation })
    expect(model.findings[0]?.message).toContain('"aEnv" expires in 5 day(s)')
  })

  it("adapts every ownership finding family, referencing the ownership model by contractName", () => {
    const model = buildFindingModel({
      abandonedContracts: [
        { contractName: "aEnv", file: "/repo/a/env.schema.ts", owner: "team-a" },
      ],
      unresolvedConsumers: [
        { contractName: "bEnv", file: "/repo/b/env.schema.ts", reason: "ambiguous barrel" },
      ],
      unconsumedOwnedVariables: [{ contractName: "cEnv", owner: "team-c", key: "UNUSED_KEY" }],
      indeterminateOwnership: [
        { contractName: "dEnv", key: "DYNAMIC_KEY", reason: "dynamic property access" },
      ],
    })
    expect(model.findings.map((f) => f.code)).toEqual([
      "abandoned-contract",
      "unresolved-consumer",
      "unconsumed-owned-variable",
      "indeterminate-ownership",
    ])
    expect(model.findings.every((f) => f.family === "ownership")).toBe(true)
    expect(model.findings.every((f) => f.location.model === "ownership")).toBe(true)
    expect(model.findings[2]?.location).toEqual({
      model: "ownership",
      contractName: "cEnv",
      file: undefined,
      variable: "UNUSED_KEY",
    })
  })
})
