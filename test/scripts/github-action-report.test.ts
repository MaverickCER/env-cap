import { describe, expect, it } from "vitest"
import {
  buildRotationAlert,
  classifyFindings,
  collectDocumentationFindings,
  collectErrorFindings,
  collectManifestFindings,
  collectOwnershipFindings,
  renderAnnotations,
  renderMarkdownSummary,
  // report.mjs itself stays plain, dependency-free JS (ADR 0013 decision 7) --
  // types come from the hand-written sibling report.d.mts, checked here.
} from "../../scripts/github-action/report.mjs"
import type { Finding } from "../../scripts/github-action/report.d.mts"

describe("collectManifestFindings", () => {
  it("returns one warning per file in a compatibility warning", () => {
    const findings = collectManifestFindings({
      warnings: [
        {
          severity: "warning",
          variable: "PORT",
          files: ["features/a/env.schema.ts", "features/b/env.schema.ts"],
          reason: "differing validators",
        },
      ],
    })
    expect(findings).toEqual([
      { level: "warning", file: "features/a/env.schema.ts", message: "PORT: differing validators" },
      { level: "warning", file: "features/b/env.schema.ts", message: "PORT: differing validators" },
    ])
  })

  it("returns nothing for an undefined manifest section", () => {
    expect(collectManifestFindings(undefined)).toEqual([])
  })
})

describe("collectDocumentationFindings", () => {
  it("maps undocumented/stale/unresolved findings to warnings", () => {
    const findings = collectDocumentationFindings({
      documentation: {
        undocumentedContracts: [{ file: "a.ts", exportName: "aEnv" }],
        undocumentedVariables: [{ file: "a.ts", exportName: "aEnv", key: "A" }],
        staleDocEntries: [{ file: "a.ts", exportName: "aEnv", key: "OLD" }],
        unresolvedLinks: [{ file: "a.ts", reason: "not statically linkable" }],
        expiringSoon: [],
      },
    })
    expect(findings.every((f) => f.level === "warning")).toBe(true)
    expect(findings).toHaveLength(4)
  })

  it("escalates an already-expired variable to error, and a not-yet-expired one stays a warning", () => {
    const findings = collectDocumentationFindings({
      documentation: {
        undocumentedContracts: [],
        undocumentedVariables: [],
        staleDocEntries: [],
        unresolvedLinks: [],
        expiringSoon: [
          {
            file: "a.ts",
            exportName: "aEnv",
            key: "OLD_KEY",
            expiresAt: "2000-01-01",
            daysRemaining: -30,
          },
          {
            file: "a.ts",
            exportName: "aEnv",
            key: "SOON_KEY",
            expiresAt: "2099-01-01",
            daysRemaining: 5,
          },
        ],
      },
    })
    const old = findings.find((f) => f.message.includes("OLD_KEY"))
    const soon = findings.find((f) => f.message.includes("SOON_KEY"))
    expect(old?.level).toBe("error")
    expect(soon?.level).toBe("warning")
  })
})

describe("collectOwnershipFindings", () => {
  it("maps abandoned/unconsumed to warning and unresolved/indeterminate to notice, never escalating the 'we don't know' states", () => {
    const findings = collectOwnershipFindings({
      abandonedContracts: [{ contractName: "orphan", file: "orphan.ts" }],
      unconsumedOwnedVariables: [{ contractName: "orphan", key: "X" }],
      unresolvedConsumers: [
        { contractName: "barrel", file: "barrel.ts", reason: "re-export chain" },
      ],
      indeterminate: [{ contractName: "dyn", key: "Y", reason: "dynamic access" }],
    })
    expect(
      findings.find((f) => f.message.includes("orphan") && f.message.includes("never imported"))
        ?.level,
    ).toBe("warning")
    expect(findings.find((f) => f.message.includes('"X"'))?.level).toBe("warning")
    expect(findings.find((f) => f.message.includes("barrel"))?.level).toBe("notice")
    expect(findings.find((f) => f.message.includes("dynamic access"))?.level).toBe("notice")
  })

  it("leaves file undefined for findings whose payload shape has no file (unconsumedOwnedVariables/indeterminate)", () => {
    const findings = collectOwnershipFindings({
      abandonedContracts: [],
      unconsumedOwnedVariables: [{ contractName: "orphan", key: "X" }],
      unresolvedConsumers: [],
      indeterminate: [{ contractName: "dyn", key: "Y", reason: "dynamic access" }],
    })
    expect(findings.every((f) => f.file === undefined)).toBe(true)
  })
})

