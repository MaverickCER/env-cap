import { describe, it, expect } from "vitest"
import {
  renderDocs,
  extractPreviouslyDocumentedKeys,
  extractPreviouslyActiveKeys,
  computeExpiringEntries,
  buildCatalog,
  normalizeDocsForComparison,
  type RenderDocsOptions,
} from "../../src/build/docs.js"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"

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
    expiresAt: undefined,
    refreshInstructions: undefined,
    required: undefined,
    extra: {},
    documented: true,
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
    expiresAt: undefined,
    metadata: undefined,
    documented: true,
    packageOrigin: undefined,
    ...overrides,
  }
}

function options(overrides: Partial<RenderDocsOptions> = {}): RenderDocsOptions {
  return {
    expiringWithinDays: 30,
    undocumentedContracts: [],
    undocumentedVariables: [],
    generatedAt: NOW,
    previousContent: undefined,
    ...overrides,
  }
}

describe("renderDocs", () => {
  it("includes the header, generation timestamp, and table of contents", async () => {
    const payments = makeContract({
      file: "/repo/features/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      variables: [
        makeVariable({ key: "STRIPE_KEY", hasProcessor: true, description: "Stripe secret key" }),
      ],
    })
    const docs = renderDocs([payments], "/repo", options())

    expect(docs).toContain("<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->")
    expect(docs).toContain(NOW.toISOString())
    expect(docs).toContain("## Table of contents")
    expect(docs).toContain("## Catalog")
    expect(docs).toContain("## Security review")
  })

  it("renders contract source, variable presence flags, and description in the catalog", async () => {
    const payments = makeContract({
      file: "/repo/features/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      variables: [
        makeVariable({
          key: "STRIPE_KEY",
          hasProcessor: true,
          hasValidator: true,
          description: "Stripe secret key",
        }),
        makeVariable({ key: "PORT", hasDefault: true }),
      ],
    })
    const docs = renderDocs([payments], "/repo", options())

    expect(docs).toContain("## payments")
    expect(docs).toContain("Source: `features/payments/env.schema.ts`")
    expect(docs).toContain("### `STRIPE_KEY`")
    expect(docs).toContain("Stripe secret key")
    expect(docs).toContain("- Processor: yes")
    expect(docs).toContain("- Validator: yes")
    expect(docs).toContain("### `PORT`")
    expect(docs).toContain("- Default: yes")
  })

  it("reports Default/Processor/Validator presence accurately for a bare variable", async () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "BARE" })],
    })
    const docs = renderDocs([contract], "/repo", options())
    expect(docs).toContain("- Default: no")
    expect(docs).toContain("- Processor: no")
    expect(docs).toContain("- Validator: no")
  })

  it("marks an undocumented contract and undocumented variable with a warning callout", async () => {
    const contract = makeContract({
      file: "/repo/orphan/env.schema.ts",
      exportName: "orphanEnv",
      documented: false,
      variables: [makeVariable({ key: "A", documented: false })],
    })
    const docs = renderDocs(
      [contract],
      "/repo",
      options({
        undocumentedContracts: [{ file: "/repo/orphan/env.schema.ts", exportName: "orphanEnv" }],
        undocumentedVariables: [
          { file: "/repo/orphan/env.schema.ts", exportName: "orphanEnv", key: "A" },
        ],
      }),
    )
    expect(docs).toContain(
      "⚠️ **Undocumented.** No `documentEnv()` call is linked to this contract.",
    )
    expect(docs).toMatch(/### `A`[\s\S]*?⚠️ \*\*Undocumented\.\*\*/)
  })

  describe("ownership matrix", () => {
    it("is omitted entirely when nothing sets owner", async () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([contract], "/repo", options())
      expect(docs).not.toContain("## Ownership matrix")
    })

    it("groups variables by effective owner, falling back to the contract's owner", async () => {
      const contract = makeContract({
        file: "/repo/payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        owner: "payments-team",
        variables: [
          makeVariable({ key: "STRIPE_KEY" }),
          makeVariable({ key: "WEBHOOK_SECRET", owner: "security-team" }),
        ],
      })
      const docs = renderDocs([contract], "/repo", options())
      expect(docs).toContain("## Ownership matrix")
      const matrix = docs.slice(
        docs.indexOf("## Ownership matrix"),
        docs.indexOf("## Dependency graph"),
      )
      expect(matrix).toContain("payments-team")
      expect(matrix).toContain("STRIPE_KEY")
      expect(matrix).toContain("security-team")
      expect(matrix).toContain("WEBHOOK_SECRET")
    })
  })

  describe("dependency graph", () => {
    it("lists every unique variable with all of its declaring locations", async () => {
      const a = makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        variables: [makeVariable({ key: "SHARED" })],
      })
      const b = makeContract({
        file: "/repo/b/env.schema.ts",
        exportName: "bEnv",
        contractName: "b",
        variables: [makeVariable({ key: "SHARED" })],
      })
      const docs = renderDocs([a, b], "/repo", options())

      expect(docs).toContain("## Dependency graph")
      const graph = docs.slice(
        docs.indexOf("## Dependency graph"),
        docs.indexOf("## Security review"),
      )
      expect(graph).toContain("`SHARED`")
      expect(graph).toContain("a (`a/env.schema.ts`)")
      expect(graph).toContain("b (`b/env.schema.ts`)")
    })

    it("still renders (as a table with no duplicate rows) when nothing is duplicated", async () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "ONLY" })],
      })
      const docs = renderDocs([contract], "/repo", options())
      expect(docs).toContain("## Dependency graph")
      expect(docs).toContain("`ONLY`")
    })
  })

  describe("lifecycle report", () => {
    it("is omitted when no variable sets expiresAt/owner/refreshInstructions", async () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([contract], "/repo", options())
      expect(docs).not.toContain("## Lifecycle report")
    })

    it("flags an already-expired variable and one expiring within the window, and omits one outside it", async () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [
          makeVariable({ key: "EXPIRED", expiresAt: "2025-01-01" }), // well before NOW
          makeVariable({ key: "EXPIRING_SOON", expiresAt: "2026-01-15" }), // 14 days after NOW
          makeVariable({ key: "FAR_OUT", expiresAt: "2027-01-01" }), // outside the 30-day window
        ],
      })
      const docs = renderDocs([contract], "/repo", options({ expiringWithinDays: 30 }))
      const lifecycle = docs.slice(
        docs.indexOf("## Lifecycle report"),
        docs.indexOf("## Security review"),
      )

      expect(lifecycle).toMatch(/EXPIRED.*expired \d+d ago/)
      expect(lifecycle).toMatch(/EXPIRING_SOON.*14d remaining/)
      // FAR_OUT is outside the window -- its row shows the plain date with no annotation.
      expect(lifecycle).toMatch(/FAR_OUT`\]\(#[^)]+\) \| -- \| 2027-01-01 \|/)
    })
  })

  describe("security review", () => {
    it("computes total/unique variable counts, required/refresh/owner counts, and duplicate-name count", async () => {
      const a = makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        variables: [
          makeVariable({ key: "SHARED", required: true, refreshInstructions: "Rotate it." }),
          makeVariable({ key: "ONLY_A", owner: "a-team" }),
        ],
      })
      const b = makeContract({
        file: "/repo/b/env.schema.ts",
        exportName: "bEnv",
        contractName: "b",
        variables: [makeVariable({ key: "SHARED" })],
      })
      const docs = renderDocs([a, b], "/repo", options())
      const security = docs.slice(docs.indexOf("## Security review"))

      expect(security).toContain("Total contracts: 2")
      expect(security).toContain("Total variable declarations: 3 (3 from active contracts)")
      expect(security).toContain("Unique variable names: 2")
      expect(security).toContain("Variables marked `required: true`: 1")
      expect(security).toContain("Variables with refresh instructions: 1")
      expect(security).toContain("Variables with no assigned owner: 2") // SHARED (a), SHARED (b) both unowned; ONLY_A has an owner
      expect(security).toContain("Variable names declared by more than one contract: 1")
    })

    it("reports undocumented contract/variable counts from the passed-in options", async () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs(
        [contract],
        "/repo",
        options({
          undocumentedContracts: [{ file: "/repo/x/env.schema.ts", exportName: "xEnv" }],
          undocumentedVariables: [{ file: "/repo/x/env.schema.ts", exportName: "xEnv", key: "A" }],
        }),
      )
      const security = docs.slice(docs.indexOf("## Security review"))
      expect(security).toContain("Undocumented contracts: 1")
      expect(security).toContain("Undocumented variables: 1")
    })
  })

  describe("change summary", () => {
    it("reports 'No changes.' (not omitted) when there is no previous content to diff against", async () => {
      // Not "omitted" -- see computeChangeSummary()'s docstring in docs.ts: a
      // first-ever report must already be a fixed point under self-feeding
      // (checkEnvArtifacts()/ADR 0016 always re-renders using whatever is
      // currently on disk as previousContent), and this is the only phrasing
      // that round-trips.
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([contract], "/repo", options())
      expect(docs).toContain("## Changes since last report")
      expect(docs).toContain("No changes.")

      // The fixed-point property itself: feeding a first report back in as
      // previousContent (nothing else changed) must reproduce it exactly,
      // modulo only the normalized _Generated ..._ timestamp line.
      const normalize = (s: string): string =>
        s.replace(/_Generated .+_/, "_Generated <normalized>_")
      const selfFed = renderDocs([contract], "/repo", options({ previousContent: docs }))
      expect(normalize(selfFed)).toBe(normalize(docs))
    })

    it("reports Added for a newly-discovered key and reports no changes when nothing changed", async () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" }), makeVariable({ key: "B" })],
      })
      const previous = renderDocs(
        [
          makeContract({
            file: "/repo/x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "A" })],
          }),
        ],
        "/repo",
        options(),
      )

      const docs = renderDocs([contract], "/repo", options({ previousContent: previous }))
      expect(docs).toContain("## Changes since last report")
      expect(docs).toContain("**Added:** `B`")

      const unchanged = renderDocs([contract], "/repo", options({ previousContent: docs }))
      expect(unchanged).toContain("No changes.")
    })

    it("reports Removed for a key no longer discovered at all", async () => {
      const previous = renderDocs(
        [
          makeContract({
            file: "/repo/x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "A" }), makeVariable({ key: "B" })],
          }),
        ],
        "/repo",
        options(),
      )
      const docs = renderDocs(
        [
          makeContract({
            file: "/repo/x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "A" })],
          }),
        ],
        "/repo",
        options({ previousContent: previous }),
      )
      expect(docs).toContain("**Removed:** `B`")
    })

    it("reports a key as no-longer-required when it's still discovered but only by an inactive contract", async () => {
      const previous = renderDocs(
        [
          makeContract({
            file: "/repo/x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "A" })],
          }),
        ],
        "/repo",
        options(),
      )
      const docs = renderDocs(
        [
          makeContract({
            file: "/repo/x/env.schema.ts",
            exportName: "xEnv",
            active: false,
            variables: [makeVariable({ key: "A" })],
          }),
        ],
        "/repo",
        options({ previousContent: previous }),
      )
      expect(docs).toContain("**No longer required (inactive):** `A`")
    })

    it("does not keep reporting a permanently-dormant key as no-longer-required on every regeneration", async () => {
      const dormant = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        active: false,
        variables: [makeVariable({ key: "A" })],
      })

      // First report where A is already inactive -- nothing "just changed" here.
      const firstReport = renderDocs([dormant], "/repo", options())

      // Regenerating against that same still-dormant state should report no changes,
      // not re-flag A as newly no-longer-required every single time.
      const secondReport = renderDocs([dormant], "/repo", options({ previousContent: firstReport }))
      expect(secondReport).toContain("No changes.")
      expect(secondReport).not.toContain("No longer required")
    })
  })

  describe("contract- and variable-level metadata fields in the catalog", () => {
    it("renders category, exclusive group, contract-level expiresAt, and metadata entries", () => {
      const contract = makeContract({
        file: "/repo/features/payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        category: "Billing",
        exclusiveGroup: "database",
        expiresAt: "2030-01-01",
        metadata: { rotationCadence: "quarterly" },
        variables: [makeVariable({ key: "STRIPE_KEY" })],
      })
      const docs = renderDocs([contract], "/repo", options())

      expect(docs).toContain("- Category: Billing")
      expect(docs).toContain("- Exclusive group: database")
      expect(docs).toContain("- Expires: 2030-01-01")
      expect(docs).toContain("- Rotation Cadence: quarterly")
    })

    it("renders arbitrary extra documentEnv() fields in the catalog, humanized", () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A", extra: { rotationCadence: "monthly" } })],
      })
      const docs = renderDocs([contract], "/repo", options())
      expect(docs).toContain("- Rotation Cadence: monthly")
    })

    it("renders Required: yes and Required: no for variables that explicitly set it either way", () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [
          makeVariable({ key: "MUST_HAVE", required: true }),
          makeVariable({ key: "MAY_OMIT", required: false }),
        ],
      })
      const docs = renderDocs([contract], "/repo", options())

      expect(docs).toContain("- Required: yes")
      expect(docs).toContain("- Required: no")
    })
  })

  describe("validation contexts", () => {
    it("renders a variable's validation context and the non-boundary disclaimer", () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "DATABASE_URL", context: "server" })],
      })
      const docs = renderDocs([contract], "/repo", options())

      expect(docs).toContain("- Validation context: server")
      expect(docs).toContain("Validation contexts describe when validation participates")
    })

    it("omits both the per-variable line and the disclaimer when no variable declares a context", () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "LOG_LEVEL" })],
      })
      const docs = renderDocs([contract], "/repo", options())

      expect(docs).not.toContain("Validation context")
    })
  })

  describe("sorting and anchor stability across the whole document", () => {
    it("sorts contracts by name regardless of input order (descending input)", () => {
      const zeta = makeContract({
        file: "/repo/zeta/env.schema.ts",
        exportName: "zetaEnv",
        contractName: "zeta",
        variables: [makeVariable({ key: "A" })],
      })
      const alpha = makeContract({
        file: "/repo/alpha/env.schema.ts",
        exportName: "alphaEnv",
        contractName: "alpha",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([zeta, alpha], "/repo", options())
      expect(docs.indexOf("## alpha")).toBeLessThan(docs.indexOf("## zeta"))
    })

    it("sorts contracts by name regardless of input order (ascending input)", () => {
      const zeta = makeContract({
        file: "/repo/zeta/env.schema.ts",
        exportName: "zetaEnv",
        contractName: "zeta",
        variables: [makeVariable({ key: "A" })],
      })
      const alpha = makeContract({
        file: "/repo/alpha/env.schema.ts",
        exportName: "alphaEnv",
        contractName: "alpha",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([alpha, zeta], "/repo", options())
      expect(docs.indexOf("## alpha")).toBeLessThan(docs.indexOf("## zeta"))
    })

    it("sorts a contract's own variables by key regardless of declaration order", () => {
      const descending = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "ZEBRA" }), makeVariable({ key: "APPLE" })],
      })
      const ascending = makeContract({
        file: "/repo/y/env.schema.ts",
        exportName: "yEnv",
        variables: [makeVariable({ key: "APPLE" }), makeVariable({ key: "ZEBRA" })],
      })
      const docsDescendingInput = renderDocs([descending], "/repo", options())
      const docsAscendingInput = renderDocs([ascending], "/repo", options())
      expect(docsDescendingInput.indexOf("### `APPLE`")).toBeLessThan(
        docsDescendingInput.indexOf("### `ZEBRA`"),
      )
      expect(docsAscendingInput.indexOf("### `APPLE`")).toBeLessThan(
        docsAscendingInput.indexOf("### `ZEBRA`"),
      )
    })

    it("assigns distinct, collision-free anchors when two different contracts share the same display name and variable key", () => {
      // `name` (contractName) is a free-form label, not required to be
      // unique -- two contracts both documented as "alpha" with the same
      // variable key produce identical `${contractName}-${key}` base text,
      // the exact collision AnchorRegistry exists to disambiguate.
      const contractA = makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        contractName: "alpha",
        variables: [makeVariable({ key: "SHARED_KEY" })],
      })
      const contractB = makeContract({
        file: "/repo/b/env.schema.ts",
        exportName: "bEnv",
        contractName: "alpha",
        variables: [makeVariable({ key: "SHARED_KEY" })],
      })
      const docs = renderDocs([contractA, contractB], "/repo", options())

      expect(docs).toContain('<a id="alpha-shared_key"></a>')
      expect(docs).toContain('<a id="alpha-shared_key-1"></a>')
    })

    it("falls back to a generic anchor when a variable heading's base text slugifies to nothing (all-symbol contract name and key)", () => {
      const contract = makeContract({
        file: "/repo/x/env.schema.ts",
        exportName: "xEnv",
        contractName: "!!!",
        variables: [makeVariable({ key: "???" })],
      })
      const docs = renderDocs([contract], "/repo", options())
      expect(docs).toContain('<a id="section"></a>')
    })

    it("falls back to the absolute path unchanged when a contract's file lies outside the given root", () => {
      const contract = makeContract({
        file: "/elsewhere/env.schema.ts",
        exportName: "elsewhereEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([contract], "/repo", options())
      expect(docs).toContain("Source: `/elsewhere/env.schema.ts`")
    })
  })
})

describe("extractPreviouslyDocumentedKeys", () => {
  it("extracts every `### `KEY`` heading from a previously-generated docs file", () => {
    const keys = extractPreviouslyDocumentedKeys(
      "## payments\n\n### `STRIPE_KEY`\n\nsome text\n\n### `PORT`\n\nmore text\n",
    )
    expect(keys).toEqual(new Set(["STRIPE_KEY", "PORT"]))
  })

  it("returns an empty set for content with no variable headings", () => {
    expect(extractPreviouslyDocumentedKeys("# Nothing here\n")).toEqual(new Set())
  })
})

