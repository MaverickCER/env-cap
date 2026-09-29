import { realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  artifactOptions,
  contractNameResolver,
  directRunUrl,
  formatFieldChanges,
  parseArgs,
  printList,
  printManifestSummary,
  requestedPasses,
  writeEvidenceChanges,
} from "../../src/cli/index.js"
import type { ParsedArgs } from "../../src/cli/index.js"
import type { ManifestChangeReport } from "../../src/build/evidence-snapshot.js"
import type { ContractModelContract } from "../../src/build/contract-model.js"
import type { DiscoveredContractSummary } from "../../src/build/link.js"

let writes: string[] = []

beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk))
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Minimal-but-valid `ContractModelContract` fixture -- only `file`/`exportName`/`contractName` matter to `contractNameResolver()`/`writeEvidenceChanges()`, but every other field is required (each `T | undefined`, not optional) by the real interface. */
function fakeContract(overrides: Partial<ContractModelContract> = {}): ContractModelContract {
  return {
    file: "features/a/env.schema.ts",
    exportName: "aEnv",
    contractName: "a",
    active: true,
    category: undefined,
    exclusiveGroup: undefined,
    variables: [],
    documented: true,
    packageOrigin: undefined,
    declaration: { file: "features/a/env.schema.ts", line: 1, column: 1 },
    documentation: undefined,
    owner: undefined,
    sensitivity: undefined,
    expiresAt: undefined,
    purpose: undefined,
    legalBasis: undefined,
    retention: undefined,
    dataResidency: undefined,
    auditRequired: undefined,
    metadata: undefined,
    ...overrides,
  }
}

function emptyChangeReport(): ManifestChangeReport {
  return {
    addedContracts: [],
    removedContracts: [],
    addedVariables: [],
    removedVariables: [],
    updatedContracts: [],
    updatedVariables: [],
  }
}

