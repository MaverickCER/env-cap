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
    `import { createEnv, documentEnv } from "env-cap";

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

describe("main() -- real --location run", () => {
  it("prints the manifest-written summary, in the CLI's actual format", async () => {
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

    expect(output).toContain("Wrote manifest: ")
    expect(output).toContain(path.join(fixtureRoot, "src/generated/env.manifest.ts"))
    expect(output).toContain("Discovered 1 contract(s).")

    // No parse warnings in this clean fixture -- the ⚠ banner (gated on
    // totalWarnings > 0) must not print.
    expect(output).not.toContain("⚠")

    // --evidence was not passed -- neither the "Wrote evidence:" line nor
    // the evidence-changes section (both gated on `if (args.evidence)`)
    // should print.
    expect(output).not.toContain("Wrote evidence:")
    expect(output).not.toContain("Evidence changes since the last persisted snapshot:")

    await expect(
      fs.access(path.join(fixtureRoot, "src/generated/env.manifest.ts")),
    ).resolves.toBeUndefined()
  })
})

describe("main() -- real --evidence-only run (no --location)", () => {
  it("skips the warning banner and manifest summary, and still prints the evidence line, when result.manifest is undefined", async () => {
    // `--location` is the only thing that ever populates `result.manifest` --
    // an `--evidence`-only invocation (the CLI's other valid non-`--json`
    // entry point per the "at least one of --location or --evidence"
    // guard) leaves it `undefined`, exercising the `result.manifest?.` and
    // `if (result.manifest)` branches this text-output path takes for real,
    // not just via a hand-built result object.
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--evidence",
      "docs/env.evidence.json",
    ]

    await main()

    const output = writes.join("")

    // No "Wrote manifest: "/"Discovered N contract(s)." -- printManifestSummary()
    // never runs when result.manifest is undefined.
    expect(output).not.toContain("Wrote manifest: ")
    expect(output).not.toContain("Discovered")

    // The warning banner is gated on result.manifest?.parseWarnings.length --
    // with no manifest, this must stay silent rather than throwing on the
    // optional chain or misreading a mutated `?? 0` as some other count.
    expect(output).not.toContain("⚠")

    // --evidence was passed -- this line is independent of --location.
    // (Printed as the arg's own relative path, not joined against fixtureRoot.)
    expect(output).toContain("Wrote evidence: docs/env.evidence.json")

    await expect(
      fs.access(path.join(fixtureRoot, "docs/env.evidence.json")),
    ).resolves.toBeUndefined()
  })
})

describe("main() -- unresolved/dropped-schema warning banner", () => {
  it("prints a leading ⚠ banner, before the manifest summary, when a createEnv() call can't be statically resolved", async () => {
    // A dynamically-constructed schema (createEnv(buildSchema())) can't be
    // statically resolved -- per the README/ADR 0002, this produces a parse
    // warning instead of silently guessing.
    await write(
      "features/dynamic/env.schema.ts",
      `import { createEnv } from "env-cap";

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
    expect(output).toContain("Checking for drift (--check: nothing will be written)...")
    expect(output).toContain("All generated artifacts are up to date.")
    // Exact per-finding line format: artifact/path columns padded, status
    // upper-cased, and no trailing "(detail)" parenthetical for an "ok" finding.
    expect(output).toContain(
      `  manifest   ${path.join(fixtureRoot, "src/generated/env.manifest.ts").padEnd(50)} OK\n`,
    )
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
      `import { createEnv, documentEnv } from "env-cap";
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
    // Exact per-finding line for a stale finding, including the
    // "(<detail>)" parenthetical a fresh/"ok" finding never gets.
    expect(output).toContain(
      `  manifest   ${manifestPath.padEnd(50)} STALE (generated content differs from what's committed)\n`,
    )
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
      "--location",
      "src/generated/env.manifest.ts",
      "--json",
    ]

    await main()

    const output = writes.join("")
    const payload = JSON.parse(output) as {
      ok: boolean
      manifest?: { contracts?: unknown[] }
    }
    expect(payload.ok).toBe(true)
    expect(payload.manifest?.contracts).toBeDefined()
    expect(payload.manifest?.contracts).toHaveLength(1)
  })

  it("includes the evidence key only when --evidence was passed", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/no-evidence.manifest.ts",
      "--json",
    ]
    await main()
    const withoutEvidence = JSON.parse(writes.join("")) as { evidence?: unknown }
    expect(withoutEvidence.evidence).toBeUndefined()
    expect("evidence" in withoutEvidence).toBe(false)

    writes = []
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/with-evidence.manifest.ts",
      "--evidence",
      "docs/with-evidence.evidence.json",
      "--json",
    ]
    await main()
    const withEvidence = JSON.parse(writes.join("")) as { evidence?: unknown }
    expect("evidence" in withEvidence).toBe(true)
    expect(withEvidence.evidence).toBeDefined()
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

