import { nodeBuildFs } from "../support/build-filesystem.js"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildContractModel } from "../../src/build/contract-model.js"
import type {
  ContractModelContract,
  ContractModelVariable,
} from "../../src/build/contract-model.js"
import { EVIDENCE_MODEL_SCHEMA_VERSION } from "../../src/build/evidence-model.js"
import type { EvidenceModel } from "../../src/build/evidence-model.js"
import {
  buildCitationSnapshots,
  dynamicAccessVariableIdentity,
  verifyDynamicAccessCitations,
} from "../../src/build/citation-verification.js"
import {
  computeEvidenceChanges,
  diffContracts,
  normalizeEvidenceSnapshotForComparison,
  readEvidenceSnapshot,
  writeEvidenceSnapshot,
} from "../../src/build/evidence-snapshot.js"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"

// None of the fixtures below declare a `dynamicAccess` citation unless noted,
// so this is only ever invoked in the dedicated dynamic-access describe block.
const readFile = (filePath: string): Promise<string> => fs.readFile(filePath, "utf8")

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

// --- ContractModel-shaped test fixtures, for diffContracts() unit tests
// directly (no real discovery/linking involved). Every field defaulted so a
// test only needs to name the one it cares about.

function cmVariable(
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
    declaration: { file: "x/env.schema.ts", line: 1, column: 1 },
    ...overrides,
  }
}

function cmContract(
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
    declaration: { file: "x/env.schema.ts", line: 1, column: 1 },
    documentation: undefined,
    ...overrides,
  }
}

