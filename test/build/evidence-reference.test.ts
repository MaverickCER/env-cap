import { describe, expect, it } from "vitest"
import type { EvidenceReference } from "../../src/build/evidence-reference.js"

/** Exhaustive over every `model` variant -- if a new arm is ever added to `EvidenceReference` without updating this, `tsc` fails here first. */
function describeReference(ref: EvidenceReference): string {
  switch (ref.model) {
    case "contract":
      return `contract:${ref.file ?? "?"}#${ref.exportName ?? "?"}${ref.variable ? `#${ref.variable}` : ""}`
    case "ownership":
      return `ownership:${ref.contractName}${ref.variable ? `#${ref.variable}` : ""}`
    case "change":
      return `change:${ref.path}`
  }
}

describe("EvidenceReference", () => {
  it("narrows to a contract reference's fields", () => {
    const ref: EvidenceReference = {
      model: "contract",
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variable: "STRIPE_KEY",
    }
    expect(describeReference(ref)).toBe("contract:/repo/a/env.schema.ts#aEnv#STRIPE_KEY")
  })

  it("narrows to an ownership reference's fields, keyed by contractName rather than file/exportName", () => {
    const ref: EvidenceReference = {
      model: "ownership",
      contractName: "paymentsEnv",
      file: undefined,
      variable: "STRIPE_KEY",
    }
    expect(describeReference(ref)).toBe("ownership:paymentsEnv#STRIPE_KEY")
  })

  it("narrows to a change reference's artifact path", () => {
    const ref: EvidenceReference = {
      model: "change",
      path: "/repo/src/generated/env.manifest.ts",
    }
    expect(describeReference(ref)).toBe("change:/repo/src/generated/env.manifest.ts")
  })
})