describe("main() -- none of --location/--evidence given", () => {
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
      "At least one of --location or --evidence is required.",
    )
    expect(process.exitCode).toBe(1)
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

  it("reports the stale artifact's name in checkResult.stale, and ok:false, once the schema changes after generation", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
    ]
    await main()

    await write(
      "features/notifications/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";
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
      "--json",
    ]
    await main()

    const output = writes.join("")
    const payload = JSON.parse(output) as {
      ok: boolean
      checkResult?: { ok: boolean; stale: string[] }
    }
    expect(payload.checkResult?.ok).toBe(false)
    expect(payload.checkResult?.stale).toEqual(["manifest"])
    expect(process.exitCode).toBe(1)
  })
})

describe("main() -- --check --strict throws on a real blocking incompatibility", () => {
  async function writeConflictingFixture(): Promise<void> {
    await write(
      "features/check-broken-a/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const brokenAEnv = createEnv({ SHARED: { processor: (v): string => String(v) } }, { name: "check-broken-a" });\n`,
    )
    await write(
      "features/check-broken-b/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const brokenBEnv = createEnv({ SHARED: { processor: (v): boolean => Boolean(v) } }, { name: "check-broken-b" });\n`,
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
    await write(
      "features/propagation-a/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const propagationAEnv = createEnv({ SHARED: { processor: (v): string => String(v) } }, { name: "propagation-a" });\n`,
    )
    await write(
      "features/propagation-b/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const propagationBEnv = createEnv({ SHARED: { processor: (v): boolean => Boolean(v) } }, { name: "propagation-b" });\n`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/propagation-*/env.schema.ts",
      "--location",
      "src/generated/propagation.manifest.ts",
      "--strict",
    ]

    await expect(main()).rejects.toThrow(EnvProjectGenerationError)
  })

  it("writes a serialized failure and exits 1, instead of throwing, when --json IS passed (no --check)", async () => {
    await write(
      "features/propagation-json-a/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const propagationJsonAEnv = createEnv({ SHARED: { processor: (v): string => String(v) } }, { name: "propagation-json-a" });\n`,
    )
    await write(
      "features/propagation-json-b/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const propagationJsonBEnv = createEnv({ SHARED: { processor: (v): boolean => Boolean(v) } }, { name: "propagation-json-b" });\n`,
    )

    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/propagation-json-*/env.schema.ts",
      "--location",
      "src/generated/propagation-json.manifest.ts",
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

describe("main() -- --exclude and --package flow through to generateEnvArtifacts()", () => {
  it("--exclude narrows discovery and --package (an unresolvable name) surfaces as a harmless parse warning", async () => {
    await write(
      "features/wpe-excluded/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const wpeExcludedEnv = createEnv({ EXCLUDED_VAR: {} }, { name: "wpe-excluded" });\n`,
    )
    await write(
      "features/wpe-included/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const wpeIncludedEnv = createEnv({ INCLUDED_VAR: {} }, { name: "wpe-included" });\n`,
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
      `import { createEnv } from "env-cap";\nexport const billingEnv = createEnv({ INVOICE_KEY: {} }, { name: "alias-billing" });\n`,
    )
    await write(
      "src/alias-consumer.ts",
      `import { billingEnv } from "@/alias-billing/env.schema.js";\nbillingEnv.INVOICE_KEY;\n`,
    )
  })

  // `--ownership` no longer exists (ADR 0046), so ownership findings are no
  // longer visible in the CLI's human-readable stdout -- the dependency-
  // ownership engine (Finding Model's "ownership" family, ADR 0038) still
  // runs unconditionally regardless of any CLI flag, so this now reads it
  // off the `--evidence --json` envelope instead of the removed
  // `printUsageSummary()` text.
  function findingCodes(output: string): string[] {
    const payload = JSON.parse(output) as {
      evidence?: { finding?: { findings?: { code: string }[] } }
    }
    return (payload.evidence?.finding?.findings ?? []).map((f) => f.code)
  }

  it("default (auto-detected tsconfig.json): the aliased contract is not reported abandoned", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/alias-billing/env.schema.ts",
      "--evidence",
      "docs/alias.evidence.json",
      "--json",
    ]

    await main()

    expect(findingCodes(writes.join(""))).not.toContain("ABANDONED_CONTRACT")
  })

  it("--no-tsconfig disables alias resolution -- the same contract is now reported abandoned", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--include",
      "features/alias-billing/env.schema.ts",
      "--evidence",
      "docs/alias-disabled.evidence.json",
      "--json",
      "--no-tsconfig",
    ]

    await main()

    expect(findingCodes(writes.join(""))).toContain("ABANDONED_CONTRACT")
  })
})

