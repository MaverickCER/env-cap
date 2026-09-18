import { describe, expect, it } from "vitest"
import {
  configurationReference,
  expiringSoonReport,
  groupVariablesByOwner,
  ownershipSummary,
} from "../../src/build/reference-projections.js"
import { evidenceDisclaimer } from "../../src/build/generated-banner.js"
import { CHANGE_MODEL_SCHEMA_VERSION } from "../../src/build/change-model.js"
import {
  CONTRACT_MODEL_SCHEMA_VERSION,
  type ContractModelContract,
  type ContractModelVariable,
} from "../../src/build/contract-model.js"
import { DEPENDENCY_MODEL_SCHEMA_VERSION } from "../../src/build/dependency-model.js"
import { EVIDENCE_MODEL_SCHEMA_VERSION } from "../../src/build/evidence-model.js"
import type { EvidenceModel } from "../../src/build/evidence-model.js"
import { FINDING_MODEL_SCHEMA_VERSION } from "../../src/build/finding-model.js"
import { LIFECYCLE_MODEL_SCHEMA_VERSION } from "../../src/build/lifecycle-model.js"
import { OWNERSHIP_MODEL_SCHEMA_VERSION } from "../../src/build/ownership-model.js"
import type { OwnershipModel } from "../../src/build/ownership-model.js"

function variable(
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
    documented: true,
    evidence: undefined,
    declaration: { file: "a/env.schema.ts", line: 1, column: 1 },
    ...overrides,
  }
}

function contract(
  overrides: Partial<ContractModelContract> & { file: string; exportName: string },
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
    variables: [],
    documented: true,
    packageOrigin: undefined,
    declaration: { file: overrides.file, line: 1, column: 1 },
    documentation: undefined,
    ...overrides,
  }
}

/** Derives an Ownership Model from `contracts` the same way `buildOwnershipModel()` does, so a fixture can't drift from the real resolution rule. */
function ownershipFor(contracts: readonly ContractModelContract[]): OwnershipModel {
  const modelContracts = contracts.map((c) => ({
    file: c.file,
    exportName: c.exportName,
    contractName: c.contractName,
    owner: c.owner,
    variables: c.variables.map((v) => ({ key: v.key, owner: v.owner ?? c.owner })),
  }))
  return {
    schemaVersion: OWNERSHIP_MODEL_SCHEMA_VERSION,
    contracts: modelContracts,
    unownedContracts: modelContracts
      .filter((c) => c.owner === undefined)
      .map(({ file, exportName }) => ({ file, exportName })),
    unownedVariables: modelContracts.flatMap((c) =>
      c.variables
        .filter((v) => v.owner === undefined)
        .map((v) => ({ file: c.file, exportName: c.exportName, key: v.key })),
    ),
  }
}

function evidenceFor(
  contracts: readonly ContractModelContract[],
  expiring: EvidenceModel["lifecycle"]["expiring"] = [],
): EvidenceModel {
  return {
    schemaVersion: EVIDENCE_MODEL_SCHEMA_VERSION,
    provenance: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      toolVersion: "0.0.0",
      commit: undefined,
    },
    contract: { schemaVersion: CONTRACT_MODEL_SCHEMA_VERSION, contracts },
    dependency: {
      schemaVersion: DEPENDENCY_MODEL_SCHEMA_VERSION,
      contracts: [],
      consumers: [],
      warnings: [],
      scannedSurfaces: [],
    },
    ownership: ownershipFor(contracts),
    lifecycle: { schemaVersion: LIFECYCLE_MODEL_SCHEMA_VERSION, contracts: [], expiring },
    finding: { schemaVersion: FINDING_MODEL_SCHEMA_VERSION, findings: [] },
    change: {
      schemaVersion: CHANGE_MODEL_SCHEMA_VERSION,
      manifest: {
        addedContracts: [],
        removedContracts: [],
        addedVariables: [],
        removedVariables: [],
        updatedContracts: [],
        updatedVariables: [],
      },
      renamedVariables: [],
    },
  }
}

