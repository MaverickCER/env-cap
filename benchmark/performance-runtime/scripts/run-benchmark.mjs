// Runtime benchmark orchestrator -- `npm run benchmark` from this directory,
// or via ../../scripts/run-benchmarks.mjs from the repo root. Writes
// results.json (immutable, measurement-only) and RESULTS.md.
//
// Only measures. Never reads a previous results.json, never computes a
// diff, never decides what's a regression -- that's
// internal-package-contract's render-summary.mjs's job (called from the
// benchmark-pr reusable workflow), run separately by CI.

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { processors, validators } from "env-cap/helpers";

import { generateRuntimeFixtures } from "../../benchmark-fixtures/generator.mjs";
import { hashFixtureTree } from "../../benchmark-fixtures/fixture-hash.mjs";
import { buildMetadata } from "../../benchmark-fixtures/metadata.mjs";
import { adaptiveSample, computeDurationStats, timeIt } from "../../benchmark-fixtures/measure.mjs";
import { benchmarkId, buildManifest, RUNTIME_BENCHMARKS, tierTotalVariables } from "../../benchmark-fixtures/scenarios.mjs";
import { renderResultsMarkdown } from "../../benchmark-fixtures/render-results-markdown.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(here, "..");
const repoRoot = path.resolve(exampleRoot, "..", "..");
const fixturesRoot = path.join(exampleRoot, "fixtures", "generated");
const childScript = path.join(here, "cold-start-child.mjs");

const COLD_START_OPTS = { warmupIterations: 0, targetDurationMs: 3000, minIterations: 5, maxIterations: 20 };
const HELPERS_OPTS = { warmupIterations: 3, targetDurationMs: 1500, minIterations: 10, maxIterations: 30 };

// Representative (processor-factory-call, input) pairs -- one per shipped
// `env-cap/helpers` processor, each paired with an input it resolves
// successfully so the benchmark measures real dispatch/coercion cost, never
// exception-throwing cost. Order matches ../../../src/helpers/index.ts's own
// `processors` object.
const PROCESSOR_PAIRS = [
  [processors.base64(), "aGVsbG8gd29ybGQ="],
  [processors.parseJSON(), '{"a":1,"b":[1,2,3]}'],
  [processors.split(","), "a,b,c,d"],
  [processors.toArray(",", [processors.trim()]), "a, b, c"],
  [processors.toBigInt(), "123456789012345678901234567890"],
  [processors.toBoolean(), "true"],
  [processors.toDate(), "2024-01-01T00:00:00Z"],
  [processors.toInteger(), "17"],
  [processors.toLowerCase(), "MiXeD CaSe"],
  [processors.toNumber(), "42"],
  [processors.toRegExp(), "^[a-z]+$"],
  [processors.toString(), 42],
  [processors.toURL(), "https://example.com/path?x=1"],
  [processors.toUpperCase(), "mixed case"],
  [processors.trim(), "  padded  "],
];

// Representative (validator-factory-call, input) pairs -- one per shipped
// `env-cap/helpers` validator (aliases `enum`/`regex` share `oneOf`/`matches`
// with their canonical entry, so aren't duplicated here), each paired with an
// input that passes. Order matches ../../../src/helpers/index.ts's own
// `validators` object.
const VALIDATOR_PAIRS = [
  [validators.after(new Date(2020, 0, 1)), new Date(2025, 0, 1)],
  [validators.all(validators.min(0), validators.max(100)), 50],
  [validators.any(validators.min(0), validators.max(-1)), 50],
  [validators.before(new Date(2030, 0, 1)), new Date(2025, 0, 1)],
  [validators.custom((v) => v > 0 || "must be positive"), 5],
  [validators.email(), "user@example.com"],
  [validators.endsWith(".com"), "example.com"],
  [validators.finite(), 3.14],
  [validators.future(), new Date(2999, 0, 1)],
  [validators.includes("example"), "test-example-text"],
  [validators.integer(), 42],
  [validators.length(5), "hello"],
  [validators.matches(/^[a-z]+$/), "hello"],
  [validators.max(1000), 500],
  [validators.maxItems(10), [1, 2, 3]],
  [validators.maxLength(50), "hi"],
  [validators.min(0), 10],
  [validators.minItems(1), [1, 2]],
  [validators.minLength(2), "hello"],
  [validators.negative(), -5],
  [validators.not(validators.min(100)), 50],
  [validators.oneOf(["a", "b", "c"]), "b"],
  [validators.optional(validators.min(0)), 50],
  [validators.past(), new Date(2000, 0, 1)],
  [validators.positive(), 5],
  [validators.range(1, 100), 50],
  [validators.refine(validators.min(0), "must be >= 0"), 50],
  [validators.required(), "value"],
  [validators.safeInteger(), 100],
  [validators.unique(), [1, 2, 3]],
  [validators.url(), "https://example.com"],
  [validators.uuid(), "123e4567-e89b-42d3-a456-426614174000"],
  [validators.uuidVersion(4), "123e4567-e89b-42d3-a456-426614174000"],
];

// Each processor/validator call costs well under a microsecond, so at a
// tier's own raw variable count (100-8000) a single timed sample is mostly
// `performance.now()`/function-call/JIT-warmup overhead, not real signal --
// empirically confirmed: two back-to-back local runs at the raw count swung
// up to ~80% tier-to-tier with zero code change. Multiplying gives
// `timeIt()` enough real inner work per sample to measure something other
// than noise, while `inputs.operations` below still records the actual
// count run, so the size axis stays honest for the complexity classifier.
const HELPERS_OPERATIONS_MULTIPLIER = 100;

