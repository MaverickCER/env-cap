import { describe, it, expect } from "vitest"
import { detectExclusiveGroupIssues } from "../../src/build/exclusive-group.js"
import type { DiscoveredContract } from "../../src/build/link.js"

function makeContract(
  overrides: Partial<DiscoveredContract> & { file: string; exportName: string },
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
    variables: [],
    documented: false,
    declaration: { file: overrides.file, line: 1, column: 1 },
    documentation: undefined,
    packageOrigin: undefined,
    ...overrides,
  }
}

describe("detectExclusiveGroupIssues", () => {
  it("does not flag a single active contract in a group", () => {
    const postgres = makeContract({
      file: "/repo/postgres/env.schema.ts",
      exportName: "postgresEnv",
      contractName: "postgres",
      exclusiveGroup: "database",
    })
    expect(detectExclusiveGroupIssues([postgres])).toHaveLength(0)
  })

  it("does not flag contracts with no exclusiveGroup at all", () => {
    const a = makeContract({ file: "/repo/a/env.schema.ts", exportName: "aEnv", contractName: "a" })
    const b = makeContract({ file: "/repo/b/env.schema.ts", exportName: "bEnv", contractName: "b" })
    expect(detectExclusiveGroupIssues([a, b])).toHaveLength(0)
  })

  it("errors when two ACTIVE contracts share an exclusiveGroup", () => {
    const postgres = makeContract({
      file: "/repo/postgres/env.schema.ts",
      exportName: "postgresEnv",
      contractName: "postgres",
      exclusiveGroup: "database",
    })
    const mongo = makeContract({
      file: "/repo/mongo/env.schema.ts",
      exportName: "mongoEnv",
      contractName: "mongo",
      exclusiveGroup: "database",
    })

    const issues = detectExclusiveGroupIssues([postgres, mongo])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe("error")
    expect(issues[0]?.variable).toBe('Exclusive group "database"')
    expect(issues[0]?.files).toEqual(["/repo/postgres/env.schema.ts", "/repo/mongo/env.schema.ts"])
    expect(issues[0]?.reason).toContain("postgres")
    expect(issues[0]?.reason).toContain("mongo")
  })

  it("does not flag two contracts sharing a group when one of them is inactive", () => {
    const postgres = makeContract({
      file: "/repo/postgres/env.schema.ts",
      exportName: "postgresEnv",
      contractName: "postgres",
      exclusiveGroup: "database",
    })
    const mongo = makeContract({
      file: "/repo/mongo/env.schema.ts",
      exportName: "mongoEnv",
      contractName: "mongo",
      exclusiveGroup: "database",
      active: false,
    })

    expect(detectExclusiveGroupIssues([postgres, mongo])).toHaveLength(0)
  })

  it("emits one issue per pair for a group with three or more active members", () => {
    const make = (name: string) =>
      makeContract({
        file: `/repo/${name}/env.schema.ts`,
        exportName: `${name}Env`,
        contractName: name,
        exclusiveGroup: "database",
      })

    const issues = detectExclusiveGroupIssues([make("a"), make("b"), make("c")])
    expect(issues).toHaveLength(3) // (a,b) (a,c) (b,c)
    expect(issues.every((issue) => issue.severity === "error")).toBe(true)
  })

  it("orders issues by group name, alphabetically -- not by declaration/discovery order", () => {
    const make = (group: string) =>
      makeContract({
        file: `/repo/${group}-a/env.schema.ts`,
        exportName: `${group}AEnv`,
        contractName: `${group}A`,
        exclusiveGroup: group,
      })
    const makeB = (group: string) =>
      makeContract({
        file: `/repo/${group}-b/env.schema.ts`,
        exportName: `${group}BEnv`,
        contractName: `${group}B`,
        exclusiveGroup: group,
      })

    // Declared "zebra" group first, "database" group second -- the reverse
    // of alphabetical order.
    const issues = detectExclusiveGroupIssues([
      make("zebra"),
      makeB("zebra"),
      make("database"),
      makeB("database"),
    ])
    expect(issues.map((issue) => issue.variable)).toEqual([
      'Exclusive group "database"',
      'Exclusive group "zebra"',
    ])
  })

  it("reports the exact, full reason text for a violation", () => {
    const postgres = makeContract({
      file: "/repo/postgres/env.schema.ts",
      exportName: "postgresEnv",
      contractName: "postgres",
      exclusiveGroup: "database",
    })
    const mongo = makeContract({
      file: "/repo/mongo/env.schema.ts",
      exportName: "mongoEnv",
      contractName: "mongo",
      exclusiveGroup: "database",
    })

    const issue = detectExclusiveGroupIssues([postgres, mongo])[0]! // one conflict in, one issue out
    expect(issue.variable).toBe('Exclusive group "database"')
    expect(issue.reason).toBe(
      '"postgres" and "mongo" are both active and both declare exclusiveGroup ' +
        '"database" -- only one active contract per exclusive group is allowed. Set active: false on ' +
        "whichever one isn't in use.",
    )
  })
})
