import { describe, it, expect } from "vitest"
import {
  detectCompatibilityIssues,
  detectDuplicateVariableShapes,
} from "../../src/build/compatibility.js"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"

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
    documented: false,
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    ...overrides,
  }
}

function makeContract(
  file: string,
  exportName: string,
  variables: DiscoveredVariable[],
  overrides: Partial<DiscoveredContract> = {},
): DiscoveredContract {
  return {
    file,
    exportName,
    contractName: exportName,
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
    variables,
    documented: false,
    declaration: { file, line: 1, column: 1 },
    documentation: undefined,
    packageOrigin: undefined,
    ...overrides,
  }
}

describe("detectCompatibilityIssues", () => {
  it("does not flag a single declaration of a variable", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasProcessor: true }),
    ])
    expect(detectCompatibilityIssues([a])).toHaveLength(0)
  })

  it("errors when two processors declare explicit, conflicting return types", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasProcessor: true, processorReturnType: "string" }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "PORT", hasProcessor: true, processorReturnType: "number" }),
    ])

    const issues = detectCompatibilityIssues([a, b])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe("error")
    expect(issues[0]?.variable).toBe("PORT")
    expect(issues[0]?.files).toEqual(["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"])
    expect(issues[0]?.code).toBe("PROCESSOR_RETURN_TYPE_CONFLICT")
    expect(issues[0]?.reason).toBe(
      'Processor return types are declared incompatible: "aEnv" produces string, "bEnv" produces number.',
    )
  })

  it("never conflicts on processorReturnType when both sides declare the SAME one", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasProcessor: true, processorReturnType: "number" }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "PORT", hasProcessor: true, processorReturnType: "number" }),
    ])
    expect(
      detectCompatibilityIssues([a, b]).filter((i) => i.code === "PROCESSOR_RETURN_TYPE_CONFLICT"),
    ).toHaveLength(0)
  })

  it("never conflicts on processorReturnType when only ONE side declares one", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasProcessor: true, processorReturnType: "string" }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "PORT", hasProcessor: true }),
    ])
    expect(
      detectCompatibilityIssues([a, b]).filter((i) => i.code === "PROCESSOR_RETURN_TYPE_CONFLICT"),
    ).toHaveLength(0)
  })

  it("warns (not errors) when processors differ without explicit annotations", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "TOKEN", hasProcessor: true, processorSource: "(v) => String(v)" }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({
        key: "TOKEN",
        hasProcessor: true,
        processorSource: "(v) => String(v).trim()",
      }),
    ])

    const issues = detectCompatibilityIssues([a, b])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe("warning")
    expect(issues[0]?.code).toBe("PROCESSOR_SOURCE_CONFLICT")
    expect(issues[0]?.files).toEqual(["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"])
    expect(issues[0]?.reason).toBe(
      '"aEnv" and "bEnv" both declare a processor for this variable with different implementations. ' +
        "Return types could not be statically verified -- add explicit return type annotations, or " +
        "confirm they produce equivalent output.",
    )
  })

  it("never conflicts on processorSource when both sides declare the SAME source, with hasProcessor true on both", () => {
    const source = "(v) => String(v)"
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "TOKEN", hasProcessor: true, processorSource: source }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "TOKEN", hasProcessor: true, processorSource: source }),
    ])
    expect(
      detectCompatibilityIssues([a, b]).filter((i) => i.code === "PROCESSOR_SOURCE_CONFLICT"),
    ).toHaveLength(0)
  })

  it("never conflicts on processorSource when only ONE side declares a processor", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "TOKEN", hasProcessor: true, processorSource: "(v) => String(v)" }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [makeVariable({ key: "TOKEN" })])
    expect(
      detectCompatibilityIssues([a, b]).filter((i) => i.code === "PROCESSOR_SOURCE_CONFLICT"),
    ).toHaveLength(0)
  })

  it("warns when validators differ, independently of processor compatibility", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasValidator: true, validatorSource: '(v) => v > 0 || "bad"' }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({
        key: "PORT",
        hasValidator: true,
        validatorSource: '(v) => v > 1024 || "bad"',
      }),
    ])

    const issues = detectCompatibilityIssues([a, b])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe("warning")
    expect(issues[0]?.code).toBe("VALIDATOR_SOURCE_CONFLICT")
    expect(issues[0]?.files).toEqual(["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"])
    expect(issues[0]?.reason).toBe(
      '"aEnv" and "bEnv" both declare a validator for this variable with different implementations. ' +
        "Validator logic cannot be statically compared -- confirm they enforce compatible rules.",
    )
  })

  it("never conflicts on validatorSource when only ONE side declares a validator", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasValidator: true, validatorSource: '(v) => v > 0 || "bad"' }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [makeVariable({ key: "PORT" })])
    expect(
      detectCompatibilityIssues([a, b]).filter((i) => i.code === "VALIDATOR_SOURCE_CONFLICT"),
    ).toHaveLength(0)
  })

  it("does not flag identical processor/validator source across files", () => {
    const source = '(v) => v > 0 || "bad"'
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "PORT", hasValidator: true, validatorSource: source }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "PORT", hasValidator: true, validatorSource: source }),
    ])

    expect(detectCompatibilityIssues([a, b])).toHaveLength(0)
  })

  it("sorts issues by variable key, not discovery order -- a later-declared key that sorts alphabetically first must still come first", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "Z_VAR", hasProcessor: true, processorReturnType: "string" }),
      makeVariable({ key: "A_VAR", hasProcessor: true, processorReturnType: "string" }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "Z_VAR", hasProcessor: true, processorReturnType: "number" }),
      makeVariable({ key: "A_VAR", hasProcessor: true, processorReturnType: "number" }),
    ])
    const issues = detectCompatibilityIssues([a, b])
    expect(issues.map((i) => i.variable)).toEqual(["A_VAR", "Z_VAR"])
  })

  it("does not flag variables that only appear in one contract", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [makeVariable({ key: "ONLY_A" })])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [makeVariable({ key: "ONLY_B" })])

    expect(detectCompatibilityIssues([a, b])).toHaveLength(0)
  })

  describe("duplicate-variable-documentation warning", () => {
    it("warns (never errors) with a stable code when two documented declarations of the same variable disagree", () => {
      const a = makeContract("/repo/notifications/env.schema.ts", "notificationsEnv", [
        makeVariable({
          key: "WEBHOOK_URL",
          documented: true,
          description: "Slack webhook",
          owner: "team-notifications",
          required: true,
        }),
      ])
      const b = makeContract("/repo/audit-log/env.schema.ts", "auditLogEnv", [
        makeVariable({
          key: "WEBHOOK_URL",
          documented: true,
          description: "Audit event webhook",
          owner: "team-security",
          expiresAt: "2027-01-01",
        }),
      ])

      const issues = detectCompatibilityIssues([a, b])
      expect(issues).toHaveLength(1)
      expect(issues[0]?.severity).toBe("warning")
      expect(issues[0]?.code).toBe("DUPLICATE_VARIABLE_DOCUMENTATION")
      expect(issues[0]?.variable).toBe("WEBHOOK_URL")
      expect(issues[0]?.files).toEqual([
        "/repo/notifications/env.schema.ts",
        "/repo/audit-log/env.schema.ts",
      ])
      expect(issues[0]?.reason).toBe(
        '"notificationsEnv" and "auditLogEnv" both document this variable, but disagree on: ' +
          "description, owner, expiresAt, required. Confirm they're still meant to be the same " +
          "variable and align the documentation, or document them separately if they're not.",
      )
    })

    it("flags diverging sensitivity between two documented declarations of the same variable", () => {
      const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
        makeVariable({ key: "SHARED", documented: true, sensitivity: "secret" }),
      ])
      const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
        makeVariable({ key: "SHARED", documented: true, sensitivity: "config" }),
      ])

      const issues = detectCompatibilityIssues([a, b])
      expect(issues).toHaveLength(1)
      expect(issues[0]?.code).toBe("DUPLICATE_VARIABLE_DOCUMENTATION")
      expect(issues[0]?.reason).toContain("sensitivity")
    })

    it("does not flag two documented declarations that agree on sensitivity", () => {
      const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
        makeVariable({ key: "SHARED", documented: true, sensitivity: "secret" }),
      ])
      const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
        makeVariable({ key: "SHARED", documented: true, sensitivity: "secret" }),
      ])

      expect(detectCompatibilityIssues([a, b])).toHaveLength(0)
    })

    it("flags a diverging metadata.<key> field, named specifically", () => {
      const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
        makeVariable({ key: "SHARED", documented: true, metadata: { rotationCadence: "30 days" } }),
      ])
      const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
        makeVariable({ key: "SHARED", documented: true, metadata: { rotationCadence: "90 days" } }),
      ])

      const issues = detectCompatibilityIssues([a, b])
      expect(issues).toHaveLength(1)
      expect(issues[0]?.reason).toContain("metadata.rotationCadence")
    })

    it("does not flag a metadata.<key> field holding structurally-identical objects, even across separately-constructed instances (ADR 0035)", () => {
      const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
        makeVariable({
          key: "SHARED",
          documented: true,
          metadata: { controls: { encryption: true, keyRotationDays: 90 } },
        }),
      ])
      const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
        makeVariable({
          key: "SHARED",
          documented: true,
          metadata: { controls: { encryption: true, keyRotationDays: 90 } },
        }),
      ])

      expect(detectCompatibilityIssues([a, b])).toHaveLength(0)
    })

    it("does not flag two documented declarations with identical metadata", () => {
      const shared = {
        description: "Shared secret",
        owner: "platform-team",
        metadata: { rotationCadence: "30 days" },
      }
      const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
        makeVariable({ key: "SHARED", documented: true, ...shared }),
      ])
      const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
        makeVariable({ key: "SHARED", documented: true, ...shared }),
      ])

      expect(detectCompatibilityIssues([a, b])).toHaveLength(0)
    })

    it("never fires when only one side (or neither) is documented -- nothing meaningful to compare", () => {
      const documented = makeContract("/repo/a/env.schema.ts", "aEnv", [
        makeVariable({ key: "SHARED", documented: true, description: "Documented side" }),
      ])
      const undocumented = makeContract("/repo/b/env.schema.ts", "bEnv", [
        makeVariable({ key: "SHARED", documented: false }),
      ])

      const issues = detectCompatibilityIssues([documented, undocumented])
      expect(
        issues.filter((issue) => issue.code === "DUPLICATE_VARIABLE_DOCUMENTATION"),
      ).toHaveLength(0)
    })
  })
})

