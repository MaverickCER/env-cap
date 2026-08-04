import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  renderEnvExample,
  extractDeclaredVariables,
  extractCommentedVariables,
  computeReconciliation,
  writeEnvExample,
} from "../../src/build/env-example.js"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"
import type { EnvExampleResult } from "../../src/build/env-example.js"

/** Narrows `EnvExampleResult.writtenPath` for tests that know, by construction, that a mode other than "skip" was used. */
function assertWritten(result: EnvExampleResult): string {
  if (result.writtenPath === undefined) throw new Error("expected writtenPath to be defined")
  return result.writtenPath
}

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

function contracts(): DiscoveredContract[] {
  return [
    makeContract({
      file: "/repo/features/payments/env.schema.ts",
      exportName: "paymentsEnv",
      contractName: "payments",
      variables: [
        makeVariable({
          key: "STRIPE_KEY",
          hasProcessor: true,
          description: "Stripe secret key",
          extra: {
            documentation: "https://dashboard.stripe.com/apikeys",
            setup: "Create a restricted API key in the Stripe dashboard.",
            rotation: "Rotate every 90 days.",
            lastRotation: "2024-06-01",
          },
        }),
      ],
    }),
    makeContract({
      file: "/repo/packages/database/env.schema.ts",
      exportName: "databaseEnv",
      contractName: "database",
      variables: [
        makeVariable({
          key: "PORT",
          hasDefault: true,
          defaultValue: { ok: true, value: 5432 },
          hasProcessor: true,
          description: "Database port",
        }),
      ],
    }),
  ]
}

describe("renderEnvExample", () => {
  it("lists every discovered variable with its description and a literal default when known", () => {
    const output = renderEnvExample(contracts())

    expect(output).toContain("# AUTO-GENERATED EXAMPLE FILE.")
    expect(output).toContain("# Stripe secret key")
    expect(output).toContain("STRIPE_KEY=")
    expect(output).toContain("# Database port")
    expect(output).toContain("PORT=5432")
  })

  it("renders every documentation field, not just description, above the variable", () => {
    const output = renderEnvExample(contracts())
    const stripeBlock = output.slice(
      output.indexOf("# Stripe secret key"),
      output.indexOf("STRIPE_KEY="),
    )

    expect(stripeBlock).toContain("# Stripe secret key")
    expect(stripeBlock).toContain("# Documentation: https://dashboard.stripe.com/apikeys")
    expect(stripeBlock).toContain("# Setup: Create a restricted API key in the Stripe dashboard.")
    expect(stripeBlock).toContain("# Rotation: Rotate every 90 days.")
    expect(stripeBlock).toContain("# Last Rotation: 2024-06-01")
    // Description is the plain leading comment, never labeled "# Description: ...".
    expect(stripeBlock).not.toContain("# Description:")
  })

  it("renders Owner/Expires At/Refresh Instructions/Required comments when the variable sets them", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [
        makeVariable({
          key: "FULL_META",
          owner: "payments-team",
          expiresAt: "2030-01-01",
          refreshInstructions: "Rotate via the vault CLI.",
          required: true,
        }),
      ],
    })
    const output = renderEnvExample([contract])

    expect(output).toContain("# Owner: payments-team")
    expect(output).toContain("# Expires At: 2030-01-01")
    expect(output).toContain("# Refresh Instructions: Rotate via the vault CLI.")
    expect(output).toContain("# Required: yes")
  })

  it("renders a string and a boolean literal default, and falls back to empty for a non-primitive default", () => {
    const contract = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      variables: [
        makeVariable({
          key: "STRING_DEFAULT",
          hasDefault: true,
          defaultValue: { ok: true, value: "production" },
        }),
        makeVariable({
          key: "BOOL_DEFAULT",
          hasDefault: true,
          defaultValue: { ok: true, value: true },
        }),
        makeVariable({
          key: "OBJECT_DEFAULT",
          hasDefault: true,
          defaultValue: { ok: true, value: { nested: true } },
        }),
      ],
    })
    const output = renderEnvExample([contract])

    expect(output).toContain("STRING_DEFAULT=production")
    expect(output).toContain("BOOL_DEFAULT=true")
    expect(output).toContain("OBJECT_DEFAULT=\n")
  })

  it("is deterministic regardless of input order", () => {
    const [payments, database] = contracts()
    const a = renderEnvExample([payments, database])
    const b = renderEnvExample([database, payments])
    expect(a).toBe(b)
  })

  it("handles two contracts declared in the same schema file (sort comparator's equal-file case)", () => {
    const first = makeContract({
      file: "/repo/shared/env.schema.ts",
      exportName: "firstEnv",
      contractName: "first",
      variables: [makeVariable({ key: "FIRST_KEY" })],
    })
    const second = makeContract({
      file: "/repo/shared/env.schema.ts",
      exportName: "secondEnv",
      contractName: "second",
      variables: [makeVariable({ key: "SECOND_KEY" })],
    })
    const output = renderEnvExample([first, second])
    expect(output).toContain("FIRST_KEY=")
    expect(output).toContain("SECOND_KEY=")
  })

  it("dedups a variable declared by multiple active contracts: first (by file order) live, rest commented with a pointer", () => {
    const a = makeContract({
      file: "/repo/a/env.schema.ts",
      exportName: "aEnv",
      contractName: "a",
      variables: [makeVariable({ key: "SHARED", description: "shared var" })],
    })
    const b = makeContract({
      file: "/repo/b/env.schema.ts",
      exportName: "bEnv",
      contractName: "b",
      variables: [makeVariable({ key: "SHARED" })],
    })

    const output = renderEnvExample([a, b])
    expect(output.match(/^SHARED=/gm)).toHaveLength(1)
    expect(output.match(/^# SHARED=/gm)).toHaveLength(1)
    expect(output).toContain('# Also declared by "b" -- see "a" above.')
  })

  it("never shows a disabled contract's variable when an active contract already declares the same key", () => {
    const postgres = makeContract({
      file: "/repo/postgres/env.schema.ts",
      exportName: "postgresEnv",
      contractName: "postgres",
      variables: [makeVariable({ key: "DATABASE_URL" })],
    })
    const mongo = makeContract({
      file: "/repo/mongo/env.schema.ts",
      exportName: "mongoEnv",
      contractName: "mongo",
      active: false,
      variables: [makeVariable({ key: "DATABASE_URL" })],
    })

    const output = renderEnvExample([postgres, mongo])
    expect(output.match(/DATABASE_URL=/g)).toHaveLength(1) // exactly one occurrence anywhere, live or commented
    expect(output).not.toContain("Disabled")
  })

  it("includes a disabled contract's unique variable, commented out, with its default value", () => {
    const postgres = makeContract({
      file: "/repo/postgres/env.schema.ts",
      exportName: "postgresEnv",
      contractName: "postgres",
      variables: [makeVariable({ key: "DATABASE_URL" })],
    })
    const mongo = makeContract({
      file: "/repo/mongo/env.schema.ts",
      exportName: "mongoEnv",
      contractName: "mongo",
      active: false,
      variables: [
        makeVariable({
          key: "MONGODB_REPLICA_SET",
          hasDefault: true,
          defaultValue: { ok: true, value: "rs0" },
          description: "Mongo replica set name",
        }),
      ],
    })

    const output = renderEnvExample([postgres, mongo])
    expect(output).toContain('# Disabled -- feature "mongo" is not active.')
    expect(output).toContain("# Mongo replica set name")
    expect(output).toContain("# MONGODB_REPLICA_SET=rs0")
    expect(output).not.toMatch(/^MONGODB_REPLICA_SET=/m) // never live
  })

  it("omits any disabled-section content when nothing is inactive", () => {
    const output = renderEnvExample(contracts())
    expect(output).not.toContain("Disabled")
  })
})