/** A minimal, structurally-valid `EvidenceModel` wrapping the given contract/dependency facts -- everything `computeEvidenceChanges()`/`buildCitationSnapshots()` actually read from a previous snapshot; every other sub-model is empty. */
function evidenceFixture(overrides: {
  contracts?: readonly ContractModelContract[]
  dependencyContracts?: EvidenceModel["dependency"]["contracts"]
}): EvidenceModel {
  return {
    schemaVersion: EVIDENCE_MODEL_SCHEMA_VERSION,
    provenance: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      toolVersion: "0.0.0",
      commit: undefined,
    },
    contract: { schemaVersion: 3, contracts: overrides.contracts ?? [] },
    dependency: {
      schemaVersion: 2,
      contracts: overrides.dependencyContracts ?? [],
      consumers: [],
      warnings: [],
      scannedSurfaces: [],
    },
    ownership: { schemaVersion: 1, contracts: [], unownedContracts: [], unownedVariables: [] },
    lifecycle: { schemaVersion: 2, contracts: [], expiring: [] },
    finding: { schemaVersion: 3, findings: [] },
    change: {
      schemaVersion: 1,
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

describe("readEvidenceSnapshot / writeEvidenceSnapshot", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-evidence-snapshot-test-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("reports 'missing' for a file that doesn't exist -- the normal, silent first-run/never-configured case", async () => {
    const result = await readEvidenceSnapshot(path.join(root, "does-not-exist.json"), nodeBuildFs)
    expect(result).toEqual({ status: "missing" })
  })

  it("reports 'invalid-json' for a file that can't be parsed, with a diagnosable detail", async () => {
    const snapshotPath = path.join(root, "corrupt.json")
    await fs.writeFile(snapshotPath, "{ not valid json", "utf8")

    const result = await readEvidenceSnapshot(snapshotPath, nodeBuildFs)
    expect(result.status).toBe("invalid-json")
    if (result.status === "invalid-json") expect(result.detail.length).toBeGreaterThan(0)
  })

  it("reports 'unsupported-version' for well-formed JSON with a schemaVersion this build doesn't recognize", async () => {
    const snapshotPath = path.join(root, "future.json")
    await fs.writeFile(snapshotPath, JSON.stringify({ schemaVersion: 999 }), "utf8")

    const result = await readEvidenceSnapshot(snapshotPath, nodeBuildFs)
    expect(result).toEqual({ status: "unsupported-version", foundVersion: 999 })
  })

  it("reports 'unsupported-version' (never throws) for well-formed JSON that parses to null -- typeof null access must not crash", async () => {
    const snapshotPath = path.join(root, "null.json")
    await fs.writeFile(snapshotPath, "null", "utf8")

    const result = await readEvidenceSnapshot(snapshotPath, nodeBuildFs)
    expect(result).toEqual({ status: "unsupported-version", foundVersion: undefined })
  })

  it("round-trips a real evidence artifact written by writeEvidenceSnapshot", async () => {
    const snapshotPath = path.join(root, "nested", "env.evidence.json")
    const snapshot = evidenceFixture({
      contracts: [cmContract({ file: "a/env.schema.ts", exportName: "aEnv" })],
    })

    await writeEvidenceSnapshot(snapshotPath, snapshot, nodeBuildFs)
    const result = await readEvidenceSnapshot(snapshotPath, nodeBuildFs)
    expect(result).toEqual({ status: "ok", snapshot })
  })
})

describe("normalizeEvidenceSnapshotForComparison", () => {
  it("blanks out provenance.generatedAt, leaving toolVersion/commit and every other field untouched", () => {
    const snapshot = evidenceFixture({
      contracts: [cmContract({ file: "a/env.schema.ts", exportName: "aEnv" })],
    })
    const withCommit: EvidenceModel = {
      ...snapshot,
      provenance: {
        ...snapshot.provenance,
        generatedAt: "2026-06-01T12:00:00.000Z",
        commit: "abc123",
      },
    }
    const normalized = normalizeEvidenceSnapshotForComparison(withCommit)

    expect(normalized.provenance.generatedAt).toBe("")
    expect(normalized.provenance.commit).toBe("abc123")
    expect(normalized.provenance.toolVersion).toBe(withCommit.provenance.toolVersion)
    expect(normalized.contract).toEqual(withCommit.contract)
  })

  it("makes two renders that differ only in generatedAt compare equal after normalization", () => {
    const a = evidenceFixture({ contracts: [] })
    const b: EvidenceModel = {
      ...a,
      provenance: { ...a.provenance, generatedAt: "2030-12-31T23:59:59.000Z" },
    }
    expect(JSON.stringify(normalizeEvidenceSnapshotForComparison(a))).toBe(
      JSON.stringify(normalizeEvidenceSnapshotForComparison(b)),
    )
  })

  it("resets change.manifest and change.renamedVariables to empty -- change describes drift from the on-disk snapshot, not reproducible by a second computation", () => {
    const snapshot = evidenceFixture({ contracts: [] })
    const withRealChange: EvidenceModel = {
      ...snapshot,
      change: {
        ...snapshot.change,
        manifest: {
          addedContracts: [{ file: "a/env.schema.ts", exportName: "aEnv" }],
          removedContracts: [],
          addedVariables: [],
          removedVariables: [],
          updatedContracts: [],
          updatedVariables: [],
        },
        renamedVariables: [
          {
            contractIdentity: "a/env.schema.ts#aEnv",
            file: "a/env.schema.ts",
            exportName: "aEnv",
            contractName: "aEnv",
            previousKey: "OLD_NAME",
            currentKey: "NEW_NAME",
          },
        ],
      },
    }
    const normalized = normalizeEvidenceSnapshotForComparison(withRealChange)

    expect(normalized.change.manifest).toEqual({
      addedContracts: [],
      removedContracts: [],
      addedVariables: [],
      removedVariables: [],
      updatedContracts: [],
      updatedVariables: [],
    })
    expect(normalized.change.renamedVariables).toEqual([])
  })

  it("resets lifecycle.expiring[].daysRemaining to 0, leaving every other field (file/exportName/key/expiresAt) untouched", () => {
    const snapshot = evidenceFixture({ contracts: [] })
    const withExpiring: EvidenceModel = {
      ...snapshot,
      lifecycle: {
        ...snapshot.lifecycle,
        expiring: [
          {
            file: "a/env.schema.ts",
            exportName: "aEnv",
            key: "STRIPE_KEY",
            expiresAt: "2026-06-01",
            daysRemaining: 42,
          },
        ],
      },
    }
    const normalized = normalizeEvidenceSnapshotForComparison(withExpiring)

    expect(normalized.lifecycle.expiring).toEqual([
      {
        file: "a/env.schema.ts",
        exportName: "aEnv",
        key: "STRIPE_KEY",
        expiresAt: "2026-06-01",
        daysRemaining: 0,
      },
    ])
  })

  it("masks the day count in EXPIRED/EXPIRING_SOON finding messages, leaves every other finding code's message untouched even if it contains a similarly-shaped digit run", () => {
    const location = {
      model: "contract" as const,
      file: undefined,
      exportName: undefined,
      variable: undefined,
      position: undefined,
    }
    const snapshot = evidenceFixture({ contracts: [] })
    const withFindings: EvidenceModel = {
      ...snapshot,
      finding: {
        ...snapshot.finding,
        findings: [
          {
            severity: "warning",
            code: "EXPIRED",
            family: "drift",
            message: "STRIPE_KEY expired 15 day(s) ago.",
            location,
          },
          {
            severity: "warning",
            code: "EXPIRING_SOON",
            family: "drift",
            message: "STRIPE_KEY expires in 15 day(s).",
            location,
          },
          {
            severity: "warning",
            code: "UNDOCUMENTED_VARIABLE",
            family: "documentation",
            message: "STRIPE_KEY has been undocumented for 15 day(s), unrelated to expiry.",
            location,
          },
        ],
      },
    }
    const normalized = normalizeEvidenceSnapshotForComparison(withFindings)

    expect(normalized.finding.findings.map((f) => f.message)).toEqual([
      "STRIPE_KEY expired N day(s) ago.",
      "STRIPE_KEY expires in N day(s).",
      // Not EXPIRED/EXPIRING_SOON -- must survive untouched, even though its
      // own text contains the exact same "15 day(s)" shape.
      "STRIPE_KEY has been undocumented for 15 day(s), unrelated to expiry.",
    ])
  })
})

describe("diffContracts", () => {
  it("reports every contract and variable as added when there is no previous snapshot", () => {
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "KEY" })],
      }),
    ]
    const report = diffContracts(undefined, current)

    expect(report.addedContracts).toHaveLength(1)
    expect(report.addedContracts[0]).toEqual({ file: "a/env.schema.ts", exportName: "aEnv" })
    expect(report.addedVariables).toHaveLength(1)
    expect(report.addedVariables[0]).toEqual({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      key: "KEY",
    })
    expect(report.removedContracts).toHaveLength(0)
    expect(report.removedVariables).toHaveLength(0)
    expect(report.updatedContracts).toHaveLength(0)
    expect(report.updatedVariables).toHaveLength(0)
  })

  it("treats a variable literally named 'Stryker was here' as added on a first run -- the previous-variables Map must be genuinely empty, not defaulted to a poisoned placeholder entry", () => {
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "Stryker was here" })],
      }),
    ]
    const report = diffContracts(undefined, current)

    expect(report.addedVariables.map((v) => v.key)).toEqual(["Stryker was here"])
    expect(report.updatedVariables).toHaveLength(0)
  })

  it("reports nothing when nothing changed", () => {
    const contracts = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "KEY", description: "desc" })],
      }),
    ]
    const report = diffContracts(contracts, contracts)

    expect(report.addedContracts).toHaveLength(0)
    expect(report.removedContracts).toHaveLength(0)
    expect(report.addedVariables).toHaveLength(0)
    expect(report.removedVariables).toHaveLength(0)
    expect(report.updatedContracts).toHaveLength(0)
    expect(report.updatedVariables).toHaveLength(0)
  })

  it("sorts addedContracts and removedContracts by file then exportName -- not discovery order", () => {
    const previous = [
      cmContract({ file: "z/old.ts", exportName: "zOld" }),
      cmContract({ file: "a/old.ts", exportName: "aOld" }),
    ]
    const current = [
      cmContract({ file: "z/new.ts", exportName: "zNew" }),
      cmContract({ file: "a/new.ts", exportName: "aNew" }),
    ]
    const report = diffContracts(previous, current)

    expect(report.addedContracts.map((c) => c.exportName)).toEqual(["aNew", "zNew"])
    expect(report.removedContracts.map((c) => c.exportName)).toEqual(["aOld", "zOld"])
  })

  it("sorts by exportName when file is the same", () => {
    const current = [
      cmContract({ file: "a/env.schema.ts", exportName: "zEnv" }),
      cmContract({ file: "a/env.schema.ts", exportName: "aEnv" }),
    ]
    const report = diffContracts(undefined, current)

    expect(report.addedContracts.map((c) => c.exportName)).toEqual(["aEnv", "zEnv"])
  })

  it("sorts addedVariables and removedVariables by key when file/exportName are the same -- not discovery order", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "Z_OLD" }), cmVariable({ key: "A_OLD" })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "Z_NEW" }), cmVariable({ key: "A_NEW" })],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.addedVariables.map((v) => v.key)).toEqual(["A_NEW", "Z_NEW"])
    expect(report.removedVariables.map((v) => v.key)).toEqual(["A_OLD", "Z_OLD"])
  })

  it("keeps 4+ variables already in alphabetical-by-key order stable -- a one-sided-blanked key comparator would flip an already-sorted run into reverse order", () => {
    // A 2-element reversal alone can pass even under a broken comparator
    // (small-array insertion sort's few pairwise comparisons can still land
    // on the right answer by luck); this specific ALREADY-ascending 4-key
    // input was empirically confirmed (via a throwaway comparator
    // simulation) to come back fully REVERSED under a `(a.key ?? "")` →
    // `(a.key && "")` mutation of `byIdentity`, while genuinely staying in
    // order under the real comparator.
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: ["A_NEW", "B_NEW", "C_NEW", "D_NEW"].map((key) => cmVariable({ key })),
      }),
    ]
    const report = diffContracts(undefined, current)

    expect(report.addedVariables.map((v) => v.key)).toEqual(["A_NEW", "B_NEW", "C_NEW", "D_NEW"])
  })

  it("sorts updatedContracts and updatedVariables by file then exportName -- not discovery order", () => {
    const previous = [
      cmContract({
        file: "z/env.schema.ts",
        exportName: "zEnv",
        owner: "team-1",
        variables: [cmVariable({ key: "KEY", required: false })],
      }),
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        owner: "team-1",
        variables: [cmVariable({ key: "KEY", required: false })],
      }),
    ]
    const current = [
      cmContract({
        file: "z/env.schema.ts",
        exportName: "zEnv",
        owner: "team-2",
        variables: [cmVariable({ key: "KEY", required: true })],
      }),
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        owner: "team-2",
        variables: [cmVariable({ key: "KEY", required: true })],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedContracts.map((c) => c.exportName)).toEqual(["aEnv", "zEnv"])
    expect(report.updatedVariables.map((v) => v.exportName)).toEqual(["aEnv", "zEnv"])
  })

  it("detects a wholly new contract and a wholly removed one", () => {
    const previous = [cmContract({ file: "old/env.schema.ts", exportName: "oldEnv" })]
    const current = [cmContract({ file: "new/env.schema.ts", exportName: "newEnv" })]
    const report = diffContracts(previous, current)

    expect(report.addedContracts.map((c) => c.file + "#" + c.exportName)).toEqual([
      "new/env.schema.ts#newEnv",
    ])
    expect(report.removedContracts.map((c) => c.file + "#" + c.exportName)).toEqual([
      "old/env.schema.ts#oldEnv",
    ])
  })

  it("reports every variable of a wholly-removed contract as removed too", () => {
    const previous = [
      cmContract({
        file: "old/env.schema.ts",
        exportName: "oldEnv",
        variables: [cmVariable({ key: "A" }), cmVariable({ key: "B" })],
      }),
    ]
    const report = diffContracts(previous, [])

    expect(report.removedContracts).toHaveLength(1)
    expect(report.removedVariables.map((v) => v.key).sort()).toEqual(["A", "B"])
  })

  it("detects an added and a removed variable within the same still-existing contract", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "OLD" })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "NEW" })],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.addedVariables.map((v) => v.key)).toEqual(["NEW"])
    expect(report.removedVariables.map((v) => v.key)).toEqual(["OLD"])
  })

  it("reports changed fields in alphabetical key order, not declaration order -- 'retention' is declared after 'sensitivity' on ContractModelContract but sorts before it", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        sensitivity: "config",
        retention: "30d",
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        sensitivity: "credential",
        retention: "90d",
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedContracts[0]?.changes).toEqual([
      { field: "retention", previous: "30d", current: "90d" },
      { field: "sensitivity", previous: "config", current: "credential" },
    ])
  })

  it("reports field-level previous/current values for an updated contract, including a metadata.<key> entry", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        owner: "team-a",
        sensitivity: "config",
        metadata: { service: "A" },
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        owner: "team-b",
        sensitivity: "credential",
        metadata: { service: "A2" },
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedContracts).toHaveLength(1)
    expect(report.updatedContracts[0]?.changes).toEqual(
      expect.arrayContaining([
        { field: "owner", previous: "team-a", current: "team-b" },
        { field: "sensitivity", previous: "config", current: "credential" },
        { field: "metadata.service", previous: "A", current: "A2" },
      ]),
    )
  })

  it("reports a schema-shape field change too, not only documented metadata -- the diff is now comprehensive, not manifest-scoped (ADR 0038)", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", hasDefault: false, defaultValue: undefined })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [
          cmVariable({ key: "K", hasDefault: true, defaultValue: { ok: true, value: "prod" } }),
        ],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedVariables).toHaveLength(1)
    expect(report.updatedVariables[0]?.changes).toEqual(
      expect.arrayContaining([
        { field: "hasDefault", previous: "false", current: "true" },
        {
          field: "defaultValue",
          previous: undefined,
          current: JSON.stringify({ ok: true, value: "prod" }),
        },
      ]),
    )
  })

  it("reports field-level previous/current values for an updated variable, including required (boolean) and metadata.<key>", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [
          cmVariable({ key: "K", required: false, metadata: { rotationCadence: "30 days" } }),
        ],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [
          cmVariable({ key: "K", required: true, metadata: { rotationCadence: "90 days" } }),
        ],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedVariables).toHaveLength(1)
    expect(report.updatedVariables[0]?.changes).toEqual(
      expect.arrayContaining([
        { field: "required", previous: "false", current: "true" },
        { field: "metadata.rotationCadence", previous: "30 days", current: "90 days" },
      ]),
    )
  })

  it("detects a metadata field change for structurally-different-but-referentially-distinct object values, and reports the JSON text (ADR 0035)", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { nested: { encryption: true } } })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { nested: { encryption: false } } })],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedVariables).toHaveLength(1)
    expect(report.updatedVariables[0]?.changes).toEqual([
      {
        field: "metadata.nested",
        previous: JSON.stringify({ encryption: true }),
        current: JSON.stringify({ encryption: false }),
      },
    ])
  })

  it("does not report a metadata field as changed when it's structurally identical, even across separately-constructed object instances", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { nested: { encryption: true } } })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { nested: { encryption: true } } })],
      }),
    ]
    expect(diffContracts(previous, current).updatedVariables).toHaveLength(0)
  })

  it("reports every key as added when metadata goes from entirely absent to present -- the 'previous ?? {}' fallback, not just 'metadata: {}'", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: undefined })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { rotationCadence: "30 days" } })],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedVariables[0]?.changes).toEqual([
      { field: "metadata.rotationCadence", previous: undefined, current: "30 days" },
    ])
  })

  it("reports every key as removed when metadata goes from present to entirely absent", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { rotationCadence: "30 days" } })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: undefined })],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedVariables[0]?.changes).toEqual([
      { field: "metadata.rotationCadence", previous: "30 days", current: undefined },
    ])
  })

  it("reports metadata.<key> entries in alphabetical key order, not declaration order", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { zebra: "old-z", alpha: "old-a" } })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { zebra: "new-z", alpha: "new-a" } })],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedVariables[0]?.changes).toEqual([
      { field: "metadata.alpha", previous: "old-a", current: "new-a" },
      { field: "metadata.zebra", previous: "old-z", current: "new-z" },
    ])
  })

  it("only reports the metadata keys that actually changed, not every key -- an unchanged key alongside a changed one must be silent", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { changed: "old", unchanged: "same" } })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [cmVariable({ key: "K", metadata: { changed: "new", unchanged: "same" } })],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedVariables[0]?.changes).toEqual([
      { field: "metadata.changed", previous: "old", current: "new" },
    ])
  })

  it("does not report a contract/variable as updated when nothing about it actually changed, even alongside unrelated additions", () => {
    const stable = cmContract({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      variables: [cmVariable({ key: "STABLE" })],
    })
    const previous = [stable]
    const current = [stable, cmContract({ file: "b/env.schema.ts", exportName: "bEnv" })]
    const report = diffContracts(previous, current)

    expect(report.updatedContracts).toHaveLength(0)
    expect(report.updatedVariables).toHaveLength(0)
    expect(report.addedContracts.map((c) => c.file + "#" + c.exportName)).toEqual([
      "b/env.schema.ts#bEnv",
    ])
  })

  it("does not report the whole variables array as a changed field on a contract -- it's diffed separately into added/removed/updatedVariables", () => {
    const previous = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        owner: "team-a",
        variables: [cmVariable({ key: "ONLY" })],
      }),
    ]
    const current = [
      cmContract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        owner: "team-b",
        // Variables genuinely differ (a new one added) alongside the owner
        // change -- "variables" must never show up as its own field entry.
        variables: [cmVariable({ key: "ONLY" }), cmVariable({ key: "NEW" })],
      }),
    ]
    const report = diffContracts(previous, current)

    expect(report.updatedContracts).toHaveLength(1)
    expect(report.updatedContracts[0]?.changes).toEqual([
      { field: "owner", previous: "team-a", current: "team-b" },
    ])
    expect(report.addedVariables.map((v) => v.key)).toEqual(["NEW"])
  })
})

