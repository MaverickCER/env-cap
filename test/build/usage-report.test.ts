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
  asserted: [],
  parseWarnings: [],
  scannedSurfaces: [{ label: "application", root: "." }],
}

describe("renderUsageReport", () => {
  it("renders only the banner and title when every section is empty", () => {
    const source = renderUsageReport(EMPTY)
    expect(source).toBe(
      "<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->\n" +
        "\n" +
        "> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.\n" +
        "\n" +
        "> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.\n" +
        "\n" +
        "# Dependency & Ownership Report\n" +
        "\n" +
        "_Produced by `env-cap --ownership`._\n" +
        "\n" +
        "Which feature owns each variable, which features consume that contract, and what the blast radius is if it changes.\n",
    )
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

  it("comma-separates multiple consumers in the dependency ownership table", () => {
    const source = renderUsageReport({
      ...EMPTY,
      dependencyOwnership: [
        {
          contractName: "payments",
          file: "f.ts",
          owner: "team",
          variableCount: 1,
          consumers: ["src/a.ts", "src/b.ts"],
        },
      ],
    })
    expect(source).toContain("| payments (`f.ts`) | team | 1 | src/a.ts, src/b.ts | 2 |")
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
        { contractName: "zeta", owner: "zeta-team", key: "ZETA_KEY", staleOrMissingCitations: [] },
        { contractName: "alpha", owner: undefined, key: "ALPHA_KEY", staleOrMissingCitations: [] },
      ],
    })
    expect(source).toContain("## Unconsumed owned dependencies")
    expect(source).toContain("Searched: application.")
    expect(source.indexOf("alpha")).toBeLessThan(source.indexOf("zeta"))
    expect(source).toContain("| `ALPHA_KEY` | alpha | -- | -- |")
    expect(source).toContain("| `ZETA_KEY` | zeta | zeta-team | -- |")
  })

  it("names every scanned surface, not just the application root, when packages were also scanned", () => {
    const source = renderUsageReport({
      ...EMPTY,
      unconsumedOwnedVariables: [
        { contractName: "alpha", owner: undefined, key: "ALPHA_KEY", staleOrMissingCitations: [] },
      ],
      scannedSurfaces: [
        { label: "application", root: "." },
        { label: "package:@acme/shared-contracts", root: "node_modules/@acme/shared-contracts" },
      ],
    })
    expect(source).toContain("Searched: application, package:@acme/shared-contracts.")
  })

  it("renders indeterminate findings sorted by contract name", () => {
    const source = renderUsageReport({
      ...EMPTY,
      indeterminate: [
        {
          contractName: "zeta",
          key: "ZETA_KEY",
          reason: "dynamic access on zeta",
          dynamicAccessSites: [{ file: "features/zeta/consumer.ts", line: 10, column: 5 }],
          staleOrMissingCitations: [],
        },
        {
          contractName: "alpha",
          key: "ALPHA_KEY",
          reason: "dynamic access on alpha",
          dynamicAccessSites: [],
          staleOrMissingCitations: [
            {
              contractName: "alpha",
              file: "features/alpha/env.schema.ts",
              exportName: "alphaEnv",
              key: "ALPHA_KEY",
              position: { file: "scripts/alpha.sh", line: 3, column: 1 },
              acknowledgment: "stale",
            },
          ],
        },
      ],
    })
    expect(source).toContain("## Indeterminate (dynamic access)")
    expect(source.indexOf("alpha")).toBeLessThan(source.indexOf("zeta"))
    expect(source).toContain(
      "| `ALPHA_KEY` | alpha | dynamic access on alpha | scripts/alpha.sh:3:1 (stale) |",
    )
    expect(source).toContain("| `ZETA_KEY` | zeta | dynamic access on zeta | -- |")
  })

  it("comma-separates multiple stale/missing citations", () => {
    const source = renderUsageReport({
      ...EMPTY,
      indeterminate: [
        {
          contractName: "alpha",
          key: "ALPHA_KEY",
          reason: "dynamic access on alpha",
          dynamicAccessSites: [],
          staleOrMissingCitations: [
            {
              contractName: "alpha",
              file: "features/alpha/env.schema.ts",
              exportName: "alphaEnv",
              key: "ALPHA_KEY",
              position: { file: "scripts/a.sh", line: 1, column: 1 },
              acknowledgment: "stale",
            },
            {
              contractName: "alpha",
              file: "features/alpha/env.schema.ts",
              exportName: "alphaEnv",
              key: "ALPHA_KEY",
              position: { file: "scripts/b.sh", line: 2, column: 2 },
              acknowledgment: "missing",
            },
          ],
        },
      ],
    })
    expect(source).toContain(
      "| `ALPHA_KEY` | alpha | dynamic access on alpha | scripts/a.sh:1:1 (stale), scripts/b.sh:2:2 (missing) |",
    )
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
      unconsumedOwnedVariables: [
        { contractName: "payments", owner: "team", key: "UNUSED", staleOrMissingCitations: [] },
      ],
      indeterminate: [
        {
          contractName: "payments",
          key: "DYNAMIC",
          reason: "dynamic",
          dynamicAccessSites: [],
          staleOrMissingCitations: [],
        },
      ],
      asserted: [
        {
          contractName: "payments",
          key: "CITED",
          wouldBeStatus: "unconsumed",
          dynamicAccessAssertions: [
            {
              file: "scripts/migrate.sh",
              line: 12,
              column: 4,
              acknowledgment: "fresh",
              contentHash: "deadbeef",
            },
          ],
        },
      ],
      parseWarnings: [{ file: "w.ts", message: "warning" }],
      scannedSurfaces: [{ label: "application", root: "." }],
    })
    expect(source).toBe(
      "<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->\n" +
        "\n" +
        "> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.\n" +
        "\n" +
        "> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.\n" +
        "\n" +
        "# Dependency & Ownership Report\n" +
        "\n" +
        "_Produced by `env-cap --ownership`._\n" +
        "\n" +
        "Which feature owns each variable, which features consume that contract, and what the blast radius is if it changes.\n" +
        "\n" +
        "## Dependency ownership\n" +
        "\n" +
        "Who owns each contract, who depends on it, and the blast radius if it changes.\n" +
        "\n" +
        "| Contract | Owner | Variables | Consumers | Blast radius |\n" +
        "|---|---|---|---|---|\n" +
        "| payments (`f.ts`) | team | 1 | -- | 0 |\n" +
        "\n" +
        "## Abandoned ownership\n" +
        "\n" +
        "Contracts never imported anywhere in the scanned repository -- a feature's schema outliving the feature.\n" +
        "\n" +
        "| Contract | Owner | File |\n" +
        "|---|---|---|\n" +
        "| orphaned | -- | `o.ts` |\n" +
        "\n" +
        "## Unresolved consumers (barrel re-exports)\n" +
        "\n" +
        "Contracts reachable only through an unresolved `export * from` barrel re-export -- cannot be proven abandoned or consumed. Advisory only; never fails a build.\n" +
        "\n" +
        "- **barreled** (`b.ts`): reason\n" +
        "\n" +
        "## Unconsumed owned dependencies\n" +
        "\n" +
        "Variables no consumer reads within the scanned surfaces below. Not proof of dead code. Common reasons a real consumer wouldn't show up here: it's read by a separate, out-of-repo service or webhook handler; it's consumed by non-TypeScript code (a shell script, a Dockerfile, a Terraform/Kubernetes manifest); or it's read from an allow-listed package whose directory wasn't included in this project's own `packages` configuration (ADR 0014).\n" +
        "\n" +
        "Searched: application.\n" +
        "\n" +
        'A blank Stale/missing citations cell is the strongest "looks genuinely unused" signal -- no developer has ever claimed otherwise. A non-blank cell means someone specifically claimed dynamic access here via `dynamicAccess`, and that claim can no longer be verified (ADR 0037) -- check with them before deleting.\n' +
        "\n" +
        "| Variable | Contract | Owner | Stale/missing citations |\n" +
        "|---|---|---|---|\n" +
        "| `UNUSED` | payments | team | -- |\n" +
        "\n" +
        "## Indeterminate (dynamic access)\n" +
        "\n" +
        "Dynamic (computed) property access was observed -- usage cannot be determined statically. Never guessed at.\n" +
        "\n" +
        "| Variable | Contract | Reason | Stale/missing citations |\n" +
        "|---|---|---|---|\n" +
        "| `DYNAMIC` | payments | dynamic | -- |\n" +
        "\n" +
        "## Asserted (developer-acknowledged dynamic access)\n" +
        "\n" +
        "Variables env-cap's own scan would otherwise flag as unconsumed or indeterminate, but a developer has cited exactly where the dynamic access happens via `dynamicAccess`. The raw static status is shown alongside the citation, never hidden behind it -- a citation is a re-acknowledgment, not proof.\n" +
        "\n" +
        "| Variable | Contract | Static status | Developer assertion |\n" +
        "|---|---|---|---|\n" +
        "| `CITED` | payments | unconsumed | Per developers, this data point is dynamically accessed at scripts/migrate.sh:12:4. |\n" +
        "\n" +
        "## Parse warnings\n" +
        "\n" +
        "Includes any `packages` (ADR 0014) resolution failures, alongside ordinary schema-discovery warnings.\n" +
        "\n" +
        "- **w.ts**: warning\n",
    )
  })

  it("renders the asserted section only when at least one variable is asserted, sorted by contract name", () => {
    const source = renderUsageReport({
      ...EMPTY,
      asserted: [
        {
          contractName: "zeta",
          key: "Z_KEY",
          wouldBeStatus: "indeterminate",
          dynamicAccessAssertions: [
            {
              file: "scripts/z.sh",
              line: 1,
              column: 1,
              acknowledgment: "fresh",
              contentHash: "deadbeef",
            },
          ],
        },
        {
          contractName: "alpha",
          key: "A_KEY",
          wouldBeStatus: "unconsumed",
          dynamicAccessAssertions: [
            {
              file: "scripts/a.sh",
              line: 2,
              column: 2,
              acknowledgment: "fresh",
              contentHash: "deadbeef",
            },
          ],
        },
      ],
    })
    expect(source).toContain("## Asserted (developer-acknowledged dynamic access)")
    expect(source.indexOf("alpha")).toBeLessThan(source.indexOf("zeta"))
  })

  it("comma-separates multiple developer-acknowledged citation sites", () => {
    const source = renderUsageReport({
      ...EMPTY,
      asserted: [
        {
          contractName: "alpha",
          key: "A_KEY",
          wouldBeStatus: "unconsumed",
          dynamicAccessAssertions: [
            {
              file: "scripts/a.sh",
              line: 1,
              column: 1,
              acknowledgment: "fresh",
              contentHash: "deadbeef",
            },
            {
              file: "scripts/b.sh",
              line: 2,
              column: 2,
              acknowledgment: "fresh",
              contentHash: "beadfeed",
            },
          ],
        },
      ],
    })
    expect(source).toContain(
      "Per developers, this data point is dynamically accessed at scripts/a.sh:1:1, scripts/b.sh:2:2.",
    )
  })
})
