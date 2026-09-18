import { describe, it, expect } from "vitest"
import { generatedBanner } from "../../src/build/generated-banner.js"
import {
  renderDocs,
  extractPreviouslyDocumentedKeys,
  extractPreviouslyActiveKeys,
  computeExpiringEntries,
  computeSecurityReviewCounters,
  buildCatalog,
  normalizeDocsForComparison,
  type RenderDocsOptions,
} from "../../src/build/docs.js"
import type {
  ContractModelContract,
  ContractModelVariable,
} from "../../src/build/contract-model.js"

const NOW = new Date("2026-01-01T00:00:00.000Z")

function makeVariable(
  overrides: Partial<ContractModelVariable> & { key: string },
): ContractModelVariable {
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
    setupInstructions: undefined,
    required: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    evidence: undefined,
    documented: true,
    declaration: { file: "x/env.schema.ts", line: 1, column: 1 },
    ...overrides,
  }
}

function makeContract(
  overrides: Partial<ContractModelContract> & {
    file: string
    exportName: string
    variables: ContractModelVariable[]
  },
): ContractModelContract {
  return {
    contractName: overrides.exportName,
    active: true,
    category: undefined,
    exclusiveGroup: undefined,
    owner: undefined,
    sensitivity: undefined,
    expiresAt: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    documented: true,
    declaration: { file: "x/env.schema.ts", line: 1, column: 1 },
    documentation: undefined,
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
      file: "features/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      variables: [
        makeVariable({ key: "STRIPE_KEY", hasProcessor: true, description: "Stripe secret key" }),
      ],
    })
    const docs = renderDocs([payments], options())

    expect(docs).toContain(generatedBanner("markdown"))
    expect(docs).toContain(NOW.toISOString())
    expect(docs).toContain("## Table of contents")
    expect(docs).toContain("## Catalog")
    expect(docs).toContain("## Security review")
  })

  it("renders contract source, variable presence flags, and description in the catalog", async () => {
    const payments = makeContract({
      file: "features/payments/env.schema.ts",
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
    const docs = renderDocs([payments], options())

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
      file: "x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "BARE" })],
    })
    const docs = renderDocs([contract], options())
    expect(docs).toContain("- Default: no")
    expect(docs).toContain("- Processor: no")
    expect(docs).toContain("- Validator: no")
  })

  it("renders the exact minimal document for a bare contract/variable with every optional field unset", async () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "BARE" })],
    })
    const docs = renderDocs([contract], options())
    expect(docs).toBe(
      '<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->\n\n> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.\n\n> Projected from env-cap\'s Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.\n\n# Environment Variables\n\n_Produced by `env-cap --docs`._\n\n_Generated 2026-01-01T00:00:00.000Z_\n\n## Changes since last report\n\nNo changes.\n\n## Table of contents\n\n- [Catalog](#catalog)\n  - [xEnv](#contract-xenv)\n- [Security review](#security-review)\n\n## Catalog\n\n<a id="catalog"></a>\n\n<a id="contract-xenv"></a>\n## xEnv\n\nSource: `x/env.schema.ts`\n- Active: yes\n\n<a id="xenv-bare"></a>\n### `BARE`\n\n- Default: no\n- Processor: no\n- Validator: no\n\n## Dependency graph\n\n<a id="dependency-graph"></a>\n\nOne row per unique variable name; more than one location means more than one feature declares it (see the package README\'s "Duplicate variables" section for how that\'s handled at runtime).\n\n| Variable | Declared in |\n|---|---|\n| `BARE` | [xEnv (`x/env.schema.ts`)](#xenv-bare) |\n\n## Security review\n\n<a id="security-review"></a>\n\n- Total contracts: 1\n- Total variable declarations: 1 (1 from active contracts)\n- Unique variable names: 1\n- Variables with `expiresAt` set: 0\n  - Already expired: 0\n  - Expiring within 30 days: 0\n- Variables marked `required: true`: 0\n- Variables with refresh instructions: 0\n- Variables with no assigned owner: 1\n- Variable names declared by more than one contract: 0\n- Undocumented contracts: 0\n- Undocumented variables: 0\n',
    )
  })

  it("renders the exact maximal document when every optional contract/variable field is set", async () => {
    const contract = makeContract({
      file: "features/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      category: "database",
      exclusiveGroup: "db",
      owner: "payments-team",
      sensitivity: "secret",
      expiresAt: "2026-01-15",
      purpose: "billing",
      legalBasis: "contract",
      retention: "7 years",
      dataResidency: "EU",
      auditRequired: true,
      metadata: { runbook: "https://wiki.internal/payments" },
      variables: [
        makeVariable({
          key: "STRIPE_KEY",
          hasDefault: true,
          hasProcessor: true,
          hasValidator: true,
          context: "server",
          description: "Stripe secret key",
          owner: "stripe-team",
          sensitivity: "restricted",
          expiresAt: "2026-01-10",
          setupInstructions: "Provision a Stripe account.",
          refreshInstructions: "Rotate in the Stripe dashboard.",
          required: true,
          purpose: "fraud-detection",
          legalBasis: "pci-dss",
          retention: "1 year",
          dataResidency: "US",
          auditRequired: false,
          evidence: { dynamicAccess: ["scripts/rotate.sh:3:5"] },
          metadata: { extra: "note" },
        }),
      ],
    })
    const docs = renderDocs([contract], options())
    expect(docs).toBe(
      '<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->\n\n> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.\n\n> Projected from env-cap\'s Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.\n\n# Environment Variables\n\n_Produced by `env-cap --docs`._\n\n_Generated 2026-01-01T00:00:00.000Z_\n\n## Changes since last report\n\nNo changes.\n\n## Table of contents\n\n- [Catalog](#catalog)\n  - [payments](#contract-payments)\n- [Ownership matrix](#ownership-matrix)\n- [Lifecycle report](#lifecycle-report)\n- [Security review](#security-review)\n\n## Catalog\n\n<a id="catalog"></a>\n\n> Validation contexts describe when validation participates. They do not restrict access to values, and they do not remove a variable\'s schema (or its `default` value) from wherever this manifest is imported.\n\n<a id="contract-payments"></a>\n## payments\n\nSource: `features/payments/env.schema.ts`\n- Active: yes\n- Category: database\n- Exclusive group: db\n- Owner: payments-team\n- Sensitivity: secret\n- Expires: 2026-01-15\n- Purpose: billing\n- Legal basis: contract\n- Retention: 7 years\n- Data residency: EU\n- Audit required: yes\n- Runbook: https://wiki.internal/payments\n\n<a id="payments-stripe_key"></a>\n### `STRIPE_KEY`\n\nStripe secret key\n\n- Default: yes\n- Processor: yes\n- Validator: yes\n- Validation context: server\n- Owner: stripe-team\n- Sensitivity: restricted\n- Expires: 2026-01-10\n- Setup instructions: Provision a Stripe account.\n- Refresh instructions: Rotate in the Stripe dashboard.\n- Required: yes\n- Purpose: fraud-detection\n- Legal basis: pci-dss\n- Retention: 1 year\n- Data residency: US\n- Audit required: no\n- Dynamic access: scripts/rotate.sh:3:5\n- Extra: note\n\n## Ownership matrix\n\n<a id="ownership-matrix"></a>\n\n| Owner | Variables |\n|---|---|\n| stripe-team | [`STRIPE_KEY` (payments)](#payments-stripe_key) |\n\n## Dependency graph\n\n<a id="dependency-graph"></a>\n\nOne row per unique variable name; more than one location means more than one feature declares it (see the package README\'s "Duplicate variables" section for how that\'s handled at runtime).\n\n| Variable | Declared in |\n|---|---|\n| `STRIPE_KEY` | [payments (`features/payments/env.schema.ts`)](#payments-stripe_key) |\n\n## Lifecycle report\n\n<a id="lifecycle-report"></a>\n\n| Variable | Owner | Expires | Refresh instructions |\n|---|---|---|---|\n| [`STRIPE_KEY`](#payments-stripe_key) | stripe-team | 2026-01-10 (**9d remaining**) | Rotate in the Stripe dashboard. |\n\n## Security review\n\n<a id="security-review"></a>\n\n- Total contracts: 1\n- Total variable declarations: 1 (1 from active contracts)\n- Unique variable names: 1\n- Variables with `expiresAt` set: 1\n  - Already expired: 0\n  - Expiring within 30 days: 1\n- Variables marked `required: true`: 1\n- Variables with refresh instructions: 1\n- Variables with no assigned owner: 0\n- Variable names declared by more than one contract: 0\n- Undocumented contracts: 0\n- Undocumented variables: 0\n',
    )
  })

  it("renders the effective sensitivity, preferring the variable's own over the contract's", async () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      sensitivity: "secret",
      variables: [
        makeVariable({ key: "OVERRIDDEN", sensitivity: "config" }),
        makeVariable({ key: "INHERITED" }),
      ],
    })
    const docs = renderDocs([contract], options())

    expect(docs).toContain("- Sensitivity: secret") // contract-level line
    expect(docs).toMatch(/### `OVERRIDDEN`[\s\S]*?- Sensitivity: config/)
    expect(docs).toMatch(/### `INHERITED`[\s\S]*?- Sensitivity: secret/)
  })

  it("marks an undocumented contract and undocumented variable with a warning callout", async () => {
    const contract = makeContract({
      file: "orphan/env.schema.ts",
      exportName: "orphanEnv",
      documented: false,
      variables: [makeVariable({ key: "A", documented: false })],
    })
    const docs = renderDocs(
      [contract],
      options({
        undocumentedContracts: [{ file: "orphan/env.schema.ts", exportName: "orphanEnv" }],
        undocumentedVariables: [
          { file: "orphan/env.schema.ts", exportName: "orphanEnv", key: "A" },
        ],
      }),
    )
    expect(docs).toContain(
      "⚠️ **Undocumented.** No `documentEnv()` call is linked to this contract.",
    )
    // Exactly one blank line separates "Source: ..." from the callout -- not
    // an unexpected extra line of junk text where that blank should be.
    expect(docs).toContain(
      "Source: `orphan/env.schema.ts`\n\n> ⚠️ **Undocumented.** No `documentEnv()` call is linked to this contract.",
    )
    expect(docs).toMatch(/### `A`[\s\S]*?⚠️ \*\*Undocumented\.\*\*/)
    // Exactly one blank line separates the variable-level callout from the
    // next line (Default/Processor/Validator).
    expect(docs).toContain("> ⚠️ **Undocumented.**\n\n- Default:")
  })

  describe("ownership matrix", () => {
    it("is omitted entirely when nothing sets owner", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([contract], options())
      expect(docs).not.toContain("## Ownership matrix")
    })

    it("groups variables by effective owner, falling back to the contract's owner", async () => {
      const contract = makeContract({
        file: "payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        owner: "payments-team",
        variables: [
          makeVariable({ key: "STRIPE_KEY" }),
          makeVariable({ key: "WEBHOOK_SECRET", owner: "security-team" }),
        ],
      })
      const docs = renderDocs([contract], options())
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

    it("sorts owners alphabetically regardless of discovery order, and joins multiple variables under the same owner with ', '", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        // Declared with the LAST-alphabetically owner discovered first.
        owner: "zzz-team",
        variables: [
          makeVariable({ key: "FIRST" }),
          makeVariable({ key: "SECOND" }),
          makeVariable({ key: "THIRD", owner: "aaa-team" }),
        ],
      })
      const docs = renderDocs([contract], options())
      const matrix = docs.slice(
        docs.indexOf("## Ownership matrix"),
        docs.indexOf("## Dependency graph"),
      )
      // aaa-team's row must come before zzz-team's, and zzz-team's own two
      // variables must be joined with ", " in a single cell.
      const aaaIndex = matrix.indexOf("aaa-team")
      const zzzIndex = matrix.indexOf("zzz-team")
      expect(aaaIndex).toBeGreaterThan(-1)
      expect(zzzIndex).toBeGreaterThan(aaaIndex)
      expect(matrix).toContain("`FIRST` (xEnv)](#xenv-first), [`SECOND` (xEnv)](#xenv-second)")
    })
  })

  describe("dependency graph", () => {
    it("lists every unique variable with all of its declaring locations, and flags hasDuplicates true (via the TOC link) only when a REAL duplicate exists alongside a non-duplicate", async () => {
      const a = makeContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        // SHARED is duplicated (both a and b declare it); ONLY_A is not --
        // the mix needed to distinguish `.some(len>1)` from `.every(len>1)`.
        variables: [makeVariable({ key: "SHARED" }), makeVariable({ key: "ONLY_A" })],
      })
      const b = makeContract({
        file: "b/env.schema.ts",
        exportName: "bEnv",
        contractName: "b",
        variables: [makeVariable({ key: "SHARED" })],
      })
      const docs = renderDocs([a, b], options())

      expect(docs).toContain("## Dependency graph")
      // hasDuplicates: true -- the TOC link must actually appear.
      expect(docs).toContain("- [Dependency graph](#dependency-graph)")
      const graph = docs.slice(
        docs.indexOf("## Dependency graph"),
        docs.indexOf("## Security review"),
      )
      expect(graph).toContain("`SHARED`")
      // Both locations joined into ONE cell with ", " -- not just present
      // separately anywhere in the section.
      expect(graph).toContain(
        "a (`a/env.schema.ts`)](#a-shared), [b (`b/env.schema.ts`)](#b-shared)",
      )
    })

    it("still renders (as a table with no duplicate rows) when nothing is duplicated", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "ONLY" })],
      })
      const docs = renderDocs([contract], options())
      expect(docs).toContain("## Dependency graph")
      expect(docs).toContain("`ONLY`")
    })

    it("sorts variable-name rows alphabetically regardless of discovery order", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "Z_KEY" }), makeVariable({ key: "A_KEY" })],
      })
      const docs = renderDocs([contract], options())
      const graph = docs.slice(
        docs.indexOf("## Dependency graph"),
        docs.indexOf("## Security review"),
      )
      expect(graph.indexOf("`A_KEY`")).toBeLessThan(graph.indexOf("`Z_KEY`"))
    })
  })

  describe("lifecycle report", () => {
    it("is omitted when no variable sets expiresAt/owner/refreshInstructions", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([contract], options())
      expect(docs).not.toContain("## Lifecycle report")
    })

    it("flags an already-expired variable and one expiring within the window, and omits one outside it", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [
          makeVariable({ key: "EXPIRED", expiresAt: "2025-01-01" }), // well before NOW
          makeVariable({ key: "EXPIRING_SOON", expiresAt: "2026-01-15" }), // 14 days after NOW
          makeVariable({ key: "FAR_OUT", expiresAt: "2027-01-01" }), // outside the 30-day window
        ],
      })
      const docs = renderDocs([contract], options({ expiringWithinDays: 30 }))
      const lifecycle = docs.slice(
        docs.indexOf("## Lifecycle report"),
        docs.indexOf("## Security review"),
      )

      expect(lifecycle).toMatch(/EXPIRED.*expired \d+d ago/)
      expect(lifecycle).toMatch(/EXPIRING_SOON.*14d remaining/)
      // FAR_OUT is outside the window -- its row shows the plain date with no annotation.
      expect(lifecycle).toMatch(/FAR_OUT`\]\(#[^)]+\) \| -- \| 2027-01-01 \|/)
    })

    it("includes a row for a variable with only an owner (no expiresAt/refreshInstructions), and one with only refreshInstructions -- each showing '--' for the columns it doesn't set", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [
          makeVariable({ key: "OWNED_ONLY", owner: "team-a" }),
          makeVariable({ key: "REFRESH_ONLY", refreshInstructions: "Rotate it." }),
        ],
      })
      const docs = renderDocs([contract], options())
      const lifecycle = docs.slice(
        docs.indexOf("## Lifecycle report"),
        docs.indexOf("## Security review"),
      )
      expect(lifecycle).toMatch(/OWNED_ONLY`\]\(#[^)]+\) \| team-a \| -- \| -- \|/)
      expect(lifecycle).toMatch(/REFRESH_ONLY`\]\(#[^)]+\) \| -- \| -- \| Rotate it\. \|/)
    })

    it("annotates exactly AT the expiringWithinDays boundary as remaining, and exactly at 0 days as remaining (not expired)", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [
          // NOW + 30 days exactly, with expiringWithinDays: 30.
          makeVariable({ key: "AT_BOUNDARY", expiresAt: "2026-01-31" }),
          // NOW exactly -- 0 days remaining, not yet expired.
          makeVariable({ key: "TODAY", expiresAt: "2026-01-01" }),
        ],
      })
      const docs = renderDocs([contract], options({ expiringWithinDays: 30 }))
      const lifecycle = docs.slice(
        docs.indexOf("## Lifecycle report"),
        docs.indexOf("## Security review"),
      )
      expect(lifecycle).toMatch(
        /AT_BOUNDARY`\]\(#[^)]+\) \| -- \| 2026-01-31 \(\*\*30d remaining\*\*\)/,
      )
      expect(lifecycle).toMatch(/TODAY`\]\(#[^)]+\) \| -- \| 2026-01-01 \(\*\*0d remaining\*\*\)/)
    })

    it("shows the raw string, without crashing, for an unparseable expiresAt that still made the row appear (owner set)", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "BAD_DATE", owner: "team-a", expiresAt: "not-a-date" })],
      })
      expect(() => renderDocs([contract], options())).not.toThrow()
      const docs = renderDocs([contract], options())
      const lifecycle = docs.slice(
        docs.indexOf("## Lifecycle report"),
        docs.indexOf("## Security review"),
      )
      expect(lifecycle).toMatch(/BAD_DATE`\]\(#[^)]+\) \| team-a \| not-a-date \|/)
    })
  })

  describe("security review", () => {
    it("computes total/unique variable counts, required/refresh/owner counts, and duplicate-name count", async () => {
      const a = makeContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        variables: [
          makeVariable({ key: "SHARED", required: true, refreshInstructions: "Rotate it." }),
          makeVariable({ key: "ONLY_A", owner: "a-team" }),
        ],
      })
      const b = makeContract({
        file: "b/env.schema.ts",
        exportName: "bEnv",
        contractName: "b",
        variables: [makeVariable({ key: "SHARED" })],
      })
      const docs = renderDocs([a, b], options())
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
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs(
        [contract],
        options({
          undocumentedContracts: [{ file: "x/env.schema.ts", exportName: "xEnv" }],
          undocumentedVariables: [{ file: "x/env.schema.ts", exportName: "xEnv", key: "A" }],
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
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([contract], options())
      expect(docs).toContain("## Changes since last report")
      expect(docs).toContain("No changes.")

      // The fixed-point property itself: feeding a first report back in as
      // previousContent (nothing else changed) must reproduce it exactly,
      // modulo only the normalized _Generated ..._ timestamp line.
      const normalize = (s: string): string =>
        s.replace(/_Generated .+_/, "_Generated <normalized>_")
      const selfFed = renderDocs([contract], options({ previousContent: docs }))
      expect(normalize(selfFed)).toBe(normalize(docs))
    })

    it("reports Added for a newly-discovered key and reports no changes when nothing changed", async () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A" }), makeVariable({ key: "B" })],
      })
      const previous = renderDocs(
        [
          makeContract({
            file: "x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "A" })],
          }),
        ],
        options(),
      )

      const docs = renderDocs([contract], options({ previousContent: previous }))
      expect(docs).toContain("## Changes since last report")
      expect(docs).toContain("**Added:** `B`")
      // Nothing was removed or commented-out -- those lines must be absent,
      // not merely present-but-empty.
      expect(docs).not.toContain("**Removed:**")
      expect(docs).not.toContain("**No longer required")

      const unchanged = renderDocs([contract], options({ previousContent: docs }))
      expect(unchanged).toContain("No changes.")
    })

    it("sorts multiple Added keys alphabetically regardless of discovery order", async () => {
      const previous = renderDocs(
        [
          makeContract({
            file: "x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "A" })],
          }),
        ],
        options(),
      )
      const docs = renderDocs(
        [
          makeContract({
            file: "x/env.schema.ts",
            exportName: "xEnv",
            // Declared in reverse-alphabetical order -- the sort must reorder them.
            variables: [
              makeVariable({ key: "A" }),
              makeVariable({ key: "Z_KEY" }),
              makeVariable({ key: "M_KEY" }),
            ],
          }),
        ],
        options({ previousContent: previous }),
      )
      expect(docs).toContain("**Added:** `M_KEY`, `Z_KEY`")
    })

    it("reports Removed for a key no longer discovered at all", async () => {
      const previous = renderDocs(
        [
          makeContract({
            file: "x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "A" }), makeVariable({ key: "B" })],
          }),
        ],
        options(),
      )
      const docs = renderDocs(
        [
          makeContract({
            file: "x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "A" })],
          }),
        ],
        options({ previousContent: previous }),
      )
      expect(docs).toContain("**Removed:** `B`")
      expect(docs).not.toContain("**Added:**")
      expect(docs).not.toContain("**No longer required")
      // Exactly one blank line separates the changes summary from the TOC --
      // not an unexpected extra line of junk text.
      expect(docs).toContain("**Removed:** `B`\n\n## Table of contents")
    })

    it("sorts multiple Removed keys alphabetically regardless of prior heading order", async () => {
      // renderCatalog() sorts a CONTRACT's own variables before rendering, so
      // a single contract's heading order can never be un-sorted -- two
      // contracts, ordered by CONTRACT name (not by their own variable's
      // key), is the only way to get a genuinely non-alphabetical heading
      // SEQUENCE in the rendered text for extractPreviouslyDocumentedKeys()
      // to parse back out of order.
      const previous = renderDocs(
        [
          makeContract({
            file: "a/env.schema.ts",
            exportName: "aEnv",
            contractName: "a",
            variables: [makeVariable({ key: "Z_KEY" })],
          }),
          makeContract({
            file: "b/env.schema.ts",
            exportName: "bEnv",
            contractName: "b",
            variables: [makeVariable({ key: "A_KEY" })],
          }),
        ],
        options(),
      )
      const docs = renderDocs(
        [
          makeContract({
            file: "x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "UNRELATED" })],
          }),
        ],
        options({ previousContent: previous }),
      )
      expect(docs).toContain("**Removed:** `A_KEY`, `Z_KEY`")
    })

    it("reports a key as no-longer-required when it's still discovered but only by an inactive contract", async () => {
      const previous = renderDocs(
        [
          makeContract({
            file: "x/env.schema.ts",
            exportName: "xEnv",
            variables: [makeVariable({ key: "A" })],
          }),
        ],
        options(),
      )
      const docs = renderDocs(
        [
          makeContract({
            file: "x/env.schema.ts",
            exportName: "xEnv",
            active: false,
            variables: [makeVariable({ key: "A" })],
          }),
        ],
        options({ previousContent: previous }),
      )
      expect(docs).toContain("**No longer required (inactive):** `A`")
      expect(docs).not.toContain("**Added:**")
      expect(docs).not.toContain("**Removed:**")
    })

    it("sorts multiple 'no longer required' keys alphabetically regardless of prior heading order", async () => {
      // Same reasoning as the Removed-sort test above -- two contracts,
      // ordered by CONTRACT name, so the PREVIOUS render's heading sequence
      // is genuinely non-alphabetical for extractPreviouslyActiveKeys() to
      // parse back out of order.
      const previous = renderDocs(
        [
          makeContract({
            file: "a/env.schema.ts",
            exportName: "aEnv",
            contractName: "a",
            variables: [makeVariable({ key: "Z_KEY" })],
          }),
          makeContract({
            file: "b/env.schema.ts",
            exportName: "bEnv",
            contractName: "b",
            variables: [makeVariable({ key: "A_KEY" })],
          }),
        ],
        options(),
      )
      const docs = renderDocs(
        [
          makeContract({
            file: "a/env.schema.ts",
            exportName: "aEnv",
            contractName: "a",
            active: false,
            variables: [makeVariable({ key: "Z_KEY" })],
          }),
          makeContract({
            file: "b/env.schema.ts",
            exportName: "bEnv",
            contractName: "b",
            active: false,
            variables: [makeVariable({ key: "A_KEY" })],
          }),
        ],
        options({ previousContent: previous }),
      )
      expect(docs).toContain("**No longer required (inactive):** `A_KEY`, `Z_KEY`")
    })

    it("does not keep reporting a permanently-dormant key as no-longer-required on every regeneration", async () => {
      const dormant = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        active: false,
        variables: [makeVariable({ key: "A" })],
      })

      // First report where A is already inactive -- nothing "just changed" here.
      const firstReport = renderDocs([dormant], options())

      // Regenerating against that same still-dormant state should report no changes,
      // not re-flag A as newly no-longer-required every single time.
      const secondReport = renderDocs([dormant], options({ previousContent: firstReport }))
      expect(secondReport).toContain("No changes.")
      expect(secondReport).not.toContain("No longer required")
    })
  })

  describe("dynamic access citations in the catalog", () => {
    it("joins two or more dynamicAccess citations with ', '", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [
          makeVariable({
            key: "A",
            evidence: { dynamicAccess: ["scripts/a.sh:1:1", "scripts/b.sh:2:2"] },
          }),
        ],
      })
      const docs = renderDocs([contract], options())
      expect(docs).toContain("- Dynamic access: scripts/a.sh:1:1, scripts/b.sh:2:2")
    })

    it("omits the Dynamic access line entirely when dynamicAccess is an empty array (evidence present but no citations)", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A", evidence: { dynamicAccess: [] } })],
      })
      const docs = renderDocs([contract], options())
      expect(docs).not.toContain("Dynamic access")
    })
  })

  describe("contract- and variable-level metadata fields in the catalog", () => {
    it("renders category, exclusive group, contract-level expiresAt, and metadata entries", () => {
      const contract = makeContract({
        file: "features/payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        category: "Billing",
        exclusiveGroup: "database",
        expiresAt: "2030-01-01",
        metadata: { rotationCadence: "quarterly" },
        variables: [makeVariable({ key: "STRIPE_KEY" })],
      })
      const docs = renderDocs([contract], options())

      expect(docs).toContain("- Category: Billing")
      expect(docs).toContain("- Exclusive group: database")
      expect(docs).toContain("- Expires: 2030-01-01")
      expect(docs).toContain("- Rotation Cadence: quarterly")
    })

    it("renders arbitrary extra documentEnv() fields in the catalog, humanized", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "A", metadata: { rotationCadence: "monthly" } })],
      })
      const docs = renderDocs([contract], options())
      expect(docs).toContain("- Rotation Cadence: monthly")
    })

    it("renders purpose, legalBasis, retention, dataResidency, and auditRequired at both contract and variable level (ADR 0035)", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        purpose: "Contract-level purpose.",
        legalBasis: "Contract-level legal basis.",
        retention: "Delete after 90 days.",
        dataResidency: ["EU", "US"],
        auditRequired: true,
        variables: [
          makeVariable({
            key: "A",
            purpose: "Variable-level purpose.",
            legalBasis: "Variable-level legal basis.",
            retention: "Delete after 30 days.",
            dataResidency: "EU",
            auditRequired: true,
          }),
        ],
      })
      const docs = renderDocs([contract], options())

      expect(docs).toContain("- Purpose: Contract-level purpose.")
      expect(docs).toContain("- Legal basis: Contract-level legal basis.")
      expect(docs).toContain("- Retention: Delete after 90 days.")
      expect(docs).toContain('- Data residency: ["EU","US"]')
      expect(docs).toContain("- Audit required: yes")
      expect(docs).toContain("- Purpose: Variable-level purpose.")
      expect(docs).toContain("- Legal basis: Variable-level legal basis.")
      expect(docs).toContain("- Retention: Delete after 30 days.")
      expect(docs).toContain("- Data residency: EU")
    })

    it("renders 'Audit required: no' at the contract level when explicitly set to false (not just omitted)", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        auditRequired: false,
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([contract], options())
      // Sliced to the contract-level fields specifically (before the first
      // variable heading) -- the variable's own `effectiveAuditRequired`
      // fallback would ALSO render "Audit required: no" from the SAME
      // contract value, at a different source line, which could mask a
      // mutant on the contract-level ternary specifically if checked
      // unscoped.
      const contractFields = docs.slice(
        docs.indexOf("Source: `x/env.schema.ts`"),
        docs.indexOf("### `A`"),
      )
      expect(contractFields).toContain("- Audit required: no")
    })

    it("renders 'Audit required: yes' at the variable level when its own effective value is true", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        auditRequired: false,
        variables: [makeVariable({ key: "A", auditRequired: true })],
      })
      const docs = renderDocs([contract], options())
      const variableFields = docs.slice(docs.indexOf("### `A`"))
      expect(variableFields).toContain("- Audit required: yes")
    })

    it("renders a non-string metadata value as its JSON text instead of [object Object] (ADR 0035)", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        metadata: { controls: { encryption: true, keyRotationDays: 90 } },
        variables: [makeVariable({ key: "A", metadata: { retryPolicy: [1, 2, 3] } })],
      })
      const docs = renderDocs([contract], options())

      expect(docs).toContain(
        `- Controls: ${JSON.stringify({ encryption: true, keyRotationDays: 90 })}`,
      )
      expect(docs).toContain(`- Retry Policy: ${JSON.stringify([1, 2, 3])}`)
      expect(docs).not.toContain("[object Object]")
    })

    it("a variable that sets its own purpose shows that value, not the contract's default, in its own entry", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        purpose: "Contract default.",
        variables: [
          makeVariable({ key: "OVERRIDES", purpose: "Variable override." }),
          makeVariable({ key: "INHERITS" }),
        ],
      })
      const docs = renderDocs([contract], options())
      // Variables render alphabetically by key: "INHERITS" before "OVERRIDES".
      const inheritsSection = docs.slice(
        docs.indexOf("### `INHERITS`"),
        docs.indexOf("### `OVERRIDES`"),
      )
      const overridesSection = docs.slice(docs.indexOf("### `OVERRIDES`"))

      expect(overridesSection).toContain("- Purpose: Variable override.")
      expect(inheritsSection).toContain("- Purpose: Contract default.")
    })

    it("renders Required: yes and Required: no for variables that explicitly set it either way", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [
          makeVariable({ key: "MUST_HAVE", required: true }),
          makeVariable({ key: "MAY_OMIT", required: false }),
        ],
      })
      const docs = renderDocs([contract], options())

      expect(docs).toContain("- Required: yes")
      expect(docs).toContain("- Required: no")
    })

    it("renders setup instructions as its own labeled line, distinct from refresh instructions", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [
          makeVariable({
            key: "STRIPE_KEY",
            setupInstructions: "Create a restricted API key in the Stripe dashboard.",
            refreshInstructions: "Rotate in the Stripe dashboard, then redeploy.",
          }),
        ],
      })
      const docs = renderDocs([contract], options())

      expect(docs).toContain(
        "- Setup instructions: Create a restricted API key in the Stripe dashboard.",
      )
      expect(docs).toContain(
        "- Refresh instructions: Rotate in the Stripe dashboard, then redeploy.",
      )
    })
  })

  describe("validation contexts", () => {
    it("renders a variable's validation context and the non-boundary disclaimer", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "DATABASE_URL", context: "server" })],
      })
      const docs = renderDocs([contract], options())

      expect(docs).toContain("- Validation context: server")
      expect(docs).toContain("Validation contexts describe when validation participates")
    })

    it("shows the disclaimer when only SOME variables (across contracts) declare a context, not all -- distinguishes `.some()` from `.every()` at both levels", () => {
      const withContext = makeContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        variables: [
          makeVariable({ key: "WITH_CONTEXT", context: "server" }),
          makeVariable({ key: "WITHOUT_CONTEXT" }),
        ],
      })
      const withoutContext = makeContract({
        file: "b/env.schema.ts",
        exportName: "bEnv",
        contractName: "b",
        variables: [makeVariable({ key: "OTHER" })],
      })
      const docs = renderDocs([withContext, withoutContext], options())
      expect(docs).toContain("Validation contexts describe when validation participates")
    })

    it("omits both the per-variable line and the disclaimer when no variable declares a context", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "LOG_LEVEL" })],
      })
      const docs = renderDocs([contract], options())

      expect(docs).not.toContain("Validation context")
    })
  })

  describe("sorting and anchor stability across the whole document", () => {
    it("sorts contracts by name regardless of input order (descending input)", () => {
      const zeta = makeContract({
        file: "zeta/env.schema.ts",
        exportName: "zetaEnv",
        contractName: "zeta",
        variables: [makeVariable({ key: "A" })],
      })
      const alpha = makeContract({
        file: "alpha/env.schema.ts",
        exportName: "alphaEnv",
        contractName: "alpha",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([zeta, alpha], options())
      expect(docs.indexOf("## alpha")).toBeLessThan(docs.indexOf("## zeta"))
    })

    it("sorts contracts by name regardless of input order (ascending input)", () => {
      const zeta = makeContract({
        file: "zeta/env.schema.ts",
        exportName: "zetaEnv",
        contractName: "zeta",
        variables: [makeVariable({ key: "A" })],
      })
      const alpha = makeContract({
        file: "alpha/env.schema.ts",
        exportName: "alphaEnv",
        contractName: "alpha",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([alpha, zeta], options())
      expect(docs.indexOf("## alpha")).toBeLessThan(docs.indexOf("## zeta"))
    })

    it("sorts a contract's own variables by key regardless of declaration order", () => {
      const descending = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        variables: [makeVariable({ key: "ZEBRA" }), makeVariable({ key: "APPLE" })],
      })
      const ascending = makeContract({
        file: "y/env.schema.ts",
        exportName: "yEnv",
        variables: [makeVariable({ key: "APPLE" }), makeVariable({ key: "ZEBRA" })],
      })
      const docsDescendingInput = renderDocs([descending], options())
      const docsAscendingInput = renderDocs([ascending], options())
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
        file: "a/env.schema.ts",
        exportName: "aEnv",
        contractName: "alpha",
        variables: [makeVariable({ key: "SHARED_KEY" })],
      })
      const contractB = makeContract({
        file: "b/env.schema.ts",
        exportName: "bEnv",
        contractName: "alpha",
        variables: [makeVariable({ key: "SHARED_KEY" })],
      })
      const docs = renderDocs([contractA, contractB], options())

      expect(docs).toContain('<a id="alpha-shared_key"></a>')
      expect(docs).toContain('<a id="alpha-shared_key-1"></a>')
    })

    it("collapses a RUN of multiple consecutive non-identifier characters into a single dash, not one dash per character", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        contractName: "A  B", // two spaces
        variables: [makeVariable({ key: "K" })],
      })
      const docs = renderDocs([contract], options())
      expect(docs).toContain('<a id="contract-a-b"></a>')
      expect(docs).not.toContain('<a id="contract-a--b"></a>')
    })

    it("falls back to a generic anchor when a variable heading's base text slugifies to nothing (all-symbol contract name and key)", () => {
      const contract = makeContract({
        file: "x/env.schema.ts",
        exportName: "xEnv",
        contractName: "!!!",
        variables: [makeVariable({ key: "???" })],
      })
      const docs = renderDocs([contract], options())
      expect(docs).toContain('<a id="section"></a>')
    })

    it("falls back to the absolute path unchanged when a contract's file lies outside the given root", () => {
      const contract = makeContract({
        file: "/elsewhere/env.schema.ts",
        exportName: "elsewhereEnv",
        variables: [makeVariable({ key: "A" })],
      })
      const docs = renderDocs([contract], options())
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

  it("rejects a heading-shaped line with trailing junk after the closing backtick (anchor-removal boundary)", () => {
    const keys = extractPreviouslyDocumentedKeys("### `STRIPE_KEY` (deprecated)\n")
    expect(keys).toEqual(new Set())
  })

  it("rejects a heading-shaped line with a leading prefix before the '###' (anchor-removal boundary)", () => {
    const keys = extractPreviouslyDocumentedKeys("x### `STRIPE_KEY`\n")
    expect(keys).toEqual(new Set())
  })
})