describe("computeEvidenceChanges", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-compute-evidence-changes-test-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("diffs against 'no previous state' and emits no readWarning when the snapshot file is simply missing", async () => {
    const snapshotPath = path.join(root, "docs/env.evidence.json")
    const contract = makeContract({
      file: path.join(root, "a/env.schema.ts"),
      exportName: "aEnv",
      variables: [makeVariable({ key: "KEY" })],
    })
    const currentContracts = buildContractModel([contract], root).contracts

    const { report, readWarning } = await computeEvidenceChanges(
      root,
      snapshotPath,
      [contract],
      currentContracts,
      readFile,
      nodeBuildFs,
    )
    expect(readWarning).toBeUndefined()
    expect(report.addedContracts).toHaveLength(1)
  })

  it("still diffs against 'no previous state', but emits a readWarning, when the snapshot file is corrupt", async () => {
    const snapshotPath = path.join(root, "docs/env.evidence.json")
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
    await fs.writeFile(snapshotPath, "not json at all", "utf8")

    const contract = makeContract({
      file: path.join(root, "a/env.schema.ts"),
      exportName: "aEnv",
      variables: [],
    })
    const currentContracts = buildContractModel([contract], root).contracts

    const { report, readWarning } = await computeEvidenceChanges(
      root,
      snapshotPath,
      [contract],
      currentContracts,
      readFile,
      nodeBuildFs,
    )

    expect(report.addedContracts).toHaveLength(1)
    expect(readWarning).toBeDefined()
    expect(readWarning?.file).toBe(snapshotPath)
    expect(readWarning?.message).toContain("could not be parsed")
  })

  it("still diffs against 'no previous state', but emits a readWarning, when the snapshot's schemaVersion is unrecognized", async () => {
    const snapshotPath = path.join(root, "docs/env.evidence.json")
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
    await fs.writeFile(snapshotPath, JSON.stringify({ schemaVersion: 999 }), "utf8")

    const contract = makeContract({
      file: path.join(root, "a/env.schema.ts"),
      exportName: "aEnv",
      variables: [],
    })
    const currentContracts = buildContractModel([contract], root).contracts

    const { report, readWarning } = await computeEvidenceChanges(
      root,
      snapshotPath,
      [contract],
      currentContracts,
      readFile,
      nodeBuildFs,
    )

    expect(report.addedContracts).toHaveLength(1)
    expect(readWarning?.message).toContain("schemaVersion")
  })

  it("diffs cleanly against a real previously-written evidence snapshot", async () => {
    const snapshotPath = path.join(root, "docs/env.evidence.json")
    const contract = makeContract({
      file: path.join(root, "a/env.schema.ts"),
      exportName: "aEnv",
      variables: [makeVariable({ key: "KEY" })],
    })
    const currentContracts = buildContractModel([contract], root).contracts

    const first = await computeEvidenceChanges(
      root,
      snapshotPath,
      [contract],
      currentContracts,
      readFile,
      nodeBuildFs,
    )
    await writeEvidenceSnapshot(
      snapshotPath,
      evidenceFixture({ contracts: currentContracts }),
      nodeBuildFs,
    )
    expect(first.report.addedContracts).toHaveLength(1)

    const second = await computeEvidenceChanges(
      root,
      snapshotPath,
      [contract],
      currentContracts,
      readFile,
      nodeBuildFs,
    )
    expect(second.readWarning).toBeUndefined()
    expect(second.report.addedContracts).toHaveLength(0)
    expect(second.report.updatedContracts).toHaveLength(0)
  })
})