describe("parseArgs", () => {
  it("parses --location with no other flags", () => {
    const args = parseArgs(["--location", "src/generated/env.manifest.ts"])
    expect(args.location).toBe("src/generated/env.manifest.ts")
    expect(args.help).toBe(false)
    expect(args.strict).toBe(false)
    expect(args.include).toEqual([])
    expect(args.exclude).toEqual([])
  })

  it("parses --root and --evidence", () => {
    const args = parseArgs([
      "--root",
      "/repo",
      "--location",
      "out.ts",
      "--evidence",
      "docs/env.evidence.json",
    ])
    expect(args.root).toBe("/repo")
    expect(args.evidence).toBe("docs/env.evidence.json")
  })

  it("collects repeatable --include and --exclude flags", () => {
    const args = parseArgs([
      "--location",
      "out.ts",
      "--include",
      "features/**/env.schema.ts",
      "--include",
      "packages/**/env.schema.ts",
      "--exclude",
      "**/fixtures/**",
    ])
    expect(args.include).toEqual(["features/**/env.schema.ts", "packages/**/env.schema.ts"])
    expect(args.exclude).toEqual(["**/fixtures/**"])
  })

  it("collects repeatable --package flags (ADR 0014)", () => {
    const args = parseArgs([
      "--location",
      "out.ts",
      "--package",
      "@acme/pkg-a",
      "--package",
      "@acme/pkg-b",
    ])
    expect(args.packages).toEqual(["@acme/pkg-a", "@acme/pkg-b"])
  })

  it("parses --tsconfig <path> (ADR 0023)", () => {
    const args = parseArgs(["--location", "out.ts", "--tsconfig", "tsconfig.build.json"])
    expect(args.tsconfig).toBe("tsconfig.build.json")
  })

  it("parses --no-tsconfig as false, and leaves tsconfig undefined when neither flag is given", () => {
    expect(parseArgs(["--location", "out.ts", "--no-tsconfig"]).tsconfig).toBe(false)
    expect(parseArgs(["--location", "out.ts"]).tsconfig).toBeUndefined()
  })

  it("sets strict, json, check, and help flags", () => {
    expect(parseArgs(["--location", "out.ts", "--strict"]).strict).toBe(true)
    expect(parseArgs(["--location", "out.ts", "--json"]).json).toBe(true)
    expect(parseArgs(["--location", "out.ts"]).json).toBe(false)
    expect(parseArgs(["--location", "out.ts", "--check"]).check).toBe(true)
    expect(parseArgs(["--location", "out.ts"]).check).toBe(false)
    expect(parseArgs(["--help"]).help).toBe(true)
    expect(parseArgs(["-h"]).help).toBe(true)
  })

  it("parses the two scoped strict flags independently of the blanket --strict", () => {
    const docsOnly = parseArgs(["--location", "out.ts", "--strict-docs"])
    expect(docsOnly.strictDocs).toBe(true)
    expect(docsOnly.strictOwnership).toBe(false)
    expect(docsOnly.strict).toBe(false)

    const ownershipOnly = parseArgs(["--location", "out.ts", "--strict-ownership"])
    expect(ownershipOnly.strictOwnership).toBe(true)
    expect(ownershipOnly.strictDocs).toBe(false)

    const both = parseArgs(["--location", "out.ts", "--strict-docs", "--strict-ownership"])
    expect([both.strictDocs, both.strictOwnership]).toEqual([true, true])

    // parseArgs keeps the three flags independent booleans -- --strict never
    // sets strictDocs/strictOwnership itself. (Its broader escalation effect
    // -- ADR 0044, --strict alone now escalates all three families -- lives
    // in artifactOptions' derived onUndocumented/onOwnershipIssue, not here.)
    const blanket = parseArgs(["--location", "out.ts", "--strict"])
    expect([blanket.strictDocs, blanket.strictOwnership]).toEqual([false, false])
  })

  it("defaults both scoped strict flags to false", () => {
    const args = parseArgs(["--location", "out.ts"])
    expect(args.strictDocs).toBe(false)
    expect(args.strictOwnership).toBe(false)
  })

  it("throws for an unknown argument", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/)
  })

  it("throws when a value-taking flag is missing its value", () => {
    expect(() => parseArgs(["--location"])).toThrow(/requires a value/)
    expect(() => parseArgs(["--include"])).toThrow(/requires a value/)
    expect(() => parseArgs(["--evidence"])).toThrow(/requires a value/)
  })

  it("parses with none of --location/--evidence given -- parseArgs itself never enforces requiredness, main() does", () => {
    const args = parseArgs(["--strict"])
    expect(args.location).toBeUndefined()
    expect(args.evidence).toBeUndefined()
  })

  it("throws for the removed --docs/--ownership/--env-example flags (moved to application code, see ADR 0046)", () => {
    expect(() => parseArgs(["--docs", "out.md"])).toThrow(/Unknown argument: --docs/)
    expect(() => parseArgs(["--ownership", "out.md"])).toThrow(/Unknown argument: --ownership/)
    expect(() => parseArgs(["--env-example", ".env.example"])).toThrow(
      /Unknown argument: --env-example/,
    )
  })
})

describe("formatFieldChanges", () => {
  it("joins multiple field changes with ', ', and falls back to 'unset' on either side", () => {
    expect(
      formatFieldChanges([
        { field: "description", previous: "old text", current: undefined },
        { field: "sensitivity", previous: undefined, current: "secret" },
      ]),
    ).toBe("description (old text -> unset), sensitivity (unset -> secret)")
  })

  it("renders a single change with no separator", () => {
    expect(formatFieldChanges([{ field: "owner", previous: "team-a", current: "team-b" }])).toBe(
      "owner (team-a -> team-b)",
    )
  })
})

describe("contractNameResolver", () => {
  it("resolves a known ref to its contractName", () => {
    const resolve = contractNameResolver([
      fakeContract({
        file: "features/a/env.schema.ts",
        exportName: "aEnv",
        contractName: "a-display",
      }),
    ])
    expect(resolve({ file: "features/a/env.schema.ts", exportName: "aEnv" })).toBe("a-display")
  })

  it("falls back to the exportName for a ref with no matching contract (e.g. a removed one)", () => {
    const resolve = contractNameResolver([fakeContract()])
    expect(resolve({ file: "features/gone/env.schema.ts", exportName: "goneEnv" })).toBe("goneEnv")
  })
})