describe("extractPreviouslyActiveKeys", () => {
  it("includes a key documented under an active contract", () => {
    const keys = extractPreviouslyActiveKeys(
      "## payments\n\n- Active: yes\n\n### `STRIPE_KEY`\n\nsome text\n",
    )
    expect(keys).toEqual(new Set(["STRIPE_KEY"]))
  })

  it("excludes a key documented under an inactive contract", () => {
    const keys = extractPreviouslyActiveKeys(
      "## payments\n\n- Active: no\n\n### `STRIPE_KEY`\n\nsome text\n",
    )
    expect(keys).toEqual(new Set())
  })

  it("tracks active state independently per contract", () => {
    const keys = extractPreviouslyActiveKeys(
      "## database\n\n- Active: yes\n\n### `DATABASE_URL`\n\n## payments\n\n- Active: no\n\n### `STRIPE_KEY`\n\n",
    )
    expect(keys).toEqual(new Set(["DATABASE_URL"]))
  })
})

describe("computeExpiringEntries", () => {
  it("includes both contract-level and variable-level expiresAt within the window, sorted by days remaining", async () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      expiresAt: "2026-01-20",
      variables: [makeVariable({ key: "A", expiresAt: "2026-01-05" })],
    })
    const entries = computeExpiringEntries([contract], 30, NOW)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.key).toBe("A") // fewer days remaining, sorts first
    expect(entries[1]?.key).toBeUndefined() // contract-level entry
  })

  it("ignores an unparseable expiresAt rather than throwing", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "not-a-date" })],
    })
    expect(computeExpiringEntries([contract], 30, NOW)).toHaveLength(0)
  })

  it("excludes an expiresAt outside the window", async () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2030-01-01" })],
    })
    expect(computeExpiringEntries([contract], 30, NOW)).toHaveLength(0)
  })

  it("skips a variable with no expiresAt at all, alongside one that has it", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [
        makeVariable({ key: "NO_EXPIRY" }),
        makeVariable({ key: "EXPIRING", expiresAt: "2026-01-05" }),
      ],
    })
    const entries = computeExpiringEntries([contract], 30, NOW)
    expect(entries.map((e) => e.key)).toEqual(["EXPIRING"])
  })
})

