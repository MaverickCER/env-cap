import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { main } from "../../src/cli/index.js"
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
import type { Finding, FindingLike, ReportResult } from "../../scripts/github-action/report.d.mts"

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

// Finding Model fixture helper -- `collectDocumentationFindings`/
// `collectOwnershipFindings` now read `evidence.finding.findings` (ADR
// 0038's Finding Model), not the removed `result.docs`/`result.usage`
// shapes (ADR 0046). See the "real CLI invocation" describe block below for
// the test that actually proves the CLI can produce this shape end to end.
function finding(overrides: Partial<FindingLike> = {}): FindingLike {
  return {
    severity: "warning",
    code: "UNDOCUMENTED_VARIABLE",
    family: "documentation",
    message: "message",
    location: { model: "contract", file: "a.ts", exportName: "aEnv", variable: undefined },
    ...overrides,
  }
}

describe("collectDocumentationFindings", () => {
  it("maps undocumented/stale/unresolved findings to warnings", () => {
    const findings = collectDocumentationFindings({
      finding: {
        findings: [
          finding({ code: "UNDOCUMENTED_CONTRACT" }),
          finding({ code: "UNDOCUMENTED_VARIABLE" }),
          finding({ code: "STALE_DOC_ENTRY" }),
          finding({ code: "UNRESOLVED_DOCUMENTENV_LINK" }),
        ],
      },
    })
    expect(findings.every((f) => f.level === "warning")).toBe(true)
    expect(findings).toHaveLength(4)
  })

  it("escalates an already-expired variable to error, and a not-yet-expired one stays a warning", () => {
    const findings = collectDocumentationFindings({
      finding: {
        findings: [
          finding({
            code: "EXPIRED",
            message: "OLD_KEY expired",
            location: { model: "contract", file: "a.ts", exportName: "aEnv", variable: "OLD_KEY" },
          }),
          finding({
            code: "EXPIRING_SOON",
            message: "SOON_KEY expiring",
            location: { model: "contract", file: "a.ts", exportName: "aEnv", variable: "SOON_KEY" },
          }),
        ],
      },
    })
    const old = findings.find((f) => f.message.includes("OLD_KEY"))
    const soon = findings.find((f) => f.message.includes("SOON_KEY"))
    expect(old?.level).toBe("error")
    expect(soon?.level).toBe("warning")
  })

  it("downgrades an info-severity finding (e.g. NONSTANDARD_SENSITIVITY_LEVEL) to notice", () => {
    const findings = collectDocumentationFindings({
      finding: {
        findings: [finding({ code: "NONSTANDARD_SENSITIVITY_LEVEL", severity: "info" })],
      },
    })
    expect(findings[0]?.level).toBe("notice")
  })

  it("filters out ownership-family findings -- only 'documentation' passes through", () => {
    const findings = collectDocumentationFindings({
      finding: { findings: [finding({ family: "ownership", code: "ABANDONED_CONTRACT" })] },
    })
    expect(findings).toEqual([])
  })

  it("returns nothing for an undefined evidence section", () => {
    expect(collectDocumentationFindings(undefined)).toEqual([])
  })
})

