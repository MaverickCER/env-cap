import { describe, expect, it } from "vitest"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import {
  buildLifecycleModel,
  computeRotationStatus,
  LIFECYCLE_MODEL_SCHEMA_VERSION,
  parseRotationPeriodDays,
} from "../../src/build/lifecycle-model.js"

const NOW = new Date("2026-01-01T00:00:00.000Z")

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
    sensitivity: undefined,
    expiresAt: undefined,
    refreshInstructions: undefined,
    authenticatorType: undefined,
    rotationPeriod: undefined,
    lastRotatedAt: undefined,
    rotationTriggerEvents: undefined,
    setupInstructions: undefined,
    required: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    removeBy: undefined,
    renamedFrom: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    evidence: undefined,
    documented: true,
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    ...overrides,
  }
}

function makeContract(
  overrides: Partial<DiscoveredContract> & {
    file: string
    exportName: string
    variables: DiscoveredVariable[]
  },
): DiscoveredContract {
  return {
    contractName: overrides.exportName,
    active: true,
    category: undefined,
    exclusiveGroup: undefined,
    owner: undefined,
    sensitivity: undefined,
    expiresAt: undefined,
    deprecated: undefined,
    deprecatedReason: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    documented: true,
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    documentation: undefined,
    packageOrigin: undefined,
    ...overrides,
  }
}