const PAYMENTS = contract({
  file: "payments/env.schema.ts",
  exportName: "paymentsEnv",
  contractName: "payments",
  owner: "team-payments",
  sensitivity: "secret",
  variables: [
    variable({ key: "STRIPE_KEY", description: "Stripe secret key.", required: true }),
    // Overrides both the contract owner and its sensitivity.
    variable({
      key: "STRIPE_TIMEOUT",
      owner: "team-platform",
      sensitivity: "config",
      hasDefault: true,
      hasProcessor: true,
    }),
  ],
})

const DATABASE = contract({
  file: "database/env.schema.ts",
  exportName: "databaseEnv",
  contractName: "database",
  active: false,
  variables: [variable({ key: "DATABASE_URL" })],
})

describe("configurationReference", () => {
  it("flattens every declared variable, resolving effective owner and sensitivity", () => {
    const result = configurationReference(evidenceFor([PAYMENTS]))
    expect(result.disclaimer).toBe(evidenceDisclaimer())
    expect(result.entries).toEqual([
      {
        file: "payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        key: "STRIPE_KEY",
        description: "Stripe secret key.",
        // Inherited from the contract.
        owner: "team-payments",
        sensitivity: "secret",
        required: true,
        hasDefault: false,
        hasProcessor: false,
        hasValidator: false,
        expiresAt: undefined,
        active: true,
      },
      {
        file: "payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        key: "STRIPE_TIMEOUT",
        description: undefined,
        // The variable's own values win over the contract's.
        owner: "team-platform",
        sensitivity: "config",
        required: undefined,
        hasDefault: true,
        hasProcessor: true,
        hasValidator: false,
        expiresAt: undefined,
        active: true,
      },
    ])
  })

  it("includes inactive contracts, marked -- the reference documents everything discovered", () => {
    const result = configurationReference(evidenceFor([PAYMENTS, DATABASE]))
    expect(result.entries.map((e) => [e.key, e.active])).toEqual([
      ["DATABASE_URL", false],
      ["STRIPE_KEY", true],
      ["STRIPE_TIMEOUT", true],
    ])
  })

  it("reports which Evidence Model fields fed each output key, via .project()", () => {
    const { value, sources } = configurationReference.project(evidenceFor([PAYMENTS]))
    expect(value.entries).toHaveLength(2)
    expect(sources["entries"]!.some((p) => p.startsWith("contract.contracts"))).toBe(true)
    // The disclaimer is a constant -- it reads nothing from the model at all.
    expect(sources["disclaimer"]).toEqual([])
  })

  it("sorts variables within the same contract by key -- not insertion order", () => {
    const reversed = contract({
      ...PAYMENTS,
      variables: [variable({ key: "Z_VAR" }), variable({ key: "A_VAR" })],
    })
    const result = configurationReference(evidenceFor([reversed]))
    expect(result.entries.map((e) => e.key)).toEqual(["A_VAR", "Z_VAR"])
  })

  it("sorts by file ahead of exportName -- a contract whose exportName would sort the other way must still follow file order", () => {
    // fileB's exportName ("aaa") would sort BEFORE fileA's ("zzz") if file
    // were not compared first -- this is the only way to distinguish "file
    // genuinely decides the order" from "file's result gets discarded and
    // exportName decides instead".
    const fileB = contract({
      file: "b/env.schema.ts",
      exportName: "aaa",
      contractName: "b-contract",
      variables: [variable({ key: "VAR" })],
    })
    const fileA = contract({
      file: "a/env.schema.ts",
      exportName: "zzz",
      contractName: "a-contract",
      variables: [variable({ key: "VAR" })],
    })
    const result = configurationReference(evidenceFor([fileB, fileA]))
    expect(result.entries.map((e) => e.file)).toEqual(["a/env.schema.ts", "b/env.schema.ts"])
  })
})

