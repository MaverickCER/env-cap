import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import {
  buildManifestSnapshot,
  computeManifestChanges,
  diffManifestSnapshots,
  manifestSnapshotPath,
  MANIFEST_SNAPSHOT_SCHEMA_VERSION,
  readManifestSnapshot,
  writeManifestSnapshot,
  type ManifestSnapshot,
} from "../../src/build/manifest-snapshot.js"

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

describe("manifestSnapshotPath", () => {
  it("derives a sibling .snapshot.json path from a .ts manifest location", () => {
    expect(manifestSnapshotPath("/repo/src/generated/env.manifest.ts")).toBe(
      "/repo/src/generated/env.manifest.snapshot.json",
    )
  })

  it("works for a manifest not named env.manifest.ts", () => {
    expect(manifestSnapshotPath("/repo/out.manifest.ts")).toBe("/repo/out.manifest.snapshot.json")
  })
})

describe("buildManifestSnapshot", () => {
  it("is deterministic regardless of input order (contracts, then variables within a contract)", () => {
    const a = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      variables: [makeVariable({ key: "Z" }), makeVariable({ key: "A" })],
    })
    const b = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [makeVariable({ key: "ONE" })],
    })

    const snapshot1 = buildManifestSnapshot([a, b], "/repo")
    const snapshot2 = buildManifestSnapshot([b, a], "/repo")
    expect(snapshot1).toEqual(snapshot2)
    expect(snapshot1.contracts.map((c) => c.file)).toEqual(["a/env.schema.ts", "b/env.schema.ts"])
    expect(snapshot1.contracts[1]?.variables.map((v) => v.key)).toEqual(["A", "Z"])
  })

  it("carries the current schema version and root-relative, POSIX-separated file paths", () => {
    const contract = makeContract({
      file: "/repo/features/x/env.schema.ts",
      exportName: "xEnv",
      variables: [],
    })
    const snapshot = buildManifestSnapshot([contract], "/repo")
    expect(snapshot.schemaVersion).toBe(MANIFEST_SNAPSHOT_SCHEMA_VERSION)
    expect(snapshot.contracts[0]?.file).toBe("features/x/env.schema.ts")
  })

  it("captures only documentEnv() metadata fields, not processor/validator/schema shape", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      owner: "team-a",
      metadata: { service: "A" },
      variables: [
        makeVariable({
          key: "KEY",
          description: "desc",
          owner: "var-owner",
          expiresAt: "2030-01-01",
          refreshInstructions: "rotate",
          required: true,
          extra: { rotationCadence: "30 days" },
        }),
      ],
    })
    const snapshot = buildManifestSnapshot([contract], "/repo")
    expect(snapshot.contracts[0]).toEqual({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      contractName: "aEnv",
      active: true,
      category: undefined,
      exclusiveGroup: undefined,
      owner: "team-a",
      expiresAt: undefined,
      metadata: { service: "A" },
      variables: [
        {
          key: "KEY",
          description: "desc",
          owner: "var-owner",
          expiresAt: "2030-01-01",
          refreshInstructions: "rotate",
          required: true,
          extra: { rotationCadence: "30 days" },
          documented: true,
        },
      ],
    })
  })
})

describe("readManifestSnapshot / writeManifestSnapshot", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-manifest-snapshot-test-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("reports 'missing' for a file that doesn't exist -- the normal, silent first-run case", async () => {
    const result = await readManifestSnapshot(path.join(root, "does-not-exist.snapshot.json"))
    expect(result).toEqual({ status: "missing" })
  })

  it("reports 'invalid-json' for a file that can't be parsed, with a diagnosable detail", async () => {
    const snapshotPath = path.join(root, "corrupt.snapshot.json")
    await fs.writeFile(snapshotPath, "{ not valid json", "utf8")

    const result = await readManifestSnapshot(snapshotPath)
    expect(result.status).toBe("invalid-json")
    if (result.status === "invalid-json") expect(result.detail.length).toBeGreaterThan(0)
  })

  it("reports 'unsupported-version' for well-formed JSON with a schemaVersion this build doesn't recognize", async () => {
    const snapshotPath = path.join(root, "future.snapshot.json")
    await fs.writeFile(snapshotPath, JSON.stringify({ schemaVersion: 999, contracts: [] }), "utf8")

    const result = await readManifestSnapshot(snapshotPath)
    expect(result).toEqual({ status: "unsupported-version", foundVersion: 999 })
  })

  it("round-trips a real snapshot written by writeManifestSnapshot", async () => {
    const snapshotPath = path.join(root, "nested", "env.manifest.snapshot.json")
    const snapshot: ManifestSnapshot = {
      schemaVersion: MANIFEST_SNAPSHOT_SCHEMA_VERSION,
      contracts: [
        {
          file: "a/env.schema.ts",
          exportName: "aEnv",
          contractName: "a",
          active: true,
          category: undefined,
          exclusiveGroup: undefined,
          owner: undefined,
          expiresAt: undefined,
          metadata: undefined,
          variables: [
            {
              key: "KEY",
              description: "desc",
              owner: undefined,
              expiresAt: undefined,
              refreshInstructions: undefined,
              required: undefined,
              extra: {},
              documented: true,
            },
          ],
        },
      ],
    }

    await writeManifestSnapshot(snapshotPath, snapshot)
    const result = await readManifestSnapshot(snapshotPath)
    expect(result).toEqual({ status: "ok", snapshot })
  })
})