describe("buildLifecycleModel", () => {
  it("carries the current schema version and root-relative, POSIX-separated file paths", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      expiresAt: "2027-01-01",
      variables: [],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.schemaVersion).toBe(LIFECYCLE_MODEL_SCHEMA_VERSION)
    expect(model.contracts[0]?.file).toBe("a/env.schema.ts")
  })

  it("omits a contract entirely when neither it nor any of its variables have lifecycle data", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "PLAIN" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts).toEqual([])
  })

  it("includes a contract when only the contract level has lifecycle data, with an empty variables array", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      deprecated: true,
      deprecatedReason: "Superseded by aEnv-v2.",
      variables: [makeVariable({ key: "PLAIN" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts).toHaveLength(1)
    expect(model.contracts[0]?.deprecated).toBe(true)
    expect(model.contracts[0]?.deprecatedReason).toBe("Superseded by aEnv-v2.")
    expect(model.contracts[0]?.variables).toEqual([])
  })

  it("includes a contract when ONLY deprecatedReason is set at the contract level (deprecated itself left unset)", () => {
    // The prior test sets `deprecated` and `deprecatedReason` together, so
    // it can't isolate `deprecatedReason !== undefined` from `deprecated
    // !== undefined` in the same OR-chain -- this contract has no other
    // contract-level lifecycle field at all.
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      deprecatedReason: "Superseded by aEnv-v2.",
      variables: [makeVariable({ key: "PLAIN" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts).toHaveLength(1)
    expect(model.contracts[0]?.deprecatedReason).toBe("Superseded by aEnv-v2.")
  })

  it("includes a contract when ONLY contract-level retention is set (no expiresAt/deprecated/deprecatedReason, no qualifying variables)", () => {
    // Isolates `contract.retention !== undefined` in the `hasContractLevelData`
    // OR-chain -- the same reason the deprecatedReason-only test above exists.
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      retention: "Delete 90 days after the account closes.",
      variables: [makeVariable({ key: "PLAIN" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts).toHaveLength(1)
    expect(model.contracts[0]?.retention).toBe("Delete 90 days after the account closes.")
    expect(model.contracts[0]?.variables).toEqual([])
  })

  it("filters variables to only those with at least one lifecycle field set", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [
        makeVariable({ key: "PLAIN" }),
        makeVariable({ key: "EXPIRES", expiresAt: "2027-01-01" }),
        makeVariable({ key: "DEPRECATED", deprecated: true, removeBy: "2027-06-01" }),
        makeVariable({ key: "RENAMED", renamedFrom: "OLD_RENAMED" }),
        makeVariable({ key: "REFRESH_ONLY", refreshInstructions: "Rotate in the vault." }),
        makeVariable({ key: "RETENTION_ONLY", retention: "90 days" }),
      ],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables.map((v) => v.key)).toEqual([
      "DEPRECATED",
      "EXPIRES",
      "REFRESH_ONLY",
      "RENAMED",
      "RETENTION_ONLY",
    ])
  })

  it("filters in a variable when ONLY deprecated is set (no expiresAt/refreshInstructions/removeBy/renamedFrom/retention)", () => {
    // Isolates `variable.deprecated !== undefined` in `hasLifecycleData`'s
    // OR-chain -- every other test combines it with removeBy or other
    // fields, which alone would already satisfy the OR.
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "DEPRECATED_ONLY", deprecated: true })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables.map((v) => v.key)).toEqual(["DEPRECATED_ONLY"])
  })

  it("filters in a variable when ONLY removeBy is set (no expiresAt/deprecated/refreshInstructions/renamedFrom/retention)", () => {
    // Isolates `variable.removeBy !== undefined` in `hasLifecycleData`'s
    // OR-chain -- every other test combines it with `deprecated`, which
    // alone would already satisfy the OR.
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "REMOVE_ONLY", removeBy: "2027-06-01" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables.map((v) => v.key)).toEqual(["REMOVE_ONLY"])
  })

  it("carries every lifecycle field through to the variable entry", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [
        makeVariable({
          key: "OLD_KEY",
          expiresAt: "2027-01-01",
          refreshInstructions: "Rotate in the vault.",
          deprecated: true,
          deprecatedReason: "Renamed for clarity.",
          removeBy: "2027-06-01",
          renamedFrom: "ANCIENT_KEY",
        }),
      ],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables).toEqual([
      {
        key: "OLD_KEY",
        expiresAt: "2027-01-01",
        refreshInstructions: "Rotate in the vault.",
        deprecated: true,
        deprecatedReason: "Renamed for clarity.",
        removeBy: "2027-06-01",
        renamedFrom: "ANCIENT_KEY",
        authenticatorType: undefined,
        rotationPeriod: undefined,
        lastRotatedAt: undefined,
        rotationTriggerEvents: undefined,
        // None of the four rotation-specific fields are set here (only the
        // pre-existing expiresAt/refreshInstructions/deprecated/... fields
        // are) -- "undeclared" is the correct, honest computed status.
        rotationStatus: "undeclared",
      },
    ])
  })

  it("sorts contracts deterministically by file, then exportName", () => {
    const b = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      deprecated: true,
      variables: [],
    })
    const a = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      deprecated: true,
      variables: [],
    })
    const model1 = buildLifecycleModel([b, a], 30, NOW, "/repo")
    const model2 = buildLifecycleModel([a, b], 30, NOW, "/repo")
    expect(model1).toEqual(model2)
    expect(model1.contracts.map((c) => c.file)).toEqual(["a/env.schema.ts", "b/env.schema.ts"])
  })

  it("promotes computeExpiringEntries() into the model's expiring field, with file relativized to root", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "SOON", expiresAt: "2026-01-15" })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.expiring).toHaveLength(1)
    expect(model.expiring[0]).toMatchObject({ key: "SOON", expiresAt: "2026-01-15" })
    // Unlike ExpiringEntry's own doc comment (an absolute path, in
    // computeExpiringEntries()'s other direct consumers), LifecycleModel's
    // own `expiring` field is root-relative -- matching every other
    // canonical model's file convention, not the absolute path
    // computeExpiringEntries() itself returns.
    expect(model.expiring[0]!.file).toBe("a/env.schema.ts")
  })

  it("filters in a variable when ONLY authenticatorType/rotationPeriod/lastRotatedAt/rotationTriggerEvents are set (none of the pre-existing lifecycle fields)", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [
        makeVariable({ key: "AUTH_TYPE_ONLY", authenticatorType: "api-key" }),
        makeVariable({ key: "ROTATION_PERIOD_ONLY", rotationPeriod: "90 days" }),
        makeVariable({ key: "LAST_ROTATED_ONLY", lastRotatedAt: "2026-01-01" }),
        makeVariable({
          key: "TRIGGER_EVENTS_ONLY",
          rotationTriggerEvents: ["suspected compromise"],
        }),
        makeVariable({ key: "PLAIN" }),
      ],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables.map((v) => v.key)).toEqual([
      "AUTH_TYPE_ONLY",
      "LAST_ROTATED_ONLY",
      "ROTATION_PERIOD_ONLY",
      "TRIGGER_EVENTS_ONLY",
    ])
  })

  it("treats an empty rotationTriggerEvents array as no rotation data at all (not distinct from unset)", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "EMPTY_TRIGGERS", rotationTriggerEvents: [] })],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts).toEqual([])
  })

  it("carries every rotation field through to the variable entry, with a computed rotationStatus", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [
        makeVariable({
          key: "STRIPE_KEY",
          authenticatorType: "api-key",
          rotationPeriod: "90 days",
          lastRotatedAt: "2025-12-01",
          rotationTriggerEvents: ["suspected compromise"],
        }),
      ],
    })
    const model = buildLifecycleModel([contract], 30, NOW, "/repo")
    expect(model.contracts[0]?.variables[0]).toMatchObject({
      key: "STRIPE_KEY",
      authenticatorType: "api-key",
      rotationPeriod: "90 days",
      lastRotatedAt: "2025-12-01",
      rotationTriggerEvents: ["suspected compromise"],
      // 2025-12-01 + 90 days is comfortably after NOW (2026-01-01).
      rotationStatus: "compliant",
    })
  })
})