describe("extractPreviouslyActiveKeys", () => {
  it("excludes a heading appearing before any '- Active:' marker at all -- the initial state defaults to inactive, not active", () => {
    const keys = extractPreviouslyActiveKeys("### `ORPHAN_KEY`\n\nsome text\n")
    expect(keys).toEqual(new Set())
  })

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

  it("ignores an Active-marker-shaped line with a leading prefix or trailing junk (anchor-removal boundary)", () => {
    const leadingJunk = extractPreviouslyActiveKeys(
      "## payments\n\nx- Active: yes\n\n### `STRIPE_KEY`\n",
    )
    expect(leadingJunk).toEqual(new Set())

    const trailingJunk = extractPreviouslyActiveKeys(
      "## payments\n\n- Active: yes please\n\n### `STRIPE_KEY`\n",
    )
    expect(trailingJunk).toEqual(new Set())
  })

  it("ignores a heading-shaped line with a leading prefix or trailing junk, even under an active contract (anchor-removal boundary)", () => {
    const leadingJunk = extractPreviouslyActiveKeys(
      "## payments\n\n- Active: yes\n\nx### `STRIPE_KEY`\n",
    )
    expect(leadingJunk).toEqual(new Set())

    const trailingJunk = extractPreviouslyActiveKeys(
      "## payments\n\n- Active: yes\n\n### `STRIPE_KEY` (deprecated)\n",
    )
    expect(trailingJunk).toEqual(new Set())
  })
})