function runColdStartChildOnce(indexPath) {
  const t0 = performance.now();
  const stdout = execFileSync(process.execPath, ["--expose-gc", childScript, indexPath], { encoding: "utf8" });
  const totalMs = performance.now() - t0;
  const child = JSON.parse(stdout);
  return { totalMs, ...child };
}

async function runColdStartTier(tierName, definitionVersion) {
  const outputDir = path.join(fixturesRoot, tierName);
  const genStart = performance.now();
  const generated = await generateRuntimeFixtures({ tierName, outputDir });
  const fixtureGenerationMs = performance.now() - genStart;
  const fixtureHash = await hashFixtureTree(outputDir);
  const indexPath = path.join(outputDir, "index.mjs");

  const { samples, configuration } = await adaptiveSample(() => runColdStartChildOnce(indexPath), COLD_START_OPTS);
  const last = samples[samples.length - 1];

  return {
    entry: {
      id: benchmarkId("runtime", "cold-start", tierName, definitionVersion),
      status: "completed",
      inputs: { contracts: generated.contracts, variables: generated.variables },
      fixtureHash,
      fixtureGenerationMs: Math.round(fixtureGenerationMs),
      totalMs: computeDurationStats(samples.map((s) => s.totalMs), configuration.warmupIterations),
      createEnvMs: computeDurationStats(samples.map((s) => s.createEnvMs), configuration.warmupIterations),
      validateEnvMs: computeDurationStats(samples.map((s) => s.validateEnvMs), configuration.warmupIterations),
      memoryBeforeBytes: last.memoryBeforeBytes,
      memoryAfterBytes: last.memoryAfterBytes,
    },
    configuration,
  };
}

/**
 * Runs `operations` processor calls and the same count of validator calls,
 * cycling through `PROCESSOR_PAIRS`/`VALIDATOR_PAIRS`. `operations` scales
 * with `tierTotalVariables(tierName)` so the size axis still mirrors
 * cold-start's own per-tier variable count in shape (never compared
 * numerically, per ../README.md's "never compare" rule -- different cost
 * drivers entirely), just amplified by `HELPERS_OPERATIONS_MULTIPLIER`.
 */
async function runHelpersTier(tierName, definitionVersion) {
  const operations = tierTotalVariables(tierName) * HELPERS_OPERATIONS_MULTIPLIER;

  const runProcessors = () => {
    for (let i = 0; i < operations; i++) {
      const [fn, value] = PROCESSOR_PAIRS[i % PROCESSOR_PAIRS.length];
      fn(value);
    }
  };
  const runValidators = () => {
    for (let i = 0; i < operations; i++) {
      const [fn, value] = VALIDATOR_PAIRS[i % VALIDATOR_PAIRS.length];
      fn(value, {});
    }
  };
  const runBoth = () => {
    runProcessors();
    runValidators();
  };

  const { samples: totalSamples } = await adaptiveSample(() => timeIt(runBoth), HELPERS_OPTS);
  const { samples: processorSamples } = await adaptiveSample(() => timeIt(runProcessors), HELPERS_OPTS);
  const { samples: validatorSamples } = await adaptiveSample(() => timeIt(runValidators), HELPERS_OPTS);

  return {
    id: benchmarkId("runtime", "helpers", tierName, definitionVersion),
    status: "completed",
    inputs: { operations },
    totalMs: computeDurationStats(totalSamples, HELPERS_OPTS.warmupIterations),
    processorsMs: computeDurationStats(processorSamples, HELPERS_OPTS.warmupIterations),
    validatorsMs: computeDurationStats(validatorSamples, HELPERS_OPTS.warmupIterations),
  };
}

async function main() {
  const startedAt = new Date();
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));

  const results = { "cold-start": { tiers: {} } };
  let sharedConfiguration;

  const coldStartDef = RUNTIME_BENCHMARKS["cold-start"];
  for (const tier of coldStartDef.tiers) {
    console.log(`[performance-runtime] cold-start.${tier} ...`);
    const { entry, configuration } = await runColdStartTier(tier, coldStartDef.definitionVersion);
    results["cold-start"].tiers[tier] = entry;
    sharedConfiguration = configuration;
    console.log(`[performance-runtime] cold-start.${tier}: median ${entry.totalMs.medianMs.toFixed(2)}ms total (createEnv ${entry.createEnvMs.medianMs.toFixed(2)}ms, validateEnv ${entry.validateEnvMs.medianMs.toFixed(2)}ms), n=${entry.totalMs.iterations}`);
  }

  results["helpers"] = { tiers: {} };
  const helpersDef = RUNTIME_BENCHMARKS["helpers"];
  for (const tier of helpersDef.tiers) {
    console.log(`[performance-runtime] helpers.${tier} ...`);
    const entry = await runHelpersTier(tier, helpersDef.definitionVersion);
    results["helpers"].tiers[tier] = entry;
    console.log(`[performance-runtime] helpers.${tier}: median ${entry.totalMs.medianMs.toFixed(2)}ms total (processors ${entry.processorsMs.medianMs.toFixed(2)}ms, validators ${entry.validatorsMs.medianMs.toFixed(2)}ms), n=${entry.totalMs.iterations}`);
  }

  const finishedAt = new Date();
  const metadata = buildMetadata({ repoRoot, startedAt, finishedAt, configuration: sharedConfiguration, envCapVersion: packageJson.version });
  const benchmarkManifest = buildManifest("runtime", RUNTIME_BENCHMARKS);

  const output = { metadata, benchmarkManifest, results };
  await fs.writeFile(path.join(exampleRoot, "results.json"), JSON.stringify(output, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(exampleRoot, "RESULTS.md"), renderResultsMarkdown(output, "Runtime performance results"), "utf8");

  console.log(`\n[performance-runtime] wrote results.json and RESULTS.md`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