describe("writeEvidenceChanges", () => {
  it("prints 'No changes.' when every change list is empty", () => {
    writeEvidenceChanges(emptyChangeReport(), [])
    const output = writes.join("")
    expect(output).toBe("\nEvidence changes since the last persisted snapshot:\n  No changes.\n")
  })

  it("prints an Added: section from addedContracts alone, with no Updated:/Removed: sections", () => {
    writeEvidenceChanges(
      {
        ...emptyChangeReport(),
        addedContracts: [{ file: "features/a/env.schema.ts", exportName: "aEnv" }],
      },
      [fakeContract({ contractName: "a-display" })],
    )
    const output = writes.join("")
    expect(output).toBe(
      '\nEvidence changes since the last persisted snapshot:\n  Added:\n    - contract "a-display" (features/a/env.schema.ts)\n',
    )
  })

  it("prints an Added: section from addedVariables alone (no addedContracts)", () => {
    writeEvidenceChanges(
      {
        ...emptyChangeReport(),
        addedVariables: [{ file: "features/a/env.schema.ts", exportName: "aEnv", key: "NEW_KEY" }],
      },
      [fakeContract({ contractName: "a-display" })],
    )
    const output = writes.join("")
    expect(output).toBe(
      '\nEvidence changes since the last persisted snapshot:\n  Added:\n    - NEW_KEY in "a-display"\n',
    )
  })

  it("prints an Updated: section from updatedContracts alone, with the exact field-change text", () => {
    writeEvidenceChanges(
      {
        ...emptyChangeReport(),
        updatedContracts: [
          {
            file: "features/a/env.schema.ts",
            exportName: "aEnv",
            changes: [{ field: "owner", previous: "team-a", current: "team-b" }],
          },
        ],
      },
      [fakeContract({ contractName: "a-display" })],
    )
    expect(writes.join("")).toBe(
      '\nEvidence changes since the last persisted snapshot:\n  Updated:\n    - contract "a-display": owner (team-a -> team-b)\n',
    )
  })

  it("prints an Updated: section from updatedVariables alone (no updatedContracts)", () => {
    writeEvidenceChanges(
      {
        ...emptyChangeReport(),
        updatedVariables: [
          {
            file: "features/a/env.schema.ts",
            exportName: "aEnv",
            key: "A_KEY",
            changes: [{ field: "owner", previous: "team-a", current: "team-b" }],
          },
        ],
      },
      [fakeContract({ contractName: "a-display" })],
    )
    expect(writes.join("")).toBe(
      '\nEvidence changes since the last persisted snapshot:\n  Updated:\n    - A_KEY in "a-display": owner (team-a -> team-b)\n',
    )
  })

  it("prints a Removed: section from removedContracts alone, resolving to the exportName since a removed contract has no current entry", () => {
    writeEvidenceChanges(
      {
        ...emptyChangeReport(),
        removedContracts: [{ file: "features/gone/env.schema.ts", exportName: "goneEnv" }],
      },
      [],
    )
    expect(writes.join("")).toBe(
      '\nEvidence changes since the last persisted snapshot:\n  Removed:\n    - contract "goneEnv" (features/gone/env.schema.ts)\n',
    )
  })

  it("prints a Removed: section from removedVariables alone (no removedContracts)", () => {
    writeEvidenceChanges(
      {
        ...emptyChangeReport(),
        removedVariables: [
          { file: "features/a/env.schema.ts", exportName: "aEnv", key: "GONE_KEY" },
        ],
      },
      [fakeContract({ contractName: "a-display" })],
    )
    expect(writes.join("")).toBe(
      '\nEvidence changes since the last persisted snapshot:\n  Removed:\n    - GONE_KEY in "a-display"\n',
    )
  })

  it("prints all three sections, in Added/Updated/Removed order, when every list has an entry", () => {
    writeEvidenceChanges(
      {
        addedContracts: [{ file: "features/a/env.schema.ts", exportName: "aEnv" }],
        removedContracts: [{ file: "features/gone/env.schema.ts", exportName: "goneEnv" }],
        addedVariables: [],
        removedVariables: [],
        updatedContracts: [
          {
            file: "features/b/env.schema.ts",
            exportName: "bEnv",
            changes: [{ field: "owner", previous: "x", current: "y" }],
          },
        ],
        updatedVariables: [],
      },
      [
        fakeContract({
          file: "features/a/env.schema.ts",
          exportName: "aEnv",
          contractName: "a-display",
        }),
      ],
    )
    const output = writes.join("")
    const addedIndex = output.indexOf("Added:")
    const updatedIndex = output.indexOf("Updated:")
    const removedIndex = output.indexOf("Removed:")
    expect(addedIndex).toBeGreaterThan(-1)
    expect(updatedIndex).toBeGreaterThan(addedIndex)
    expect(removedIndex).toBeGreaterThan(updatedIndex)
  })
})

