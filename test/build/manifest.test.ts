import { describe, it, expect } from "vitest"
import { renderManifest } from "../../src/build/manifest.js"
import type { DiscoveredContract } from "../../src/build/link.js"

function contract(overrides: Partial<DiscoveredContract>): DiscoveredContract {
  return {
    file: "/repo/x/env.schema.ts",
    exportName: "xEnv",
    contractName: "x",
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

    expect(output).toContain("// AUTO-GENERATED FILE.")
    expect(output).toContain("// DO NOT EDIT.")
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
})