describe("hasRotationData / computeRotationStatus", () => {
  const NOW = new Date("2026-06-01T00:00:00.000Z")

  const bare = {
    expiresAt: undefined,
    authenticatorType: undefined,
    rotationPeriod: undefined,
    lastRotatedAt: undefined,
    rotationTriggerEvents: undefined,
  }

  it('returns "undeclared" when nothing at all is set', () => {
    expect(computeRotationStatus(bare, NOW)).toBe("undeclared")
  })

  it('returns "undeclared" when only expiresAt is set (expiresAt alone is not a rotation field)', () => {
    expect(computeRotationStatus({ ...bare, expiresAt: "2026-01-01" }, NOW)).toBe("undeclared")
  })

  it('returns "undeclared" when rotationTriggerEvents is an empty array', () => {
    expect(computeRotationStatus({ ...bare, rotationTriggerEvents: [] }, NOW)).toBe("undeclared")
  })

  it('treats each rotation field alone as enough to escape "undeclared" (isolates each arm of the OR-chain)', () => {
    expect(computeRotationStatus({ ...bare, authenticatorType: "api-key" }, NOW)).not.toBe(
      "undeclared",
    )
    expect(computeRotationStatus({ ...bare, rotationPeriod: "90 days" }, NOW)).not.toBe(
      "undeclared",
    )
    expect(computeRotationStatus({ ...bare, lastRotatedAt: "2026-01-01" }, NOW)).not.toBe(
      "undeclared",
    )
    expect(
      computeRotationStatus({ ...bare, rotationTriggerEvents: ["personnel change"] }, NOW),
    ).not.toBe("undeclared")
  })

  it('returns "expired" when expiresAt has already passed, regardless of a compliant rotationPeriod', () => {
    const status = computeRotationStatus(
      {
        ...bare,
        expiresAt: "2026-01-01", // already past NOW (2026-06-01)
        rotationPeriod: "365 days",
        lastRotatedAt: "2026-05-01", // would otherwise be well within a 365-day period
      },
      NOW,
    )
    expect(status).toBe("expired")
  })

  it('does not return "expired" when expiresAt is in the future', () => {
    expect(
      computeRotationStatus(
        { ...bare, expiresAt: "2027-01-01", authenticatorType: "api-key" },
        NOW,
      ),
    ).not.toBe("expired")
  })

  it('does not treat expiresAt === now (the exact boundary) as "expired" -- only strictly in the past counts', () => {
    const status = computeRotationStatus(
      { ...bare, expiresAt: NOW.toISOString(), authenticatorType: "api-key" },
      NOW,
    )
    expect(status).toBe("compliant")
  })

  it("ignores an unparseable expiresAt (treated the same as unset, not as an error)", () => {
    const status = computeRotationStatus(
      { ...bare, expiresAt: "not-a-date", authenticatorType: "api-key" },
      NOW,
    )
    expect(status).toBe("compliant")
  })

  it('returns "compliant" when rotationPeriod + lastRotatedAt are both set and the due date is still in the future', () => {
    const status = computeRotationStatus(
      { ...bare, rotationPeriod: "90 days", lastRotatedAt: "2026-05-15" },
      NOW,
    )
    expect(status).toBe("compliant")
  })

  it('returns "compliant" at the exact due-date boundary (due date === now is not yet overdue)', () => {
    // 90 days after 2026-03-03T00:00:00.000Z is exactly NOW (2026-06-01T00:00:00.000Z).
    const status = computeRotationStatus(
      { ...bare, rotationPeriod: "90 days", lastRotatedAt: "2026-03-03T00:00:00.000Z" },
      NOW,
    )
    expect(status).toBe("compliant")
  })

  it('returns "compliant" when lastRotatedAt is exactly now (the boundary is inclusive, not just "in the past")', () => {
    const status = computeRotationStatus(
      { ...bare, rotationPeriod: "90 days", lastRotatedAt: NOW.toISOString() },
      NOW,
    )
    expect(status).toBe("compliant")
  })

  it('returns "overdue" (fails closed) when lastRotatedAt is in the future -- a rotation timestamped ahead of "now" can\'t have actually happened yet', () => {
    const status = computeRotationStatus(
      { ...bare, rotationPeriod: "90 days", lastRotatedAt: "2026-12-01" },
      NOW,
    )
    expect(status).toBe("overdue")
  })

  it('returns "overdue" when rotationPeriod + lastRotatedAt are both set and the due date has passed', () => {
    const status = computeRotationStatus(
      { ...bare, rotationPeriod: "90 days", lastRotatedAt: "2026-01-01" },
      NOW,
    )
    expect(status).toBe("overdue")
  })

  it('returns "overdue" (fails closed) when rotationPeriod is set but lastRotatedAt is missing', () => {
    expect(computeRotationStatus({ ...bare, rotationPeriod: "90 days" }, NOW)).toBe("overdue")
  })

  it('returns "overdue" (fails closed) when rotationPeriod is set and lastRotatedAt does not parse as a date', () => {
    const status = computeRotationStatus(
      { ...bare, rotationPeriod: "90 days", lastRotatedAt: "not-a-date" },
      NOW,
    )
    expect(status).toBe("overdue")
  })

  it('returns "overdue" (fails closed) when rotationPeriod does not parse as a duration, even with a valid lastRotatedAt', () => {
    const status = computeRotationStatus(
      { ...bare, rotationPeriod: "quarterly", lastRotatedAt: "2026-05-01" },
      NOW,
    )
    expect(status).toBe("overdue")
  })

  it('returns "overdue" (fails closed) for a zero-length rotationPeriod -- "rotate every 0 days" is treated as unverifiable, not as an always-due-instantly duration', () => {
    const status = computeRotationStatus(
      { ...bare, rotationPeriod: "0 days", lastRotatedAt: "2026-05-01" },
      NOW,
    )
    expect(status).toBe("overdue")
  })

  it('returns "compliant" when rotation metadata is declared but no rotationPeriod exists to be overdue against', () => {
    expect(computeRotationStatus({ ...bare, authenticatorType: "api-key" }, NOW)).toBe("compliant")
    expect(computeRotationStatus({ ...bare, lastRotatedAt: "2020-01-01" }, NOW)).toBe("compliant")
    expect(
      computeRotationStatus({ ...bare, rotationTriggerEvents: ["personnel change"] }, NOW),
    ).toBe("compliant")
  })
})

