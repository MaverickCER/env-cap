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
  applyLiveExpirationOverrides,
  buildContractModel,
  buildLifecycleModel,
  buildOwnershipModel,
  buildSarifLog,
  checkEnvArtifacts,
  computeExpiringEntries,
  computeReconciliation,
  computeSecurityReviewCounters,
  computeSourceFingerprint,
  configurationReference,
  discoverSchemaFiles,
  expiringSoonReport,
  generateDocumentation,
  generateEnvArtifacts,
  generateEnvManifest,
  generateEvidenceModel,
  generateUsageReport,
  getEvidenceModel,
  groupVariablesByOwner,
  linkFiles,
  ownershipSummary,
  parseSchemaFile,
  renderDocs,
  renderEnvExample,
  renderManifest,
  resolveLiveExpirationDates,
} from "@maverickcer/env-cap/build"
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"
import { generateBuildtimeFixtures } from "../benchmark-fixtures/generator.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturesRoot = path.join(here, "fixtures", "generated")
const EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/_benchmark-output/**"]
const SLOW = { warmupIterations: 1, minIterations: 3, maxIterations: 8, targetDurationMs: 1500 }

/** Fixture trees are expensive to write at large sizes, so each (size, docs style) is generated once and shared. */
const fixtureCache = new Map()
function fixture(n, docsStyle = "minimal", perContract = 10) {
  const key = `${String(n)}-${docsStyle}-${String(perContract)}`
  if (!fixtureCache.has(key)) {
    const outputDir = path.join(fixturesRoot, key)
    fixtureCache.set(
      key,
      generateBuildtimeFixtures({ outputDir, docsStyle, variables: n, perContract }).then(
        () => outputDir,
      ),
    )
  }
  return fixtureCache.get(key)
}

const SHAPE = { total: "variable", perContract: "variables-per-contract" }
/** The fixture for one measurement: `variable` declared variables, `variables-per-contract` of them to a contract. */
const fixtureAt = (values, docsStyle = "minimal") =>
  fixture(values[SHAPE.total], docsStyle, values[SHAPE.perContract] ?? 10)

/** Discovered, linked contracts (what the pure functions below take), once per size. */
const linkCache = new Map()
function linked(values) {
  const key = `${String(values[SHAPE.total])}-${String(values[SHAPE.perContract] ?? 10)}`
  if (!linkCache.has(key)) {
    linkCache.set(
      key,
      (async () => {
        const root = await fixtureAt(values)
        const files = await discoverSchemaFiles({
          root,
          fs: nodeBuildFileSystem,
          include: ["**/env.schema.ts"],
          exclude: EXCLUDE,
        })
        const readFile = (file) => fs.readFile(file, "utf8")
        const context = {
          fs: nodeBuildFileSystem,
          root,
          packages: [],
          cache: new Map(),
          tsconfigPaths: undefined,
          aliasCache: { resolutions: new Map() },
        }
        const { contracts } = await linkFiles(files, readFile, context)
        return { root, files, contracts }
      })(),
    )
  }
  return linkCache.get(key)
}

/** The evidence model (its six fact models), once per size. */
const evidenceCache = new Map()
function evidenced(values) {
  const key = `${String(values[SHAPE.total])}-${String(values[SHAPE.perContract] ?? 10)}`
  if (!evidenceCache.has(key)) {
    evidenceCache.set(
      key,
      (async () =>
        generateEvidenceModel({
          root: await fixtureAt(values),
          fs: nodeBuildFileSystem,
          include: ["**/env.schema.ts"],
          exclude: EXCLUDE,
        }))(),
    )
  }
  return evidenceCache.get(key)
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
  setup: async (_n, _options, context) => ({ root: await fixtureAt(context.values) }),
  run: ({ root }) => call(root),
})

/** The second variable every function of the project's contracts scales with: how they are split across files. */
const PER_CONTRACT = {
  name: SHAPE.perContract,
  how: "swept",
  description:
    "How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.",
}
const PER_CONTRACT_SWEEP = (expectedComplexity, complexityReason) => ({
  variable: SHAPE.perContract,
  description: PER_CONTRACT.description,
  baseValue: 10,
  primaryValue: 640,
  tiers: [5, 10, 20, 40, 80, 160],
  expectedComplexity,
  complexityReason,
})


const FS_FIXED = "fixed: the Node filesystem adapter, which is what every real build uses"
const EXCLUDE_FIXED = "fixed: the standard ignore list, whose patterns are tested against every path walked"
const INCLUDE_FIXED = "fixed: the default schema glob"
const PACKAGES_NOT =
  "not covered: resolving an allowlisted package reads that package's schemas, and the fixtures allowlist none"
const TSCONFIG_NOT =
  "not covered: path-alias resolution applies one tsconfig to each import, and the fixtures import nothing"
