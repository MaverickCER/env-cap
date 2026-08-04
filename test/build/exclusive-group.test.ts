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
    expiresAt: undefined,
    metadata: undefined,
    variables: [],
    documented: false,
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
})
