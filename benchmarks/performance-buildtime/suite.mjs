// env-cap build-time benchmark suite: the cost of the CLI/CI tooling (`@maverickcer/env-cap/build`) that discovers
// contracts and generates manifests, documentation, usage reports and evidence. This is development
// and CI cost, not production request cost -- it is paid by every pipeline run and every developer
// who regenerates artifacts. See ../READING-BENCHMARKS.md and ../WRITING-BENCHMARKS.md.
//
// Imports env-cap by its PACKAGE NAME, never a monorepo-relative path.

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineSuite } from "internal-package-contract/benchmark"
import { defineEvidenceProjection } from "@maverickcer/env-cap/evidence"
import {
  discoverSchemaFiles,
  generateDocumentation,
  generateEnvArtifacts,
  generateEnvManifest,
  generateEvidenceModel,
  generateUsageReport,
} from "@maverickcer/env-cap/build"
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"
import { generateBuildtimeFixtures } from "../benchmark-fixtures/generator.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturesRoot = path.join(here, "fixtures", "generated")
const EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/_benchmark-output/**"]
const SLOW = { warmupIterations: 1, minIterations: 3, maxIterations: 8, targetDurationMs: 1500 }

/** Fixture trees are expensive to write at large sizes, so each (size, docs style) is generated once and shared. */
const fixtureCache = new Map()
function fixture(n, docsStyle = "minimal") {
  const key = `${String(n)}-${docsStyle}`
  if (!fixtureCache.has(key)) {
    const outputDir = path.join(fixturesRoot, key)
    fixtureCache.set(
      key,
      generateBuildtimeFixtures({ outputDir, docsStyle, variables: n }).then(() => outputDir),
    )
  }
  return fixtureCache.get(key)
}
const out = (root, name) => path.join(root, "_benchmark-output", name)

async function readAll(dir) {
  let bytes = 0
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === "_benchmark-output") continue
    const full = path.join(dir, entry.name)
    bytes += entry.isDirectory() ? await readAll(full) : (await fs.readFile(full, "utf8")).length
  }
  return bytes
}

/** A projection that touches all six canonical fact models, shaped like a real consumer's. */
const projection = defineEvidenceProjection({
  variableKeys: (evidence) =>
    evidence.contract.contracts.flatMap((c) => c.variables.map((v) => v.key)),
  ownersByContract: (evidence) =>
    Object.fromEntries(evidence.ownership.contracts.map((c) => [c.exportName, c.owner])),
  expiringSoonKeys: (evidence) => evidence.lifecycle.expiring.map((e) => e.key ?? e.exportName),
  findingCountsBySeverity: (evidence) =>
    evidence.finding.findings.reduce(
      (acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }),
      {},
    ),
  consumingFileCounts: (evidence) =>
    evidence.dependency.contracts.map((c) => c.consumingFiles.length),
})

const VARIABLES = {
  name: "declared variables",
  how: "swept",
  description:
    "The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it).",
}
const FIXTURE_SHAPE = {
  name: "schema content",
  how: "fixed",
  value:
    "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls",
  description:
    "Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling.",
}
const DISK = {
  name: "filesystem",
  how: "fixed",
  value: "local SSD through the Node adapter",
  description: "A network or virtual filesystem adds latency per file; not covered.",
}
const RUNTIME = {
  name: "runtime",
  how: "fixed",
  value: "Node (V8)",
  description: "Measured on Node only.",
}

const generate = (call) => ({
  setup: async (n) => ({ root: await fixture(n) }),
  run: ({ root }) => call(root),
})