describe("buildCitationSnapshots / verifyDynamicAccessCitations (ADR 0037)", () => {
  let root: string
  const realReadFile = (filePath: string): Promise<string> => fs.readFile(filePath, "utf8")

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-dynamic-access-ack-test-"))
    await fs.mkdir(path.join(root, "scripts"), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  function makeCitingContract(): DiscoveredContract {
    return makeContract({
      file: path.join(root, "a", "env.schema.ts"),
      exportName: "aEnv",
      contractName: "a",
      variables: [
        makeVariable({
          key: "SECRET_KEY",
          evidence: { dynamicAccess: ["scripts/migrate.sh:12:4"] },
        }),
      ],
    })
  }

  it("reports a brand-new citation as fresh -- nothing to contradict it yet -- and stamps this run's own contentHash", async () => {
    await fs.writeFile(path.join(root, "scripts", "migrate.sh"), "v1\n", "utf8")

    const acknowledgments = await buildCitationSnapshots(
      [makeCitingContract()],
      undefined,
      root,
      realReadFile,
    )
    const assertions = [...acknowledgments.values()].flat()
    expect(assertions).toHaveLength(1)
    expect(assertions[0]).toMatchObject({
      file: "scripts/migrate.sh",
      line: 12,
      column: 4,
      acknowledgment: "fresh",
    })
    expect(assertions[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyDynamicAccessCitations([makeCitingContract()], root, acknowledgments)).toEqual([])
  })

  it("stays fresh across a run where the cited file's content is unchanged", async () => {
    await fs.writeFile(path.join(root, "scripts", "migrate.sh"), "v1\n", "utf8")

    const first = await buildCitationSnapshots(
      [makeCitingContract()],
      undefined,
      root,
      realReadFile,
    )
    const identity = dynamicAccessVariableIdentity("a/env.schema.ts", "aEnv", "SECRET_KEY")
    const previous = evidenceFixture({
      dependencyContracts: [
        {
          file: "a/env.schema.ts",
          exportName: "aEnv",
          contractName: "a",
          imported: false,
          hasDynamicAccess: false,
          consumingFiles: [],
          ambiguousBarrelFiles: [],
          dynamicAccessSites: [],
          variables: [
            {
              key: "SECRET_KEY",
              status: "unconsumed",
              positions: [],
              dynamicAccessAssertions: first.get(identity) ?? [],
            },
          ],
        },
      ],
    })

    const second = await buildCitationSnapshots(
      [makeCitingContract()],
      previous,
      root,
      realReadFile,
    )
    const assertions = [...second.values()].flat()
    expect(assertions).toMatchObject([{ acknowledgment: "fresh" }])
    expect(verifyDynamicAccessCitations([makeCitingContract()], root, second)).toEqual([])
  })

  it("goes stale once the cited file's content changes after the baseline was committed", async () => {
    await fs.writeFile(path.join(root, "scripts", "migrate.sh"), "v1\n", "utf8")
    const first = await buildCitationSnapshots(
      [makeCitingContract()],
      undefined,
      root,
      realReadFile,
    )
    const identity = dynamicAccessVariableIdentity("a/env.schema.ts", "aEnv", "SECRET_KEY")
    const previous = evidenceFixture({
      dependencyContracts: [
        {
          file: "a/env.schema.ts",
          exportName: "aEnv",
          contractName: "a",
          imported: false,
          hasDynamicAccess: false,
          consumingFiles: [],
          ambiguousBarrelFiles: [],
          dynamicAccessSites: [],
          variables: [
            {
              key: "SECRET_KEY",
              status: "unconsumed",
              positions: [],
              dynamicAccessAssertions: first.get(identity) ?? [],
            },
          ],
        },
      ],
    })

    // The cited file changes -- "more code is added" -- with no re-acknowledgment.
    await fs.writeFile(path.join(root, "scripts", "migrate.sh"), "v2 -- more code\n", "utf8")

    const second = await buildCitationSnapshots(
      [makeCitingContract()],
      previous,
      root,
      realReadFile,
    )
    const assertions = [...second.values()].flat()
    expect(assertions).toMatchObject([{ acknowledgment: "stale" }])
    expect(verifyDynamicAccessCitations([makeCitingContract()], root, second)).toEqual([
      {
        contractName: "a",
        file: "a/env.schema.ts",
        exportName: "aEnv",
        key: "SECRET_KEY",
        position: { file: "scripts/migrate.sh", line: 12, column: 4 },
        acknowledgment: "stale",
      },
    ])
  })

  it("reports missing, never stale, once the cited file is deleted entirely", async () => {
    await fs.writeFile(path.join(root, "scripts", "migrate.sh"), "v1\n", "utf8")
    const acknowledgments = await buildCitationSnapshots(
      [makeCitingContract()],
      undefined,
      root,
      realReadFile,
    )
    expect([...acknowledgments.values()].flat()).toMatchObject([{ acknowledgment: "fresh" }])

    await fs.rm(path.join(root, "scripts", "migrate.sh"))

    const second = await buildCitationSnapshots(
      [makeCitingContract()],
      undefined,
      root,
      realReadFile,
    )
    const assertions = [...second.values()].flat()
    expect(assertions).toEqual([
      {
        file: "scripts/migrate.sh",
        line: 12,
        column: 4,
        acknowledgment: "missing",
        contentHash: undefined,
      },
    ])
    expect(verifyDynamicAccessCitations([makeCitingContract()], root, second)).toEqual([
      expect.objectContaining({ acknowledgment: "missing", key: "SECRET_KEY" }),
    ])
  })

  it("skips a malformed dynamicAccess citation string (fails parsePositionCitation) without crashing, while still processing a real one alongside it", async () => {
    await fs.writeFile(path.join(root, "scripts", "migrate.sh"), "v1\n", "utf8")
    const contractWithMalformedCitation = makeContract({
      file: path.join(root, "a", "env.schema.ts"),
      exportName: "aEnv",
      contractName: "a",
      variables: [
        makeVariable({
          key: "SECRET_KEY",
          evidence: {
            dynamicAccess: ["not-a-valid-citation-string", "scripts/migrate.sh:12:4"],
          },
        }),
      ],
    })

    const acknowledgments = await buildCitationSnapshots(
      [contractWithMalformedCitation],
      undefined,
      root,
      realReadFile,
    )
    const assertions = [...acknowledgments.values()].flat()
    expect(assertions).toHaveLength(1)
    expect(assertions[0]).toMatchObject({ file: "scripts/migrate.sh", line: 12, column: 4 })
  })
})
