import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EnvProjectGenerationError } from "../../src/build/errors.js"
import { main } from "../../src/cli/index.js"

// Real, end-to-end exercise of main()'s stdout-formatting path (roughly
// src/cli/index.ts lines 109-229) -- test/cli/index.test.ts only covers
// parseArgs(), and test/cli/bin.test.ts only spawns the built CLI for
// --help/error/exit-code cases, so the manifest/docs summary formatting
// below was never actually exercised by any test.

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(here, "fixtures-main")

async function write(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(fixtureRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

let writes: string[]
let originalArgv: string[]

beforeEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })

  // One documented variable (STRIPE_KEY) and one undocumented one
  // (UNDOCUMENTED_VAR) so the docs pass has something real to report.
  await write(
    "features/payments/env.schema.ts",
    `import { createEnv, documentEnv } from "@maverickcer/env-cap";

const schema = {
  STRIPE_KEY: {},
  UNDOCUMENTED_VAR: {},
};

export const paymentsEnv = createEnv(schema, { name: "payments" });

documentEnv(schema, {
  owner: "payments-team",
  variables: {
    STRIPE_KEY: { description: "Stripe secret key." },
  },
});
`,
  )

  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk))
    return true
  })

  originalArgv = process.argv
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.argv = originalArgv
  process.exitCode = undefined
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("main() -- real --location/--docs run", () => {
  it("prints the manifest-written summary and the undocumented-variable section, in the CLI's actual format", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
      "--docs",
      "docs/ENVIRONMENT.md",
    ]

    await main()

    const output = writes.join("")

    expect(output).toContain("Wrote manifest: ")
    expect(output).toContain(path.join(fixtureRoot, "src/generated/env.manifest.ts"))
    expect(output).toContain("Discovered 1 contract(s).")
    expect(output).toContain("Wrote docs: ")
    expect(output).toContain(path.join(fixtureRoot, "docs/ENVIRONMENT.md"))

    expect(output).toContain("1 undocumented variable(s):")
    expect(output).toContain("  - UNDOCUMENTED_VAR in paymentsEnv")

    await expect(
      fs.access(path.join(fixtureRoot, "src/generated/env.manifest.ts")),
    ).resolves.toBeUndefined()
    await expect(fs.access(path.join(fixtureRoot, "docs/ENVIRONMENT.md"))).resolves.toBeUndefined()
  })
})

describe("main() -- unresolved/dropped-schema warning banner", () => {
  it("prints a leading ⚠ banner, before the manifest summary, when a createEnv() call can't be statically resolved", async () => {
    // A dynamically-constructed schema (createEnv(buildSchema())) can't be
    // statically resolved -- per the README/ADR 0002, this produces a parse
    // warning instead of silently guessing.
    await write(
      "features/dynamic/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";

function buildSchema() {
  return { DYNAMIC_VAR: {} };
}

export const dynamicEnv = createEnv(buildSchema(), { name: "dynamic" });
`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
    ]

    await main()

    const output = writes.join("")

    expect(output).toContain("⚠ 1 unresolved/dropped-schema warning(s) found")
    expect(output.indexOf("⚠")).toBeLessThan(output.indexOf("Wrote manifest:"))
  })
})

describe("main() -- --check", () => {
  it("exits 0 and reports everything up to date against a clean, already-generated fixture", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
    ]
    await main()
    writes = []

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
      "--check",
    ]
    const manifestPath = path.join(fixtureRoot, "src/generated/env.manifest.ts")
    const before = await fs.readFile(manifestPath, "utf8")

    await main()

    const output = writes.join("")
    expect(output).toContain("All generated artifacts are up to date.")
    expect(process.exitCode).toBe(0)
    expect(await fs.readFile(manifestPath, "utf8")).toBe(before)
  })

  it("exits 1 and lists stale artifacts, without touching fixture files, once the schema changes after generation", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
    ]
    await main()

    const manifestPath = path.join(fixtureRoot, "src/generated/env.manifest.ts")
    const before = await fs.readFile(manifestPath, "utf8")

    // A whole new contract changes manifest.ts's output (a list of imported
    // contracts) -- a new variable on the existing contract alone would not.
    await write(
      "features/notifications/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema = { SLACK_WEBHOOK: {} };
export const notificationsEnv = createEnv(schema, { name: "notifications" });
documentEnv(schema, { owner: "platform-team", variables: { SLACK_WEBHOOK: { description: "Slack webhook." } } });
`,
    )

    writes = []
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
      "--check",
    ]
    await main()

    const output = writes.join("")
    expect(output).toContain("artifact(s) are stale or missing")
    expect(process.exitCode).toBe(1)
    expect(await fs.readFile(manifestPath, "utf8")).toBe(before)
  })
})