describe("extractDeclaredVariables", () => {
  it("extracts KEY names, ignoring comments and blank lines", () => {
    const names = extractDeclaredVariables(
      "# a comment\n\nSTRIPE_KEY=sk_test\nPORT=5432\n# PORT=commented_out\n",
    )
    expect(names).toEqual(["STRIPE_KEY", "PORT"])
  })

  it("returns an empty array for an empty or comment-only file", () => {
    expect(extractDeclaredVariables("")).toEqual([])
    expect(extractDeclaredVariables("# nothing here\n")).toEqual([])
  })
})

describe("extractCommentedVariables", () => {
  it("extracts KEY names from commented-out `# KEY=value` lines", () => {
    const names = extractCommentedVariables(
      "STRIPE_KEY=sk_test\n# PORT=5432\n#   MONGODB_URI=mongodb://x\n",
    )
    expect(names).toEqual(["PORT", "MONGODB_URI"])
  })

  it("does not mistake a plain comment for a commented-out variable", () => {
    expect(extractCommentedVariables('# just a note\n# Also declared by "x" above.\n')).toEqual([])
  })

  it("returns an empty array for a file with nothing commented out", () => {
    expect(extractCommentedVariables("STRIPE_KEY=sk_test\n")).toEqual([])
  })
})

describe("computeReconciliation", () => {
  it("flags a variable no schema declares anymore, whether it was live or already commented", () => {
    const active = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        variables: [makeVariable({ key: "FOO" })],
      }),
    ]
    const reconciliation = computeReconciliation(
      active,
      "FOO=x\nLEGACY_LIVE=1\n# LEGACY_COMMENTED=2\n",
    )
    expect(reconciliation.staleVariables).toEqual(["LEGACY_COMMENTED", "LEGACY_LIVE"])
    expect(reconciliation.variablesToComment).toEqual([])
    expect(reconciliation.variablesToAdd).toEqual([])
  })

  it("flags a live variable whose only declaring feature became inactive", () => {
    const inactive = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        active: false,
        variables: [makeVariable({ key: "FOO" })],
      }),
    ]
    const reconciliation = computeReconciliation(inactive, "FOO=x\n")
    expect(reconciliation.variablesToComment).toEqual(["FOO"])
    expect(reconciliation.staleVariables).toEqual([])
  })

  it("never flags a variable for commenting when another active contract still requires it", () => {
    const mixed = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        variables: [makeVariable({ key: "SHARED" })],
      }), // active
      makeContract({
        file: "/repo/b/env.schema.ts",
        exportName: "bEnv",
        contractName: "b",
        active: false,
        variables: [makeVariable({ key: "SHARED" })],
      }),
    ]
    const reconciliation = computeReconciliation(mixed, "SHARED=x\n")
    expect(reconciliation.variablesToComment).toEqual([])
    expect(reconciliation.staleVariables).toEqual([])
  })

  it("flags a required variable missing from the existing file, whether absent or only commented out", () => {
    const active = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        variables: [makeVariable({ key: "NEW_VAR" }), makeVariable({ key: "WAS_COMMENTED" })],
      }),
    ]
    const reconciliation = computeReconciliation(active, "# WAS_COMMENTED=x\n")
    expect(reconciliation.variablesToAdd).toEqual(["NEW_VAR", "WAS_COMMENTED"])
  })

  it("reports nothing to change when the existing file already matches the current configuration", () => {
    const active = [
      makeContract({
        file: "/repo/a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a",
        variables: [makeVariable({ key: "FOO" })],
      }),
    ]
    const reconciliation = computeReconciliation(active, "FOO=x\n")
    expect(reconciliation).toEqual({
      staleVariables: [],
      variablesToComment: [],
      variablesToAdd: [],
    })
  })
})

