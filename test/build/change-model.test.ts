import { describe, expect, it } from "vitest"
import { buildChangeModel, CHANGE_MODEL_SCHEMA_VERSION } from "../../src/build/change-model.js"
import type { ManifestChangeReport } from "../../src/build/manifest-snapshot.js"

const EMPTY_REPORT: ManifestChangeReport = {
  addedContracts: [],
  removedContracts: [],
  addedVariables: [],
  removedVariables: [],
  updatedContracts: [],
  updatedVariables: [],
}

describe("buildChangeModel", () => {
  it("carries the current schema version", () => {
    const model = buildChangeModel(EMPTY_REPORT)
    expect(model.schemaVersion).toBe(CHANGE_MODEL_SCHEMA_VERSION)
  })

  it("wraps the given ManifestChangeReport unmodified, doing no computation of its own", () => {
    const report: ManifestChangeReport = {
      addedContracts: [
        {
          identity: "a/env.schema.ts#aEnv",
          file: "a/env.schema.ts",
          exportName: "aEnv",
          contractName: "a",
        },
      ],
      removedContracts: [],
      addedVariables: [],
      removedVariables: [],
      updatedContracts: [],
      updatedVariables: [],
    }
    const model = buildChangeModel(report)
    expect(model.manifest).toBe(report)
  })
})
