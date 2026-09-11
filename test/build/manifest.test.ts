import { describe, it, expect } from "vitest"
import { generatedBanner } from "../../src/build/generated-banner.js"
import { discoverValidationContexts, renderManifest } from "../../src/build/manifest.js"
import type { DiscoveredContract, DiscoveredVariable } from "../../src/build/link.js"

function contract(overrides: Partial<DiscoveredContract>): DiscoveredContract {
  return {
    file: "/repo/x/env.schema.ts",
    exportName: "xEnv",
    contractName: "x",
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
    declaration: { file: "/repo/x/env.schema.ts", line: 1, column: 1 },
    documentation: undefined,
    packageOrigin: undefined,
    ...overrides,
  }
}

function variable(overrides: Partial<DiscoveredVariable> & { key: string }): DiscoveredVariable {
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

describe("renderManifest", () => {
  it("produces deterministic, sorted, relative imports and aliases name collisions", () => {
    const contracts = [
      contract({
        file: "/repo/features/payments/env.schema.ts",
        exportName: "featureEnv",
        contractName: "payments",
      }),
      contract({
        file: "/repo/packages/database/env.schema.ts",
        exportName: "databaseEnv",
        contractName: "database",
      }),
      contract({
        file: "/repo/features/billing/env.schema.ts",
        exportName: "featureEnv",
        contractName: "billing",
      }),
    ]

    const output = renderManifest(contracts, "/repo/src/generated/env.manifest.ts")

    expect(output).toContain(generatedBanner("ts"))
    // A genuine blank line separates the banner from the first import.
    expect(output).toContain(`${generatedBanner("ts")}\n\nimport {`)
    // A genuine trailing blank line (final newline) after the closing "];".
    expect(output.endsWith("];\n")).toBe(true)
    expect(output).toContain('import { featureEnv } from "../../features/billing/env.schema";')
    expect(output).toContain('import { databaseEnv } from "../../packages/database/env.schema";')
    expect(output).toContain(
      'import { featureEnv as featureEnv_1 } from "../../features/payments/env.schema";',
    )
    expect(output).toContain("export const manifest = [")
    expect(output).toContain("  featureEnv,")
    expect(output).toContain("  featureEnv_1,")

    // Deterministic: re-rendering the same input produces byte-identical output.
    expect(renderManifest(contracts, "/repo/src/generated/env.manifest.ts")).toBe(output)
  })

  it("sorts stably when two contracts are declared in the same schema file (sort comparator's equal-file case)", () => {
    const contracts = [
      contract({
        file: "/repo/shared/env.schema.ts",
        exportName: "firstEnv",
        contractName: "first",
      }),
      contract({
        file: "/repo/shared/env.schema.ts",
        exportName: "secondEnv",
        contractName: "second",
      }),
    ]
    const output = renderManifest(contracts, "/repo/src/generated/env.manifest.ts")
    expect(output).toContain('import { firstEnv } from "../../shared/env.schema";')
    expect(output).toContain('import { secondEnv } from "../../shared/env.schema";')
  })

  it("increments the collision suffix past 1 for a third contract sharing the same exportName", () => {
    // Two collisions is not enough to distinguish `suffix += 1` from `suffix
    // -= 1`: both give `_1` for the second one. A THIRD contract with the
    // same exportName needs `_2`, which only the real increment produces
    // (`-= 1` would try `_0`, `_-1`, `_-2`, ... -- also always missing from
    // `usedNames`, an infinite loop this test would hang on if reached, so
    // this doubles as a sanity check that never happens in practice).
    const contracts = [
      contract({ file: "/repo/a/env.schema.ts", exportName: "sharedEnv", contractName: "a" }),
      contract({ file: "/repo/b/env.schema.ts", exportName: "sharedEnv", contractName: "b" }),
      contract({ file: "/repo/c/env.schema.ts", exportName: "sharedEnv", contractName: "c" }),
    ]
    const output = renderManifest(contracts, "/repo/src/generated/env.manifest.ts")
    expect(output).toContain('import { sharedEnv } from "../../a/env.schema";')
    expect(output).toContain('import { sharedEnv as sharedEnv_1 } from "../../b/env.schema";')
    expect(output).toContain('import { sharedEnv as sharedEnv_2 } from "../../c/env.schema";')
  })

  it("strips only the file's OWN trailing .ts/.tsx extension, not an embedded one earlier in the path", () => {
    // A directory literally named "config.ts.old": the correct (anchored)
    // regex strips only the real trailing ".ts"; an unanchored one matches
    // the FIRST ".ts"-shaped substring instead (inside "config.ts.old"),
    // leaving the file's own real extension on the specifier.
    const contracts = [contract({ file: "/repo/config.ts.old/env.schema.ts" })]
    const output = renderManifest(contracts, "/repo/src/generated/env.manifest.ts")
    expect(output).toContain('from "../../config.ts.old/env.schema";')
  })

  it("produces an empty contracts array for no discovered contracts", () => {
    const output = renderManifest([], "/repo/src/generated/env.manifest.ts")
    expect(output).toContain("export const manifest = [\n];")
  })

  it("prepends './' when the schema file is a descendant of the output directory (path.relative returns no leading dot)", () => {
    const contracts = [contract({ file: "/repo/features/payments/env.schema.ts" })]
    const output = renderManifest(contracts, "/repo/env.manifest.ts")
    expect(output).toContain('from "./features/payments/env.schema";')
  })

  it("resolves import specifiers relative to the output file's directory, not the project root", () => {
    const contracts = [contract({ file: "/repo/features/payments/env.schema.ts" })]
    const output = renderManifest(contracts, "/repo/deeper/nested/dir/env.manifest.ts")
    expect(output).toContain('from "../../../features/payments/env.schema";')
  })

  it("imports a package-resolved contract (ADR 0014) by bare package name, never a relative path into node_modules", () => {
    const contracts = [
      contract({
        file: "/repo/node_modules/@acme/pkg/src/env.schema.ts",
        exportName: "pkgEnv",
        contractName: "pkg",
        packageOrigin: {
          packageName: "@acme/pkg",
          declaredField: "./src/env.schema.ts",
          resolvedFile: "/repo/node_modules/@acme/pkg/src/env.schema.ts",
          packageDir: "/repo/node_modules/@acme/pkg",
        },
      }),
      contract({
        file: "/repo/features/local/env.schema.ts",
        exportName: "localEnv",
        contractName: "local",
      }),
    ]

    const output = renderManifest(contracts, "/repo/src/generated/env.manifest.ts")

    expect(output).toContain('import { pkgEnv } from "@acme/pkg";')
    expect(output).not.toContain("node_modules")
    expect(output).toContain('import { localEnv } from "../../features/local/env.schema";')
  })

  describe("activeContexts export", () => {
    it("emits a sorted, deduplicated activeContexts export when any variable declares a context", () => {
      const contracts = [
        contract({
          exportName: "serverEnv",
          variables: [
            variable({ key: "DATABASE_URL", context: "server" }),
            variable({ key: "LOG_LEVEL" }),
          ],
        }),
        contract({
          file: "/repo/y/env.schema.ts",
          exportName: "clientEnv",
          variables: [variable({ key: "PUBLIC_API_URL", context: "client" })],
        }),
      ]

      const output = renderManifest(contracts, "/repo/src/generated/env.manifest.ts")

      expect(output).toContain("// all currently active validation contexts")
      expect(output).toContain('export const activeContexts = ["client", "server"];')
      // Placed after the imports, before the manifest array.
      expect(output.indexOf("export const activeContexts")).toBeLessThan(
        output.indexOf("export const manifest"),
      )
      // A genuine blank line separates the activeContexts export from the
      // manifest array below it.
      expect(output).toContain(
        'export const activeContexts = ["client", "server"];\n\nexport const manifest = [',
      )
    })

    it("dedupes a context declared by more than one variable/contract", () => {
      const contracts = [
        contract({
          exportName: "serverEnv",
          variables: [
            variable({ key: "DATABASE_URL", context: "server" }),
            variable({ key: "REDIS_URL", context: "server" }),
          ],
        }),
      ]
      const output = renderManifest(contracts, "/repo/src/generated/env.manifest.ts")
      expect(output).toContain('export const activeContexts = ["server"];')
    })

    it("omits the comment and export entirely when no variable declares a context", () => {
      const contracts = [contract({ variables: [variable({ key: "LOG_LEVEL" })] })]
      const output = renderManifest(contracts, "/repo/src/generated/env.manifest.ts")
      expect(output).not.toContain("activeContexts")
      expect(output).not.toContain("validation context")
      // Not just "no activeContexts text" -- genuinely NOTHING inserted
      // between the imports' trailing blank line and the manifest array
      // (an empty `[]` fallback, not a fallback array with any content).
      expect(output).toContain(
        'import { xEnv } from "../../x/env.schema";\n\nexport const manifest = [',
      )
    })

    it("excludes contexts declared only by variables in an inactive (active: false) contract", () => {
      const contracts = [
        contract({
          exportName: "serverEnv",
          active: false,
          variables: [variable({ key: "DATABASE_URL", context: "server" })],
        }),
        contract({
          file: "/repo/y/env.schema.ts",
          exportName: "clientEnv",
          variables: [variable({ key: "PUBLIC_API_URL", context: "client" })],
        }),
      ]
      const output = renderManifest(contracts, "/repo/src/generated/env.manifest.ts")
      expect(output).toContain('export const activeContexts = ["client"];')
      expect(output).not.toContain('"server"')
    })
  })
})

describe("discoverValidationContexts", () => {
  it("returns an empty array when no contract has any variables", () => {
    expect(discoverValidationContexts([])).toEqual([])
  })

  it("collects, dedupes, and sorts contexts across multiple active contracts", () => {
    const contracts = [
      contract({
        exportName: "a",
        variables: [variable({ key: "A", context: "worker" }), variable({ key: "B" })],
      }),
      contract({
        file: "/repo/y/env.schema.ts",
        exportName: "b",
        variables: [
          variable({ key: "C", context: "edge" }),
          variable({ key: "D", context: "worker" }),
        ],
      }),
    ]
    expect(discoverValidationContexts(contracts)).toEqual(["edge", "worker"])
  })

  it("ignores variables belonging to an inactive contract", () => {
    const contracts = [
      contract({ active: false, variables: [variable({ key: "A", context: "server" })] }),
    ]
    expect(discoverValidationContexts(contracts)).toEqual([])
  })
})
