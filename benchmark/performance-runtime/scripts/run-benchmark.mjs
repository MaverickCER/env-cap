// Runtime benchmark orchestrator -- `npm run benchmark` from this directory,
// or via ../../scripts/run-benchmarks.mjs from the repo root. Writes
// results.json (immutable, measurement-only) and RESULTS.md.
//
// Only measures. Never reads a previous results.json, never computes a
// diff, never decides what's a regression -- that's
// scripts/render-benchmark-summary.mjs's job, run separately by CI.

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateRuntimeFixtures } from "../../benchmark-fixtures/generator.mjs";
import { hashFixtureTree } from "../../benchmark-fixtures/fixture-hash.mjs";
import { buildMetadata } from "../../benchmark-fixtures/metadata.mjs";
import { adaptiveSample, computeDurationStats } from "../../benchmark-fixtures/measure.mjs";
import { benchmarkId, buildManifest, RUNTIME_BENCHMARKS } from "../../benchmark-fixtures/scenarios.mjs";
import { renderResultsMarkdown } from "../../benchmark-fixtures/render-results-markdown.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(here, "..");
const repoRoot = path.resolve(exampleRoot, "..", "..");
const fixturesRoot = path.join(exampleRoot, "fixtures", "generated");
const childScript = path.join(here, "cold-start-child.mjs");

const COLD_START_OPTS = { warmupIterations: 0, targetDurationMs: 3000, minIterations: 5, maxIterations: 20 };

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