describe("main() -- manifest.warnings (compatibility warnings, non-strict)", () => {
  it("prints the compatibility-warning section when two contracts declare the same variable with differing, unannotated processors", async () => {
    await write(
      "features/warn-a/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const warnAEnv = createEnv({ SHARED_VAR: { processor: (v) => String(v) } }, { name: "warn-a" });\n`,
    )
    await write(
      "features/warn-b/env.schema.ts",
      `import { createEnv } from "env-cap";\nexport const warnBEnv = createEnv({ SHARED_VAR: { processor: (v) => String(v).trim() } }, { name: "warn-b" });\n`,
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
    expect(output).toContain("- [PROCESSOR_SOURCE_CONFLICT] SHARED_VAR:")
  })
})

describe("main() -- evidence changes since the last persisted snapshot (ADR 0038)", () => {
  it("reports everything as added on the first run, and 'No changes.' on an immediate rerun against the same source", async () => {
    const location = "src/generated/changes.manifest.ts"
    const evidence = "docs/changes.evidence.json"
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      location,
      "--evidence",
      evidence,
    ]

    await main()
    const firstOutput = writes.join("")
    expect(firstOutput).toContain(`Wrote evidence: ${evidence}\n`)
    expect(firstOutput).toContain("Evidence changes since the last persisted snapshot:")
    expect(firstOutput).toContain("Added:")
    expect(firstOutput).toContain('contract "payments"')
    expect(firstOutput).toContain('STRIPE_KEY in "payments"')

    writes.length = 0
    await main()
    const secondOutput = writes.join("")
    expect(secondOutput).toContain("Evidence changes since the last persisted snapshot:")
    expect(secondOutput).toContain("No changes.")
    expect(secondOutput).not.toContain("Added:")
  })

  it("reports an Updated: section with the changed field's before/after values after a documentEnv() edit", async () => {
    const location = "src/generated/changes-updated.manifest.ts"
    const evidence = "docs/changes-updated.evidence.json"
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      location,
      "--evidence",
      evidence,
    ]
    await main()
    writes.length = 0

    await write(
      "features/payments/env.schema.ts",
      `import { createEnv, documentEnv } from "env-cap";

const schema = {
  STRIPE_KEY: {},
  UNDOCUMENTED_VAR: {},
};

export const paymentsEnv = createEnv(schema, { name: "payments" });

documentEnv(schema, {
  owner: "payments-team",
  variables: {
    // \`description\` drops to unset (was "Stripe secret key.") and
    // \`sensitivity\` goes from unset to defined -- exercises BOTH sides of
    // formatFieldChanges()'s "previous ?? \\"unset\\""/"current ?? \\"unset\\""
    // fallback in one field-change list, and (being two field changes on the
    // same variable) its ", "-joined output too.
    STRIPE_KEY: { sensitivity: "secret" },
  },
});
`,
    )

    await main()
    const output = writes.join("")
    expect(output).toContain("Updated:")
    expect(output).toContain(
      'STRIPE_KEY in "payments": description (Stripe secret key. -> unset), sensitivity (unset -> secret)',
    )
    expect(output).not.toContain("Added:")
  })
})

// `--docs`/`--ownership`/`--env-example` were removed from the CLI (ADR
// 0046): the human-readable docs/env-example/dependency-ownership summary
// sections (`printDocsSummary()`/`printUsageSummary()`) no longer exist in
// `src/cli/index.ts`, so the describe blocks that used to exercise them
// through a real `main()` run (env-example reconciliation formatting,
// doc.undocumentedContracts/staleDocEntries/expiringSoon/unresolvedLinks,
// and the --ownership output block) were removed too -- that rendering
// logic is gone from the CLI, not just untested. The underlying computation
// (`computeDocumentation()`/`computeUsage()`, which still run
// unconditionally inside `generateEnvArtifacts()` for Finding Model, ADR
// 0038) keeps its own full library-level coverage in
// test/build/documentation-generate.test.ts and test/build/usage-generate.test.ts,
// unaffected by this CLI change. See
// specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md and
// examples/nextjs-app/scripts/generate-docs for where this rendering lives now.