describe("computeExpiringEntries", () => {
  it("includes both contract-level and variable-level expiresAt within the window, sorted by days remaining", async () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
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
      file: "x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "not-a-date" })],
    })
    expect(computeExpiringEntries([contract], 30, NOW)).toHaveLength(0)
  })

  it("includes an entry exactly AT the expiringWithinDays boundary, for both contract- and variable-level expiresAt", () => {
    // NOW + 30 days exactly, with expiringWithinDays: 30 -- the `<=` boundary.
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      expiresAt: "2026-01-31",
      variables: [makeVariable({ key: "A", expiresAt: "2026-01-31" })],
    })
    const entries = computeExpiringEntries([contract], 30, NOW)
    expect(entries).toHaveLength(2)
    expect(entries.every((e) => e.daysRemaining === 30)).toBe(true)
  })

  it("excludes a CONTRACT-level expiresAt outside the window, alongside a variable-level one that's within it", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      expiresAt: "2030-01-01", // far outside the 30-day window
      variables: [makeVariable({ key: "A", expiresAt: "2026-01-05" })],
    })
    const entries = computeExpiringEntries([contract], 30, NOW)
    expect(entries.map((e) => e.key)).toEqual(["A"])
  })

  it("ignores a CONTRACT-level unparseable expiresAt rather than throwing", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      expiresAt: "not-a-date",
      variables: [makeVariable({ key: "A" })],
    })
    expect(() => computeExpiringEntries([contract], 30, NOW)).not.toThrow()
    expect(computeExpiringEntries([contract], 30, NOW)).toHaveLength(0)
  })

  it("excludes an expiresAt outside the window", async () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A", expiresAt: "2030-01-01" })],
    })
    expect(computeExpiringEntries([contract], 30, NOW)).toHaveLength(0)
  })

  it("skips a variable with no expiresAt at all, alongside one that has it", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
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

describe("computeSecurityReviewCounters", () => {
  it("counts totals, active-only variables, and unique vs. total variable names", () => {
    const a = makeContract({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      active: true,
      variables: [makeVariable({ key: "SHARED" }), makeVariable({ key: "ONLY_A" })],
    })
    const b = makeContract({
      file: "b/env.schema.ts",
      exportName: "bEnv",
      active: false,
      variables: [makeVariable({ key: "SHARED" })],
    })

    const counters = computeSecurityReviewCounters([a, b], 30, NOW, 0, 0)
    expect(counters.totalContracts).toBe(2)
    expect(counters.totalVariableDeclarations).toBe(3)
    expect(counters.activeVariableDeclarations).toBe(2)
    expect(counters.uniqueVariableNames).toBe(2)
    expect(counters.duplicateVariableNameCount).toBe(1)
  })

  it("classifies expiresAt into expired vs. expiring-soon vs. neither, sharing the same day-math computeExpiringEntries uses", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      variables: [
        makeVariable({ key: "EXPIRED", expiresAt: "2025-01-01" }),
        makeVariable({ key: "EXPIRING_SOON", expiresAt: "2026-01-15" }),
        makeVariable({ key: "FAR_OUT", expiresAt: "2027-01-01" }),
        makeVariable({ key: "NO_EXPIRY" }),
      ],
    })

    const counters = computeSecurityReviewCounters([contract], 30, NOW, 0, 0)
    expect(counters.expiresAtSetCount).toBe(3)
    expect(counters.expiredCount).toBe(1)
    expect(counters.expiringSoonCount).toBe(1)
  })

  it("counts exactly AT the expiringWithinDays boundary as expiring-soon (not neither), and exactly 0 days as expiring-soon (not expired)", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      variables: [
        makeVariable({ key: "AT_BOUNDARY", expiresAt: "2026-01-31" }), // NOW + 30 days exactly
        makeVariable({ key: "TODAY", expiresAt: "2026-01-01" }), // 0 days remaining
      ],
    })
    const counters = computeSecurityReviewCounters([contract], 30, NOW, 0, 0)
    expect(counters.expiringSoonCount).toBe(2)
    expect(counters.expiredCount).toBe(0)
  })

  it("counts required/refresh-instructions/no-owner using the same effective-owner fallback the ownership matrix uses", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      owner: "contract-owner",
      variables: [
        makeVariable({ key: "REQUIRED", required: true }),
        makeVariable({ key: "REFRESHABLE", refreshInstructions: "Rotate it." }),
        makeVariable({ key: "OWNED_BY_CONTRACT" }), // falls back to contract.owner -- not "no owner"
        makeVariable({ key: "TRULY_UNOWNED", owner: undefined }),
      ],
    })

    const counters = computeSecurityReviewCounters([contract], 30, NOW, 0, 0)
    expect(counters.requiredCount).toBe(1)
    expect(counters.refreshInstructionsCount).toBe(1)
    expect(counters.noOwnerCount).toBe(0) // every variable resolves an owner via the contract fallback
  })

  it("counts a variable with no owner at any level (variable or contract) as unowned", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "UNOWNED" })],
    })
    const counters = computeSecurityReviewCounters([contract], 30, NOW, 0, 0)
    expect(counters.noOwnerCount).toBe(1)
  })

  it("passes through the undocumented contract/variable counts given by the caller", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      variables: [makeVariable({ key: "A" })],
    })
    const counters = computeSecurityReviewCounters([contract], 30, NOW, 2, 5)
    expect(counters.undocumentedContractCount).toBe(2)
    expect(counters.undocumentedVariableCount).toBe(5)
  })
})