describe("detectDuplicateVariableShapes", () => {
  // A "shape" is the tuple (valueType, hasProcessor, hasValidator). `number`
  // here comes from a statically-evaluated default; `processorReturnType`
  // wins over it wherever both exist.
  const numberShaped = (key: string): DiscoveredVariable =>
    makeVariable({
      key,
      hasDefault: true,
      defaultValue: { ok: true, value: 30 },
      hasProcessor: true,
      processorSource: "(v) => Number(v)",
      hasValidator: true,
      validatorSource: "(v) => v > 0",
    })

  it("flags a matching pair of differently-named variables in two different contracts", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [numberShaped("A_TIMEOUT")])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [numberShaped("B_TIMEOUT")])

    const issues = detectDuplicateVariableShapes([a, b])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe("DUPLICATE_VARIABLE_SHAPE_ACROSS_CONTRACTS")
    // Never blocking, under any flag -- see the function's own doc comment.
    expect(issues[0]?.severity).toBe("info")
    expect(issues[0]?.variable).toBe("A_TIMEOUT / B_TIMEOUT")
    expect(issues[0]?.files).toEqual(["/repo/a/env.schema.ts", "/repo/b/env.schema.ts"])
    expect(issues[0]?.reason).toBe(
      '"A_TIMEOUT" (aEnv) and "B_TIMEOUT" (bEnv) declare an identical shape (type number, processor: ' +
        "yes, validator: yes). Informational only -- they may be the same underlying value modelled " +
        "twice, or two unrelated values that happen to look alike. Nothing is required.",
    )
  })

  it("renders 'no' (not 'yes') in the reason for a matching pair that neither processes nor validates", () => {
    const plainShaped = (key: string): DiscoveredVariable =>
      makeVariable({ key, hasDefault: true, defaultValue: { ok: true, value: 30 } })
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [plainShaped("A_TIMEOUT")])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [plainShaped("B_TIMEOUT")])

    const issues = detectDuplicateVariableShapes([a, b])
    expect(issues[0]?.reason).toBe(
      '"A_TIMEOUT" (aEnv) and "B_TIMEOUT" (bEnv) declare an identical shape (type number, processor: ' +
        "no, validator: no). Informational only -- they may be the same underlying value modelled " +
        "twice, or two unrelated values that happen to look alike. Nothing is required.",
    )
  })

  it("does not flag a pair whose shapes differ in any single tuple element", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [numberShaped("A_TIMEOUT")])
    // Same valueType and processor, but no validator.
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({
        key: "B_TIMEOUT",
        hasDefault: true,
        defaultValue: { ok: true, value: 30 },
        hasProcessor: true,
        processorSource: "(v) => Number(v)",
      }),
    ])
    expect(detectDuplicateVariableShapes([a, b])).toEqual([])
  })

  it("does not flag a pair that differs ONLY in hasProcessor -- valueType and hasValidator both match", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({
        key: "A_TIMEOUT",
        hasDefault: true,
        defaultValue: { ok: true, value: 30 },
        hasProcessor: true,
        processorSource: "(v) => Number(v)",
        hasValidator: true,
        validatorSource: "(v) => v > 0",
      }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({
        key: "B_TIMEOUT",
        hasDefault: true,
        defaultValue: { ok: true, value: 30 },
        hasProcessor: false,
        hasValidator: true,
        validatorSource: "(v) => v > 0",
      }),
    ])
    expect(detectDuplicateVariableShapes([a, b])).toEqual([])
  })

  it("never infers a valueType from defaultValue when hasDefault is false -- a variable with no default stays unknown even if defaultValue is (implausibly) populated", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "A_THING", hasDefault: false, defaultValue: { ok: true, value: 5 } }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "B_THING", hasDefault: true, defaultValue: { ok: true, value: 10 } }),
    ])
    // Both would resolve to valueType "number" if `hasDefault` weren't
    // actually consulted -- must NOT match, since "a" is genuinely unknown.
    expect(detectDuplicateVariableShapes([a, b])).toEqual([])
  })

  it("never resolves a valueType from an unsuccessful default (ok: false), even with hasDefault true", () => {
    const unresolvedDefault = (key: string): DiscoveredVariable =>
      makeVariable({ key, hasDefault: true, defaultValue: { ok: false } })
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [unresolvedDefault("A_THING")])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [unresolvedDefault("B_THING")])
    // Both stay "unknown" -- an "unknown" shape never matches, including
    // against another identically-unknown one (see the dedicated test for
    // that rule below). If this ever wrongly resolved to a real type (e.g.
    // "undefined", from reading `.value` off an `{ok:false}` variant), the
    // two would spuriously match instead.
    expect(detectDuplicateVariableShapes([a, b])).toEqual([])
  })

  it("never throws when hasDefault is true but defaultValue itself is absent", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({ key: "A_THING", hasDefault: true, defaultValue: undefined }),
    ])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "B_THING", hasDefault: true, defaultValue: undefined }),
    ])
    expect(() => detectDuplicateVariableShapes([a, b])).not.toThrow()
    expect(detectDuplicateVariableShapes([a, b])).toEqual([])
  })

  it('never flags an "unknown" shape, even against another identically-unknown one', () => {
    // No processorReturnType and no statically-resolvable default -- the type
    // is genuinely unknown, and is never inferred from processor source text.
    const unknown = (key: string): DiscoveredVariable =>
      makeVariable({ key, hasProcessor: true, processorSource: "(v) => transform(v)" })
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [unknown("A_THING")])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [unknown("B_THING")])
    expect(detectDuplicateVariableShapes([a, b])).toEqual([])
  })

  it("exempts contracts in an exclusive group -- interchangeable alternatives are meant to look alike", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [numberShaped("A_TIMEOUT")], {
      exclusiveGroup: "database",
    })
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [numberShaped("B_TIMEOUT")], {
      exclusiveGroup: "database",
    })
    expect(detectDuplicateVariableShapes([a, b])).toEqual([])
  })

  it("exempts inactive contracts -- an unwired contract is not a live duplication", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [numberShaped("A_TIMEOUT")])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [numberShaped("B_TIMEOUT")], {
      active: false,
    })
    expect(detectDuplicateVariableShapes([a, b])).toEqual([])
  })

  it("never flags two same-shaped variables declared inside one contract", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      numberShaped("A_TIMEOUT"),
      numberShaped("A_RETRY_DELAY"),
    ])
    expect(detectDuplicateVariableShapes([a])).toEqual([])
  })

  it("still flags a matching pair sharing the same contractName but declared in different files -- the file/contractName skip-guard needs BOTH to match, not just one", () => {
    const a = makeContract("/repo/a/env.schema.ts", "sharedName", [numberShaped("A_TIMEOUT")])
    const b = makeContract("/repo/b/env.schema.ts", "sharedName", [numberShaped("B_TIMEOUT")])
    const issues = detectDuplicateVariableShapes([a, b])
    expect(issues).toHaveLength(1)
  })

  it("still flags a matching pair sharing the same declaring file but a different contractName", () => {
    const a = makeContract("/repo/shared.ts", "aEnv", [numberShaped("A_TIMEOUT")])
    const b = makeContract("/repo/shared.ts", "bEnv", [numberShaped("B_TIMEOUT")])
    const issues = detectDuplicateVariableShapes([a, b])
    expect(issues).toHaveLength(1)
  })

  it("never flags the same key across contracts -- that is detectCompatibilityIssues()'s concern", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [numberShaped("TIMEOUT")])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [numberShaped("TIMEOUT")])
    expect(detectDuplicateVariableShapes([a, b])).toEqual([])
  })

  it("emits one finding per matching pair, never a merged transitive cluster", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [numberShaped("A_TIMEOUT")])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [numberShaped("B_TIMEOUT")])
    const c = makeContract("/repo/c/env.schema.ts", "cEnv", [numberShaped("C_TIMEOUT")])

    const issues = detectDuplicateVariableShapes([a, b, c])
    expect(issues.map((i) => i.variable)).toEqual([
      "A_TIMEOUT / B_TIMEOUT",
      "A_TIMEOUT / C_TIMEOUT",
      "B_TIMEOUT / C_TIMEOUT",
    ])
  })

  it("sorts declarations by key before pairing -- discovered in reverse order, pairs still come out alphabetically", () => {
    const z = makeContract("/repo/z/env.schema.ts", "zEnv", [numberShaped("Z_TIMEOUT")])
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [numberShaped("B_TIMEOUT")])
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [numberShaped("A_TIMEOUT")])

    const issues = detectDuplicateVariableShapes([z, b, a])
    expect(issues.map((i) => i.variable)).toEqual([
      "A_TIMEOUT / B_TIMEOUT",
      "A_TIMEOUT / Z_TIMEOUT",
      "B_TIMEOUT / Z_TIMEOUT",
    ])
  })

  it("sorts by contractName when key is the same and by file when key and contractName both match -- the full tiebreak chain, exercised in reverse", () => {
    // Two pairs of SAME-key (so no cross-key match at all -- these exist
    // purely to prove `declarations.sort()`'s own tiebreak chain runs in the
    // right order internally); assert indirectly via a THIRD, differently-
    // shaped key that matches only one specific declaration, to observe
    // which declaration ends up adjacent to it after sorting is irrelevant
    // here -- instead, directly probe the sort by making contractName/file
    // the only distinguishing dimension across DIFFERENT keys.
    const zContractSameKeyShapeA = makeContract("/repo/z/env.schema.ts", "zEnv", [
      numberShaped("SHARED"),
    ])
    const aContractSameKeyShapeB = makeContract("/repo/a/env.schema.ts", "aEnv", [
      numberShaped("SHARED"),
    ])
    // Different key, same shape as both -- pairs with whichever "SHARED"
    // declaration sorts first once contractName breaks the key tie.
    const other = makeContract("/repo/other/env.schema.ts", "otherEnv", [
      numberShaped("OTHER_TIMEOUT"),
    ])

    const issues = detectDuplicateVariableShapes([
      zContractSameKeyShapeA,
      aContractSameKeyShapeB,
      other,
    ])
    // "aEnv" sorts before "zEnv" by contractName once both declare "SHARED"
    // -- so the first cross-key pair formed must be "OTHER_TIMEOUT /
    // SHARED" (declarations.sort() places aEnv's SHARED before zEnv's).
    expect(issues.map((i) => i.variable)).toEqual([
      "OTHER_TIMEOUT / SHARED",
      "OTHER_TIMEOUT / SHARED",
    ])
    expect(issues[0]?.files).toEqual(["/repo/other/env.schema.ts", "/repo/a/env.schema.ts"])
    expect(issues[1]?.files).toEqual(["/repo/other/env.schema.ts", "/repo/z/env.schema.ts"])
  })

  it("prefers an explicit processorReturnType over the default's typeof when both exist", () => {
    const a = makeContract("/repo/a/env.schema.ts", "aEnv", [
      makeVariable({
        key: "A_URL",
        hasDefault: true,
        defaultValue: { ok: true, value: "http://localhost" },
        hasProcessor: true,
        processorReturnType: "URL",
      }),
    ])
    // Same annotated return type, so these match despite one having no default.
    const b = makeContract("/repo/b/env.schema.ts", "bEnv", [
      makeVariable({ key: "B_URL", hasProcessor: true, processorReturnType: "URL" }),
    ])
    // A third whose only type evidence is a `string` default -- "string" is
    // not "URL", so it must not match either of the two above.
    const c = makeContract("/repo/c/env.schema.ts", "cEnv", [
      makeVariable({
        key: "C_URL",
        hasDefault: true,
        defaultValue: { ok: true, value: "http://localhost" },
        hasProcessor: true,
      }),
    ])

    expect(detectDuplicateVariableShapes([a, b, c]).map((i) => i.variable)).toEqual([
      "A_URL / B_URL",
    ])
  })
})