describe("collectErrorFindings", () => {
  it("returns one error finding per file for each blocking issue, only when error.issues is present", () => {
    const findings = collectErrorFindings({
      name: "EnvProjectGenerationError",
      message: "...",
      issues: [
        {
          severity: "error",
          variable: 'Exclusive group "database"',
          files: ["a.ts", "b.ts"],
          reason: "two active contracts",
        },
      ],
    })
    expect(findings).toEqual([
      { level: "error", file: "a.ts", message: 'Exclusive group "database": two active contracts' },
      { level: "error", file: "b.ts", message: 'Exclusive group "database": two active contracts' },
    ])
  })

  it("returns nothing when issues is absent (a plain Error, not a compatibility failure)", () => {
    expect(collectErrorFindings({ name: "Error", message: "boom" })).toEqual([])
  })
})

describe("classifyFindings", () => {
  it("concatenates whichever of manifest/docs/usage/error sections are present", () => {
    const findings = classifyFindings({
      manifest: {
        warnings: [{ severity: "warning", variable: "A", files: ["a.ts"], reason: "r" }],
      },
      usage: {
        abandonedContracts: [],
        unconsumedOwnedVariables: [],
        unresolvedConsumers: [],
        indeterminate: [{ contractName: "c", key: "k", reason: "dynamic" }],
      },
    })
    expect(findings).toHaveLength(2)
    expect(findings.some((f) => f.level === "warning")).toBe(true)
    expect(findings.some((f) => f.level === "notice")).toBe(true)
  })

  it("silently ignores an unrecognized extra top-level field on the payload rather than breaking", () => {
    // Deliberately widened past ReportResult's declared shape -- this proves
    // the *runtime* tolerates an extra field a future schemaVersion might
    // add (ADR 0013 decision 5), which is exactly the case ReportResult's
    // own type can't express without losing the excess-property check that
    // makes every other test in this file useful.
    const payload = {
      manifest: { warnings: [] },
      somethingFromAFutureSchemaVersion: { nested: { data: true } },
    } as unknown as Parameters<typeof classifyFindings>[0]

    expect(() => classifyFindings(payload)).not.toThrow()
  })
})

describe("renderMarkdownSummary", () => {
  it("includes counts, blocking issues, undocumented variables, expiring secrets (enriched with catalog compliance), and the ownership table", () => {
    const summary = renderMarkdownSummary({
      ok: true,
      docs: {
        documentation: {
          undocumentedVariables: [{ file: "a.ts", exportName: "aEnv", key: "UNDOCUMENTED" }],
          expiringSoon: [
            {
              file: "a.ts",
              exportName: "aEnv",
              key: "STRIPE_KEY",
              expiresAt: "2027-01-01",
              daysRemaining: 5,
            },
          ],
        },
        catalog: [
          {
            file: "a.ts",
            exportName: "aEnv",
            variables: { STRIPE_KEY: { extra: { compliance: "PCI DSS" } } },
          },
        ],
      },
      usage: {
        dependencyOwnership: [
          { contractName: "payments", owner: "payments-team", consumers: ["x.ts", "y.ts"] },
          { contractName: "database", owner: "data-team", consumers: ["z.ts"] },
        ],
      },
    })

    expect(summary).toContain("# env-cap report")
    expect(summary).toContain("UNDOCUMENTED")
    expect(summary).toContain("STRIPE_KEY")
    expect(summary).toContain("PCI DSS")
    expect(summary).toContain("Ownership & Blast Radius")
    expect(summary.indexOf("payments")).toBeLessThan(summary.indexOf("database")) // sorted by consumer count descending
  })

  it("reports the failure name for an ok:false payload", () => {
    const summary = renderMarkdownSummary({
      ok: false,
      error: { name: "EnvProjectGenerationError", message: "...", issues: [] },
    })
    expect(summary).toContain("EnvProjectGenerationError")
  })
})

