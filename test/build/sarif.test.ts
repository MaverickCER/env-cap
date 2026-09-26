import { describe, expect, it } from "vitest"
import { buildSarifLog } from "../../src/build/sarif.js"
import { FINDING_MODEL_SCHEMA_VERSION } from "../../src/build/finding-model.js"
import type { Finding, FindingModel } from "../../src/build/finding-model.js"

function model(findings: Finding[]): FindingModel {
  return { schemaVersion: FINDING_MODEL_SCHEMA_VERSION, findings }
}

const CONTRACT_FINDING: Finding = {
  severity: "warning",
  code: "UNDOCUMENTED_VARIABLE",
  family: "documentation",
  message: '"STRIPE_KEY" has no matching entry in a linked documentEnv()\'s "variables".',
  location: {
    model: "contract",
    file: "src/payments/env.schema.ts",
    exportName: "paymentsEnv",
    variable: "STRIPE_KEY",
    position: undefined,
  },
}

describe("buildSarifLog", () => {
  it("produces a spec-shaped, empty-but-valid log for a run with no findings", () => {
    const log = buildSarifLog(model([]))
    expect(log.version).toBe("2.1.0")
    expect(log.$schema).toContain("sarif-schema-2.1.0.json")
    expect(log.runs).toHaveLength(1)
    expect(log.runs[0]?.results).toEqual([])
    // No findings means no rules -- advertising rules that produced nothing
    // makes a clean run look like it has unexplained silent rules.
    expect(log.runs[0]?.tool.driver.rules).toEqual([])
    expect(log.runs[0]?.tool.driver.name).toBe("env-cap")
    expect(log.runs[0]?.tool.driver.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(log.runs[0]?.tool.driver.informationUri).toBe(
      "https://github.com/maverickcer/env-cap#readme",
    )
  })

  it("maps each finding to a result carrying its code as ruleId and its own message", () => {
    const log = buildSarifLog(model([CONTRACT_FINDING]))
    expect(log.runs[0]?.results).toEqual([
      {
        ruleId: "UNDOCUMENTED_VARIABLE",
        level: "warning",
        message: { text: CONTRACT_FINDING.message },
        locations: [
          { physicalLocation: { artifactLocation: { uri: "src/payments/env.schema.ts" } } },
        ],
      },
    ])
  })

  it("maps env-cap's info severity onto SARIF's note level, and error/warning through unchanged", () => {
    const log = buildSarifLog(
      model([
        { ...CONTRACT_FINDING, severity: "info", code: "NONSTANDARD_SENSITIVITY_LEVEL" },
        { ...CONTRACT_FINDING, severity: "warning" },
        { ...CONTRACT_FINDING, severity: "error", code: "EXCLUSIVE_GROUP_VIOLATION" },
      ]),
    )
    expect(log.runs[0]?.results.map((r) => r.level)).toEqual(["note", "warning", "error"])
  })

  it("lists each distinct rule id once, sorted, regardless of how many results use it", () => {
    const log = buildSarifLog(
      model([
        { ...CONTRACT_FINDING, code: "UNDOCUMENTED_VARIABLE" },
        { ...CONTRACT_FINDING, code: "EXPIRING_SOON" },
        { ...CONTRACT_FINDING, code: "UNDOCUMENTED_VARIABLE" },
      ]),
    )
    expect(log.runs[0]?.tool.driver.rules).toEqual([
      { id: "EXPIRING_SOON" },
      { id: "UNDOCUMENTED_VARIABLE" },
    ])
    expect(log.runs[0]?.results).toHaveLength(3)
  })

  it("emits a region only when the finding actually carries a position -- never a fabricated line 1", () => {
    const withPosition: Finding = {
      ...CONTRACT_FINDING,
      code: "STALE_DYNAMIC_ACCESS_CITATION",
      location: {
        model: "ownership",
        contractName: "payments",
        file: "src/payments/env.schema.ts",
        variable: "STRIPE_KEY",
        position: { file: "scripts/deploy.sh", line: 12, column: 4 },
      },
    }
    const results = buildSarifLog(model([CONTRACT_FINDING, withPosition])).runs[0]?.results ?? []

    expect(results[0]?.locations?.[0]?.physicalLocation.region).toBeUndefined()
    expect(results[1]?.locations?.[0]?.physicalLocation.region).toEqual({
      startLine: 12,
      startColumn: 4,
    })
  })

  it("omits locations entirely for a finding that names no file", () => {
    const log = buildSarifLog(
      model([
        {
          ...CONTRACT_FINDING,
          location: {
            model: "contract",
            file: undefined,
            exportName: undefined,
            variable: undefined,
            position: undefined,
          },
        },
      ]),
    )
    expect(log.runs[0]?.results[0]?.locations).toBeUndefined()
    // A read through optional chaining can't tell "the key is absent" apart
    // from "the key is present and set to `undefined`" -- this asserts the
    // stronger, `exactOptionalPropertyTypes`-motivated guarantee the source
    // comment describes: the key itself is never emitted, never set `undefined`.
    expect(log.runs[0]?.results[0]).not.toHaveProperty("locations")
  })

  it("uses a change-model finding's artifact path as its location uri", () => {
    const log = buildSarifLog(
      model([
        {
          severity: "warning",
          code: "ARTIFACT_STALE",
          family: "drift",
          message: "docs artifact is stale.",
          location: { model: "change", path: "docs/ENVIRONMENT.md" },
        },
      ]),
    )
    expect(log.runs[0]?.results[0]?.locations).toEqual([
      { physicalLocation: { artifactLocation: { uri: "docs/ENVIRONMENT.md" } } },
    ])
  })

  it("round-trips through JSON unchanged -- the log is plain, serializable data", () => {
    const log = buildSarifLog(model([CONTRACT_FINDING]))
    expect(JSON.parse(JSON.stringify(log))).toEqual(log)
  })
})
