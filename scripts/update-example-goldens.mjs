#!/usr/bin/env node
// Regenerates every example's `expected/` golden fixtures from a fresh, real
// generation run. Deliberately NOT part of `npm run verify`/CI -- this is a
// human-invoked "I intentionally changed the output format, here's the new
// golden" step. See examples/README.md's "expected/" section.
//
// Mirrors (duplicates, deliberately -- this is a plain Node script, not
// TypeScript-aware, so it can't import src/build/docs.ts directly) the
// normalization logic in src/build/docs.ts's normalizeDocsForComparison()
// and test/examples/support.ts's normalizeExampleCliOutput()/
// normalizeExampleJsonOutput(). Keep all three in sync if renderDocs()'s or
// the CLI's output format ever changes.

import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const examplesRoot = path.join(root, "examples")

const STANDARD_ARTIFACTS_WITH_OWNERSHIP = [
  "src/generated/env.manifest.ts",
  "src/generated/env.manifest.snapshot.json",
  "docs/ENVIRONMENT.md",
  "docs/OWNERSHIP.md",
  ".env.example",
]
const STANDARD_ARTIFACTS = [
  "src/generated/env.manifest.ts",
  "src/generated/env.manifest.snapshot.json",
  "docs/ENVIRONMENT.md",
  ".env.example",
]

// multiple-active-exclusive-capabilities is deliberately excluded -- by
// design (see its README), generate:env always fails there and nothing is
// ever successfully generated, so there is nothing to golden.
const EXAMPLES = {
  "basic-node": { artifacts: STANDARD_ARTIFACTS_WITH_OWNERSHIP },
  "cli-usage": { artifacts: STANDARD_ARTIFACTS_WITH_OWNERSHIP, cli: true },
  "composable-boilerplates": { artifacts: STANDARD_ARTIFACTS_WITH_OWNERSHIP },
  "paypal-addon": { artifacts: STANDARD_ARTIFACTS },
  "paypal-consumer": {
    artifacts: [
      "src/env.manifest.ts",
      "src/env.manifest.snapshot.json",
      "docs/ENVIRONMENT.md",
      ".env.example",
    ],
  },
  "aws-secrets-manager": { artifacts: STANDARD_ARTIFACTS },
  "missing-env-var": { artifacts: STANDARD_ARTIFACTS },
  "duplicate-variable-metadata": { artifacts: STANDARD_ARTIFACTS },
  "split-generators": { artifacts: STANDARD_ARTIFACTS_WITH_OWNERSHIP },
  "validation-contexts": { artifacts: STANDARD_ARTIFACTS },
  "tsconfig-aliases": { artifacts: STANDARD_ARTIFACTS_WITH_OWNERSHIP },
  "tsconfig-aliases-consumer": { artifacts: STANDARD_ARTIFACTS_WITH_OWNERSHIP },
  "evidence-projections": {
    artifacts: [
      ".env.example",
      "projected-config-reference.md",
      "projected-inventory.json",
      "projected-ownership.json",
    ],
    extraScripts: [
      "project:env-example",
      "project:config-reference",
      "project:inventory",
      "project:ownership",
    ],
  },
}

function normalizeDocsForComparison(content) {
  return content
    .replace(/^_Generated .+_$/m, "_Generated <normalized-for-comparison>_")
    .replace(/\(\*\*\d+d remaining\*\*\)/g, "(**Nd remaining**)")
    .replace(/\(\*\*expired \d+d ago\*\*\)/g, "(**expired Nd ago**)")
    .replace(/^(- Already expired:) \d+$/gm, "$1 N")
    .replace(/^(- Expiring within \d+ days:) \d+$/gm, "$1 N")
}

function normalizeCliOutput(output, exampleDir) {
  const withPlaceholder = output.split(exampleDir).join("<EXAMPLE_ROOT>")
  const collapsedPadding = withPlaceholder
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, "").replace(/ {2,}/g, " "))
    .join("\n")
  return normalizeDocsForComparison(collapsedPadding)
}

// --silent suppresses only npm's own "> script\n> command\n" preamble --
// required for generate:env:json's captured output to be parseable JSON at
// all, and keeps every other golden free of npm-version-dependent preamble
// formatting too. See test/examples/support.ts's runNpmScript() docstring.
function run(exampleDir, script) {
  return execFileSync("npm", ["run", "--silent", script], {
    cwd: exampleDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

for (const [name, config] of Object.entries(EXAMPLES)) {
  const exampleDir = path.join(examplesRoot, name)
  if (!existsSync(path.join(exampleDir, "node_modules"))) {
    console.log(
      `[skip] ${name}: node_modules not installed (run npm install in examples/${name} first)`,
    )
    continue
  }

  console.log(`[golden] ${name}: regenerating...`)
  const generateOutput = run(exampleDir, "generate:env")
  // evidence-projections' projected artifacts each come from their own
  // `project:*` script (which runs generate:env itself first, as their
  // baseline) rather than generate:env alone -- see its README.
  for (const script of config.extraScripts ?? []) run(exampleDir, script)

  const expectedDir = path.join(exampleDir, "expected")
  for (const relativePath of config.artifacts) {
    const dest = path.join(expectedDir, relativePath)
    mkdirSync(path.dirname(dest), { recursive: true })
    cpSync(path.join(exampleDir, relativePath), dest)
  }

  if (config.cli) {
    const cliDir = path.join(expectedDir, "cli")
    mkdirSync(cliDir, { recursive: true })

    writeFileSync(
      path.join(cliDir, "generate-stdout.txt"),
      normalizeCliOutput(generateOutput, exampleDir),
      "utf8",
    )
    writeFileSync(
      path.join(cliDir, "check-stdout.txt"),
      normalizeCliOutput(run(exampleDir, "verify:env"), exampleDir),
      "utf8",
    )

    const jsonOutput = run(exampleDir, "generate:env:json")
    writeFileSync(
      path.join(cliDir, "report.json"),
      jsonOutput.split(exampleDir).join("<EXAMPLE_ROOT>"),
      "utf8",
    )
  }

  console.log(`[golden] ${name}: done.`)
}

console.log("\nGolden fixtures updated. Review the diff before committing.")
