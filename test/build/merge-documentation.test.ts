import { describe, expect, it } from "vitest"
import { mergeSharedDocumentation } from "../../src/build/merge-documentation.js"
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
    authenticatorType: undefined,
    rotationPeriod: undefined,
    lastRotatedAt: undefined,
    rotationTriggerEvents: undefined,
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

const origin = {
  packageName: "shared-package",
  packageDir: "/repo/node_modules/shared-package",
} as never

const variableOf = (contracts: readonly DiscoveredContract[], at: number): DiscoveredVariable => {
  const variable = contracts[at]?.variables[0]
  if (variable === undefined) throw new Error("no variable")
  return variable
}

const fromPackage = (path: string, name: string, vars: DiscoveredVariable[]) =>
  makeContract(`/repo/node_modules/shared-package/${path}`, name, vars, { packageOrigin: origin })

describe("mergeSharedDocumentation", () => {
  it("leaves a variable only one contract declares exactly as it is", () => {
    const only = makeContract("/repo/a.ts", "a", [
      makeVariable({ key: "ONLY", documented: true, description: "Mine" }),
    ])
    const other = makeContract("/repo/b.ts", "b", [makeVariable({ key: "OTHER" })])
    const merged = mergeSharedDocumentation([only, other])
    expect(merged[0]?.variables[0]).toBe(only.variables[0])
    expect(merged[1]?.variables[0]).toBe(other.variables[0])
  })

  it("lets the application add its own expiry to a variable the package already explains", () => {
    const shipped = makeContract(
      "/repo/node_modules/shared-package/env.ts",
      "shippedEnv",
      [
        makeVariable({
          key: "TOKEN",
          documented: true,
          description: "Explained once",
          refreshInstructions: "Ask the package",
          sensitivity: "secret",
        }),
      ],
      { packageOrigin: origin },
    )
    const own = makeContract("/repo/ci/env.ts", "ownEnv", [
      makeVariable({ key: "TOKEN", documented: true, expiresAt: "2027-01-01", owner: "me" }),
    ])
    const merged = mergeSharedDocumentation([shipped, own])
    expect(variableOf(merged, 1)).toMatchObject({
      description: "Explained once",
      refreshInstructions: "Ask the package",
      sensitivity: "secret",
      expiresAt: "2027-01-01",
      owner: "me",
    })
    // The package's own declaration learns the application's expiry too, so both say the same thing.
    expect(variableOf(merged, 0)).toMatchObject({
      description: "Explained once",
      expiresAt: "2027-01-01",
      owner: "me",
    })
  })

  it("never replaces a field a declaration sets itself", () => {
    const shipped = fromPackage("a.ts", "a", [
      makeVariable({ key: "X", documented: true, description: "Package's own", required: false }),
    ])
    const own = makeContract("/repo/b.ts", "b", [
      makeVariable({ key: "X", documented: true, description: "App's own", required: true }),
    ])
    const merged = mergeSharedDocumentation([shipped, own])
    expect(variableOf(merged, 0)).toMatchObject({ description: "Package's own", required: false })
    expect(variableOf(merged, 1)).toMatchObject({ description: "App's own", required: true })
  })

  it("leaves a package's lone declaration exactly as it is", () => {
    const only = fromPackage("a.ts", "a", [makeVariable({ key: "X", documented: true })])
    expect(mergeSharedDocumentation([only])[0]?.variables[0]).toBe(only.variables[0])
  })

  it("fills a gap from a package's contract before the application's, whatever order they were found in", () => {
    const ownFirst = makeContract("/repo/own.ts", "own", [
      makeVariable({ key: "X", documented: true, description: "From the application" }),
    ])
    const gap = makeContract("/repo/gap.ts", "gap", [makeVariable({ key: "X", documented: true })])
    const shipped = makeContract(
      "/repo/node_modules/shared-package/env.ts",
      "shipped",
      [makeVariable({ key: "X", documented: true, description: "From the package" })],
      { packageOrigin: origin },
    )
    expect(variableOf(mergeSharedDocumentation([ownFirst, gap, shipped]), 1).description).toBe(
      "From the package",
    )
    expect(variableOf(mergeSharedDocumentation([shipped, ownFirst, gap]), 2).description).toBe(
      "From the package",
    )
    expect(variableOf(mergeSharedDocumentation([ownFirst, shipped, gap]), 2).description).toBe(
      "From the package",
    )
  })

  it("skips a donor that leaves the field unset for the first one that sets it", () => {
    const gap = makeContract("/repo/gap.ts", "gap", [makeVariable({ key: "X", documented: true })])
    const silent = makeContract(
      "/repo/node_modules/shared-package/silent.ts",
      "silent",
      [makeVariable({ key: "X", documented: true })],
      { packageOrigin: origin },
    )
    const sets = makeContract(
      "/repo/node_modules/shared-package/sets.ts",
      "sets",
      [makeVariable({ key: "X", documented: true, description: "Set later" })],
      { packageOrigin: origin },
    )
    expect(variableOf(mergeSharedDocumentation([gap, silent, sets]), 0).description).toBe(
      "Set later",
    )
    expect(variableOf(mergeSharedDocumentation([gap, sets, silent]), 0).description).toBe(
      "Set later",
    )
  })

  it("takes the first of several packages' contracts, and never fills one application contract from another", () => {
    const first = makeContract(
      "/repo/node_modules/a/env.ts",
      "first",
      [makeVariable({ key: "X", documented: true, description: "First" })],
      { packageOrigin: origin },
    )
    const second = makeContract(
      "/repo/node_modules/b/env.ts",
      "second",
      [makeVariable({ key: "X", documented: true, description: "Second" })],
      { packageOrigin: origin },
    )
    const gap = makeContract("/repo/gap.ts", "gap", [makeVariable({ key: "X", documented: true })])
    expect(variableOf(mergeSharedDocumentation([first, second, gap]), 2).description).toBe("First")
    const sibling = makeContract("/repo/sibling.ts", "sibling", [
      makeVariable({ key: "X", documented: true, description: "Sibling", owner: "sibling-team" }),
    ])
    const merged = mergeSharedDocumentation([gap, sibling])
    expect(variableOf(merged, 0)).toMatchObject({ description: undefined, owner: undefined })
    expect(variableOf(merged, 1)).toMatchObject({ description: "Sibling", owner: "sibling-team" })
  })

  it("merges metadata key by key, keeping the declaration's own value and taking the first package's over a later one's", () => {
    const shipped = makeContract(
      "/repo/node_modules/shared-package/env.ts",
      "shipped",
      [
        makeVariable({
          key: "X",
          documented: true,
          metadata: { team: "package", tier: 1, rotation: "30 days" },
        }),
      ],
      { packageOrigin: origin },
    )
    const sibling = makeContract(
      "/repo/node_modules/other-package/env.ts",
      "sibling",
      [
        makeVariable({
          key: "X",
          documented: true,
          metadata: { team: "sibling", region: "eu", tier: 9 },
        }),
      ],
      { packageOrigin: origin },
    )
    const own = makeContract("/repo/own.ts", "own", [
      makeVariable({ key: "X", documented: true, metadata: { rotation: "90 days" } }),
    ])
    const merged = mergeSharedDocumentation([own, shipped, sibling])
    expect(variableOf(merged, 0).metadata).toEqual({
      team: "package",
      tier: 1,
      region: "eu",
      rotation: "90 days",
    })
  })

  it("fills a package's gap from the application only when every application contract that sets it agrees", () => {
    const shipped = fromPackage("env.ts", "shipped", [makeVariable({ key: "X", documented: true })])
    const primary = makeContract("/repo/primary.ts", "primary", [
      makeVariable({ key: "X", documented: true, owner: "db-team", description: "Same" }),
    ])
    const replica = makeContract("/repo/replica.ts", "replica", [
      makeVariable({ key: "X", documented: true, owner: "replica-team", description: "Same" }),
    ])
    const silent = makeContract("/repo/silent.ts", "silent", [
      makeVariable({ key: "X", documented: true }),
    ])
    // Two alternatives that disagree: the shared package takes neither owner, but the description they share.
    expect(variableOf(mergeSharedDocumentation([shipped, primary, replica]), 0)).toMatchObject({
      owner: undefined,
      description: "Same",
    })
    expect(
      variableOf(mergeSharedDocumentation([shipped, replica, primary]), 0).owner,
    ).toBeUndefined()
    // One that sets it and one that leaves it unset do not disagree.
    expect(variableOf(mergeSharedDocumentation([shipped, silent, primary]), 0).owner).toBe(
      "db-team",
    )
  })

  it("leaves metadata unset when the application contracts disagree on every key, and fills from a package beside one", () => {
    const gap = fromPackage("gap.ts", "gap", [makeVariable({ key: "X", documented: true })])
    const primary = makeContract("/repo/primary.ts", "primary", [
      makeVariable({ key: "X", documented: true, metadata: { region: "eu" } }),
    ])
    const replica = makeContract("/repo/replica.ts", "replica", [
      makeVariable({ key: "X", documented: true, metadata: { region: "us" } }),
    ])
    expect(
      variableOf(mergeSharedDocumentation([gap, primary, replica]), 0).metadata,
    ).toBeUndefined()
    // One package's declaration and one application's: the package's description fills the gap.
    const shipped = fromPackage("env.ts", "shipped", [
      makeVariable({ key: "X", documented: true, description: "From the package" }),
    ])
    expect(variableOf(mergeSharedDocumentation([gap, shipped, primary]), 0).description).toBe(
      "From the package",
    )
  })

  it("applies the same agreement to metadata, key by key, and keeps a package's own key first", () => {
    const shipped = fromPackage("env.ts", "shipped", [
      makeVariable({ key: "X", documented: true, metadata: { tier: 1 } }),
    ])
    const other = fromPackage("other.ts", "other", [
      makeVariable({ key: "X", documented: true, metadata: { tier: 2, team: "package" } }),
    ])
    const gap = fromPackage("gap.ts", "gap", [makeVariable({ key: "X", documented: true })])
    const primary = makeContract("/repo/primary.ts", "primary", [
      makeVariable({
        key: "X",
        documented: true,
        metadata: { region: "eu", team: "app", tier: 7 },
      }),
    ])
    const replica = makeContract("/repo/replica.ts", "replica", [
      makeVariable({ key: "X", documented: true, metadata: { region: "us", team: "app" } }),
    ])
    expect(variableOf(mergeSharedDocumentation([gap, primary, replica]), 0).metadata).toEqual({
      team: "app",
      tier: 7,
    })
    expect(
      variableOf(mergeSharedDocumentation([gap, shipped, other, primary]), 0).metadata,
    ).toEqual({
      tier: 1,
      team: "package",
      region: "eu",
    })
  })

  it("leaves metadata unset when no declaration has any", () => {
    const a = makeContract("/repo/a.ts", "a", [makeVariable({ key: "X", documented: true })])
    const b = fromPackage("b.ts", "b", [makeVariable({ key: "X", documented: true })])
    expect(variableOf(mergeSharedDocumentation([a, b]), 0).metadata).toBeUndefined()
  })

  it("takes metadata a declaration lacks wholly from the others", () => {
    const a = makeContract("/repo/a.ts", "a", [makeVariable({ key: "X", documented: true })])
    const b = makeContract(
      "/repo/node_modules/shared-package/b.ts",
      "b",
      [makeVariable({ key: "X", documented: true, metadata: { team: "b" } })],
      { packageOrigin: origin },
    )
    expect(variableOf(mergeSharedDocumentation([a, b]), 0).metadata).toEqual({ team: "b" })
  })

  it("counts a variable as documented when another declaration of it is", () => {
    const bare = makeContract("/repo/bare.ts", "bare", [makeVariable({ key: "X" })])
    const documented = makeContract(
      "/repo/node_modules/shared-package/doc.ts",
      "doc",
      [makeVariable({ key: "X", documented: true, description: "Said" })],
      { packageOrigin: origin },
    )
    const merged = mergeSharedDocumentation([bare, documented])
    expect(variableOf(merged, 0)).toMatchObject({ documented: true, description: "Said" })
    const neither = mergeSharedDocumentation([
      makeContract("/repo/n1.ts", "n1", [makeVariable({ key: "Y" })]),
      fromPackage("n2.ts", "n2", [makeVariable({ key: "Y" })]),
    ])
    expect(variableOf(neither, 0).documented).toBe(false)
  })

  it("counts a variable as documented when any one of several other declarations is", () => {
    const bare = makeContract("/repo/bare.ts", "bare", [makeVariable({ key: "X" })])
    const silent = fromPackage("silent.ts", "silent", [makeVariable({ key: "X" })])
    const documented = makeContract(
      "/repo/node_modules/shared-package/doc.ts",
      "doc",
      [makeVariable({ key: "X", documented: true })],
      { packageOrigin: origin },
    )
    expect(variableOf(mergeSharedDocumentation([bare, silent, documented]), 0).documented).toBe(
      true,
    )
    expect(variableOf(mergeSharedDocumentation([bare, documented, silent]), 0).documented).toBe(
      true,
    )
  })

  it("compares nothing across variables with different names, and does not change its input", () => {
    const a = makeContract("/repo/a.ts", "a", [
      makeVariable({ key: "A", documented: true, description: "A" }),
    ])
    const b = makeContract("/repo/b.ts", "b", [makeVariable({ key: "B" })])
    const before = JSON.stringify([a, b])
    const merged = mergeSharedDocumentation([a, b])
    expect(variableOf(merged, 1).description).toBeUndefined()
    expect(JSON.stringify([a, b])).toBe(before)
  })

  it("fills every kind of documentation field", () => {
    const full: Partial<DiscoveredVariable> = {
      description: "d",
      owner: "o",
      sensitivity: "s",
      expiresAt: "2027-01-01",
      refreshInstructions: "r",
      authenticatorType: "api-key",
      rotationPeriod: "90d",
      lastRotatedAt: "2026-01-01",
      rotationTriggerEvents: ["breach"],
      setupInstructions: "i",
      required: true,
      deprecated: true,
      deprecatedReason: "why",
      removeBy: "2028-01-01",
      renamedFrom: "OLD",
      purpose: "p",
      legalBasis: "l",
      retention: "1y",
      dataResidency: ["eu"],
      auditRequired: true,
    }
    const donor = makeContract(
      "/repo/node_modules/shared-package/donor.ts",
      "donor",
      [makeVariable({ key: "X", documented: true, ...full })],
      { packageOrigin: origin },
    )
    const gap = makeContract("/repo/gap.ts", "gap", [makeVariable({ key: "X", documented: true })])
    expect(variableOf(mergeSharedDocumentation([gap, donor]), 0)).toMatchObject(full)
  })

  it("keeps evidence with the contract that cites it, never copying a package's citations", () => {
    const donor = makeContract(
      "/repo/node_modules/shared-package/donor.ts",
      "donor",
      [makeVariable({ key: "X", documented: true, evidence: { verifiedAt: "x" } as never })],
      { packageOrigin: origin },
    )
    const gap = makeContract("/repo/gap.ts", "gap", [makeVariable({ key: "X", documented: true })])
    expect(variableOf(mergeSharedDocumentation([gap, donor]), 0).evidence).toBeUndefined()
  })
})
