import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

/**
 * `env-cap init` -- scaffolds a minimal, working env-cap starting point into
 * the current project: one discoverable capability contract and one
 * artifact-generation script. Nothing more.
 *
 * Deliberately filesystem-only and non-executing, matching this package's
 * own runtime discipline (ADR 0002, ADR 0040) and repo-contract's `init`:
 * it reads the consumer's `package.json` (to confirm it's a project and to
 * decide `src/` vs. root placement) and writes new files with
 * exclusive-create -- it never runs a subprocess, never invokes a package
 * manager, never mutates `package.json`, never regenerates an artifact, and
 * never reads the ambient environment. Anything the documented workflow
 * still needs afterwards is printed as a `Next:` step, not performed here.
 * See ADR 0042.
 *
 * `src/cli/**` is the sanctioned place for direct `node:fs` use (ADR 0040) --
 * this file is bundled into the `bin` target, exempt from the
 * `verify-no-ambient-fs` tarball guard exactly as `src/cli/index.ts` is.
 */

const USAGE = `Usage: env-cap init

Scaffolds a minimal env-cap starting point into the current directory:

  <src>/env.schema.ts     a starter capability contract (createEnv + documentEnv)
  scripts/generate-env.mjs a script that generates the manifest + docs artifacts

Never overwrites an existing file, never runs anything, never edits
package.json. Everything else -- generating artifacts, wiring validateEnv()
into startup -- is printed as a next step. Run generation afterwards with
\`node scripts/generate-env.mjs\` or \`npx env-cap --location <path>\`.`

const SCHEMA_TEMPLATE = `// Starter env-cap capability contract -- expand it: add your real variables,
// split into per-capability files (e.g. features/<name>/env.schema.ts), or
// keep everything here. env-cap discovers every **/env.schema.ts by default.
//
// createEnv() reads only default/processor/validator/context -- the fields
// validateEnv() uses at runtime. documentEnv() is a build-time-only marker
// that feeds the generated docs and ownership report; it is inert at runtime.
// Keep the object passed to both a static literal -- env-cap resolves it by
// static analysis and never executes this file.
import { createEnv, documentEnv } from "env-cap"

const schema = {
  EXAMPLE_API_URL: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string) => value.startsWith("https://") || "Expected an https:// URL.",
  },
}

export const exampleEnv = createEnv(schema, { name: "example", source: import.meta.url })

documentEnv(schema, {
  owner: "your-team",
  variables: {
    EXAMPLE_API_URL: {
      description: "Base URL for the example upstream API. Replace with a real variable.",
      required: true,
    },
  },
})
`

const GENERATOR_TEMPLATE = `// Build-time only. Run with \`node scripts/generate-env.mjs\`, or wire it into
// a package.json script (e.g. "generate:env"). Never imported by app code.
import { generateEnvArtifacts } from "env-cap/build"
import { nodeBuildFileSystem } from "env-cap/node"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const result = await generateEnvArtifacts({
  fs: nodeBuildFileSystem,
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: {
    location: "docs/ENVIRONMENT.md",
    envExample: { location: ".env.example", onExisting: "keep-sibling" },
  },
  usage: { report: { location: "docs/OWNERSHIP.md" } },
})

console.log(\`Discovered \${result.manifest?.contracts.length ?? 0} contract(s).\`)
if (result.manifest?.outputPath) console.log(\`Wrote manifest: \${result.manifest.outputPath}\`)
if (result.docs?.docsPath) console.log(\`Wrote docs: \${result.docs.docsPath}\`)
`

type WriteOutcome = "created" | "skipped"

interface ScaffoldTarget {
  readonly label: string
  readonly absolutePath: string
  readonly content: string
}

interface ScaffoldResult {
  readonly target: ScaffoldTarget
  readonly outcome: WriteOutcome
}

interface InitReport {
  readonly results: readonly ScaffoldResult[]
  readonly schemaRelPath: string
}

/**
 * Confirms `cwd` is a project (`package.json` present and a JSON object).
 * Throws a message suitable for printing directly on any failure -- every
 * such failure is a preflight failure and nothing is written.
 */
function assertIsProject(cwd: string): void {
  const packageJsonPath = path.join(cwd, "package.json")
  if (!existsSync(packageJsonPath)) {
    throw new Error(`no package.json found at ${packageJsonPath} -- run \`npm init\` first.`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  } catch {
    // No binding: the SyntaxError carries only a char offset, nothing the
    // caller needs beyond "the file at this path isn't valid JSON".
    throw new Error(`package.json at ${packageJsonPath} is not valid JSON.`)
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`package.json at ${packageJsonPath} must contain a top-level object.`)
  }
}

