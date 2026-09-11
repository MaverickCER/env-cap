import { describe, expect, it } from "vitest"
import { buildFindingModel, FINDING_MODEL_SCHEMA_VERSION } from "../../src/build/finding-model.js"
import type { CompatibilityIssue } from "../../src/build/compatibility.js"
import type { ArtifactCheckFinding } from "../../src/build/check-artifacts.js"
import type { DocumentationFindings } from "../../src/build/generate-documentation.js"

describe("buildFindingModel", () => {
  it("carries the current schema version and produces no findings for an empty input", () => {
    const model = buildFindingModel({ root: "/repo" })
    expect(model.schemaVersion).toBe(FINDING_MODEL_SCHEMA_VERSION)
    expect(model.findings).toEqual([])
  })

  it("adapts a compatibility issue, reusing its own code", () => {
    const issue: CompatibilityIssue = {
      severity: "error",
      variable: "PORT",
      files: ["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"],
      reason: "Processor return types are declared incompatible.",
      code: "PROCESSOR_RETURN_TYPE_CONFLICT",
    }
    const model = buildFindingModel({ root: "/repo", compatibilityIssues: [issue] })
    expect(model.findings).toEqual([
      {
        severity: "error",
        code: "PROCESSOR_RETURN_TYPE_CONFLICT",
        family: "compatibility",
        message: issue.reason,
        location: {
          model: "contract",
          file: "a/env.schema.ts",
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
    const model = buildFindingModel({ root: "/repo", compatibilityIssues: [issue] })
    expect(model.findings[0]?.code).toBe("DUPLICATE_VARIABLE_DOCUMENTATION")
  })

  it("synthesizes exclusive-group-violation for exclusiveGroupIssues, which never set their own code", () => {
    const issue: CompatibilityIssue = {
      severity: "error",
      variable: 'Exclusive group "database"',
      files: ["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"],
      reason: "Both active and both declare exclusiveGroup.",
    }
    const model = buildFindingModel({ root: "/repo", exclusiveGroupIssues: [issue] })
    expect(model.findings).toHaveLength(1)
    expect(model.findings[0]?.code).toBe("EXCLUSIVE_GROUP_VIOLATION")
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
    const model = buildFindingModel({ root: "/repo", artifactCheckFindings: findings })
    expect(model.findings).toEqual([
      {
        severity: "warning",
        code: "ARTIFACT_STALE",
        family: "drift",
        message: "generated content differs from what's committed",
        location: { model: "change", path: "/repo/ENVIRONMENT.md" },
      },
      {
        severity: "warning",
        code: "ARTIFACT_MISSING",
        family: "drift",
        message: "not yet generated",
        location: { model: "change", path: "/repo/OWNERSHIP.md" },
      },
    ])
  })

  it("synthesizes a message for an artifact-check finding with no detail", () => {
    const findings: ArtifactCheckFinding[] = [
      { artifact: "manifest", path: "/repo/env.manifest.ts", status: "stale" },
    ]
    const model = buildFindingModel({ root: "/repo", artifactCheckFindings: findings })
    expect(model.findings[0]?.message).toBe("manifest artifact is stale.")
  })

  it("adapts every DocumentationFindings array, verbatim message and location", () => {
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
      nonstandardSensitivityLevels: [
        {
          file: "/repo/a/env.schema.ts",
          exportName: "aEnv",
          key: "WEIRD_KEY",
          sensitivity: "top-secret",
        },
      ],
      unresolvedLinks: [{ file: "/repo/a/docs.ts", reason: "could not be statically linked" }],
    }
    const model = buildFindingModel({ root: "/repo", documentation })
    expect(model.findings).toEqual([
      {
        severity: "warning",
        code: "UNDOCUMENTED_CONTRACT",
        family: "documentation",
        message: '"aEnv" has no documentEnv() call linked to it.',
        location: {
          model: "contract",
          file: "a/env.schema.ts",
          exportName: "aEnv",
          variable: undefined,
          position: undefined,
        },
      },
      {
        severity: "warning",
        code: "UNDOCUMENTED_VARIABLE",
        family: "documentation",
        message:
          '"KEY" (declared by "aEnv") has no matching entry in a linked documentEnv()\'s "variables".',
        location: {
          model: "contract",
          file: "a/env.schema.ts",
          exportName: "aEnv",
          variable: "KEY",
          position: undefined,
        },
      },
      {
        severity: "warning",
        code: "STALE_DOC_ENTRY",
        family: "documentation",
        message:
          '"OLD_KEY" is documented under "aEnv" but no longer exists in that contract\'s schema.',
        location: {
          model: "contract",
          file: "a/env.schema.ts",
          exportName: "aEnv",
          variable: "OLD_KEY",
          position: undefined,
        },
      },
      {
        severity: "warning",
        code: "EXPIRED",
        family: "documentation",
        message: '"EXPIRED_KEY" expired 10 day(s) ago (expiresAt: 2025-01-01).',
        location: {
          model: "contract",
          file: "a/env.schema.ts",
          exportName: "aEnv",
          variable: "EXPIRED_KEY",
          position: undefined,
        },
      },
      {
        severity: "warning",
        code: "EXPIRING_SOON",
        family: "documentation",
        message: '"SOON_KEY" expires in 5 day(s) (expiresAt: 2026-01-15).',
        location: {
          model: "contract",
          file: "a/env.schema.ts",
          exportName: "aEnv",
          variable: "SOON_KEY",
          position: undefined,
        },
      },
      {
        severity: "info",
        code: "NONSTANDARD_SENSITIVITY_LEVEL",
        family: "documentation",
        message:
          '"WEIRD_KEY" declares sensitivity "top-secret", which isn\'t one of the standard levels (secret/credential/pii/config) -- still honored verbatim, just flagged for vocabulary drift.',
        location: {
          model: "contract",
          file: "a/env.schema.ts",
          exportName: "aEnv",
          variable: "WEIRD_KEY",
          position: undefined,
        },
      },
      {
        severity: "warning",
        code: "UNRESOLVED_DOCUMENTENV_LINK",
        family: "documentation",
        message: "could not be statically linked",
        location: {
          model: "contract",
          file: "a/docs.ts",
          exportName: undefined,
          variable: undefined,
          position: undefined,
        },
      },
    ])
  })

  it("falls back to exportName in the message for a contract-level (key: undefined) expiring/nonstandard-sensitivity entry", () => {
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
      nonstandardSensitivityLevels: [
        {
          file: "/repo/a/env.schema.ts",
          exportName: "aEnv",
          key: undefined,
          sensitivity: "top-secret",
        },
      ],
      unresolvedLinks: [],
    }
    const model = buildFindingModel({ root: "/repo", documentation })
    expect(model.findings[0]?.message).toBe('"aEnv" expires in 5 day(s) (expiresAt: 2026-01-15).')
    expect(model.findings[1]?.message).toContain('"aEnv" declares sensitivity "top-secret"')
  })

  it("treats daysRemaining exactly 0 (expires today) as NOT yet expired -- the boundary, not just clearly-past/clearly-future values", () => {
    const documentation: DocumentationFindings = {
      undocumentedContracts: [],
      undocumentedVariables: [],
      staleDocEntries: [],
      expiringSoon: [
        {
          file: "/repo/a/env.schema.ts",
          exportName: "aEnv",
          key: "KEY",
          expiresAt: "2026-01-15",
          daysRemaining: 0,
        },
      ],
      nonstandardSensitivityLevels: [],
      unresolvedLinks: [],
    }
    const model = buildFindingModel({ root: "/repo", documentation })
    expect(model.findings[0]?.code).toBe("EXPIRING_SOON")
    expect(model.findings[0]?.message).toBe('"KEY" expires in 0 day(s) (expiresAt: 2026-01-15).')
  })

  it("adapts every ownership finding family, referencing the ownership model by contractName", () => {
    const model = buildFindingModel({
      root: "/repo",
      abandonedContracts: [
        { contractName: "aEnv", file: "/repo/a/env.schema.ts", owner: "team-a" },
      ],
      unresolvedConsumers: [
        { contractName: "bEnv", file: "/repo/b/env.schema.ts", reason: "ambiguous barrel" },
      ],
      unconsumedOwnedVariables: [
        { contractName: "cEnv", owner: "team-c", key: "UNUSED_KEY", staleOrMissingCitations: [] },
      ],
      indeterminateOwnership: [
        {
          contractName: "dEnv",
          key: "DYNAMIC_KEY",
          reason: "dynamic property access",
          dynamicAccessSites: [],
          staleOrMissingCitations: [],
        },
      ],
    })
    expect(model.findings).toEqual([
      {
        severity: "warning",
        code: "ABANDONED_CONTRACT",
        family: "ownership",
        message: '"aEnv" is never imported anywhere in the scanned repository.',
        location: {
          model: "ownership",
          contractName: "aEnv",
          file: "/repo/a/env.schema.ts",
          variable: undefined,
          position: undefined,
        },
      },
      {
        severity: "warning",
        code: "UNRESOLVED_CONSUMER",
        family: "ownership",
        message: "ambiguous barrel",
        location: {
          model: "ownership",
          contractName: "bEnv",
          file: "/repo/b/env.schema.ts",
          variable: undefined,
          position: undefined,
        },
      },
      {
        severity: "warning",
        code: "UNCONSUMED_OWNED_VARIABLE",
        family: "ownership",
        message:
          '"UNUSED_KEY" (declared by "cEnv") has no consumer found in the scanned repository.',
        location: {
          model: "ownership",
          contractName: "cEnv",
          file: undefined,
          variable: "UNUSED_KEY",
          position: undefined,
        },
      },
      {
        severity: "warning",
        code: "INDETERMINATE_OWNERSHIP",
        family: "ownership",
        message: "dynamic property access",
        location: {
          model: "ownership",
          contractName: "dEnv",
          file: undefined,
          variable: "DYNAMIC_KEY",
          position: undefined,
        },
      },
    ])
  })

  it("adapts a missing dynamic-access citation, citing the exact position", () => {
    const model = buildFindingModel({
      root: "/repo",
      dynamicAccessCitationProblems: [
        {
          contractName: "eEnv",
          file: "e/env.schema.ts",
          exportName: "eEnv",
          key: "SECRET_KEY",
          position: { file: "scripts/gone.sh", line: 1, column: 1 },
          acknowledgment: "missing",
        },
      ],
    })
    expect(model.findings).toHaveLength(1)
    expect(model.findings[0]).toMatchObject({
      severity: "warning",
      code: "MISSING_DYNAMIC_ACCESS_CITATION",
      family: "ownership",
      location: {
        model: "ownership",
        contractName: "eEnv",
        file: "e/env.schema.ts",
        variable: "SECRET_KEY",
        position: { file: "scripts/gone.sh", line: 1, column: 1 },
      },
    })
    expect(model.findings[0]?.message).toContain("scripts/gone.sh:1:1")
    expect(model.findings[0]?.message).toContain("no longer exists")
  })

  it("adapts a stale dynamic-access citation, distinct from a missing one", () => {
    const model = buildFindingModel({
      root: "/repo",
      dynamicAccessCitationProblems: [
        {
          contractName: "fEnv",
          file: "f/env.schema.ts",
          exportName: "fEnv",
          key: "SECRET_KEY",
          position: { file: "scripts/migrate.sh", line: 12, column: 4 },
          acknowledgment: "stale",
        },
      ],
    })
    expect(model.findings[0]?.code).toBe("STALE_DYNAMIC_ACCESS_CITATION")
    expect(model.findings[0]?.message).toContain("content has changed")
    expect(model.findings[0]?.location).toMatchObject({
      position: { file: "scripts/migrate.sh", line: 12, column: 4 },
    })
  })
})