describe("diffManifestSnapshots", () => {
  function snapshotOf(contracts: ManifestSnapshot["contracts"]): ManifestSnapshot {
    return { schemaVersion: MANIFEST_SNAPSHOT_SCHEMA_VERSION, contracts }
  }

  function contract(
    overrides: Partial<ManifestSnapshot["contracts"][number]> & {
      file: string
      exportName: string
    },
  ): ManifestSnapshot["contracts"][number] {
    return {
      contractName: overrides.exportName,
      active: true,
      category: undefined,
      exclusiveGroup: undefined,
      owner: undefined,
      expiresAt: undefined,
      metadata: undefined,
      variables: [],
      ...overrides,
    }
  }

  function variable(
    overrides: Partial<ManifestSnapshot["contracts"][number]["variables"][number]> & {
      key: string
    },
  ): ManifestSnapshot["contracts"][number]["variables"][number] {
    return {
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

  it("reports every contract and variable as added when there is no previous snapshot", () => {
    const current = snapshotOf([
      contract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [variable({ key: "KEY" })],
      }),
    ])
    const report = diffManifestSnapshots(undefined, current)

    expect(report.addedContracts).toHaveLength(1)
    expect(report.addedContracts[0]?.identity).toBe("a/env.schema.ts#aEnv")
    expect(report.addedVariables).toHaveLength(1)
    expect(report.addedVariables[0]?.identity).toBe("a/env.schema.ts#aEnv#KEY")
    expect(report.removedContracts).toHaveLength(0)
    expect(report.removedVariables).toHaveLength(0)
    expect(report.updatedContracts).toHaveLength(0)
    expect(report.updatedVariables).toHaveLength(0)
  })

  it("reports nothing when nothing changed", () => {
    const snapshot = snapshotOf([
      contract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [variable({ key: "KEY", description: "desc" })],
      }),
    ])
    const report = diffManifestSnapshots(snapshot, snapshot)

    expect(report.addedContracts).toHaveLength(0)
    expect(report.removedContracts).toHaveLength(0)
    expect(report.addedVariables).toHaveLength(0)
    expect(report.removedVariables).toHaveLength(0)
    expect(report.updatedContracts).toHaveLength(0)
    expect(report.updatedVariables).toHaveLength(0)
  })

  it("detects a wholly new contract and a wholly removed one", () => {
    const previous = snapshotOf([contract({ file: "old/env.schema.ts", exportName: "oldEnv" })])
    const current = snapshotOf([contract({ file: "new/env.schema.ts", exportName: "newEnv" })])
    const report = diffManifestSnapshots(previous, current)

    expect(report.addedContracts.map((c) => c.identity)).toEqual(["new/env.schema.ts#newEnv"])
    expect(report.removedContracts.map((c) => c.identity)).toEqual(["old/env.schema.ts#oldEnv"])
  })

  it("reports every variable of a wholly-removed contract as removed too", () => {
    const previous = snapshotOf([
      contract({
        file: "old/env.schema.ts",
        exportName: "oldEnv",
        variables: [variable({ key: "A" }), variable({ key: "B" })],
      }),
    ])
    const current = snapshotOf([])
    const report = diffManifestSnapshots(previous, current)

    expect(report.removedContracts).toHaveLength(1)
    expect(report.removedVariables.map((v) => v.key).sort()).toEqual(["A", "B"])
  })

  it("detects an added and a removed variable within the same still-existing contract", () => {
    const previous = snapshotOf([
      contract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [variable({ key: "OLD" })],
      }),
    ])
    const current = snapshotOf([
      contract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [variable({ key: "NEW" })],
      }),
    ])
    const report = diffManifestSnapshots(previous, current)

    expect(report.addedVariables.map((v) => v.key)).toEqual(["NEW"])
    expect(report.removedVariables.map((v) => v.key)).toEqual(["OLD"])
  })

  it("reports field-level previous/current values for an updated contract, including a metadata.<key> entry", () => {
    const previous = snapshotOf([
      contract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        owner: "team-a",
        metadata: { service: "A" },
      }),
    ])
    const current = snapshotOf([
      contract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        owner: "team-b",
        metadata: { service: "A2" },
      }),
    ])
    const report = diffManifestSnapshots(previous, current)

    expect(report.updatedContracts).toHaveLength(1)
    expect(report.updatedContracts[0]?.changes).toEqual(
      expect.arrayContaining([
        { field: "owner", previous: "team-a", current: "team-b" },
        { field: "metadata.service", previous: "A", current: "A2" },
      ]),
    )
  })

  it("reports field-level previous/current values for an updated variable, including required (boolean) and extra.<key>", () => {
    const previous = snapshotOf([
      contract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [variable({ key: "K", required: false, extra: { rotationCadence: "30 days" } })],
      }),
    ])
    const current = snapshotOf([
      contract({
        file: "a/env.schema.ts",
        exportName: "aEnv",
        variables: [variable({ key: "K", required: true, extra: { rotationCadence: "90 days" } })],
      }),
    ])
    const report = diffManifestSnapshots(previous, current)

    expect(report.updatedVariables).toHaveLength(1)
    expect(report.updatedVariables[0]?.changes).toEqual(
      expect.arrayContaining([
        { field: "required", previous: "false", current: "true" },
        { field: "extra.rotationCadence", previous: "30 days", current: "90 days" },
      ]),
    )
  })

  it("does not report a contract/variable as updated when nothing about it actually changed, even alongside unrelated additions", () => {
    const stable = contract({
      file: "a/env.schema.ts",
      exportName: "aEnv",
      variables: [variable({ key: "STABLE" })],
    })
    const previous = snapshotOf([stable])
    const current = snapshotOf([stable, contract({ file: "b/env.schema.ts", exportName: "bEnv" })])
    const report = diffManifestSnapshots(previous, current)

    expect(report.updatedContracts).toHaveLength(0)
    expect(report.updatedVariables).toHaveLength(0)
    expect(report.addedContracts.map((c) => c.identity)).toEqual(["b/env.schema.ts#bEnv"])
  })
})