describe("main() -- --json wiring", () => {
  it("emits a parseable ok:true JSON report on success", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--docs",
      "docs/ENVIRONMENT.md",
      "--json",
    ]

    await main()

    const output = writes.join("")
    const payload = JSON.parse(output) as {
      ok: boolean
      docs?: { documentation?: { undocumentedVariables?: unknown[] } }
    }
    expect(payload.ok).toBe(true)
    expect(payload.docs?.documentation?.undocumentedVariables).toBeDefined()
    expect(payload.docs?.documentation?.undocumentedVariables).toHaveLength(1)
  })

  it("emits a parseable ok:false JSON report when --strict-docs turns an undocumented variable into a hard failure", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--docs",
      "docs/ENVIRONMENT.md",
      "--strict-docs",
      "--json",
    ]

    await main()

    const output = writes.join("")
    const payload = JSON.parse(output) as { ok: boolean; error?: { name: string } }
    expect(payload.ok).toBe(false)
    expect(payload.error?.name).toBe("EnvProjectGenerationError")
    expect(process.exitCode).toBe(1)
  })
})

describe("main() -- --help", () => {
  it("prints HELP_TEXT and exits 0, without touching any generation path", async () => {
    process.argv = ["node", "env-cap", "--help"]

    await main()

    const output = writes.join("")
    expect(output).toContain("env-cap - generate a manifest")
    expect(output).toContain("Usage:")
    expect(process.exitCode).toBe(0)
  })
})

describe("main() -- none of --location/--docs/--ownership given", () => {
  it("prints HELP_TEXT and exits 1 without --json", async () => {
    process.argv = ["node", "env-cap", "--root", fixtureRoot]

    await main()

    const output = writes.join("")
    expect(output).toContain("Usage:")
    expect(process.exitCode).toBe(1)
  })

  it("emits a machine-readable failure and exits 1 with --json", async () => {
    process.argv = ["node", "env-cap", "--root", fixtureRoot, "--json"]

    await main()

    const output = writes.join("")
    const payload = JSON.parse(output) as { ok: boolean; error?: { message: string } }
    expect(payload.ok).toBe(false)
    expect(payload.error?.message).toContain(
      "At least one of --location, --docs, or --ownership is required.",
    )
    expect(process.exitCode).toBe(1)
  })
})