// The default fixture (see beforeEach) always has an undocumented variable
// (UNDOCUMENTED_VAR) and a contract nothing imports, so it produces both a
// documentation-family and an ownership-family warning without any extra
// setup -- exactly what these two scoped flags gate on.
describe("main() -- --strict-docs / --strict-ownership", () => {
  // `--docs`/`--ownership` no longer exist as CLI flags (ADR 0046) -- every
  // case below now drives the always-computed documentation/ownership
  // findings (Finding Model, ADR 0038) through `--location` alone, exactly
  // like the pre-existing "bare --strict" case below already did.
  it("writes the manifest and exits cleanly without either flag, however many warnings exist", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
    ]

    await main()

    expect(process.exitCode).not.toBe(1)
    await expect(
      fs.stat(path.join(fixtureRoot, "src/generated/env.manifest.ts")),
    ).resolves.toBeDefined()
  })

  it("throws on a documentation-family warning under --strict-docs, writing nothing", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/strict-docs.manifest.ts",
      "--strict-docs",
    ]

    await expect(main()).rejects.toBeInstanceOf(EnvProjectGenerationError)
    // Atomic: the blocking check runs before any pass writes.
    await expect(
      fs.stat(path.join(fixtureRoot, "src/generated/strict-docs.manifest.ts")),
    ).rejects.toThrow()
  })

  it("names the offending finding code in the thrown error, not just a count", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/strict-docs.manifest.ts",
      "--strict-docs",
    ]

    await expect(main()).rejects.toThrow(/UNDOCUMENTED_VARIABLE/)
  })

  it("throws on an ownership-family warning under --strict-ownership, writing nothing", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/strict-ownership.manifest.ts",
      "--strict-ownership",
    ]

    await expect(main()).rejects.toThrow(/ABANDONED_CONTRACT/)
    await expect(
      fs.stat(path.join(fixtureRoot, "src/generated/strict-ownership.manifest.ts")),
    ).rejects.toThrow()
  })

  it("--strict-docs leaves ownership findings alone, and vice versa -- the two scoped flags are independent", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/strict-ownership-only.manifest.ts",
      "--strict-ownership",
    ]
    await expect(main()).rejects.toThrow(/ABANDONED_CONTRACT/)
  })

  it("bare --strict also escalates documentation/ownership findings, even without --docs/--ownership requested (ADR 0044)", async () => {
    process.argv = [
      "node",
      "env-cap",
      "--root",
      fixtureRoot,
      "--location",
      "src/generated/env.manifest.ts",
      "--strict",
    ]
    // Before ADR 0044, bare --strict gated the compatibility family only, so
    // this same fixture's documentation/ownership warnings did not block it.
    // Now it does -- "strict" means every provable-error family, matching
    // @maverickcer/data-cap's own bare --strict.
    await expect(main()).rejects.toThrow(/UNDOCUMENTED_VARIABLE|ABANDONED_CONTRACT/)
  })

  it("lists --strict-docs and --strict-ownership in --help", async () => {
    process.argv = ["node", "env-cap", "--help"]
    await main()
    const output = writes.join("")
    expect(output).toContain("--strict-docs")
    expect(output).toContain("--strict-ownership")
  })

  it("lists the init subcommand in --help", async () => {
    process.argv = ["node", "env-cap", "--help"]
    await main()
    expect(writes.join("")).toContain("env-cap init")
  })
})

describe("main() -- init subcommand dispatch", () => {
  it("routes `init` (first positional token) to the scaffolder, not parseArgs", async () => {
    // parseArgs() would throw "Unknown argument: init" -- reaching the init
    // help text at all proves main() intercepted before parseArgs.
    process.argv = ["node", "env-cap", "init", "--help"]

    await main()

    expect(writes.join("")).toContain("Usage: env-cap init")
    expect(process.exitCode).toBe(0)
  })

  it("scaffolds into the current directory and exits 0", async () => {
    // Mocks the `process.cwd` FUNCTION rather than calling the real
    // `process.chdir()` -- the latter throws
    // `ERR_WORKER_UNSUPPORTED_OPERATION` under a worker-thread-based test
    // runner (Stryker's own vitest-runner included) -- a Node.js platform
    // restriction, confirmed directly (`npm run mutation` aborted its whole
    // dry run on this file before this fix). Same technique this
    // codebase's own test/build/usage-generate.test.ts (and siblings)
    // already use for the identical reason.
    process.argv = ["node", "env-cap", "init"]
    await fs.mkdir(fixtureRoot, { recursive: true })
    await fs.writeFile(path.join(fixtureRoot, "package.json"), '{"name": "demo"}')
    vi.spyOn(process, "cwd").mockReturnValue(fixtureRoot)

    await main()

    expect(process.exitCode).toBe(0)
    expect(writes.join("")).toContain("env-cap initialized")
    await expect(fs.access(path.join(fixtureRoot, "env.schema.ts"))).resolves.toBeUndefined()
  })

  it("`--help` alone (no init token) still prints the generator help, not init help", async () => {
    process.argv = ["node", "env-cap", "--help"]
    await main()
    const output = writes.join("")
    expect(output).toContain("generate a manifest and/or a persisted evidence artifact")
    expect(output).not.toContain("Usage: env-cap init\n\nScaffolds")
  })
})