describe("writeEnvExample", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-env-example-test-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("writes directly to the requested location when nothing exists there yet", async () => {
    const location = path.join(root, ".env.example")
    const result = await writeEnvExample(contracts(), location)

    expect(result.writtenPath).toBe(location)
    expect(result.skippedExistingPath).toBeUndefined()
    expect(result.staleVariables).toEqual([])
    expect(result.variablesToComment).toEqual([])
    expect(result.variablesToAdd).toEqual([])

    const written = await fs.readFile(location, "utf8")
    expect(written).toContain("STRIPE_KEY=")
  })

  it("never overwrites an existing file -- writes a timestamped sibling instead", async () => {
    const location = path.join(root, ".env.example")
    await fs.writeFile(location, "STRIPE_KEY=sk_hand_written\n", "utf8")

    const result = await writeEnvExample(contracts(), location)

    expect(result.skippedExistingPath).toBe(location)
    const writtenPath = assertWritten(result)
    expect(writtenPath).not.toBe(location)
    expect(writtenPath.startsWith(`${location}.`)).toBe(true)

    const original = await fs.readFile(location, "utf8")
    expect(original).toBe("STRIPE_KEY=sk_hand_written\n")
  })

  it("reports variables in an existing file that no discovered contract declares anymore", async () => {
    const location = path.join(root, ".env.example")
    await fs.writeFile(location, "STRIPE_KEY=x\nPORT=1\nLEGACY_FEATURE_FLAG=true\n", "utf8")

    const result = await writeEnvExample(contracts(), location)

    expect(result.staleVariables).toEqual(["LEGACY_FEATURE_FLAG"])
  })

  it("reports no stale variables when every existing entry is still discovered", async () => {
    const location = path.join(root, ".env.example")
    await fs.writeFile(location, "STRIPE_KEY=x\nPORT=1\n", "utf8")

    const result = await writeEnvExample(contracts(), location)

    expect(result.staleVariables).toEqual([])
  })

  it("prepends a reconciliation header to the sibling file, with only the non-empty sections", async () => {
    const location = path.join(root, ".env.example")
    // Existing file: missing a required var, has a stale one, and still has a
    // live entry for a variable whose feature just went inactive.
    await fs.writeFile(location, "STRIPE_KEY=x\nLEGACY_FEATURE_FLAG=true\n", "utf8")

    const contractsWithInactive = [
      ...contracts(),
      makeContract({
        file: "/repo/mongo/env.schema.ts",
        exportName: "mongoEnv",
        contractName: "mongo-shadow",
        active: false,
        variables: [makeVariable({ key: "STRIPE_KEY" })],
      }),
    ]
    const result = await writeEnvExample(contractsWithInactive, location)

    expect(result.staleVariables).toEqual(["LEGACY_FEATURE_FLAG"])
    expect(result.variablesToAdd).toEqual(["PORT"])

    const written = await fs.readFile(assertWritten(result), "utf8")
    expect(written).toContain(
      "# Remove the following variables (no longer declared by any feature):",
    )
    expect(written).toContain("#   - LEGACY_FEATURE_FLAG")
    expect(written).toContain(
      "# Add the following variables (required by the current configuration):",
    )
    expect(written).toContain("#   - PORT")
    // STRIPE_KEY is still required by the (active) payments contract, so even
    // though "mongo-shadow" also declares it while inactive, it must never
    // show up in a "comment the following" section.
    expect(written).not.toContain("Comment the following variables")
  })

  it("includes a 'Comment the following variables' section when a live entry's only feature just went inactive", async () => {
    const location = path.join(root, ".env.example")
    await fs.writeFile(location, "STRIPE_KEY=x\nPORT=1\nLEGACY_ONLY=1\n", "utf8")

    const inactiveOnly = [
      ...contracts(),
      makeContract({
        file: "/repo/legacy/env.schema.ts",
        exportName: "legacyEnv",
        contractName: "legacy",
        active: false,
        variables: [makeVariable({ key: "LEGACY_ONLY" })],
      }),
    ]
    const result = await writeEnvExample(inactiveOnly, location)

    expect(result.variablesToComment).toEqual(["LEGACY_ONLY"])

    const written = await fs.readFile(assertWritten(result), "utf8")
    expect(written).toContain(
      "# Comment the following variables (their feature is no longer active):",
    )
    expect(written).toContain("#   - LEGACY_ONLY")
  })

  it("writes no reconciliation header when the sibling would report nothing to change", async () => {
    const location = path.join(root, ".env.example")
    await fs.writeFile(location, "STRIPE_KEY=x\nPORT=1\n", "utf8")

    const result = await writeEnvExample(contracts(), location)

    expect(result.staleVariables).toEqual([])
    expect(result.variablesToComment).toEqual([])
    expect(result.variablesToAdd).toEqual([])

    const written = await fs.readFile(assertWritten(result), "utf8")
    expect(written).not.toContain("Remove the following")
    expect(written).not.toContain("Comment the following")
    expect(written).not.toContain("Add the following")
  })

  describe("onExisting", () => {
    it.each(["keep-sibling", "overwrite", "skip"] as const)(
      "writes directly to the location when nothing exists there yet, regardless of onExisting (%s)",
      async (onExisting) => {
        const location = path.join(root, ".env.example")
        const result = await writeEnvExample(contracts(), location, { onExisting })

        expect(result.writtenPath).toBe(location)
        expect(result.skippedExistingPath).toBeUndefined()
        const written = await fs.readFile(location, "utf8")
        expect(written).toContain("STRIPE_KEY=")
      },
    )

    it('"overwrite" replaces the existing file directly, with no reconciliation header (the changes are already applied)', async () => {
      const location = path.join(root, ".env.example")
      await fs.writeFile(location, "STRIPE_KEY=sk_hand_written\nLEGACY_FEATURE_FLAG=true\n", "utf8")

      const result = await writeEnvExample(contracts(), location, { onExisting: "overwrite" })

      expect(result.writtenPath).toBe(location)
      expect(result.skippedExistingPath).toBeUndefined()
      // Reconciliation is still computed and returned as a diagnostic, even
      // though the change was applied directly rather than left for a human.
      expect(result.staleVariables).toEqual(["LEGACY_FEATURE_FLAG"])
      expect(result.variablesToAdd).toEqual(["PORT"])

      const written = await fs.readFile(location, "utf8")
      expect(written).toContain("STRIPE_KEY=")
      expect(written).toContain("PORT=5432")
      expect(written).not.toContain("LEGACY_FEATURE_FLAG")
      expect(written).not.toContain("Remove the following")
      expect(written).not.toContain("Add the following")
    })

    it('"skip" writes nothing at all when a file already exists, but still reports reconciliation diagnostics', async () => {
      const location = path.join(root, ".env.example")
      await fs.writeFile(location, "STRIPE_KEY=sk_hand_written\nLEGACY_FEATURE_FLAG=true\n", "utf8")

      const result = await writeEnvExample(contracts(), location, { onExisting: "skip" })

      expect(result.writtenPath).toBeUndefined()
      expect(result.skippedExistingPath).toBe(location)
      expect(result.staleVariables).toEqual(["LEGACY_FEATURE_FLAG"])
      expect(result.variablesToAdd).toEqual(["PORT"])

      const original = await fs.readFile(location, "utf8")
      expect(original).toBe("STRIPE_KEY=sk_hand_written\nLEGACY_FEATURE_FLAG=true\n")

      const siblings = await fs.readdir(root)
      expect(siblings).toEqual([".env.example"]) // no timestamped sibling was written either
    })
  })
})