describe("buildCatalog", () => {
  it("carries the same descriptive content as the generated Markdown, keyed by variable name -- every CatalogContract/CatalogVariable field, exactly", () => {
    const contract = makeContract({
      file: "features/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      active: false,
      documented: false,
      category: "Payments",
      exclusiveGroup: "db",
      owner: "payments-team",
      sensitivity: "secret",
      expiresAt: "2028-01-01",
      purpose: "billing",
      legalBasis: "contract",
      retention: "7 years",
      dataResidency: "EU",
      auditRequired: true,
      metadata: { service: "Payment Processing API", criticality: "Production-critical" },
      variables: [
        makeVariable({
          key: "STRIPE_KEY",
          description: "Stripe secret API key.",
          owner: "sysadmin@example.com",
          sensitivity: "restricted",
          expiresAt: "2027-01-01",
          refreshInstructions: "Rotate the key in the Stripe Dashboard.",
          setupInstructions: "Create a Stripe account.",
          required: true,
          hasDefault: true,
          hasProcessor: true,
          processorReturnType: "string",
          hasValidator: true,
          documented: false,
          context: "server",
          purpose: "fraud-detection",
          legalBasis: "pci-dss",
          retention: "1 year",
          dataResidency: "US",
          auditRequired: false,
          evidence: { dynamicAccess: ["scripts/rotate.sh:1:1"] },
          metadata: {
            rotationCadence: "90 days",
            storageProvider: "AWS Secrets Manager",
            compliance: "PCI DSS",
          },
        }),
      ],
    })

    const [entry] = buildCatalog([contract])
    expect(entry).toBeDefined()
    expect(entry).toEqual({
      file: "features/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      active: false,
      documented: false,
      category: "Payments",
      exclusiveGroup: "db",
      owner: "payments-team",
      sensitivity: "secret",
      expiresAt: "2028-01-01",
      purpose: "billing",
      legalBasis: "contract",
      retention: "7 years",
      dataResidency: "EU",
      auditRequired: true,
      metadata: { service: "Payment Processing API", criticality: "Production-critical" },
      variables: {
        STRIPE_KEY: {
          description: "Stripe secret API key.",
          owner: "sysadmin@example.com",
          sensitivity: "restricted",
          expiresAt: "2027-01-01",
          refreshInstructions: "Rotate the key in the Stripe Dashboard.",
          setupInstructions: "Create a Stripe account.",
          required: true,
          hasDefault: true,
          hasProcessor: true,
          processorReturnType: "string",
          hasValidator: true,
          documented: false,
          context: "server",
          purpose: "fraud-detection",
          legalBasis: "pci-dss",
          retention: "1 year",
          dataResidency: "US",
          auditRequired: false,
          evidence: { dynamicAccess: ["scripts/rotate.sh:1:1"] },
          metadata: {
            rotationCadence: "90 days",
            storageProvider: "AWS Secrets Manager",
            compliance: "PCI DSS",
          },
        },
      },
    })
  })

  it("falls back to the contract-level owner when a variable has none of its own", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      owner: "contract-owner",
      variables: [makeVariable({ key: "A" })],
    })
    const entry = buildCatalog([contract])[0]! // one contract in, one catalog entry out
    expect(entry.variables["A"]!.owner).toBe("contract-owner")
  })

  it("resolves sensitivity the same way owner does -- variable override wins, contract is the fallback", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      sensitivity: "secret",
      variables: [
        makeVariable({ key: "OVERRIDDEN", sensitivity: "config" }),
        makeVariable({ key: "INHERITED" }),
      ],
    })
    const entry = buildCatalog([contract])[0]! // one contract in, one catalog entry out
    expect(entry.sensitivity).toBe("secret")
    expect(entry.variables["OVERRIDDEN"]!.sensitivity).toBe("config")
    expect(entry.variables["INHERITED"]!.sensitivity).toBe("secret")
  })

  it("never lets extra metadata override a reserved field, even when an author names an extra key the same as a reserved one", () => {
    const contract = makeContract({
      file: "x/env.schema.ts",
      exportName: "xEnv",
      variables: [
        makeVariable({
          key: "A",
          required: true,
          documented: true,
          // An author's documentEnv() metadata field literally named
          // "documented"/"required" -- must never clobber the real booleans.
          metadata: { documented: "definitely not", required: "also not" },
        }),
      ],
    })
    const entry = buildCatalog([contract])[0]! // one contract in, one catalog entry out
    const variable = entry.variables["A"]!
    expect(variable.documented).toBe(true)
    expect(variable.required).toBe(true)
    expect(variable.metadata).toEqual({ documented: "definitely not", required: "also not" })
  })

  it("keys variables by exact name (not an array), and keeps two same-named contracts as distinct array entries", () => {
    const contractA = makeContract({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      contractName: "shared-name",
      variables: [makeVariable({ key: "A" })],
    })
    const contractB = makeContract({
      file: "b/env.schema.ts",
      exportName: "bEnv",
      contractName: "shared-name",
      variables: [makeVariable({ key: "B" })],
    })

    const catalog = buildCatalog([contractA, contractB])
    expect(Array.isArray(catalog)).toBe(true)
    expect(catalog).toHaveLength(2)
    expect(catalog.every((c) => c.contractName === "shared-name")).toBe(true)

    expect(Array.isArray(catalog[0]?.variables)).toBe(false)
    expect(catalog.find((c) => c.file === "a/env.schema.ts")?.variables["A"]).toBeDefined()
    expect(catalog.find((c) => c.file === "b/env.schema.ts")?.variables["B"]).toBeDefined()
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