describe("requestedPasses", () => {
  const base: ParsedArgs = {
    include: [],
    exclude: [],
    packages: [],
    strict: false,
    strictDocs: false,
    strictOwnership: false,
    json: false,
    check: false,
    help: false,
  }

  it("is true only for the passes whose flag was actually given", () => {
    expect(requestedPasses({ ...base, location: "out.ts" })).toEqual({
      manifest: true,
      docs: false,
      usage: false,
      evidence: false,
    })
    expect(requestedPasses({ ...base, evidence: "evidence.json" })).toEqual({
      manifest: false,
      docs: false,
      usage: false,
      evidence: true,
    })
  })

  it("is false across the board when nothing was requested", () => {
    expect(requestedPasses(base)).toEqual({
      manifest: false,
      docs: false,
      usage: false,
      evidence: false,
    })
  })

  // `--docs`/`--ownership` no longer exist as CLI flags (ADR 0046), so
  // `docs`/`usage` can never be `true` -- pinned explicitly here (not just
  // implied by the `toEqual()` checks above, both of which happen to use a
  // `base` that never sets them) so a mutant flipping either hardcoded
  // `false` to `true` in `requestedPasses()` is still caught even against a
  // fully-populated `ParsedArgs`.
  it("docs/usage are always false, regardless of which other flags are set", () => {
    const passes = requestedPasses({
      ...base,
      location: "out.ts",
      evidence: "evidence.json",
      strict: true,
      strictDocs: true,
      strictOwnership: true,
    })
    expect(passes.docs).toBe(false)
    expect(passes.usage).toBe(false)
  })
})

describe("artifactOptions", () => {
  const base: ParsedArgs = {
    include: [],
    exclude: [],
    packages: [],
    strict: false,
    strictDocs: false,
    strictOwnership: false,
    json: false,
    check: false,
    help: false,
  }

  it("maps empty include/exclude/packages arrays to undefined, not []", () => {
    const options = artifactOptions(base)
    expect(options.include).toBeUndefined()
    expect(options.exclude).toBeUndefined()
    expect(options.packages).toBeUndefined()
  })

  it("passes non-empty include/exclude/packages arrays through unchanged", () => {
    const options = artifactOptions({
      ...base,
      include: ["a/**"],
      exclude: ["b/**"],
      packages: ["@scope/pkg"],
    })
    expect(options.include).toEqual(["a/**"])
    expect(options.exclude).toEqual(["b/**"])
    expect(options.packages).toEqual(["@scope/pkg"])
  })

  it("manifest is false when --location was omitted, and onIncompatibility follows --strict", () => {
    expect(artifactOptions(base).manifest).toBe(false)
    expect(artifactOptions({ ...base, location: "out.ts" }).manifest).toEqual({
      location: "out.ts",
      onIncompatibility: "warn",
    })
    expect(artifactOptions({ ...base, location: "out.ts", strict: true }).manifest).toEqual({
      location: "out.ts",
      onIncompatibility: "throw",
    })
  })

  // `--docs`/`--ownership` were removed from the CLI (ADR 0046):
  // `artifactOptions()` no longer has a `docs`/`ownership` source field on
  // `ParsedArgs` to read, so it never sets `docs`/`usage` on the options
  // object it returns at all -- confirmed here via `in`, since a TypeScript
  // property-access check on the (inferred, docs/usage-less) return type
  // would fail to compile rather than assert anything at runtime.
  it("never sets docs/usage on the returned options object", () => {
    expect("docs" in artifactOptions(base)).toBe(false)
    expect("usage" in artifactOptions(base)).toBe(false)
  })

  it("evidence is false when --evidence was omitted, and set from it otherwise", () => {
    expect(artifactOptions(base).evidence).toBe(false)
    expect(artifactOptions({ ...base, evidence: "evidence.json" }).evidence).toEqual({
      location: "evidence.json",
    })
  })

  it("onUndocumented/onOwnershipIssue follow --strict-docs/--strict-ownership independently", () => {
    expect(artifactOptions(base).onUndocumented).toBe("warn")
    expect(artifactOptions(base).onOwnershipIssue).toBe("warn")
    expect(artifactOptions({ ...base, strictDocs: true }).onUndocumented).toBe("throw")
    expect(artifactOptions({ ...base, strictDocs: true }).onOwnershipIssue).toBe("warn")
    expect(artifactOptions({ ...base, strictOwnership: true }).onOwnershipIssue).toBe("throw")
    expect(artifactOptions({ ...base, strictOwnership: true }).onUndocumented).toBe("warn")
  })

  it("bare --strict also escalates onUndocumented/onOwnershipIssue, not just onIncompatibility (ADR 0044)", () => {
    const strictOnly = artifactOptions({ ...base, strict: true })
    expect(strictOnly.onUndocumented).toBe("throw")
    expect(strictOnly.onOwnershipIssue).toBe("throw")
    // Neither scoped flag itself flips true -- groupEscalates ORs `strict` in
    // at read time; parseArgs' own independence (tested above) is untouched.
    expect(base.strictDocs).toBe(false)
    expect(base.strictOwnership).toBe(false)
  })
})