describe("buildCatalog", () => {
  it("carries the same descriptive content as the generated Markdown, keyed by variable name", () => {
    const contract = makeContract({
      file: "/repo/features/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      category: "Payments",
      owner: "payments-team",
      metadata: { service: "Payment Processing API", criticality: "Production-critical" },
      variables: [
        makeVariable({
          key: "STRIPE_KEY",
          description: "Stripe secret API key.",
          owner: "sysadmin@example.com",
          expiresAt: "2027-01-01",
          refreshInstructions: "Rotate the key in the Stripe Dashboard.",
          required: true,
          hasValidator: true,
          context: "server",
          extra: {
            rotationCadence: "90 days",
            storageProvider: "AWS Secrets Manager",
            compliance: "PCI DSS",
          },
        }),
      ],
    })

    const [entry] = buildCatalog([contract])
    expect(entry).toBeDefined()
    expect(entry.file).toBe("/repo/features/payments/env.schema.ts")
    expect(entry.exportName).toBe("paymentsEnv")
    expect(entry.contractName).toBe("payments")
    expect(entry.category).toBe("Payments")
    expect(entry.owner).toBe("payments-team")
    expect(entry.metadata).toEqual({
      service: "Payment Processing API",
      criticality: "Production-critical",
    })

    const variable = entry.variables.STRIPE_KEY
    expect(variable).toBeDefined()
    expect(variable.description).toBe("Stripe secret API key.")
    expect(variable.owner).toBe("sysadmin@example.com")
    expect(variable.expiresAt).toBe("2027-01-01")
    expect(variable.refreshInstructions).toBe("Rotate the key in the Stripe Dashboard.")
    expect(variable.required).toBe(true)
    expect(variable.hasValidator).toBe(true)
    expect(variable.context).toBe("server")
    expect(variable.extra).toEqual({
      rotationCadence: "90 days",
      storageProvider: "AWS Secrets Manager",
      compliance: "PCI DSS",
    })
  })

  it("falls back to the contract-level owner when a variable has none of its own", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      owner: "contract-owner",
      variables: [makeVariable({ key: "A" })],
    })
    const [entry] = buildCatalog([contract])
    expect(entry.variables.A.owner).toBe("contract-owner")
  })

  it("never lets extra metadata override a reserved field, even when an author names an extra key the same as a reserved one", () => {
    const contract = makeContract({
      file: "/repo/x/env.schema.ts",
      exportName: "xEnv",
      variables: [
        makeVariable({
          key: "A",
          required: true,
          documented: true,
          // An author's documentEnv() extra metadata field literally named
          // "documented"/"required" -- must never clobber the real booleans.
          extra: { documented: "definitely not", required: "also not" },
        }),
      ],
    })
    const [entry] = buildCatalog([contract])
    const variable = entry.variables.A
    expect(variable.documented).toBe(true)
    expect(variable.required).toBe(true)
    expect(variable.extra).toEqual({ documented: "definitely not", required: "also not" })
  })

  it("keys variables by exact name (not an array), and keeps two same-named contracts as distinct array entries", () => {
    const contractA = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      contractName: "shared-name",
      variables: [makeVariable({ key: "A" })],
    })
    const contractB = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      contractName: "shared-name",
      variables: [makeVariable({ key: "B" })],
    })

    const catalog = buildCatalog([contractA, contractB])
    expect(Array.isArray(catalog)).toBe(true)
    expect(catalog).toHaveLength(2)
    expect(catalog.every((c) => c.contractName === "shared-name")).toBe(true)

    expect(Array.isArray(catalog[0]?.variables)).toBe(false)
    expect(catalog.find((c) => c.file === "/repo/a/env.schema.ts")?.variables.A).toBeDefined()
    expect(catalog.find((c) => c.file === "/repo/b/env.schema.ts")?.variables.B).toBeDefined()
  })
})