describe("ownershipSummary", () => {
  it("carries the standing disclaimer", () => {
    const result = ownershipSummary(evidenceFor([PAYMENTS]))
    expect(result.disclaimer).toBe(evidenceDisclaimer())
  })

  it("rolls variables and contracts up per owner, sorted", () => {
    const result = ownershipSummary(evidenceFor([PAYMENTS]))
    expect(result.owners).toEqual([
      { owner: "team-payments", variables: ["payments.STRIPE_KEY"], contracts: ["payments"] },
      { owner: "team-platform", variables: ["payments.STRIPE_TIMEOUT"], contracts: [] },
    ])
  })

  it("names unowned variables separately, never under a synthetic owner", () => {
    const result = ownershipSummary(evidenceFor([PAYMENTS, DATABASE]))
    expect(result.owners.map((o) => o.owner)).toEqual(["team-payments", "team-platform"])
    expect(result.unowned).toEqual(["database.DATABASE_URL"])
  })

  it("lists an empty variables array (not absent) for an owner that owns a contract but no individual variable -- every one of its variables was overridden to a different owner", () => {
    const overridden = contract({
      file: "checkout/env.schema.ts",
      exportName: "checkoutEnv",
      contractName: "checkout",
      owner: "team-checkout",
      variables: [variable({ key: "CHECKOUT_URL", owner: "team-payments" })],
    })
    const result = ownershipSummary(evidenceFor([overridden]))
    expect(result.owners).toEqual([
      { owner: "team-checkout", variables: [], contracts: ["checkout"] },
      { owner: "team-payments", variables: ["checkout.CHECKOUT_URL"], contracts: [] },
    ])
  })

  it("sorts multiple distinct owners alphabetically -- not the order their contracts were discovered in", () => {
    const zebraOwned = contract({
      file: "z/env.schema.ts",
      exportName: "zEnv",
      contractName: "zebra",
      owner: "zebra-owner",
      variables: [variable({ key: "Z_VAR" })],
    })
    const alphaOwned = contract({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      contractName: "alpha",
      owner: "alpha-owner",
      variables: [variable({ key: "A_VAR" })],
    })
    // Deliberately discovered zebra-owner's contract before alpha-owner's.
    const result = ownershipSummary(evidenceFor([zebraOwned, alphaOwned]))
    expect(result.owners.map((o) => o.owner)).toEqual(["alpha-owner", "zebra-owner"])
  })

  it("sorts multiple unowned entries alphabetically, and falls back to the exportName when its contract is absent from Contract Model", () => {
    const zebraUnowned = contract({
      file: "z/env.schema.ts",
      exportName: "zEnv",
      contractName: "zebra",
      variables: [variable({ key: "Z_VAR" })],
    })
    const alphaUnowned = contract({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      contractName: "alpha",
      variables: [variable({ key: "A_VAR" })],
    })
    const evidence = evidenceFor([zebraUnowned, alphaUnowned])
    const desynced = {
      ...evidence,
      ownership: {
        ...evidence.ownership,
        unownedVariables: [
          ...evidence.ownership.unownedVariables,
          { file: "orphan/env.schema.ts", exportName: "orphanEnv", key: "ORPHAN_VAR" },
        ],
      },
    }
    const result = ownershipSummary(desynced)
    expect(result.unowned).toEqual(["alpha.A_VAR", "orphanEnv.ORPHAN_VAR", "zebra.Z_VAR"])
  })

  it("is empty, not absent, when nothing declares an owner at all", () => {
    const result = ownershipSummary(evidenceFor([DATABASE]))
    expect(result.owners).toEqual([])
    expect(result.unowned).toEqual(["database.DATABASE_URL"])
  })

  it("sorts owners, and each owner's own variables and contracts, alphabetically -- not insertion order", () => {
    // "zebra" is declared before "alpha" (reverse alphabetical insertion),
    // and each owner has TWO variables/contracts also inserted out of
    // order -- real sorting at every level, not a coincidence of the
    // fixture already being alphabetical.
    const zebraContract = contract({
      file: "z/env.schema.ts",
      exportName: "zEnv",
      contractName: "zebra",
      owner: "zebra-owner",
      variables: [variable({ key: "Z_VAR" }), variable({ key: "A_VAR" })],
    })
    const alphaContract = contract({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      contractName: "alpha",
      owner: "zebra-owner",
      variables: [variable({ key: "M_VAR" })],
    })
    const result = ownershipSummary(evidenceFor([zebraContract, alphaContract]))
    expect(result.owners).toEqual([
      {
        owner: "zebra-owner",
        variables: ["alpha.M_VAR", "zebra.A_VAR", "zebra.Z_VAR"],
        contracts: ["alpha", "zebra"],
      },
    ])
  })

  it("falls back to the exportName when Ownership Model references a contract that's genuinely absent from Contract Model -- a real EvidenceModel is never guaranteed internally consistent by its own type", () => {
    const evidence = evidenceFor([PAYMENTS])
    const desynced = {
      ...evidence,
      ownership: {
        ...evidence.ownership,
        contracts: [
          {
            file: "orphan/env.schema.ts",
            exportName: "orphanEnv",
            contractName: "orphan",
            owner: "team-orphan",
            variables: [{ key: "ORPHAN_VAR", owner: "team-orphan" }],
          },
        ],
      },
    }
    const result = ownershipSummary(desynced)
    expect(result.owners).toEqual([
      { owner: "team-orphan", variables: ["orphanEnv.ORPHAN_VAR"], contracts: ["orphanEnv"] },
    ])
  })
})