describe("main() -- --check exercises every options-ternary (docs/env-example/ownership, all true)", () => {
  it("--location --docs --env-example --ownership --strict --strict-docs --strict-ownership together, on a clean/fully-consumed fixture, still reports up to date", async () => {
    await write(
      "features/check-clean/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema = { CLEAN_KEY: {} };
export const cleanEnv = createEnv(schema, { name: "check-clean" });
documentEnv(schema, { owner: "clean-team", variables: { CLEAN_KEY: { description: "A clean variable." } } });
`,
    )
    await write(
      "src/check-clean-consumer.ts",
      `import { cleanEnv } from "../features/check-clean/env.schema.js";\ncleanEnv.CLEAN_KEY;\n`,
    )

    const flags = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/check-clean/env.schema.ts",
      "--location",
      "src/generated/check-clean.manifest.ts",
      "--docs",
      "docs/check-clean.ENVIRONMENT.md",
      "--env-example",
      ".env.check-clean.example",
      "--ownership",
      "docs/check-clean.OWNERSHIP.md",
      "--strict",
      "--strict-docs",
      "--strict-ownership",
    ]

    process.argv = [...flags]
    await main()

    writes = []
    process.argv = [...flags, "--check"]
    await main()

    const output = writes.join("")
    expect(output).toContain("Checking for drift (--check: nothing will be written)...")
    expect(output).toContain("All generated artifacts are up to date.")
    expect(process.exitCode).toBe(0)
  })

  it('--docs without --env-example hits the envExample:false branch of the docs ternary, and --ownership without --strict-ownership hits onOwnershipIssue:"warn" inside --check', async () => {
    await write(
      "features/check-clean-2/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema = { CLEAN_KEY_2: {} };
export const cleanEnv2 = createEnv(schema, { name: "check-clean-2" });
documentEnv(schema, { variables: { CLEAN_KEY_2: { description: "Another clean variable." } } });
`,
    )
    await write(
      "src/check-clean-2-consumer.ts",
      `import { cleanEnv2 } from "../features/check-clean-2/env.schema.js";\ncleanEnv2.CLEAN_KEY_2;\n`,
    )

    const flags = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/check-clean-2/env.schema.ts",
      "--docs",
      "docs/check-clean-2.ENVIRONMENT.md",
      "--ownership",
      "docs/check-clean-2.OWNERSHIP.md",
    ]

    process.argv = [...flags]
    await main()

    writes = []
    process.argv = [...flags, "--check"]
    await main()

    const output = writes.join("")
    expect(output).toContain("All generated artifacts are up to date.")
    expect(process.exitCode).toBe(0)
  })
})

describe("main() -- --check --json success", () => {
  it("emits a parseable ok:true JSON report with an additive checkResult when nothing is stale", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
    ]
    await main()

    writes = []
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
      "--check",
      "--json",
    ]
    await main()

    const output = writes.join("")
    const payload = JSON.parse(output) as {
      ok: boolean
      checkResult?: { ok: boolean; stale: string[] }
    }
    expect(payload.ok).toBe(true)
    expect(payload.checkResult?.ok).toBe(true)
    expect(payload.checkResult?.stale).toEqual([])
    expect(process.exitCode).toBe(0)
  })
})

describe("main() -- --check --strict throws on a real blocking incompatibility", () => {
  async function writeConflictingFixture(): Promise<void> {
    await write(
      "features/check-broken-a/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const brokenAEnv = createEnv({ SHARED: { processor: (v): string => String(v) } }, { name: "check-broken-a" });\n`,
    )
    await write(
      "features/check-broken-b/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const brokenBEnv = createEnv({ SHARED: { processor: (v): boolean => Boolean(v) } }, { name: "check-broken-b" });\n`,
    )
  }

  it("with --json: writes a serialized failure and exits 1, instead of throwing out of main()", async () => {
    await writeConflictingFixture()

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/check-broken-*/env.schema.ts",
      "--location",
      "src/generated/check-broken.manifest.ts",
      "--check",
      "--strict",
      "--json",
    ]

    await main()

    const output = writes.join("")
    const payload = JSON.parse(output) as { ok: boolean; error?: { name: string } }
    expect(payload.ok).toBe(false)
    expect(payload.error?.name).toBe("EnvProjectGenerationError")
    expect(process.exitCode).toBe(1)
  })

  it("without --json: propagates the raw EnvProjectGenerationError out of main()", async () => {
    await writeConflictingFixture()

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/check-broken-*/env.schema.ts",
      "--location",
      "src/generated/check-broken-2.manifest.ts",
      "--check",
      "--strict",
    ]

    await expect(main()).rejects.toThrow(EnvProjectGenerationError)
  })
})

describe("main() -- normal-flow non--json error propagation", () => {
  it("propagates the raw error via a bare throw when --json was not passed", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--docs",
      "docs/ENVIRONMENT.md",
      "--strict-docs",
    ]

    await expect(main()).rejects.toThrow(EnvProjectGenerationError)
  })
})

