#!/usr/bin/env node
// Regenerates committed generated output from a fresh, real run.
// It is NOT part of `npm run verify` or CI. For a code change it stays a
// human step that says "I changed the output format on purpose". So a
// regression can never be re-goldened silently.
//
// `npm run version` (`changeset version && examples:update-golden`) runs it
// right after Changesets bumps the version. That is safe because Changesets
// never bundles a version-bump commit with source changes. Only
// package.json, CHANGELOG.md and what the goldens embed (toolVersion,
// generatedAt) can differ. No code change exists in that commit for a
// rewritten golden to paper over.
//
// Two tiers, handled differently on purpose:
//
//  - FLAGSHIPS (`examples/<name>`) have no `expected/` mirror of env-cap's
//    output. Their committed `docs/`, `.env.example`, and
//    `src/generated/env.manifest.ts` *are* the golden. A reader opening the
//    example sees the bytes `test/examples/<name>.test.ts` asserts on, with no
//    second copy to go stale. Regenerating one runs its generation script;
//    there is nothing to copy. `enterprise-platform/expected/output.json`
//    is unrelated: it is the example's runtime self-check, not env-cap output.
//  - FIXTURES (`test/integration/<category>`) keep their `expected/` mirrors.
//    They are behavioral fixtures with no human reader. An explicit
//    side-by-side diff of generator output is the point there.
//
// This plain Node script cannot import TypeScript, so it duplicates the
// normalization in src/build/docs.ts's normalizeDocsForComparison() and
// test/support/example-runner.ts's normalizeExampleCliOutput() and
// normalizeExampleJsonOutput(). Keep all three in sync when renderDocs()
// or the CLI's output format changes.

import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const STANDARD_ARTIFACTS_WITH_OWNERSHIP = [
  "src/generated/env.manifest.ts",
  "docs/ENVIRONMENT.md",
  "docs/OWNERSHIP.md",
  "docs/env.evidence.json",
  "docs/env.evidence.json.fingerprint",
  ".env.example",
]
const STANDARD_ARTIFACTS = [
  "src/generated/env.manifest.ts",
  "docs/ENVIRONMENT.md",
  "docs/env.evidence.json",
  "docs/env.evidence.json.fingerprint",
  ".env.example",
]

// The three human-facing flagships, rooted at examples/<name>, each mapped
// to the npm script that regenerates its committed output. Two call the
// `env-cap` CLI directly (`docs`). `enterprise-platform` keeps a
// hand-written script (`generate:env`) because it does custom reporting.
// That script's "ADVANCED TIER" header explains it.
const FLAGSHIP_SCRIPTS = {
  application: "docs",
  "team-service": "docs",
  "enterprise-platform": "generate:env",
}

// The twelve behavioral fixtures under test/integration/, one entry per
// fixture directory. Each key is a path from the root, because each fixture
// lives under a different positive/negative/<category> folder.
// multiple-active-exclusive-capabilities is left out on purpose. Its
// generate:env always fails by design, so there is nothing to golden.
const FIXTURES = {
  // The CLI writes only the manifest and the evidence artifact (ADR 0046): no docs, no .env.example.
  "test/integration/positive/basic/cli-usage": {
    artifacts: [
      "src/generated/env.manifest.ts",
      "docs/env.evidence.json",
      "docs/env.evidence.json.fingerprint",
    ],
    cli: true,
  },
  "test/integration/positive/basic/split-generators": {
    artifacts: STANDARD_ARTIFACTS_WITH_OWNERSHIP,
  },
  "test/integration/positive/team/validation-contexts": { artifacts: STANDARD_ARTIFACTS },
  "test/integration/positive/team/duplicate-variable-metadata": { artifacts: STANDARD_ARTIFACTS },
  "test/integration/positive/enterprise/aws-secrets-manager": { artifacts: STANDARD_ARTIFACTS },
  "test/integration/positive/enterprise/paypal-addon": { artifacts: STANDARD_ARTIFACTS },
  "test/integration/positive/enterprise/paypal-consumer": {
    artifacts: [
      "src/env.manifest.ts",
      "docs/ENVIRONMENT.md",
      "docs/env.evidence.json",
      "docs/env.evidence.json.fingerprint",
      ".env.example",
    ],
  },
  "test/integration/positive/enterprise/tsconfig-aliases": {
    artifacts: STANDARD_ARTIFACTS_WITH_OWNERSHIP,
  },
  "test/integration/positive/enterprise/tsconfig-aliases-consumer": {
    artifacts: STANDARD_ARTIFACTS_WITH_OWNERSHIP,
  },
  "test/integration/positive/enterprise/evidence-projections": {
    artifacts: [
      ".env.example",
      "docs/env.evidence.json",
      "docs/env.evidence.json.fingerprint",
      "projected-config-reference.md",
      "projected-inventory.json",
      "projected-ownership.json",
      "projected-lifecycle.json",
      "projected-dependency-graph.dot",
      "projected-dependency-graph.mmd",
      "projected-dependency-graph.json",
      "projected-findings.json",
      "projected-drift.json",
      "projected-migration.json",
      "projected-audit-trail.json",
      "projected-blast-radius.json",
      "projected-joined-variables.json",
    ],
    extraScripts: [
      "project:env-example",
      "project:config-reference",
      "project:inventory",
      "project:ownership",
      "project:lifecycle",
      "project:dependency-graph",
      "project:findings",
      "project:drift",
      "project:migration",
      "project:change-impact-audit-trail",
      "project:change-impact-blast-radius",
      "project:joined-variables",
    ],
  },
  "test/integration/negative/invalid-config/missing-env-var": { artifacts: STANDARD_ARTIFACTS },
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

// --silent suppresses only npm's "> script\n> command\n" preamble. Without
// it, generate:env:json's captured output is not parseable JSON. It also
// keeps every other golden free of preamble text that varies by npm version.
// See test/support/example-runner.ts's runNpmScript() docstring.
function run(exampleDir, script) {
  return execFileSync("npm", ["run", "--silent", script], {
    cwd: exampleDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

/**
 * Regenerates one flagship example's committed output in place, by running
 * its own generation script: the same command its README tells a reader to
 * run. Nothing is copied anywhere: the files it just wrote are the golden.
 */
function regenerateFlagship(name, script) {
  const exampleDir = path.join(root, "examples", name)
  if (!existsSync(path.join(exampleDir, "node_modules"))) {
    console.log(`[skip] ${name}: node_modules not installed (run npm install in ${name} first)`)
    return
  }
  console.log(`[golden] ${name}: regenerating (npm run ${script})...`)
  run(exampleDir, script)
  console.log(`[golden] ${name}: done.`)
}

function regenerate(label, relativeDir, config) {
  const exampleDir = path.join(root, relativeDir)
  if (!existsSync(path.join(exampleDir, "node_modules"))) {
    console.log(
      `[skip] ${label}: node_modules not installed (run npm install in ${relativeDir} first)`,
    )
    return
  }

  console.log(`[golden] ${label}: regenerating...`)
  const generateOutput = run(exampleDir, "generate:env")
  // evidence-projections' projected artifacts each come from their own
  // `project:*` script (which runs generate:env itself first, as their
  // baseline) rather than generate:env alone.
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

  console.log(`[golden] ${label}: done.`)
}

for (const [name, script] of Object.entries(FLAGSHIP_SCRIPTS)) regenerateFlagship(name, script)
for (const [relativeDir, config] of Object.entries(FIXTURES))
  regenerate(relativeDir, relativeDir, config)

console.log("\nGenerated output updated. Review the diff before committing.")