describe("expiringSoonReport", () => {
  const expiring = [
    {
      file: "payments/env.schema.ts",
      exportName: "paymentsEnv",
      key: "STRIPE_KEY",
      expiresAt: "2026-01-01",
      daysRemaining: -10,
    },
    {
      file: "payments/env.schema.ts",
      exportName: "paymentsEnv",
      key: "STRIPE_TIMEOUT",
      expiresAt: "2026-03-01",
      daysRemaining: 12,
    },
  ]

  const withRefresh = contract({
    ...PAYMENTS,
    variables: [
      variable({ key: "STRIPE_KEY", refreshInstructions: "Rotate in the Stripe dashboard." }),
      variable({ key: "STRIPE_TIMEOUT", owner: "team-platform" }),
    ],
  })

  it("joins each expiry with its owner and refresh instructions", () => {
    const result = expiringSoonReport(evidenceFor([withRefresh], expiring))
    expect(result.disclaimer).toBe(evidenceDisclaimer())
    expect(result.entries).toEqual([
      {
        file: "payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        key: "STRIPE_KEY",
        expiresAt: "2026-01-01",
        daysRemaining: -10,
        expired: true,
        refreshInstructions: "Rotate in the Stripe dashboard.",
        owner: "team-payments",
      },
      {
        file: "payments/env.schema.ts",
        exportName: "paymentsEnv",
        contractName: "payments",
        key: "STRIPE_TIMEOUT",
        expiresAt: "2026-03-01",
        daysRemaining: 12,
        expired: false,
        refreshInstructions: undefined,
        owner: "team-platform",
      },
    ])
    expect(result.expiredCount).toBe(1)
  })

  it("resolves a contract-level expiry (key: undefined) to the contract's own owner", () => {
    const result = expiringSoonReport(
      evidenceFor(
        [withRefresh],
        [
          {
            file: "payments/env.schema.ts",
            exportName: "paymentsEnv",
            key: undefined,
            expiresAt: "2026-06-01",
            daysRemaining: 100,
          },
        ],
      ),
    )
    expect(result.entries[0]?.key).toBeUndefined()
    expect(result.entries[0]?.owner).toBe("team-payments")
    expect(result.entries[0]?.expired).toBe(false)
    expect(result.expiredCount).toBe(0)
  })

  it('resolves a contract-level expiry\'s owner from the contract itself, never from a per-variable lookup keyed on the literal string "undefined"', () => {
    // A variable literally named "undefined" would collide with the
    // per-variable lookup key that a contract-level expiry (`key: undefined`)
    // builds via template-literal interpolation (`...#undefined`) if the
    // `entry.key === undefined` branch were ever skipped. This distinguishes
    // "genuinely branches on key" from "coincidentally produces the same
    // owner either way".
    const withUndefinedKeyedVariable = contract({
      ...PAYMENTS,
      variables: [
        variable({ key: "undefined", owner: "team-decoy" }),
        variable({ key: "STRIPE_KEY" }),
      ],
    })
    const result = expiringSoonReport(
      evidenceFor(
        [withUndefinedKeyedVariable],
        [
          {
            file: "payments/env.schema.ts",
            exportName: "paymentsEnv",
            key: undefined,
            expiresAt: "2026-06-01",
            daysRemaining: 100,
          },
        ],
      ),
    )
    expect(result.entries[0]?.owner).toBe("team-payments")
  })

  it("falls back to undefined owner (never throws) for a per-variable expiry whose contract is absent from Contract Model", () => {
    const result = expiringSoonReport(
      evidenceFor(
        [withRefresh],
        [
          {
            file: "orphan/env.schema.ts",
            exportName: "orphanEnv",
            key: "ORPHAN_VAR",
            expiresAt: "2026-06-01",
            daysRemaining: 5,
          },
        ],
      ),
    )
    expect(result.entries[0]?.owner).toBeUndefined()
    expect(result.entries[0]?.contractName).toBe("orphanEnv")
    expect(result.entries[0]?.refreshInstructions).toBeUndefined()
  })

  it("is empty when nothing is inside the window the evidence was generated with", () => {
    const result = expiringSoonReport(evidenceFor([PAYMENTS]))
    expect(result.entries).toEqual([])
    expect(result.expiredCount).toBe(0)
  })

  it("treats daysRemaining exactly 0 (expires today) as NOT yet expired -- the boundary, not just clearly-past/clearly-future values", () => {
    const result = expiringSoonReport(
      evidenceFor(
        [withRefresh],
        [
          {
            file: "payments/env.schema.ts",
            exportName: "paymentsEnv",
            key: "STRIPE_KEY",
            expiresAt: "2026-01-15",
            daysRemaining: 0,
          },
        ],
      ),
    )
    expect(result.entries[0]?.expired).toBe(false)
    expect(result.expiredCount).toBe(0)
  })

  it("falls back to the exportName and leaves owner undefined when the expiry's contract is absent from Contract Model -- a real EvidenceModel is never guaranteed internally consistent by its own type", () => {
    const result = expiringSoonReport(
      evidenceFor(
        [withRefresh],
        [
          {
            file: "orphan/env.schema.ts",
            exportName: "orphanEnv",
            key: undefined,
            expiresAt: "2026-06-01",
            daysRemaining: 5,
          },
        ],
      ),
    )
    expect(result.entries).toEqual([
      {
        file: "orphan/env.schema.ts",
        exportName: "orphanEnv",
        contractName: "orphanEnv",
        key: undefined,
        expiresAt: "2026-06-01",
        daysRemaining: 5,
        expired: false,
        refreshInstructions: undefined,
        owner: undefined,
      },
    ])
  })
})

describe("groupVariablesByOwner", () => {
  it("omits variables with no effective owner rather than bucketing them under a synthetic key", () => {
    const grouped = groupVariablesByOwner(
      [
        { owner: "team-a", variables: [{ key: "A" }, { key: "B" }] },
        { owner: undefined, variables: [{ key: "C" }] },
      ],
      (contractNode) => contractNode.owner,
    )
    expect([...grouped.keys()]).toEqual(["team-a"])
    expect(grouped.get("team-a")?.map((e) => e.variable.key)).toEqual(["A", "B"])
  })

  it("uses the caller's ownerOf, so a variable-level override wins where one is supplied", () => {
    const grouped = groupVariablesByOwner(
      [
        {
          owner: "team-a",
          variables: [
            { key: "A", owner: "team-b" },
            { key: "B", owner: undefined },
          ],
        },
      ],
      (contractNode, v) => v.owner ?? contractNode.owner,
    )
    expect([...grouped.keys()].sort()).toEqual(["team-a", "team-b"])
    expect(grouped.get("team-b")?.map((e) => e.variable.key)).toEqual(["A"])
    expect(grouped.get("team-a")?.map((e) => e.variable.key)).toEqual(["B"])
  })
})