describe("main() -- normal flow with docs + env-example + ownership all requested together", () => {
  it("exercises the docs/envExample/usage ternaries in the non---check generation path", async () => {
    await write(
      "features/full-flow/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema = { FULL_FLOW_KEY: {} };
export const fullFlowEnv = createEnv(schema, { name: "full-flow" });
documentEnv(schema, { owner: "full-flow-team", variables: { FULL_FLOW_KEY: { description: "A fully documented variable." } } });
`,
    )
    await write(
      "src/full-flow-consumer.ts",
      `import { fullFlowEnv } from "../features/full-flow/env.schema.js";\nfullFlowEnv.FULL_FLOW_KEY;\n`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/full-flow/env.schema.ts",
      "--location",
      "src/generated/full-flow.manifest.ts",
      "--docs",
      "docs/full-flow.ENVIRONMENT.md",
      "--env-example",
      ".env.full-flow.example",
      "--ownership",
      "docs/full-flow.OWNERSHIP.md",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain("Wrote manifest: ")
    expect(output).toContain("Wrote docs: ")
    expect(output).toContain("Wrote example: ")
    expect(output).toContain("Wrote dependency ownership report: ")

    await expect(
      fs.access(path.join(fixtureRoot, ".env.full-flow.example")),
    ).resolves.toBeUndefined()
    await expect(
      fs.access(path.join(fixtureRoot, "docs/full-flow.OWNERSHIP.md")),
    ).resolves.toBeUndefined()
  })
})

describe("main() -- --exclude and --package flow through to generateEnvArtifacts()", () => {
  it("--exclude narrows discovery and --package (an unresolvable name) surfaces as a harmless parse warning", async () => {
    await write(
      "features/wpe-excluded/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const wpeExcludedEnv = createEnv({ EXCLUDED_VAR: {} }, { name: "wpe-excluded" });\n`,
    )
    await write(
      "features/wpe-included/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const wpeIncludedEnv = createEnv({ INCLUDED_VAR: {} }, { name: "wpe-included" });\n`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/wpe-*/env.schema.ts",
      "--exclude",
      "features/wpe-excluded/**",
      "--package",
      "@fixtures/does-not-exist",
      "--location",
      "src/generated/exclude-package.manifest.ts",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain("Discovered 1 contract(s).") // wpe-excluded is filtered out by --exclude
    expect(output).toContain("parse warning(s):")
    expect(output).toContain("@fixtures/does-not-exist") // the unresolvable --package name, reported as a warning, never a throw
  })
})

describe("main() -- --tsconfig/--no-tsconfig flow through to generateEnvArtifacts() (ADR 0023, Experimental)", () => {
  beforeEach(async () => {
    await write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["features/*"] } } }),
    )
    await write(
      "features/alias-billing/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const billingEnv = createEnv({ INVOICE_KEY: {} }, { name: "alias-billing" });\n`,
    )
    await write(
      "src/alias-consumer.ts",
      `import { billingEnv } from "@/alias-billing/env.schema.js";\nbillingEnv.INVOICE_KEY;\n`,
    )
  })

  it("default (auto-detected tsconfig.json): the aliased contract is not reported abandoned", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/alias-billing/env.schema.ts",
      "--ownership",
      "docs/alias.OWNERSHIP.md",
    ]

    await main()

    const output = writes.join("")
    expect(output).not.toContain("abandoned contract(s)")
  })

  it("--no-tsconfig disables alias resolution -- the same contract is now reported abandoned", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/alias-billing/env.schema.ts",
      "--ownership",
      "docs/alias-disabled.OWNERSHIP.md",
      "--no-tsconfig",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain("abandoned contract(s) (never imported anywhere):")
    expect(output).toContain("- alias-billing (")
  })
})