describe("printList", () => {
  it("writes nothing at all for an empty list", () => {
    printList([], "N thing(s):", (x: string) => x)
    expect(writes).toEqual([])
  })

  it("writes the header once and one '  - <rendered>' line per item, in order", () => {
    printList(["a", "b"], "2 thing(s):", (x) => `rendered-${x}`)
    expect(writes.join("")).toBe("\n2 thing(s):\n  - rendered-a\n  - rendered-b\n")
  })
})

describe("printManifestSummary", () => {
  it("printManifestSummary writes the outputPath, contract count, and both warning lists", () => {
    const contractSummary: DiscoveredContractSummary = {
      file: "features/a/env.schema.ts",
      exportName: "aEnv",
      contractName: "a",
      variableCount: 1,
      active: true,
      documented: true,
    }
    printManifestSummary({
      outputPath: "src/generated/env.manifest.ts",
      contracts: [contractSummary, contractSummary],
      warnings: [
        {
          severity: "warning",
          variable: "KEY",
          files: [],
          reason: "conflict",
          code: "PROCESSOR_SOURCE_CONFLICT",
        },
        // No `code` at all -- exercises the `w.code ? ... : ""` ternary's
        // other branch (an exclusive-group violation never sets one).
        { severity: "error", variable: 'Exclusive group "db"', files: [], reason: "both active" },
      ],
      parseWarnings: [{ file: "a.ts", message: "bad" }],
    })
    const output = writes.join("")
    expect(output).toContain("Wrote manifest: src/generated/env.manifest.ts")
    expect(output).toContain("Discovered 2 contract(s).")
    expect(output).toContain("[PROCESSOR_SOURCE_CONFLICT] KEY: conflict")
    expect(output).toContain('  - Exclusive group "db": both active\n')
    expect(output).toContain("a.ts: bad")
  })
})

// directRunUrl() is exported purely for this direct-unit-test path -- see the
// comment above its definition in src/cli/index.ts for why it exists at all
// (npm's `.bin` symlink indirection). module-level `isDirectRun`/auto-run
// behavior itself is exercised separately in test/cli/direct-run.test.ts,
// since re-executing this module's top level doesn't belong alongside the
// static `import { main }` bindings the rest of this suite relies on.
describe("directRunUrl", () => {
  const originalArgv1 = process.argv[1]

  afterEach(() => {
    // process.argv[1] is always a real path in a real vitest run;
    // the empty-string fallback only matters in principle, for whatever
    // hypothetical environment argv[1] were genuinely absent in.
    process.argv[1] = originalArgv1 ?? ""
  })

  it("returns undefined when process.argv[1] is falsy", () => {
    process.argv[1] = ""
    expect(directRunUrl()).toBeUndefined()
  })

  it("resolves a real, symlink-free path via realpathSync", () => {
    const here = fileURLToPath(import.meta.url)
    process.argv[1] = here
    expect(directRunUrl()).toBe(pathToFileURL(realpathSync(here)).href)
  })

  it("falls back to the unresolved path when realpathSync throws (e.g. a nonexistent argv[1])", () => {
    const nonexistent = path.join(path.dirname(fileURLToPath(import.meta.url)), "does-not-exist.ts")
    process.argv[1] = nonexistent
    expect(directRunUrl()).toBe(pathToFileURL(nonexistent).href)
  })
})