const LIVE_NOT =
  "not covered: it calls the caller's own function (a lookup the caller pays for), so its cost is not env-cap's"
const COMMIT_NOT =
  "not covered: a caller-supplied function that returns the commit recorded as provenance; its cost is the caller's lookup, and env-cap only copies the string it returns"
const WINDOW_FIXED =
  "fixed: 30 days, the default window; the scan reads every variable once whatever the window"
const LOCATION_FIXED = "fixed: one file under the fixture's output folder"
const ON_FINDING_NOT =
  "not covered: called only when a finding is raised, which the fixtures never do"

const pure = (spec) => ({
  variables: [VARIABLES, FIXTURE_SHAPE, RUNTIME],
  sampling: { warmupIterations: 1, minIterations: 5, maxIterations: 50, targetDurationMs: 800 },
  inEndToEnd: { callsPerOperation: 0, description: "Not part of the end-to-end operation, which calls the generators; measured on its own." },
  ...spec,
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

  notBenchmarked: {
    buildChangeModel:
      "Its input is the list of changes a caller read from a previous manifest, which is empty on a first run and small on any later one; the model it builds from the contracts is part of `generate-evidence-model`, which builds all six fact models from the same linked contracts.",
    buildDependencyModel:
      "It scans the files that consume the contracts, and the fixtures contain only the schemas; the scan is what `generate-usage-report` and `generate-evidence-model` run on every call, so it is measured there at every size.",
    buildFindingModel:
      "Its input is the lists of findings the other passes produced, which the fixtures never produce; the model it builds from them is derived once in `generate-evidence-model`.",
    computeRotationStatus:
      "It reads five fields of one variable and compares dates, a constant amount of work done once per variable; `build-lifecycle-model` runs it for every variable at every size.",
    displayPath:
      "It trims one path against one root, a constant amount of work in the length of a path; every generator calls it per file, so `generate-evidence-model` measures it at every size.",
    effectiveOwner:
      "It reads two fields of one variable and one of its contract, a constant amount of work; `build-ownership-model` runs it for every variable at every size.",
    extractContractDocs:
      "An internal step of `parseSchemaFile`, which receives the parser's own syntax nodes and cannot be called without one; `parse-schema-file` measures it as part of parsing each schema at every size.",
    extractSchemaVariables:
      "An internal step of `parseSchemaFile`, which receives the parser's own syntax nodes and cannot be called without one; `parse-schema-file` measures it as part of parsing each schema at every size.",
    renderUsageReport:
      "Its input is the findings of the dependency pass, which the fixtures never produce; the report is rendered once in `generate-usage-report`, which measures it at every size.",
    resolveRelativeImport:
      "It tries a fixed list of file extensions against the filesystem for one import, a constant number of probes; `link-files` runs it for every import at every size.",
    writeEnvExample:
      "It renders the `.env.example` file (measured as `render-env-example`) and writes it once through the filesystem adapter, which the standard keeps out of the benchmarks (no real I/O).",
    "processors.toArray":
      "A factory that builds one processor from a separator and a list of item processors in constant time; the processor it returns is what the runtime suite's `processor-to-array` measures.",
    "validators.matches":
      "A factory that builds one validator from a pattern and a message in constant time; the validator it returns is what the runtime suite's `validator-matches` measures.",
    "validators.range":
      "A factory that builds one validator from two numbers in constant time; the validator it returns is what the runtime suite's `validator-range` measures.",
    "validators.refine":
      "A factory that wraps one validator with a message in constant time; the validator it returns is what the runtime suite's `validator-refine` measures.",
    "validators.regex":
      "A factory that builds one validator from a pattern and a message in constant time; the validator it returns is what the runtime suite's `validator-matches` measures.",
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
        PER_CONTRACT,
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
      sweeps: [
        PER_CONTRACT_SWEEP(
          "constant",
          "The walk visits the same total number of schema files and folders however the variables are split across them, so the split does not change the cost.",
        ),
      ],
      covers: {
        discoverSchemaFiles: {
          "options.exclude": EXCLUDE_FIXED,
          "options.fs": FS_FIXED,
          "options.include": INCLUDE_FIXED,
          "options.root": "swept",
        },
      },
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
        PER_CONTRACT,
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
          expectedComplexity: "linearithmic",
          complexityReason:
            "Parsing and rendering are linear in the source text, but the model sorts every variable and declaration by key (contract-model.ts, compatibility.ts) so the manifest and the compatibility findings are stable, and that sort adds an n log n term that shows once the whole project is covered.",
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
      sweeps: [
        PER_CONTRACT_SWEEP(
          "constant",
          "The same total number of variables is parsed and rendered however they are split across files, so the split changes only the small per-file share of the work.",
        ),
      ],
      covers: {
        generateEnvManifest: {
          "options.exclude": EXCLUDE_FIXED,
          "options.fs": FS_FIXED,
          "options.include": "variant:one-contract-scoped",
          "options.location": LOCATION_FIXED,
          "options.onIncompatibility": ON_FINDING_NOT,
          "options.packages": PACKAGES_NOT,
          "options.root": "swept",
          "options.tsconfig": TSCONFIG_NOT,
        },
      },
      notCovered: [
        {
          name: "incompatible schemas",
          reason:
            "Files the parser cannot handle take a warning path; the benchmark uses only supported schemas.",
        },
      ],
      sampling: SLOW,
      setup: async (_n, options, context) => ({
        root: await fixtureAt(context.values),
        scoped: options?.scoped === true,
      }),
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
        PER_CONTRACT,
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
      sweeps: [
        PER_CONTRACT_SWEEP(
          "constant",
          "The same total number of variables is rendered however they are split across files; each file adds one heading and a small table header, a share that shrinks as files grow.",
        ),
      ],
      covers: {
        generateDocumentation: {
          "options.envExample":
            "not covered: the optional `.env.example` is a separate rendering, measured as `render-env-example` and `compute-reconciliation`",
          "options.exclude": EXCLUDE_FIXED,
          "options.expiringWithinDays": WINDOW_FIXED,
          "options.fs": FS_FIXED,
          "options.include": INCLUDE_FIXED,
          "options.liveExpirationDates": LIVE_NOT,
          "options.location": LOCATION_FIXED,
          "options.packages": PACKAGES_NOT,
          "options.root": "swept",
          "options.tsconfig": TSCONFIG_NOT,
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        variant: "minimal-docs",
        description:
          "Not called by the end-to-end operation: generateEnvArtifacts renders the catalog from its shared parse, while this standalone generator parses again.",
      },
      sampling: SLOW,
      setup: async (_n, options, context) => ({
        root: await fixtureAt(context.values, options?.docs ?? "minimal"),
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
        PER_CONTRACT,
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
      sweeps: [
        PER_CONTRACT_SWEEP(
          "constant",
          "The same total number of variables is reported however they are split across files; only the small per-file share of the work changes.",
        ),
      ],
      covers: {
        generateUsageReport: {
          "options.exclude": EXCLUDE_FIXED,
          "options.fs": FS_FIXED,
          "options.include": INCLUDE_FIXED,
          "options.packages": PACKAGES_NOT,
          "options.report": LOCATION_FIXED,
          "options.root": "swept",
          "options.tsconfig": TSCONFIG_NOT,
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description:
          "Not called by the end-to-end operation: generateEnvArtifacts builds the usage report from its shared parse, while this standalone generator parses again.",
      },
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
        PER_CONTRACT,
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
      sweeps: [
        PER_CONTRACT_SWEEP(
          "constant",
          "The same total number of variables is parsed and rendered three times over however they are split across files; only the small per-file share changes.",
        ),
      ],
      covers: {
        generateEnvArtifacts: {
          "options.docs": "fixed: requested, at one location, with default documentation options",
          "options.evidence":
            "not covered: persisting the evidence model is the evidence model written to disk, which `generate-evidence-model` builds",
          "options.exclude": EXCLUDE_FIXED,
          "options.fs": FS_FIXED,
          "options.include": INCLUDE_FIXED,
          "options.liveExpirationDates": LIVE_NOT,
          "options.manifest": "fixed: requested, at one location",
          "options.onOwnershipIssue": ON_FINDING_NOT,
          "options.onUndocumented": ON_FINDING_NOT,
          "options.packages": PACKAGES_NOT,
          "options.root": "swept",
          "options.tsconfig": TSCONFIG_NOT,
          "options.usage": "fixed: requested, at one location",
        },
      },
      inEndToEnd: {
        callsPerOperation: 1,
        description: "This is the end-to-end operation itself.",
        includes: ["discover-schema-files"],
      },
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
      id: "check-artifacts",
      name: "checkEnvArtifacts",
      why: "The CI gate that fails when a committed manifest, document or report is stale: it regenerates every requested artifact in memory and compares it with the file on disk.",
      poorPerformanceMeans:
        "A slower gate on every pull request, which is the most frequent place build-time cost is paid.",
      expectedComplexity: "linear",
      complexityReason:
        "It runs one shared discovery, parse and link, renders each requested artifact once and compares each with its file, so cost is proportional to the amount of configuration.",
      variables: [
        VARIABLES,
        PER_CONTRACT,
        FIXTURE_SHAPE,
        DISK,
        {
          name: "artifact state",
          how: "fixed",
          value: "every artifact is current",
          description: "A stale artifact adds a finding to report and no more parsing.",
        },
        RUNTIME,
      ],
      sweeps: [
        PER_CONTRACT_SWEEP(
          "constant",
          "The same total number of variables is rendered and compared however they are split across files; only the small per-file share changes.",
        ),
      ],
      covers: {
        checkEnvArtifacts: {
          "options.docs": "fixed: checked, against the file `generate-artifacts` writes",
          "options.evidence":
            "not covered: checking the persisted evidence model compares one more rendered file, the same work as the others",
          "options.exclude": EXCLUDE_FIXED,
          "options.fs": FS_FIXED,
          "options.include": INCLUDE_FIXED,
          "options.liveExpirationDates": LIVE_NOT,
          "options.manifest": "fixed: checked, against the file `generate-artifacts` writes",
          "options.onOwnershipIssue": ON_FINDING_NOT,
          "options.onUndocumented": ON_FINDING_NOT,
          "options.packages": PACKAGES_NOT,
          "options.root": "swept",
          "options.tsconfig": TSCONFIG_NOT,
          "options.usage": "fixed: checked, against the file `generate-artifacts` writes",
        },
      },
      inEndToEnd: { callsPerOperation: 0, description: "A CI gate, not part of generating the artifacts." },
      sampling: SLOW,
      setup: async (_n, _options, context) => {
        const root = await fixtureAt(context.values)
        const options = {
          root,
          fs: nodeBuildFileSystem,
          manifest: { location: out(root, "check.manifest.ts") },
          docs: { location: out(root, "CHECK-ENVIRONMENT.md") },
          usage: { report: { location: out(root, "CHECK-OWNERSHIP.md") } },
        }
        await generateEnvArtifacts(options)
        return options
      },
      run: (options) => checkEnvArtifacts(options),
    },
    {
      id: "compute-source-fingerprint",
      name: "computeSourceFingerprint",
      why: "It decides whether a cached evidence model is still current, so it runs before every cached read and must cost far less than the recompute it avoids.",
      poorPerformanceMeans:
        "A cache that costs nearly as much as the recompute it saves, which makes every cached read pointless.",
      expectedComplexity: "linear",
      complexityReason:
        "It walks the schema files and hashes each one's text once, with no parsing or linking, so cost is proportional to the bytes of source.",
      variables: [VARIABLES, PER_CONTRACT, FIXTURE_SHAPE, DISK, RUNTIME],
      sweeps: [
        PER_CONTRACT_SWEEP(
          "constant",
          "The same total bytes of source are hashed however they are split across files; only the per-file read overhead changes.",
        ),
      ],
      covers: {
        computeSourceFingerprint: {
          "options.exclude": EXCLUDE_FIXED,
          "options.fs": FS_FIXED,
          "options.include": INCLUDE_FIXED,
          "options.packages": PACKAGES_NOT,
          "options.root": "swept",
        },
      },
      inEndToEnd: { callsPerOperation: 0, description: "Run before a cached read, not while generating." },
      sampling: SLOW,
      ...generate((root) =>
        computeSourceFingerprint({
          root,
          fs: nodeBuildFileSystem,
          include: ["**/env.schema.ts"],
          exclude: EXCLUDE,
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
      variables: [VARIABLES, PER_CONTRACT, FIXTURE_SHAPE, DISK, RUNTIME],
      sweeps: [
        PER_CONTRACT_SWEEP(
          "constant",
          "The same total number of variables is modelled however they are split across files; only the small per-file share changes.",
        ),
      ],
      covers: {
        generateEvidenceModel: {
          "options.commit": COMMIT_NOT,
          "options.exclude": EXCLUDE_FIXED,
          "options.expiringWithinDays": WINDOW_FIXED,
          "options.fs": FS_FIXED,
          "options.include": INCLUDE_FIXED,
          "options.liveExpirationDates": LIVE_NOT,
          "options.packages": PACKAGES_NOT,
          "options.previousSnapshotLocation":
            "fixed: none, the first-run state, where everything reads as added",
          "options.root": "swept",
          "options.tsconfig": TSCONFIG_NOT,
        },
      },
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
      id: "get-evidence-model",
      name: "getEvidenceModel",
      why: "The cached way to read the evidence model: it trusts a committed artifact only while the source fingerprint matches, and recomputes otherwise.",
      poorPerformanceMeans:
        "A miss that costs more than a plain recompute, or a hit that costs nearly as much as one, would make the cache worse than not having it.",
      expectedComplexity: "linear",
      complexityReason:
        "A hit fingerprints the source and reads one file; a miss does that and then rebuilds the model, so both grow with the amount of configuration.",
      variables: [
        VARIABLES,
        FIXTURE_SHAPE,
        DISK,
        {
          name: "cache state",
          how: "variant",
          description: "A committed artifact whose fingerprint matches, or none.",
        },
        RUNTIME,
      ],
      variants: [
        {
          name: "cache-hit",
          description: "The committed artifact is current: read from disk, no recompute.",
          options: { hit: true },
          expectedComplexity: "linear",
          complexityReason:
            "The source is fingerprinted and the artifact read once, both proportional to the amount of configuration, with no parsing.",
        },
        {
          name: "cache-miss",
          description: "No artifact exists: the model is rebuilt.",
          options: { hit: false },
        },
      ],
      covers: {
        getEvidenceModel: {
          "options.commit": COMMIT_NOT,
          "options.exclude": EXCLUDE_FIXED,
          "options.expiringWithinDays": WINDOW_FIXED,
          "options.fs": FS_FIXED,
          "options.include": INCLUDE_FIXED,
          "options.liveExpirationDates": LIVE_NOT,
          "options.location": "variant:cache-hit",
          "options.packages": PACKAGES_NOT,
          "options.previousSnapshotLocation": "fixed: none, the first-run state",
          "options.root": "swept",
          "options.tsconfig": TSCONFIG_NOT,
        },
      },
      inEndToEnd: { callsPerOperation: 0, description: "A cached read, not part of generating the artifacts." },
      sampling: { warmupIterations: 1, minIterations: 3, maxIterations: 5, targetDurationMs: 1500 },
      setup: async (n, options) => {
        const root = await fixture(n)
        const location = options?.hit ? "_benchmark-output/evidence.json" : "_benchmark-output/absent.json"
        if (options?.hit) {
          await generateEnvArtifacts({
            root,
            fs: nodeBuildFileSystem,
            include: ["**/env.schema.ts"],
            exclude: EXCLUDE,
            manifest: false,
            docs: false,
            usage: false,
            evidence: { location: "_benchmark-output/evidence.json" },
          })
        }
        return { root, location }
      },
      run: ({ root, location }) =>
        getEvidenceModel({
          root,
          fs: nodeBuildFileSystem,
          include: ["**/env.schema.ts"],
          exclude: EXCLUDE,
          location,
        }),
    },
    {
      id: "parse-schema-file",
      name: "parseSchemaFile",
      why: "Every generator parses each schema file with the TypeScript parser, which is the largest single cost of a build-time run.",
      poorPerformanceMeans:
        "Every build-time command slows in proportion to the source it parses, and a super-linear parse would punish the largest schema files first.",
      expectedComplexity: "linear",
      complexityReason:
        "The text is parsed once by the TypeScript parser and the variables read from one syntax tree, so cost is proportional to the length of the source.",
      variables: [
        {
          ...VARIABLES,
          description: "The tier axis: how many variables the one schema file declares.",
        },
        FIXTURE_SHAPE,
        RUNTIME,
      ],
      covers: {
        parseSchemaFile: {
          filePath: "fixed: one short path, which is only recorded in the result",
          sourceText: "swept",
        },
      },
      inEndToEnd: { callsPerOperation: 0, description: "Run once per schema file inside every generator; measured here on one file." },
      setup: async (n) => {
        // One schema file declaring all n variables.
        const root = await fixture(n, "minimal", n)
        const file = path.join(root, "contract-0000", "env.schema.ts")
        return { file, text: await fs.readFile(file, "utf8") }
      },
      run: ({ file, text }) => parseSchemaFile(file, text),
    },
    {
      id: "link-files",
      name: "linkFiles",
      why: "It turns parsed schema files into linked contracts, following the imports between them, and runs once in every generator.",
      poorPerformanceMeans:
        "Every build-time command slows in proportion to the number of schema files and the imports between them.",
      expectedComplexity: "linear",
      complexityReason:
        "Each file is read and parsed once and each import resolved once, so cost is proportional to the number of files.",
      variables: [VARIABLES, FIXTURE_SHAPE, DISK, RUNTIME],
      covers: {
        linkFiles: {
          discoveredFiles: "swept",
          readFile: "fixed: reads the file from the local disk through the Node adapter",
          "context.fs": FS_FIXED,
          "context.root": "fixed: the generated fixture tree",
          "context.packages": PACKAGES_NOT,
          "context.cache": "fixed: an empty cache, which is what a first resolution of each package starts with",
          "context.tsconfigPaths": TSCONFIG_NOT,
          "context.aliasCache": "fixed: an empty cache, which is what a first resolution of each alias starts with",
          packageOrigins: PACKAGES_NOT,
        },
      },
      notCovered: [
        {
          name: "aliased and package imports",
          reason:
            "Following a tsconfig alias or an allowlisted package adds a resolution per import; the fixtures import nothing.",
        },
      ],
      inEndToEnd: { callsPerOperation: 0, description: "Run once inside every generator; measured on its own." },
      sampling: SLOW,
      setup: async (_n, _options, context) => {
        const root = await fixtureAt(context.values)
        const files = await discoverSchemaFiles({
          root,
          fs: nodeBuildFileSystem,
          include: ["**/env.schema.ts"],
          exclude: EXCLUDE,
        })
        return {
          files,
          link: () =>
            linkFiles(files, (file) => fs.readFile(file, "utf8"), {
              fs: nodeBuildFileSystem,
              root,
              packages: [],
              cache: new Map(),
              tsconfigPaths: undefined,
              aliasCache: { resolutions: new Map() },
            }),
        }
      },
      run: ({ link }) => link(),
    },
    pure({
      id: "build-contract-model",
      name: "buildContractModel",
      why: "It derives the contract fact model (every contract, its variables and their documentation) that the other models and every projection build on.",
      poorPerformanceMeans: "Every evidence build slows in proportion to the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "One entry is built for each contract and each variable, once, so cost is proportional to the number of variables.",
      covers: {
        buildContractModel: {
          contracts: "swept",
          root: "fixed: the generated fixture tree, which only shortens the file paths",
        },
      },
      setup: async (_n, _o, context) => linked(context.values),
      run: ({ root, contracts }) => buildContractModel(contracts, root),
    }),
    pure({
      id: "build-ownership-model",
      name: "buildOwnershipModel",
      why: "It derives who owns each contract and variable, the model ownership reviews and the usage report read.",
      poorPerformanceMeans: "Every evidence build slows in proportion to the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "Each variable's owner is resolved once from its own documentation and its contract's, so cost is proportional to the number of variables.",
      covers: {
        buildOwnershipModel: {
          contracts: "swept",
          root: "fixed: the generated fixture tree, which only shortens the file paths",
        },
      },
      setup: async (_n, _o, context) => linked(context.values),
      run: ({ root, contracts }) => buildOwnershipModel(contracts, root),
    }),
    pure({
      id: "build-lifecycle-model",
      name: "buildLifecycleModel",
      why: "It derives the lifecycle fact model: what expires, what is due for rotation and what is deprecated, which the rotation reminders read.",
      poorPerformanceMeans: "Every evidence build and every scheduled rotation check slows in proportion to the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "Each variable's dates are read and compared once, so cost is proportional to the number of variables.",
      covers: {
        buildLifecycleModel: {
          contracts: "swept",
          expiringWithinDays: WINDOW_FIXED,
          now: "fixed: one instant, because the clock only decides which entries are due",
          root: "fixed: the generated fixture tree, which only shortens the file paths",
        },
      },
      setup: async (_n, _o, context) => linked(context.values),
      run: ({ root, contracts }) => buildLifecycleModel(contracts, 30, new Date(0), root),
    }),
    pure({
      id: "compute-expiring-entries",
      name: "computeExpiringEntries",
      why: "It lists what expires within a window, once for every reminder and every report that shows expiries.",
      poorPerformanceMeans: "A slower expiry reminder in proportion to the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "Each variable's expiry date is compared with the window once, so cost is proportional to the number of variables.",
      covers: {
        computeExpiringEntries: {
          contracts: "swept",
          expiringWithinDays: WINDOW_FIXED,
          now: "fixed: one instant, because the clock only decides which entries are due",
        },
      },
      setup: async (_n, _o, context) => (await evidenced(context.values)).contract.contracts,
      run: (contracts) => computeExpiringEntries(contracts, 30, new Date(0)),
    }),
    pure({
      id: "compute-security-review-counters",
      name: "computeSecurityReviewCounters",
      why: "It counts what a security review looks at (secrets, owners, expiries, undocumented variables), once per documentation render.",
      poorPerformanceMeans: "Slower documentation in proportion to the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "Each variable is classified once into the counters, so cost is proportional to the number of variables.",
      covers: {
        computeSecurityReviewCounters: {
          contracts: "swept",
          expiringWithinDays: WINDOW_FIXED,
          now: "fixed: one instant, because the clock only decides which entries are due",
          undocumentedContractCount: "fixed: zero, the fixtures document everything",
          undocumentedVariableCount: "fixed: zero, the fixtures document everything",
        },
      },
      setup: async (_n, _o, context) => (await evidenced(context.values)).contract.contracts,
      run: (contracts) => computeSecurityReviewCounters(contracts, 30, new Date(0), 0, 0),
    }),
    pure({
      id: "render-docs",
      name: "renderDocs",
      why: "It turns the contract model into the Markdown reference, the largest text env-cap renders.",
      poorPerformanceMeans: "Documentation builds slow in proportion to the number of variables and the prose each carries.",
      expectedComplexity: "linear",
      complexityReason: "One section is rendered for each contract and variable, once, so cost is proportional to the amount of documentation.",
      covers: {
        renderDocs: {
          contracts: "swept",
          "options.expiringWithinDays": WINDOW_FIXED,
          "options.generatedAt": "fixed: one instant, which is only printed in the header",
          "options.previousContent": "fixed: none, the first-run state, so nothing is compared with an earlier document",
          "options.undocumentedContracts": "fixed: none, the fixtures document everything",
          "options.undocumentedVariables": "fixed: none, the fixtures document everything",
        },
      },
      setup: async (_n, _o, context) => (await evidenced(context.values)).contract.contracts,
      run: (contracts) =>
        renderDocs(contracts, {
          expiringWithinDays: 30,
          undocumentedContracts: [],
          undocumentedVariables: [],
          generatedAt: new Date(0),
          previousContent: undefined,
        }),
    }),
    pure({
      id: "render-manifest",
      name: "renderManifest",
      why: "It renders the TypeScript manifest the application imports, in every build that ships the application.",
      poorPerformanceMeans: "Slower builds in proportion to the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "One manifest entry is rendered for each variable, so cost is proportional to the number of variables.",
      covers: {
        renderManifest: {
          contracts: "swept",
          outputFile: "fixed: one path, which only decides the relative import paths printed",
        },
      },
      setup: async (_n, _o, context) => linked(context.values),
      run: ({ root, contracts }) => renderManifest(contracts, path.join(root, "env.manifest.ts")),
    }),
    pure({
      id: "compute-reconciliation",
      name: "computeReconciliation",
      why: "It compares the variables the schemas declare with those in an existing `.env.example`, to say what to add and what is stale.",
      poorPerformanceMeans: "A slower `.env.example` update in proportion to the number of variables and the size of the file.",
      expectedComplexity: "linear",
      complexityReason: "The existing lines are indexed once and each declared variable looked up once, so cost is proportional to both.",
      covers: {
        computeReconciliation: {
          contracts: "swept",
          existingContent: "fixed: empty, the first-run state, where every variable is new",
        },
      },
      setup: async (_n, _o, context) => linked(context.values),
      run: ({ contracts }) => computeReconciliation(contracts, ""),
    }),
    pure({
      id: "render-env-example",
      name: "renderEnvExample",
      why: "It renders the `.env.example` file developers copy, from the same contracts as everything else.",
      poorPerformanceMeans: "A slower `.env.example` update in proportion to the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "One line is rendered for each variable, so cost is proportional to the number of variables.",
      covers: {
        renderEnvExample: {
          contracts: "swept",
          reconciliationHeader: "fixed: none, the default header",
        },
      },
      setup: async (_n, _o, context) => linked(context.values),
      run: ({ contracts }) => renderEnvExample(contracts),
    }),
    pure({
      id: "group-variables-by-owner",
      name: "groupVariablesByOwner",
      why: "It groups every variable under its owner, which the ownership summary and the usage report both print.",
      poorPerformanceMeans: "A slower ownership report in proportion to the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "Each variable is placed in its owner's group once, so cost is proportional to the number of variables.",
      covers: {
        groupVariablesByOwner: {
          contracts: "swept",
          ownerOf: "fixed: reads one field of the contract, the cheapest honest owner lookup",
        },
      },
      setup: async (_n, _o, context) => (await evidenced(context.values)).contract.contracts,
      run: (contracts) => groupVariablesByOwner(contracts, (contract) => contract.owner),
    }),
    pure({
      id: "apply-live-expiration-overrides",
      name: "applyLiveExpirationOverrides",
      why: "It replaces schema expiry dates with live ones (read from a secrets manager), once per run that uses a live source.",
      poorPerformanceMeans: "A slower run for every project that tracks expiry in a live source, in proportion to the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "Each variable is looked up once in the map of overrides, so cost is proportional to the number of variables.",
      covers: {
        applyLiveExpirationOverrides: {
          contracts: "swept",
          overrides: "fixed: one override for every tenth variable",
        },
      },
      setup: async (_n, _o, context) => {
        const { contracts } = await linked(context.values)
        const overrides = {}
        for (const [index, contract] of contracts.entries()) {
          if (index % 10 === 0) for (const variable of contract.variables.slice(0, 1)) overrides[variable.key] = "2099-01-01"
        }
        return { contracts, overrides }
      },
      run: ({ contracts, overrides }) => applyLiveExpirationOverrides(contracts, overrides),
    }),
    pure({
      id: "resolve-live-expiration-dates",
      name: "resolveLiveExpirationDates",
      why: "It asks the caller's live source for the expiry of every variable once, then applies the answers.",
      poorPerformanceMeans: "A slower run for every project that uses a live source, in proportion to the number of variables, on top of the lookup the caller pays for.",
      expectedComplexity: "linear",
      complexityReason: "The variable names are collected once, handed to the caller's function once and the answers applied once, so cost is proportional to the number of variables.",
      covers: {
        resolveLiveExpirationDates: {
          contracts: "swept",
          liveExpirationDates: "fixed: an in-memory lookup that answers at once, so the benchmark measures env-cap's own collecting and applying",
        },
      },
      setup: async (_n, _o, context) => linked(context.values),
      run: ({ contracts }) => resolveLiveExpirationDates(contracts, () => Promise.resolve({})),
    }),
    pure({
      id: "configuration-reference",
      name: "configurationReference",
      why: "It projects the evidence model into the flat configuration reference an operations team reads.",
      poorPerformanceMeans: "A slower projection in proportion to the evidence model, which grows with the number of variables.",
      expectedComplexity: "linear",
      complexityReason: "It reads the models once and builds one entry per variable, so cost is proportional to the number of variables.",
      covers: {
        configurationReference: {
          "evidence.change": "swept",
          "evidence.contract": "swept",
          "evidence.dependency": "swept",
          "evidence.finding": "swept",
          "evidence.lifecycle": "swept",
          "evidence.ownership": "swept",
          "evidence.provenance": "fixed: one small record, which is copied",
          "evidence.schemaVersion": "fixed: one number, which is copied",
        },
      },
      setup: async (_n, _o, context) => evidenced(context.values),
      run: (evidence) => configurationReference(evidence),
    }),
    pure({
      id: "expiring-soon-report",
      name: "expiringSoonReport",
      why: "It projects the evidence model into the report of what expires soon, which the rotation reminders send.",
      poorPerformanceMeans: "A slower reminder in proportion to the evidence model.",
      expectedComplexity: "linear",
      complexityReason: "It reads the lifecycle and contract models once, so cost is proportional to the number of variables.",
      covers: {
        expiringSoonReport: {
          "evidence.change": "swept",
          "evidence.contract": "swept",
          "evidence.dependency": "swept",
          "evidence.finding": "swept",
          "evidence.lifecycle": "swept",
          "evidence.ownership": "swept",
          "evidence.provenance": "fixed: one small record, which is copied",
          "evidence.schemaVersion": "fixed: one number, which is copied",
        },
      },
      setup: async (_n, _o, context) => evidenced(context.values),
      run: (evidence) => expiringSoonReport(evidence),
    }),
    pure({
      id: "ownership-summary",
      name: "ownershipSummary",
      why: "It projects the evidence model into the per-owner summary a review reads.",
      poorPerformanceMeans: "A slower summary in proportion to the evidence model.",
      expectedComplexity: "linear",
      complexityReason: "It groups every variable by owner once, so cost is proportional to the number of variables.",
      covers: {
        ownershipSummary: {
          "evidence.change": "swept",
          "evidence.contract": "swept",
          "evidence.dependency": "swept",
          "evidence.finding": "swept",
          "evidence.lifecycle": "swept",
          "evidence.ownership": "swept",
          "evidence.provenance": "fixed: one small record, which is copied",
          "evidence.schemaVersion": "fixed: one number, which is copied",
        },
      },
      setup: async (_n, _o, context) => evidenced(context.values),
      run: (evidence) => ownershipSummary(evidence),
    }),
    pure({
      id: "build-sarif-log",
      name: "buildSarifLog",
      variables: [
        {
          name: "declared variables",
          how: "swept",
          description: "The tier axis here is findings, one for each of this many variables with a problem.",
        },
        { name: "finding mix", how: "fixed", value: "one error, one warning and one info in turn", description: "Severity only picks the SARIF level." },
        RUNTIME,
      ],
      why: "It converts the finding model into SARIF for code-scanning dashboards, in every pipeline that uploads findings.",
      poorPerformanceMeans: "A slower upload step in proportion to the number of findings.",
      expectedComplexity: "linear",
      complexityReason: "One SARIF result is built for each finding, so cost is proportional to the number of findings.",
      covers: {
        buildSarifLog: {
          "findingModel.findings": "swept",
          "findingModel.schemaVersion": "fixed: one number, which is copied",
        },
      },
      // The fixtures are clean, so they raise no findings: this builds n, as a project with a backlog would have.
      setup: (n) => ({
        schemaVersion: 3,
        findings: Array.from({ length: n }, (_, index) => ({
          severity: ["error", "warning", "info"][index % 3],
          code: `DOCUMENTATION_FINDING_${String(index % 37)}`,
          family: "documentation",
          message: `Variable ${String(index)} has no owner.`,
          location: {
            model: "contract",
            file: `contract-${String(Math.floor(index / 10))}/env.schema.ts`,
            position: { line: (index % 200) + 1, column: 3 },
          },
        })),
      }),
      run: (findingModel) => buildSarifLog(findingModel),
    }),
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