export default defineSuite({
  package: { name: "env-cap", bundleFiles: ["dist/build.js", "dist/node.js", "dist/evidence.js"] },
  tiers: [20, 40, 80, 160, 320, 640, 1280, 2560, 5120],

  workload: {
    unit: "variable",
    description:
      "One environment variable declared in a schema file. Schema files hold ten variables each, so 640 variables is 64 files -- a large monorepo's worth of configuration. The ladder stops at 5,120 variables (512 files) because `discoverSchemaFiles` refuses more than 1,000 files as a sanity limit, which 10,240 variables would exceed.",
    typicalN: 640,
  },

  endToEnd: {
    purpose:
      "Shows what a pipeline run or a developer pays to regenerate every env-cap artifact (manifest, documentation and usage report) for a project, compared with the bare minimum of just reading every schema file. The baseline is the unavoidable floor -- the files must at least be read -- so the difference is env-cap's parsing, linking and rendering. This is CI and development time, paid on every build, not request-time cost.",
    baseline: {
      description: "Walk the project directory and read every schema file as text -- no env-cap.",
      sampling: SLOW,
      setup: async (n) => ({ root: await fixture(n) }),
      run: ({ root }) => readAll(root),
    },
    withPackage: {
      description:
        "`generateEnvArtifacts` discovers, parses and links every schema once and writes the manifest, the documentation and the usage report.",
      sampling: SLOW,
      setup: async (n) => ({ root: await fixture(n) }),
      run: ({ root }) =>
        generateEnvArtifacts({
          root,
          fs: nodeBuildFileSystem,
          manifest: { location: out(root, "env.manifest.ts") },
          docs: { location: out(root, "ENVIRONMENT.md") },
          usage: { report: { location: out(root, "OWNERSHIP.md") } },
        }),
    },
    variables: [
      VARIABLES,
      FIXTURE_SHAPE,
      DISK,
      RUNTIME,
      {
        name: "artifacts requested",
        how: "fixed",
        value: "manifest + docs + usage report",
        description:
          "Requesting fewer artifacts costs less; each standalone generator is measured below.",
      },
      {
        name: "cache state",
        how: "fixed",
        value: "no incremental cache",
        description: "Every run parses from scratch; the tooling keeps no build cache.",
      },
    ],
  },

  functions: [
    {
      id: "discover-schema-files",
      name: "discoverSchemaFiles",
      why: "Every build-time command starts by finding the project's schema files, so its cost is paid first by every generator and every CI run.",
      poorPerformanceMeans:
        "Every pipeline step that touches env-cap starts later, and a super-linear regression would slow monorepos with thousands of files before any real work begins.",
      expectedComplexity: "linear",
      complexityReason:
        "It walks the directory tree once and tests each path against the include and exclude patterns, so cost is proportional to the number of files visited.",
      variables: [
        VARIABLES,
        DISK,
        {
          name: "directory depth",
          how: "fixed",
          value: "one level of contract folders",
          description: "Deeper trees add a directory read per level.",
        },
        {
          name: "unrelated files",
          how: "fixed",
          value: "none",
          description:
            "Real repositories hold many non-schema files that must also be walked; a pure schema tree is the best case.",
        },
        RUNTIME,
      ],
      inEndToEnd: {
        callsPerOperation: 1,
        description: "Once at the start of every artifact generation.",
      },
      sampling: SLOW,
      ...generate((root) =>
        discoverSchemaFiles({
          root,
          fs: nodeBuildFileSystem,
          include: ["**/env.schema.ts"],
          exclude: EXCLUDE,
        }),
      ),
    },
    {
      id: "generate-manifest",
      name: "generateEnvManifest",
      why: "Produces the manifest the application imports at runtime; it runs in every build that ships the application.",
      poorPerformanceMeans:
        "Build time grows with the amount of configuration; a regression delays every deploy that regenerates the manifest.",
      expectedComplexity: "linear",
      complexityReason:
        "It discovers the files, parses each with the TypeScript parser once and renders one manifest entry per contract, so cost is proportional to the source text parsed.",
      variables: [
        VARIABLES,
        FIXTURE_SHAPE,
        DISK,
        {
          name: "scope",
          how: "variant",
          description: "All contracts versus a single contract selected with `include`.",
        },
        RUNTIME,
      ],
      variants: [
        {
          name: "all-contracts",
          description: "The manifest covers every schema file in the project.",
          options: { scoped: false },
        },
        {
          name: "one-contract-scoped",
          description:
            "An `include` selects one schema file; discovery still walks the tree but only that file is parsed.",
          options: { scoped: true },
          expectedComplexity: "logarithmic",
          complexityReason:
            "Only the one selected file is parsed and rendered, but the directory walk that still happens grows with the tree. Across the measured sizes it is a small, sub-linear share of the cost, so the curve rises slowly without being flat.",
        },
      ],
      notCovered: [
        {
          name: "incompatible schemas",
          reason:
            "Files the parser cannot handle take a warning path; the benchmark uses only supported schemas.",
        },
      ],
      sampling: SLOW,
      setup: async (n, options) => ({ root: await fixture(n), scoped: options?.scoped === true }),
      run: ({ root, scoped }) =>
        generateEnvManifest({
          root,
          fs: nodeBuildFileSystem,
          location: out(root, scoped ? "scoped.manifest.ts" : "env.manifest.ts"),
          ...(scoped ? { include: ["contract-0000/env.schema.ts"] } : {}),
        }),
    },
    {
      id: "generate-documentation",
      name: "generateDocumentation",
      why: "Renders the environment reference developers and auditors read; it runs wherever documentation is regenerated, often on every merge.",
      poorPerformanceMeans:
        "Documentation builds slow down in proportion to configuration size and, when owners write long runbook text, to the volume of prose rendered.",
      expectedComplexity: "linear",
      complexityReason:
        "It parses each schema once and renders one section per variable, so cost is proportional to the number of variables and the size of their documentation.",
      variables: [
        VARIABLES,
        FIXTURE_SHAPE,
        DISK,
        {
          name: "documentation volume",
          how: "variant",
          description: "One-line descriptions versus long multi-section runbook text per variable.",
        },
        RUNTIME,
      ],
      variants: [
        {
          name: "minimal-docs",
          description: "One short description per variable.",
          options: { docs: "minimal" },
        },
        {
          name: "heavy-docs",
          description:
            "Long descriptions and extra documentation fields per variable (a heavily documented enterprise).",
          options: { docs: "heavy" },
        },
      ],
      inEndToEnd: {
        callsPerOperation: 1,
        variant: "minimal-docs",
        description: "Once per artifact run, rendering from the shared parse.",
      },
      sampling: SLOW,
      setup: async (n, options) => ({
        root: await fixture(n, options?.docs ?? "minimal"),
        docs: options?.docs ?? "minimal",
      }),
      run: ({ root, docs }) =>
        generateDocumentation({
          root,
          fs: nodeBuildFileSystem,
          location: out(root, `ENVIRONMENT-${docs}.md`),
        }),
    },
    {
      id: "generate-usage-report",
      name: "generateUsageReport",
      why: "Shows which owners and files consume which variables; it runs in compliance and ownership reviews and in pipelines that enforce them.",
      poorPerformanceMeans:
        "Ownership checks slow down with configuration size, which tempts teams to skip them.",
      expectedComplexity: "linear",
      complexityReason:
        "It parses the schemas and scans consuming files once, building one usage record per contract, so cost is proportional to the number of variables.",
      variables: [
        VARIABLES,
        FIXTURE_SHAPE,
        DISK,
        {
          name: "consuming files",
          how: "fixed",
          value: "none beyond the schemas",
          description:
            "Real projects scan application code for usages; the fixtures contain only schema files, so this is the cheapest case.",
        },
        RUNTIME,
      ],
      inEndToEnd: { callsPerOperation: 1, description: "Once per artifact run." },
      sampling: SLOW,
      ...generate((root) =>
        generateUsageReport({
          root,
          fs: nodeBuildFileSystem,
          report: { location: out(root, "OWNERSHIP-standalone.md") },
        }),
      ),
    },
    {
      id: "generate-artifacts",
      name: "generateEnvArtifacts",
      why: "The combined entry point most pipelines call: it shares one discovery and parse across all three artifacts instead of repeating them.",
      poorPerformanceMeans:
        "The shared pass is the whole saving over running the generators one by one; if it stopped being shared, every pipeline would pay roughly three times the parsing.",
      expectedComplexity: "linear",
      complexityReason:
        "It discovers, parses and links once and renders each artifact from that single pass, so cost is proportional to the amount of configuration.",
      variables: [
        VARIABLES,
        FIXTURE_SHAPE,
        DISK,
        {
          name: "artifacts requested",
          how: "fixed",
          value: "manifest + docs + usage report",
          description: "All three; fewer cost less.",
        },
        RUNTIME,
      ],
      inEndToEnd: { callsPerOperation: 1, description: "This is the end-to-end operation itself." },
      sampling: SLOW,
      ...generate((root) =>
        generateEnvArtifacts({
          root,
          fs: nodeBuildFileSystem,
          manifest: { location: out(root, "combined.manifest.ts") },
          docs: { location: out(root, "COMBINED-ENVIRONMENT.md") },
          usage: { report: { location: out(root, "COMBINED-OWNERSHIP.md") } },
        }),
      ),
    },
    {
      id: "generate-evidence-model",
      name: "generateEvidenceModel",
      why: "Builds the six canonical fact models (contract, ownership, lifecycle, dependency, finding and more) that audits, dashboards and custom projections read.",
      poorPerformanceMeans:
        "Compliance tooling that rebuilds evidence on every run gets slower with the size of the configuration, and an expensive model discourages using it at all.",
      expectedComplexity: "linear",
      complexityReason:
        "It runs discovery and linking once and then derives each fact model from the same parse, so cost is proportional to the amount of configuration.",
      variables: [VARIABLES, FIXTURE_SHAPE, DISK, RUNTIME],
      sampling: { warmupIterations: 1, minIterations: 3, maxIterations: 5, targetDurationMs: 1500 },
      ...generate((root) =>
        generateEvidenceModel({
          root,
          fs: nodeBuildFileSystem,
          include: ["**/env.schema.ts"],
          exclude: EXCLUDE,
        }),
      ),
    },
    {
      id: "evidence-projection",
      name: "defineEvidenceProjection (project)",
      why: "Turns the evidence model into a consumer-specific view (a report, an export); it runs in every pipeline that publishes one, on top of the model build.",
      poorPerformanceMeans:
        "Custom reports slow in proportion to the model, and a copy-heavy implementation would make the projection cost more than building the evidence itself.",
      expectedComplexity: "linear",
      complexityReason:
        "The projection copies the model once (`structuredClone`) and reads it through a tracking membrane, both proportional to the model's size, which grows with the number of variables.",
      variables: [
        VARIABLES,
        FIXTURE_SHAPE,
        {
          name: "projection shape",
          how: "fixed",
          value: "five derived fields across all six fact models",
          description:
            "A projection that reads fewer fields still pays the clone; one that computes more adds proportional work.",
        },
        RUNTIME,
      ],
      sampling: { warmupIterations: 1, minIterations: 5, maxIterations: 20, targetDurationMs: 800 },
      setup: async (n) => ({
        evidence: await generateEvidenceModel({
          root: await fixture(n),
          fs: nodeBuildFileSystem,
          include: ["**/env.schema.ts"],
          exclude: EXCLUDE,
        }),
      }),
      run: ({ evidence }) => projection(evidence),
    },
  ],
})