describe("main() -- manifest.warnings (compatibility warnings, non-strict)", () => {
  it("prints the compatibility-warning section when two contracts declare the same variable with differing, unannotated processors", async () => {
    await write(
      "features/warn-a/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const warnAEnv = createEnv({ SHARED_VAR: { processor: (v) => String(v) } }, { name: "warn-a" });\n`,
    )
    await write(
      "features/warn-b/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const warnBEnv = createEnv({ SHARED_VAR: { processor: (v) => String(v).trim() } }, { name: "warn-b" });\n`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/warn-*/env.schema.ts",
      "--location",
      "src/generated/warn.manifest.ts",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain("compatibility warning(s):")
    expect(output).toContain("- SHARED_VAR:")
  })
})

describe("main() -- manifest changes since last execution", () => {
  it("reports everything as added on the first run, and 'No changes.' on an immediate rerun against the same source", async () => {
    const location = "src/generated/changes.manifest.ts"
    process.argv = ["node", "env-cap", "--root", fixtureRoot, "--location", location]

    await main()
    const firstOutput = writes.join("")
    expect(firstOutput).toContain("Manifest changes since last execution:")
    expect(firstOutput).toContain("Added:")
    expect(firstOutput).toContain('contract "payments"')
    expect(firstOutput).toContain('STRIPE_KEY in "payments"')

    writes.length = 0
    await main()
    const secondOutput = writes.join("")
    expect(secondOutput).toContain("Manifest changes since last execution:")
    expect(secondOutput).toContain("No changes.")
    expect(secondOutput).not.toContain("Added:")
  })

  it("reports an Updated: section with the changed field's before/after values after a documentEnv() edit", async () => {
    const location = "src/generated/changes-updated.manifest.ts"
    process.argv = ["node", "env-cap", "--root", fixtureRoot, "--location", location]
    await main()
    writes.length = 0

    await write(
      "features/payments/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";

const schema = {
  STRIPE_KEY: {},
  UNDOCUMENTED_VAR: {},
};

export const paymentsEnv = createEnv(schema, { name: "payments" });

documentEnv(schema, {
  owner: "payments-team",
  variables: {
    STRIPE_KEY: { description: "Stripe secret key -- rotate quarterly." },
  },
});
`,
    )

    await main()
    const output = writes.join("")
    expect(output).toContain("Updated:")
    expect(output).toContain('STRIPE_KEY in "payments": description (')
    expect(output).not.toContain("Added:")
  })
})

describe("main() -- --env-example output formatting", () => {
  beforeEach(async () => {
    await write(
      "features/example-active/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema = { REQUIRED_NEW_VAR: {}, EXISTING_VAR: {} };
export const exampleActiveEnv = createEnv(schema, { name: "example-active" });
documentEnv(schema, {
  variables: {
    REQUIRED_NEW_VAR: { description: "A newly required variable." },
    EXISTING_VAR: { description: "Already present." },
  },
});
`,
    )
    await write(
      "features/example-inactive/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema2 = { TO_BE_COMMENTED: {} };
export const exampleInactiveEnv = createEnv(schema2, { name: "example-inactive" });
documentEnv(schema2, { active: false, variables: { TO_BE_COMMENTED: { description: "No longer active." } } });
`,
    )
  })

  it("skippedExistingPath: leaves a pre-existing file untouched and lists stale/toComment/toAdd variables", async () => {
    const envExamplePath = await write(
      ".env.example.pre-existing",
      "EXISTING_VAR=foo\nTO_BE_COMMENTED=bar\nLEGACY_STALE_VAR=baz\n",
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/example-*/env.schema.ts",
      "--docs",
      "docs/example.ENVIRONMENT.md",
      "--env-example",
      ".env.example.pre-existing",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain(`Left existing example untouched: ${envExamplePath}`)
    expect(output).toContain("Wrote a fresh copy to compare/merge: ")

    expect(output).toContain(
      "1 variable(s) in the existing example are no longer used by any contract:",
    )
    expect(output).toContain("  - LEGACY_STALE_VAR")

    expect(output).toContain(
      "1 variable(s) in the existing example should be commented out (feature no longer active):",
    )
    expect(output).toContain("  - TO_BE_COMMENTED")

    expect(output).toContain(
      "1 variable(s) required by the current configuration are missing from the existing example:",
    )
    expect(output).toContain("  - REQUIRED_NEW_VAR")
  })

  it("writtenPath: writes directly to the target when nothing exists there yet", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/example-*/env.schema.ts",
      "--docs",
      "docs/example2.ENVIRONMENT.md",
      "--env-example",
      ".env.example.fresh",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain("Wrote example: ")
    expect(output).not.toContain("Left existing example untouched")
  })
})

describe("main() -- doc.undocumentedContracts (no documentEnv() call at all)", () => {
  it("lists a contract with zero linked documentEnv() calls under 'undocumented contract(s)'", async () => {
    await write(
      "features/no-docs-at-all/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const noDocsAtAllEnv = createEnv({ ORPHAN_VAR: {} }, { name: "no-docs-at-all" });\n`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/no-docs-at-all/env.schema.ts",
      "--docs",
      "docs/no-docs-at-all.ENVIRONMENT.md",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain("undocumented contract(s) (no documentEnv() linked):")
    expect(output).toContain("- noDocsAtAllEnv (")
  })
})

describe("main() -- doc.staleDocEntries", () => {
  it("lists a documentEnv() entry whose key no longer exists in the schema", async () => {
    await write(
      "features/stale-doc/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema = { STILL_HERE: {} };
export const staleDocEnv = createEnv(schema, { name: "stale-doc" });
documentEnv(schema, { variables: { STILL_HERE: {}, LONG_GONE: { description: "No longer in the schema." } } });
`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/stale-doc/env.schema.ts",
      "--docs",
      "docs/stale-doc.ENVIRONMENT.md",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain("stale documentEnv() entry/entries (no matching schema variable):")
    expect(output).toContain("- LONG_GONE in staleDocEnv")
  })
})

describe("main() -- doc.expiringSoon", () => {
  it("shows both an already-expired variable and one expiring soon, with the correct phrasing for each", async () => {
    const msPerDay = 86_400_000
    const expiredDate = new Date(Date.now() - 5 * msPerDay).toISOString().slice(0, 10)
    const soonDate = new Date(Date.now() + 10 * msPerDay).toISOString().slice(0, 10)
    const contractSoonDate = new Date(Date.now() + 15 * msPerDay).toISOString().slice(0, 10)

    await write(
      "features/expiring/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema = { EXPIRED_VAR: {}, SOON_VAR: {} };
export const expiringEnv = createEnv(schema, { name: "expiring" });
documentEnv(schema, {
  expiresAt: "${contractSoonDate}",
  variables: {
    EXPIRED_VAR: { expiresAt: "${expiredDate}" },
    SOON_VAR: { expiresAt: "${soonDate}" },
  },
});
`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/expiring/env.schema.ts",
      "--docs",
      "docs/expiring.ENVIRONMENT.md",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain("variable(s)/contract(s) expiring soon or already expired:")
    expect(output).toMatch(/EXPIRED_VAR in expiringEnv: \d{4}-\d{2}-\d{2} \(expired \d+d ago\)/)
    expect(output).toMatch(/SOON_VAR in expiringEnv: \d{4}-\d{2}-\d{2} \(\d+d remaining\)/)
    // Contract-level expiresAt (no variable key) -- label falls back to the
    // bare exportName, exercising the e.key ? ... : e.exportName ternary's
    // other branch.
    expect(output).toMatch(/ {2}- expiringEnv: \d{4}-\d{2}-\d{2} \(\d+d remaining\)/)
  })
})

describe("main() -- doc.unresolvedLinks", () => {
  it("lists a documentEnv() call that could not be statically linked to any schema", async () => {
    await write(
      "features/unresolved-link/env.schema.ts",
      `import { documentEnv } from "@maverickcer/env-cap";
import { someSchema } from "some-external-package";
documentEnv(someSchema, {});
`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/unresolved-link/env.schema.ts",
      "--docs",
      "docs/unresolved-link.ENVIRONMENT.md",
    ]

    await main()

    const output = writes.join("")
    expect(output).toContain("documentEnv() call(s) could not be statically linked:")
    expect(output).toContain(path.join(fixtureRoot, "features/unresolved-link/env.schema.ts"))
  })
})

describe("main() -- --ownership output block", () => {
  it("lists abandoned/unresolved-consumer/unconsumed-owned/indeterminate/parse-warning findings, in the CLI's actual format", async () => {
    // Never imported anywhere -- abandoned.
    await write(
      "features/owner-abandoned/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema = { OLD_KEY: {} };
export const ownerAbandonedEnv = createEnv(schema, { name: "owner-abandoned" });
documentEnv(schema, { owner: "legacy-team" });
`,
    )

    // Only reachable through an unresolved "export * from" barrel -- unresolvedConsumers, never abandoned.
    await write(
      "features/owner-barrel/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const ownerBarrelEnv = createEnv({ BARREL_KEY: {} }, { name: "owner-barrel" });\n`,
    )
    await write("features/owner-barrel/index.ts", `export * from "./env.schema.js";\n`)
    await write(
      "src/owner-barrel-consumer.ts",
      `import { ownerBarrelEnv } from "../features/owner-barrel/index.js";\nownerBarrelEnv.BARREL_KEY;\n`,
    )

    // Imported and referenced (contract-level coupling proven), but its one
    // variable is never actually read -- unconsumedOwnedVariables.
    await write(
      "features/owner-unconsumed/env.schema.ts",
      `import { createEnv, documentEnv } from "@maverickcer/env-cap";
const schema = { OWNED_UNUSED: {} };
export const ownerUnconsumedEnv = createEnv(schema, { name: "owner-unconsumed" });
documentEnv(schema, { owner: "team-x" });
`,
    )
    await write(
      "src/owner-unconsumed-consumer.ts",
      `import { ownerUnconsumedEnv } from "../features/owner-unconsumed/env.schema.js";\ninitialize(ownerUnconsumedEnv);\n`,
    )

    // Dynamic (computed) property access observed on the contract -- indeterminate, never unconsumed.
    await write(
      "features/owner-indeterminate/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";\nexport const ownerIndeterminateEnv = createEnv({ DYN_KEY: {} }, { name: "owner-indeterminate" });\n`,
    )
    await write(
      "src/owner-indeterminate-consumer.ts",
      `import { ownerIndeterminateEnv } from "../features/owner-indeterminate/env.schema.js";
const dynamicKey = "DYN_KEY";
ownerIndeterminateEnv[dynamicKey];
`,
    )

    // A dynamically-constructed schema can't be statically resolved -- contributes a parse warning.
    await write(
      "features/owner-dynamic/env.schema.ts",
      `import { createEnv } from "@maverickcer/env-cap";
function buildOwnerSchema() {
  return { DYNAMIC_OWNER_VAR: {} };
}
export const ownerDynamicEnv = createEnv(buildOwnerSchema(), { name: "owner-dynamic" });
`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/owner-*/env.schema.ts",
      "--ownership",
      "docs/owner.OWNERSHIP.md",
    ]

    await main()

    const output = writes.join("")

    expect(output).toContain("abandoned contract(s) (never imported anywhere):")
    expect(output).toContain("- owner-abandoned (")

    expect(output).toContain("contract(s) with unresolved consumers (barrel re-exports):")
    expect(output).toContain("owner-barrel: ")
    expect(output).toContain("export * from")

    expect(output).toContain("unconsumed owned variable(s):")
    expect(output).toContain("- OWNED_UNUSED in owner-unconsumed")

    expect(output).toContain("indeterminate finding(s) (dynamic access, never guessed at):")
    expect(output).toContain("- DYN_KEY in owner-indeterminate:")

    expect(output).toContain("parse warning(s):")

    await expect(
      fs.access(path.join(fixtureRoot, "docs/owner.OWNERSHIP.md")),
    ).resolves.toBeUndefined()
  })
})