describe("collectOwnershipFindings", () => {
  it("maps abandoned/unconsumed to warning and unresolved/indeterminate to notice, never escalating the 'we don't know' states", () => {
    const findings = collectOwnershipFindings({
      finding: {
        findings: [
          finding({
            family: "ownership",
            code: "ABANDONED_CONTRACT",
            message: '"orphan" is never imported anywhere',
            location: { model: "ownership", contractName: "orphan", file: "orphan.ts" },
          }),
          finding({
            family: "ownership",
            code: "UNCONSUMED_OWNED_VARIABLE",
            message: '"X" has no consumer',
            location: { model: "ownership", contractName: "orphan", variable: "X" },
          }),
          finding({
            family: "ownership",
            code: "UNRESOLVED_CONSUMER",
            message: '"barrel": re-export chain',
            location: { model: "ownership", contractName: "barrel", file: "barrel.ts" },
          }),
          finding({
            family: "ownership",
            code: "INDETERMINATE_OWNERSHIP",
            message: '"Y" in "dyn": dynamic access',
            location: { model: "ownership", contractName: "dyn", variable: "Y" },
          }),
        ],
      },
    })
    expect(
      findings.find((f) => f.message.includes("orphan") && f.message.includes("never imported"))
        ?.level,
    ).toBe("warning")
    expect(findings.find((f) => f.message.includes('"X"'))?.level).toBe("warning")
    expect(findings.find((f) => f.message.includes("barrel"))?.level).toBe("notice")
    expect(findings.find((f) => f.message.includes("dynamic access"))?.level).toBe("notice")
  })

  it("leaves file undefined for findings whose location carries no file (unconsumedOwnedVariables/indeterminate)", () => {
    const findings = collectOwnershipFindings({
      finding: {
        findings: [
          finding({
            family: "ownership",
            code: "UNCONSUMED_OWNED_VARIABLE",
            location: {
              model: "ownership",
              contractName: "orphan",
              variable: "X",
              file: undefined,
            },
          }),
        ],
      },
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
  it("concatenates whichever of manifest/evidence/error sections are present", () => {
    const findings = classifyFindings({
      manifest: {
        warnings: [{ severity: "warning", variable: "A", files: ["a.ts"], reason: "r" }],
      },
      evidence: {
        finding: {
          findings: [
            finding({
              family: "ownership",
              code: "INDETERMINATE_OWNERSHIP",
              location: { model: "ownership", contractName: "c", variable: "k" },
            }),
          ],
        },
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
  it("includes counts, blocking issues, undocumented variables, expiring secrets (enriched with metadata), and the ownership table", () => {
    const summary = renderMarkdownSummary({
      ok: true,
      evidence: {
        finding: {
          findings: [
            finding({
              code: "UNDOCUMENTED_VARIABLE",
              location: {
                model: "contract",
                file: "a.ts",
                exportName: "aEnv",
                variable: "UNDOCUMENTED",
              },
            }),
          ],
        },
        lifecycle: {
          expiring: [
            {
              file: "a.ts",
              exportName: "aEnv",
              key: "STRIPE_KEY",
              expiresAt: "2027-01-01",
              daysRemaining: 5,
            },
          ],
        },
        contract: {
          contracts: [
            {
              file: "a.ts",
              exportName: "aEnv",
              variables: [{ key: "STRIPE_KEY", metadata: { compliance: "PCI DSS" } }],
            },
          ],
        },
        ownership: {
          contracts: [
            { file: "p.ts", exportName: "paymentsEnv", owner: "payments-team" },
            { file: "d.ts", exportName: "databaseEnv", owner: "data-team" },
          ],
        },
        dependency: {
          contracts: [
            {
              file: "p.ts",
              exportName: "paymentsEnv",
              contractName: "payments",
              consumingFiles: ["x.ts", "y.ts"],
            },
            {
              file: "d.ts",
              exportName: "databaseEnv",
              contractName: "database",
              consumingFiles: ["z.ts"],
            },
          ],
        },
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

  it("renders nothing docs/ownership-related when evidence is entirely absent (--evidence wasn't passed)", () => {
    const summary = renderMarkdownSummary({ ok: true, manifest: { warnings: [] } })
    expect(summary).not.toContain("Undocumented variables")
    expect(summary).not.toContain("Expiring")
    expect(summary).not.toContain("Ownership & Blast Radius")
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
    expect(buildRotationAlert({ evidence: { lifecycle: { expiring: [] } } })).toEqual({
      action: "close",
    })
  })

  it("returns action: close when evidence/lifecycle/expiring is entirely absent", () => {
    expect(buildRotationAlert({})).toEqual({ action: "close" })
  })

  it("returns action: open with an 'expiring soon' title when nothing is yet expired", () => {
    const alert = buildRotationAlert({
      evidence: {
        lifecycle: {
          expiring: [
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
      evidence: {
        lifecycle: {
          expiring: [
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

// The test class that would have caught the original regression: every test
// above feeds a hand-built, synthetic `evidence`/`docs`/`usage` object
// straight into report.mjs's pure functions -- which stays valuable for
// covering each branch cheaply, but proves nothing about whether a REAL
// `env-cap --json` invocation can actually produce a payload shaped that
// way. The old `result.docs`/`result.usage`-reading version of this file
// passed exactly this kind of synthetic-fixture test suite right up until
// `--docs`/`--ownership` were removed from the CLI (ADR 0046) and those
// fields silently stopped being populated by any real invocation -- nothing
// here would have failed. This describes block runs the real, in-process
// `main()` (the same packaged CLI entry point the Action itself shells out
// to) against a real fixture schema, with `--evidence --json` (the Action's
// own documented minimum for full reporting), and asserts report.mjs's
// functions produce real, correct content from that real payload.
describe("report.mjs against a real `env-cap --json` payload (not a synthetic fixture)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const fixtureRoot = path.resolve(here, "fixtures-github-action-report")

  async function write(relativePath: string, content: string): Promise<void> {
    const filePath = path.join(fixtureRoot, relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, "utf8")
  }

  let writes: string[]
  let originalArgv: string[]

  beforeEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true })

    const msPerDay = 86_400_000
    const expiredDate = new Date(Date.now() - 5 * msPerDay).toISOString().slice(0, 10)

    // One contract with, deliberately, all three finding families a real
    // Action run cares about: an undocumented variable (documentation), a
    // never-imported contract (ownership/abandoned), and an already-expired
    // secret (documentation/lifecycle) -- no consumer file is written at all,
    // so STRIPE_KEY is also unconsumed.
    await write(
      "features/payments/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";

const schema = {
  STRIPE_KEY: {},
  UNDOCUMENTED_VAR: {},
};

export const paymentsEnv = createEnv(schema, { name: "payments" });

documentEnv(schema, {
  owner: "payments-team",
  variables: {
    STRIPE_KEY: { description: "Stripe secret key.", expiresAt: "${expiredDate}" },
  },
});
`,
    )

    writes = []
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk))
      return true
    })
    originalArgv = process.argv
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    process.argv = originalArgv
    process.exitCode = undefined
    await fs.rm(fixtureRoot, { recursive: true, force: true })
  })

  it("classifyFindings/renderMarkdownSummary/buildRotationAlert all produce real content from a real `--location --evidence --json` payload", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
      "--evidence",
      "docs/env.evidence.json",
      "--json",
    ]

    await main()

    const result = JSON.parse(writes.join("")) as ReportResult
    // Sanity: this is a real envelope with a real, populated evidence field --
    // not a hand-built stand-in for one.
    expect(result.evidence?.finding?.findings.length).toBeGreaterThan(0)

    const findings = classifyFindings(result)
    expect(findings.some((f) => f.message.includes("UNDOCUMENTED_VAR"))).toBe(true)
    expect(findings.some((f) => f.message.includes("payments") && f.level === "warning")).toBe(true)
    // The already-expired STRIPE_KEY is escalated to "error" -- proves
    // annotationLevel()'s EXPIRED special-case survives the real Finding
    // Model round-trip, not just a hand-built fixture shaped to hit it.
    expect(findings.some((f) => f.message.includes("STRIPE_KEY") && f.level === "error")).toBe(true)

    const summary = renderMarkdownSummary(result)
    expect(summary).toContain("UNDOCUMENTED_VAR")
    expect(summary).toContain("STRIPE_KEY")
    expect(summary).toContain("expired")

    const alert = buildRotationAlert(result)
    expect(alert.action).toBe("open")
    expect(alert.action === "open" && alert.title).toContain("expired")
  })

  it("evidence is entirely absent from the payload when --evidence isn't passed -- reporting degrades to manifest-only, exactly as action.yml documents", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
      "--json",
    ]

    await main()

    const result = JSON.parse(writes.join("")) as ReportResult
    expect(result.evidence).toBeUndefined()
    // No documentation/ownership finding leaks through when evidence is
    // absent -- classifyFindings() falls back to manifest findings alone
    // (empty here: this fixture has no compatibility conflict).
    expect(classifyFindings(result)).toEqual([])
    expect(collectDocumentationFindings(result.evidence)).toEqual([])
    expect(collectOwnershipFindings(result.evidence)).toEqual([])
    expect(buildRotationAlert(result)).toEqual({ action: "close" })
  })
})