/** `src/` if it already exists as a directory, otherwise the project root -- where the starter schema goes. */
function schemaDirectory(cwd: string): string {
  const srcDir = path.join(cwd, "src")
  return existsSync(srcDir) && statSync(srcDir).isDirectory() ? srcDir : cwd
}

/**
 * Computes the two scaffold targets and rejects any whose path is already
 * blocked by a wrong-typed entry (a directory where a file must go, or a
 * non-directory where `scripts/` must go). A failure here means zero writes.
 */
function planTargets(cwd: string): ScaffoldTarget[] {
  const schemaPath = path.join(schemaDirectory(cwd), "env.schema.ts")
  const scriptsDir = path.join(cwd, "scripts")
  const generatorPath = path.join(scriptsDir, "generate-env.mjs")

  for (const filePath of [schemaPath, generatorPath]) {
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      throw new Error(`${filePath} already exists and is a directory.`)
    }
  }
  if (existsSync(scriptsDir) && !statSync(scriptsDir).isDirectory()) {
    throw new Error(`${scriptsDir} already exists and is not a directory.`)
  }

  return [
    {
      label: path.relative(cwd, schemaPath),
      absolutePath: schemaPath,
      content: SCHEMA_TEMPLATE,
    },
    {
      label: path.relative(cwd, generatorPath),
      absolutePath: generatorPath,
      content: GENERATOR_TEMPLATE,
    },
  ]
}

/**
 * Writes `content` to `filePath` only if it doesn't already exist, creating
 * parent directories first. Exclusive-create (`"wx"`) rather than an
 * existsSync-then-write pair -- the two-step form races between the check
 * and the write; `"wx"` makes "don't overwrite" atomic. An existing file is
 * never touched -- the conflict is resolved by skipping, never overwriting.
 */
function writeIfAbsent(filePath: string, content: string): WriteOutcome {
  mkdirSync(path.dirname(filePath), { recursive: true })
  try {
    writeFileSync(filePath, content, { flag: "wx" })
    return "created"
  } catch (error) {
    if (isFileExistsError(error)) return "skipped"
    throw error
  }
}

function isFileExistsError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "EEXIST"
  )
}

function runInit(cwd: string): InitReport {
  assertIsProject(cwd)
  const targets = planTargets(cwd)
  const results = targets.map((target) => ({
    target,
    outcome: writeIfAbsent(target.absolutePath, target.content),
  }))
  return { results, schemaRelPath: targets[0].label }
}

/** The structured `Created:` / `Skipped:` / `Next:` report, as a string (one `console.log`, testable). */
function renderReport(report: InitReport): string {
  const lines: string[] = ["env-cap initialized", ""]

  const created = report.results.filter((r) => r.outcome === "created")
  const skipped = report.results.filter((r) => r.outcome === "skipped")

  if (created.length > 0) {
    lines.push("Created:")
    for (const r of created) lines.push(`  + ${r.target.label}`)
    lines.push("")
  }
  if (skipped.length > 0) {
    lines.push("Skipped (already exists):")
    for (const r of skipped) lines.push(`  - ${r.target.label}`)
    lines.push("")
  }

  const manifestImport = report.schemaRelPath.startsWith("src" + path.sep)
    ? "./generated/env.manifest.js"
    : "./src/generated/env.manifest.js"

  lines.push(
    "Next:",
    "  1. Generate the manifest + docs:  node scripts/generate-env.mjs",
    "  2. Validate once at app startup:",
    "",
    '       import { validateEnv } from "env-cap"',
    `       import { manifest } from "${manifestImport}"`,
    "       await validateEnv({ manifest, values: process.env })",
    "",
    "  3. Read validated values through the contract:  exampleEnv.EXAMPLE_API_URL",
    "",
    "env-cap init edited no package.json script -- add one if you want, e.g.",
    '  "generate:env": "node scripts/generate-env.mjs"',
  )

  return lines.join("\n")
}

/**
 * `env-cap init` entry. Returns the process exit code; never calls
 * `process.exit`. `rest` is argv already sliced past the `init` token.
 */
export function runInitCommand(rest: readonly string[]): number {
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  if (rest.length > 0) {
    process.stderr.write(`env-cap init takes no arguments (got: ${rest.join(" ")})\n\n${USAGE}\n`)
    return 1
  }

  try {
    process.stdout.write(`${renderReport(runInit(process.cwd()))}\n`)
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`env-cap init failed: ${message}\n`)
    return 1
  }
}