describe("computeManifestChanges", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-compute-manifest-changes-test-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("diffs against 'no previous state' and emits no readWarning when the snapshot file is simply missing", async () => {
    const manifestOutputPath = path.join(root, "src/generated/env.manifest.ts")
    const contract = makeContract({
      file: path.join(root, "a/env.schema.ts"),
      exportName: "aEnv",
      variables: [makeVariable({ key: "KEY" })],
    })

    const { report, readWarning } = await computeManifestChanges(root, manifestOutputPath, [
      contract,
    ])
    expect(readWarning).toBeUndefined()
    expect(report.addedContracts).toHaveLength(1)
  })

  it("still diffs against 'no previous state', but emits a readWarning, when the snapshot file is corrupt", async () => {
    const manifestOutputPath = path.join(root, "src/generated/env.manifest.ts")
    const snapshotPath = manifestSnapshotPath(manifestOutputPath)
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
    await fs.writeFile(snapshotPath, "not json at all", "utf8")

    const contract = makeContract({
      file: path.join(root, "a/env.schema.ts"),
      exportName: "aEnv",
      variables: [],
    })
    const { report, readWarning } = await computeManifestChanges(root, manifestOutputPath, [
      contract,
    ])

    expect(report.addedContracts).toHaveLength(1)
    expect(readWarning).toBeDefined()
    expect(readWarning?.file).toBe(snapshotPath)
    expect(readWarning?.message).toContain("could not be parsed")
  })

  it("still diffs against 'no previous state', but emits a readWarning, when the snapshot's schemaVersion is unrecognized", async () => {
    const manifestOutputPath = path.join(root, "src/generated/env.manifest.ts")
    const snapshotPath = manifestSnapshotPath(manifestOutputPath)
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
    await fs.writeFile(snapshotPath, JSON.stringify({ schemaVersion: 999, contracts: [] }), "utf8")

    const contract = makeContract({
      file: path.join(root, "a/env.schema.ts"),
      exportName: "aEnv",
      variables: [],
    })
    const { report, readWarning } = await computeManifestChanges(root, manifestOutputPath, [
      contract,
    ])

    expect(report.addedContracts).toHaveLength(1)
    expect(readWarning?.message).toContain("schemaVersion")
  })
})