describe("normalizeDocsForComparison", () => {
  it("normalizes the _Generated ..._ timestamp line", () => {
    const a = normalizeDocsForComparison("_Generated 2026-01-01T00:00:00.000Z_\n")
    const b = normalizeDocsForComparison("_Generated 2026-06-15T12:34:56.789Z_\n")
    expect(a).toBe(b)
  })

  it("normalizes lifecycle report 'Xd remaining' and 'expired Xd ago' annotations", () => {
    const a = normalizeDocsForComparison(
      "| `KEY` | owner | 2026-09-01 (**29d remaining**) | -- |\n",
    )
    const b = normalizeDocsForComparison("| `KEY` | owner | 2026-09-01 (**5d remaining**) | -- |\n")
    expect(a).toBe(b)
    expect(a).toContain("(**Nd remaining**)")

    const c = normalizeDocsForComparison(
      "| `KEY` | owner | 2026-01-01 (**expired 10d ago**) | -- |\n",
    )
    const d = normalizeDocsForComparison(
      "| `KEY` | owner | 2026-01-01 (**expired 200d ago**) | -- |\n",
    )
    expect(c).toBe(d)
    expect(c).toContain("(**expired Nd ago**)")
  })

  it("normalizes the security review's expired/expiring-soon counts, without touching the configured window", () => {
    const a = normalizeDocsForComparison("- Already expired: 0\n- Expiring within 30 days: 1\n")
    const b = normalizeDocsForComparison("- Already expired: 3\n- Expiring within 30 days: 7\n")
    expect(a).toBe(b)
    // The configured window (30) is not date-relative -- must survive normalization untouched.
    expect(a).toContain("Expiring within 30 days: N")
  })

  it("leaves ordinary, date-unrelated content untouched", () => {
    const content = "# Environment Variables\n\n## Catalog\n\n### `KEY`\n\nSome description.\n"
    expect(normalizeDocsForComparison(content)).toBe(content)
  })
})