describe("renderAnnotations", () => {
  it("resolves a file relative to cliRoot then re-relativizes it to workspaceRoot when working-directory is non-trivial", () => {
    const workspaceRoot = "/home/runner/work/repo/repo"
    const cliRoot = path_join(workspaceRoot, "packages/app")
    const findings: Finding[] = [
      { level: "warning", file: "features/payments/env.schema.ts", message: "msg" },
    ]

    const [line] = renderAnnotations(findings, cliRoot, workspaceRoot)
    expect(line).toBe("::warning file=packages/app/features/payments/env.schema.ts::msg")
  })

  it("handles an already-absolute file the same way (the CLI's documented absolute/relative inconsistency)", () => {
    const workspaceRoot = "/home/runner/work/repo/repo"
    const cliRoot = path_join(workspaceRoot, "packages/app")
    const absoluteFile = path_join(cliRoot, "features/payments/env.schema.ts")
    const findings: Finding[] = [{ level: "error", file: absoluteFile, message: "msg" }]

    const [line] = renderAnnotations(findings, cliRoot, workspaceRoot)
    expect(line).toBe("::error file=packages/app/features/payments/env.schema.ts::msg")
  })

  it("proves the two-root fix matters: normalizing against workspaceRoot alone (the single-root version) would get this wrong", () => {
    const workspaceRoot = "/home/runner/work/repo/repo"
    const cliRoot = path_join(workspaceRoot, "packages/app")
    const findings: Finding[] = [
      { level: "warning", file: "features/payments/env.schema.ts", message: "msg" },
    ]

    const [correct] = renderAnnotations(findings, cliRoot, workspaceRoot)
    const [wrongSingleRoot] = renderAnnotations(findings, workspaceRoot, workspaceRoot)
    expect(correct).not.toBe(wrongSingleRoot)
    expect(correct).toBe("::warning file=packages/app/features/payments/env.schema.ts::msg")
    expect(wrongSingleRoot).toBe("::warning file=features/payments/env.schema.ts::msg")
  })

  it("degrades to a fileless annotation for a finding with no file (unconsumedOwnedVariables/indeterminate)", () => {
    const [line] = renderAnnotations(
      [{ level: "notice", file: undefined, message: "msg" }],
      "/root",
      "/root",
    )
    expect(line).toBe("::notice::msg")
  })

  it("matches the working-directory: '.' common case, where cliRoot === workspaceRoot", () => {
    const [line] = renderAnnotations(
      [{ level: "warning", file: "a.ts", message: "msg" }],
      "/repo",
      "/repo",
    )
    expect(line).toBe("::warning file=a.ts::msg")
  })
})

// Local, dependency-free path join for the tests above -- avoids importing
// "node:path" purely to build POSIX fixture paths independent of the host OS.
function path_join(...segments: string[]): string {
  return segments.join("/").replace(/\/+/g, "/")
}

describe("buildRotationAlert", () => {
  it("returns action: close when nothing is expiring", () => {
    expect(buildRotationAlert({ docs: { documentation: { expiringSoon: [] } } })).toEqual({
      action: "close",
    })
  })

  it("returns action: close when docs/documentation/expiringSoon is entirely absent", () => {
    expect(buildRotationAlert({})).toEqual({ action: "close" })
  })

  it("returns action: open with an 'expiring soon' title when nothing is yet expired", () => {
    const alert = buildRotationAlert({
      docs: {
        documentation: {
          expiringSoon: [
            {
              file: "a.ts",
              exportName: "aEnv",
              key: "K",
              expiresAt: "2099-01-01",
              daysRemaining: 10,
            },
          ],
        },
      },
    })
    expect(alert.action).toBe("open")
    expect(alert.action === "open" && alert.title).toBe(
      "env-cap: 1 environment variable(s) expiring soon",
    )
    expect(alert.action === "open" && alert.body).toContain("K")
  })

  it("returns action: open with an 'expired' title when at least one entry is already past due", () => {
    const alert = buildRotationAlert({
      docs: {
        documentation: {
          expiringSoon: [
            {
              file: "a.ts",
              exportName: "aEnv",
              key: "OLD",
              expiresAt: "2000-01-01",
              daysRemaining: -5,
            },
            {
              file: "a.ts",
              exportName: "aEnv",
              key: "SOON",
              expiresAt: "2099-01-01",
              daysRemaining: 10,
            },
          ],
        },
      },
    })
    expect(alert.action).toBe("open")
    expect(alert.action === "open" && alert.title).toBe(
      "env-cap: 1 environment variable(s) expired, 1 expiring soon",
    )
  })
})
