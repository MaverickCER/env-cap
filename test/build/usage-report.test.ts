import { describe, expect, it } from "vitest"
import { renderUsageReport } from "../../src/build/usage-report.js"
import type { GenerateUsageReportResult } from "../../src/build/generate-usage.js"

// Nothing else calls renderUsageReport() with more than a single, mostly-
// empty computation (see test/build/usage-generate.test.ts, which only
// asserts a handful of substrings on the real end-to-end output) -- every
// render*() helper's non-empty branch, and the sort comparator's both
// directions, are exercised here directly instead.
type Computed = Omit<GenerateUsageReportResult, "reportPath">

const EMPTY: Computed = {
  dependencyOwnership: [],
  abandonedContracts: [],
  unresolvedConsumers: [],
  unconsumedOwnedVariables: [],
  indeterminate: [],
  parseWarnings: [],
}

describe("renderUsageReport", () => {
  it("renders only the banner and title when every section is empty", () => {
    const source = renderUsageReport(EMPTY)
    expect(source).toContain("# Dependency & Ownership Report")
    expect(source).not.toContain("##")
  })

  it("renders the dependency ownership table sorted by contract name, with and without an owner/consumers", () => {
    const source = renderUsageReport({
      ...EMPTY,
      dependencyOwnership: [
        {
          contractName: "payments",
          file: "features/payments/env.schema.ts",
          owner: "payments-team",
          variableCount: 2,
          consumers: ["src/server.ts"],
        },
        {
          contractName: "billing",
          file: "features/billing/env.schema.ts",
          owner: undefined,
          variableCount: 1,
          consumers: [],
        },
      ],
    })
    expect(source).toContain("## Dependency ownership")
    // Sorted: billing before payments, regardless of input order.
    expect(source.indexOf("billing")).toBeLessThan(source.indexOf("payments"))
    expect(source).toContain("| billing (`features/billing/env.schema.ts`) | -- | 1 | -- | 0 |")
    expect(source).toContain(
      "| payments (`features/payments/env.schema.ts`) | payments-team | 2 | src/server.ts | 1 |",
    )
  })

  it("renders abandoned contracts sorted by name, with and without an owner", () => {
    const source = renderUsageReport({
      ...EMPTY,
      abandonedContracts: [
        { contractName: "zeta", file: "features/zeta/env.schema.ts", owner: "zeta-team" },
        { contractName: "alpha", file: "features/alpha/env.schema.ts", owner: undefined },
      ],
    })
    expect(source).toContain("## Abandoned ownership")
    expect(source.indexOf("alpha")).toBeLessThan(source.indexOf("zeta"))
    expect(source).toContain("| alpha | -- | `features/alpha/env.schema.ts` |")
    expect(source).toContain("| zeta | zeta-team | `features/zeta/env.schema.ts` |")
  })

  it("renders unresolved consumers sorted by name", () => {
    const source = renderUsageReport({
      ...EMPTY,
      unresolvedConsumers: [
        { contractName: "zeta", file: "features/zeta/env.schema.ts", reason: "reason z" },
        { contractName: "alpha", file: "features/alpha/env.schema.ts", reason: "reason a" },
      ],
    })
    expect(source).toContain("## Unresolved consumers (barrel re-exports)")
    expect(source.indexOf("alpha")).toBeLessThan(source.indexOf("zeta"))
    expect(source).toContain("- **alpha** (`features/alpha/env.schema.ts`): reason a")
  })

  it("renders unconsumed owned variables sorted by contract name, with and without an owner", () => {
    const source = renderUsageReport({
      ...EMPTY,
      unconsumedOwnedVariables: [
        { contractName: "zeta", owner: "zeta-team", key: "ZETA_KEY" },
        { contractName: "alpha", owner: undefined, key: "ALPHA_KEY" },
      ],
    })
    expect(source).toContain("## Unconsumed owned dependencies")
    expect(source.indexOf("alpha")).toBeLessThan(source.indexOf("zeta"))
    expect(source).toContain("| `ALPHA_KEY` | alpha | -- |")
    expect(source).toContain("| `ZETA_KEY` | zeta | zeta-team |")
  })

  it("renders indeterminate findings sorted by contract name", () => {
    const source = renderUsageReport({
      ...EMPTY,
      indeterminate: [
        { contractName: "zeta", key: "ZETA_KEY", reason: "dynamic access on zeta" },
        { contractName: "alpha", key: "ALPHA_KEY", reason: "dynamic access on alpha" },
      ],
    })
    expect(source).toContain("## Indeterminate (dynamic access)")
    expect(source.indexOf("alpha")).toBeLessThan(source.indexOf("zeta"))
    expect(source).toContain("| `ALPHA_KEY` | alpha | dynamic access on alpha |")
  })

  it("renders parse warnings in input order (no sort)", () => {
    const source = renderUsageReport({
      ...EMPTY,
      parseWarnings: [{ file: "features/a/env.schema.ts", message: "first warning" }],
    })
    expect(source).toContain("## Parse warnings")
    expect(source).toContain("- **features/a/env.schema.ts**: first warning")
  })

  it("sort comparator hits its a>b branch too, not just a<b (insertion sort only compares the new element against its predecessor, so already-ascending input never exercises a<b)", () => {
    const source = renderUsageReport({
      ...EMPTY,
      abandonedContracts: [
        { contractName: "alpha", file: "features/alpha/env.schema.ts", owner: undefined },
        { contractName: "zeta", file: "features/zeta/env.schema.ts", owner: undefined },
      ],
    })
    expect(source.indexOf("alpha")).toBeLessThan(source.indexOf("zeta"))
  })

  it("sort comparator handles two entries with an identical contractName (e.g. two features both named via the same documentEnv() name) without dropping either", () => {
    const source = renderUsageReport({
      ...EMPTY,
      abandonedContracts: [
        { contractName: "payments", file: "features/payments-v1/env.schema.ts", owner: undefined },
        { contractName: "payments", file: "features/payments-v2/env.schema.ts", owner: undefined },
      ],
    })
    expect(source).toContain("features/payments-v1/env.schema.ts")
    expect(source).toContain("features/payments-v2/env.schema.ts")
  })

  it("renders every section together, collapsing extra blank lines between them", () => {
    const source = renderUsageReport({
      dependencyOwnership: [
        { contractName: "payments", file: "f.ts", owner: "team", variableCount: 1, consumers: [] },
      ],
      abandonedContracts: [{ contractName: "orphaned", file: "o.ts", owner: undefined }],
      unresolvedConsumers: [{ contractName: "barreled", file: "b.ts", reason: "reason" }],
      unconsumedOwnedVariables: [{ contractName: "payments", owner: "team", key: "UNUSED" }],
      indeterminate: [{ contractName: "payments", key: "DYNAMIC", reason: "dynamic" }],
      parseWarnings: [{ file: "w.ts", message: "warning" }],
    })
    expect(source).not.toMatch(/\n{3,}/)
    for (const heading of [
      "Dependency ownership",
      "Abandoned ownership",
      "Unresolved consumers",
      "Unconsumed owned dependencies",
      "Indeterminate (dynamic access)",
      "Parse warnings",
    ]) {
      expect(source).toContain(heading)
    }
  })
})