describe("parseRotationPeriodDays", () => {
  it("parses plain '<n> <unit>' forms, singular/plural/abbreviated, case-insensitively", () => {
    expect(parseRotationPeriodDays("90 days")).toBe(90)
    expect(parseRotationPeriodDays("1 day")).toBe(1)
    expect(parseRotationPeriodDays("5d")).toBe(5)
    expect(parseRotationPeriodDays("2 weeks")).toBe(14)
    expect(parseRotationPeriodDays("1 week")).toBe(7)
    expect(parseRotationPeriodDays("3w")).toBe(21)
    expect(parseRotationPeriodDays("6 months")).toBe(180)
    expect(parseRotationPeriodDays("1 month")).toBe(30)
    expect(parseRotationPeriodDays("2mo")).toBe(60)
    expect(parseRotationPeriodDays("1 year")).toBe(365)
    expect(parseRotationPeriodDays("2 years")).toBe(730)
    expect(parseRotationPeriodDays("1y")).toBe(365)
    expect(parseRotationPeriodDays("90 DAYS")).toBe(90)
    expect(parseRotationPeriodDays("  90 days  ")).toBe(90)
  })

  it("rejects a plain form with trailing garbage after the unit -- the whole string must match, not just a prefix", () => {
    expect(parseRotationPeriodDays("90 daysx")).toBeUndefined()
    expect(parseRotationPeriodDays("90 days and change")).toBeUndefined()
  })

  it("parses ISO 8601 calendar-duration forms, including multi-digit components", () => {
    expect(parseRotationPeriodDays("P90D")).toBe(90)
    expect(parseRotationPeriodDays("P3M")).toBe(90)
    expect(parseRotationPeriodDays("P1Y")).toBe(365)
    expect(parseRotationPeriodDays("P10Y")).toBe(10 * 365)
    expect(parseRotationPeriodDays("P12M")).toBe(12 * 30)
    expect(parseRotationPeriodDays("P1Y2M3D")).toBe(365 + 60 + 3)
    expect(parseRotationPeriodDays("p90d")).toBe(90)
  })

  it("rejects an ISO 8601 form with trailing garbage -- the whole string must match, not just a prefix", () => {
    expect(parseRotationPeriodDays("P90Dxyz")).toBeUndefined()
  })

  it("rejects an ISO 8601 form with leading garbage before the 'P' -- the whole string must match, not just a suffix", () => {
    expect(parseRotationPeriodDays("xP90D")).toBeUndefined()
  })

  it("returns undefined for free-text prose, an empty string, or a bare 'P' with no components", () => {
    expect(parseRotationPeriodDays("quarterly")).toBeUndefined()
    expect(parseRotationPeriodDays("")).toBeUndefined()
    expect(parseRotationPeriodDays("P")).toBeUndefined()
    expect(parseRotationPeriodDays("every other release")).toBeUndefined()
  })

  it("returns undefined for a zero-length period in either grammar -- a degenerate duration, not a real one", () => {
    expect(parseRotationPeriodDays("0 days")).toBeUndefined()
    expect(parseRotationPeriodDays("0d")).toBeUndefined()
    expect(parseRotationPeriodDays("0 weeks")).toBeUndefined()
    expect(parseRotationPeriodDays("P0D")).toBeUndefined()
    expect(parseRotationPeriodDays("P0Y0M0D")).toBeUndefined()
  })
})
