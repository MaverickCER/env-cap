// Build-time benchmark orchestrator -- `npm run benchmark` from this
// directory, or via ../../scripts/run-benchmarks.mjs from the repo root.
// Plain Node: build-time analysis only parses text, never executes it (ADR
// 0002), so there's no TypeScript execution step here to isolate cost from.
//
// Only measures. Never reads a previous results.json, never computes a
// diff, never decides what's a regression -- that's
// scripts/render-benchmark-summary.mjs's job, run separately by CI.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateEnvArtifacts, generateEnvManifest, generateDocumentation, generateUsageReport, discoverSchemaFiles } from "@maverickcer/env-cap/build";

import { generateBuildtimeFixtures } from "../../benchmark-fixtures/generator.mjs";
import { hashFixtureTree } from "../../benchmark-fixtures/fixture-hash.mjs";
import { buildMetadata } from "../../benchmark-fixtures/metadata.mjs";
import { adaptiveSample, computeDurationStats, timeIt } from "../../benchmark-fixtures/measure.mjs";
import { benchmarkId, buildManifest, BUILDTIME_BENCHMARKS, TIER_NAMES } from "../../benchmark-fixtures/scenarios.mjs";
import { renderResultsMarkdown } from "../../benchmark-fixtures/render-results-markdown.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(here, "..");
const repoRoot = path.resolve(exampleRoot, "..", "..");
const fixturesRoot = path.join(exampleRoot, "fixtures", "generated");

const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/.git/**"];
const IN_PROCESS_OPTS = { warmupIterations: 3, targetDurationMs: 1500, minIterations: 5, maxIterations: 30 };
const SHARED_CONFIGURATION = { ...IN_PROCESS_OPTS, gcEnabled: typeof global.gc === "function" };

/** generateEnvArtifacts()/generateEnvManifest()/etc. refuse to write outside their own `root` -- every output path must nest under the fixture root being generated against, same as any real consumer would place generated files inside their own project. */
function outputPath(root, ...parts) {
  return path.join(root, "_benchmark-output", ...parts);
}

async function fileSizeOrNull(filePath) {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return null;
  }
}

async function ensureTierFixtures(tierName) {
  const outputDir = path.join(fixturesRoot, tierName);
  const genStart = performance.now();
  const generated = await generateBuildtimeFixtures({ tierName, outputDir, docsStyle: "minimal" });
  const fixtureGenerationMs = performance.now() - genStart;
  const fixtureHash = await hashFixtureTree(outputDir);
  return { outputDir, generated, fixtureGenerationMs, fixtureHash };
}

async function runArtifactsTier(tierName, definitionVersion, fixture) {
  const manifestPath = outputPath(fixture.outputDir, "artifacts", "env.manifest.ts");
  const docsPath = outputPath(fixture.outputDir, "artifacts", "ENVIRONMENT.md");
  const usagePath = outputPath(fixture.outputDir, "artifacts", "OWNERSHIP.md");

  const run = () =>
    generateEnvArtifacts({
      root: fixture.outputDir,
      manifest: { location: manifestPath },
      docs: { location: docsPath },
      usage: { report: { location: usagePath } },
    });

  const { samples: totalSamples } = await adaptiveSample(() => timeIt(run), IN_PROCESS_OPTS);

  // Auxiliary, separately-measured -- NOT extracted from generateEnvArtifacts()'s
  // own internal pass (intentionally not exposed as public API, see
  // PERFORMANCE.md), so this is close to, but not exactly, an internal phase
  // split of the same run.
  const { samples: discoverySamples } = await adaptiveSample(
    () => timeIt(() => discoverSchemaFiles({ root: fixture.outputDir, include: ["**/env.schema.ts"], exclude: DEFAULT_EXCLUDE })),
    IN_PROCESS_OPTS,
  );

  await run(); // leave a final, current copy of each artifact on disk for byte-size measurement
  const [manifestBytes, docsBytes, usageReportBytes] = await Promise.all([fileSizeOrNull(manifestPath), fileSizeOrNull(docsPath), fileSizeOrNull(usagePath)]);

  return {
    id: benchmarkId("buildtime", "artifacts", tierName, definitionVersion),
    status: "completed",
    inputs: { contracts: fixture.generated.contracts, variables: fixture.generated.variables },
    fixtureHash: fixture.fixtureHash,
    fixtureGenerationMs: Math.round(fixture.fixtureGenerationMs),
    totalMs: computeDurationStats(totalSamples, IN_PROCESS_OPTS.warmupIterations),
    discoveryMs: computeDurationStats(discoverySamples, IN_PROCESS_OPTS.warmupIterations),
    outputBytes: { manifestBytes, docsBytes, usageReportBytes },
  };
}

async function runDiscoveryTier(tierName, definitionVersion, fixture) {
  const { samples } = await adaptiveSample(
    () => timeIt(() => discoverSchemaFiles({ root: fixture.outputDir, include: ["**/env.schema.ts"], exclude: DEFAULT_EXCLUDE })),
    IN_PROCESS_OPTS,
  );
  return {
    id: benchmarkId("buildtime", "discovery", tierName, definitionVersion),
    status: "completed",
    inputs: { contracts: fixture.generated.contracts, variables: fixture.generated.variables },
    fixtureHash: fixture.fixtureHash,
    fixtureGenerationMs: Math.round(fixture.fixtureGenerationMs),
    durationMs: computeDurationStats(samples, IN_PROCESS_OPTS.warmupIterations),
  };
}

async function runStandaloneVsCombined(definitionVersion, fixture) {
  const standaloneIteration = async () => {
    await generateEnvManifest({ root: fixture.outputDir, location: outputPath(fixture.outputDir, "standalone", "env.manifest.ts") });
    await generateDocumentation({ root: fixture.outputDir, location: outputPath(fixture.outputDir, "standalone", "ENVIRONMENT.md") });
    await generateUsageReport({ root: fixture.outputDir, report: { location: outputPath(fixture.outputDir, "standalone", "OWNERSHIP.md") } });
  };
  const combinedIteration = () =>
    generateEnvArtifacts({
      root: fixture.outputDir,
      manifest: { location: outputPath(fixture.outputDir, "combined", "env.manifest.ts") },
      docs: { location: outputPath(fixture.outputDir, "combined", "ENVIRONMENT.md") },
      usage: { report: { location: outputPath(fixture.outputDir, "combined", "OWNERSHIP.md") } },
    });

  const { samples: standaloneSamples } = await adaptiveSample(() => timeIt(standaloneIteration), IN_PROCESS_OPTS);
  const { samples: combinedSamples } = await adaptiveSample(() => timeIt(combinedIteration), IN_PROCESS_OPTS);

  const standaloneMs = computeDurationStats(standaloneSamples, IN_PROCESS_OPTS.warmupIterations);
  const combinedMs = computeDurationStats(combinedSamples, IN_PROCESS_OPTS.warmupIterations);
  const savingsPercent = standaloneMs.medianMs > 0 ? ((standaloneMs.medianMs - combinedMs.medianMs) / standaloneMs.medianMs) * 100 : 0;

  return {
    id: benchmarkId("buildtime", "standalone-vs-combined", "stress", definitionVersion),
    status: "completed",
    inputs: { contracts: fixture.generated.contracts, variables: fixture.generated.variables },
    fixtureHash: fixture.fixtureHash,
    standaloneMs,
    combinedMs,
    savingsPercent: Math.round(savingsPercent * 100) / 100,
  };
}

async function runDocumentationPayload(definitionVersion) {
  const minimalDir = path.join(fixturesRoot, "documentation-payload-minimal");
  const heavyDir = path.join(fixturesRoot, "documentation-payload-heavy");
  const minimalGen = await generateBuildtimeFixtures({ tierName: "stress", outputDir: minimalDir, docsStyle: "minimal" });
  await generateBuildtimeFixtures({ tierName: "stress", outputDir: heavyDir, docsStyle: "heavy" });

  const minimalDocsPath = outputPath(minimalDir, "ENVIRONMENT.md");
  const heavyDocsPath = outputPath(heavyDir, "ENVIRONMENT.md");

  const { samples: minimalSamples } = await adaptiveSample(() => timeIt(() => generateDocumentation({ root: minimalDir, location: minimalDocsPath })), IN_PROCESS_OPTS);
  const { samples: heavySamples } = await adaptiveSample(() => timeIt(() => generateDocumentation({ root: heavyDir, location: heavyDocsPath })), IN_PROCESS_OPTS);

  const [minimalDocsBytes, heavyDocsBytes] = await Promise.all([fileSizeOrNull(minimalDocsPath), fileSizeOrNull(heavyDocsPath)]);

  return {
    id: benchmarkId("buildtime", "documentation-payload", "stress", definitionVersion),
    status: "completed",
    inputs: { contracts: minimalGen.contracts, variables: minimalGen.variables },
    minimalDocsMs: computeDurationStats(minimalSamples, IN_PROCESS_OPTS.warmupIterations),
    minimalDocsBytes,
    heavyDocsMs: computeDurationStats(heavySamples, IN_PROCESS_OPTS.warmupIterations),
    heavyDocsBytes,
  };
}

async function runScopedInclude(definitionVersion, fixture) {
  const fullManifestPath = outputPath(fixture.outputDir, "scoped-include", "full.manifest.ts");
  const scopedManifestPath = outputPath(fixture.outputDir, "scoped-include", "scoped.manifest.ts");
  const scopedInclude = ["contract-0000/env.schema.ts"];

  const { samples: fullTotal } = await adaptiveSample(() => timeIt(() => generateEnvManifest({ root: fixture.outputDir, location: fullManifestPath })), IN_PROCESS_OPTS);
  const { samples: fullDiscovery } = await adaptiveSample(
    () => timeIt(() => discoverSchemaFiles({ root: fixture.outputDir, include: ["**/env.schema.ts"], exclude: DEFAULT_EXCLUDE })),
    IN_PROCESS_OPTS,
  );
  const { samples: scopedTotal } = await adaptiveSample(
    () => timeIt(() => generateEnvManifest({ root: fixture.outputDir, location: scopedManifestPath, include: scopedInclude })),
    IN_PROCESS_OPTS,
  );
  const { samples: scopedDiscovery } = await adaptiveSample(() => timeIt(() => discoverSchemaFiles({ root: fixture.outputDir, include: scopedInclude, exclude: DEFAULT_EXCLUDE })), IN_PROCESS_OPTS);

  return {
    id: benchmarkId("buildtime", "scoped-include", "extreme", definitionVersion),
    status: "completed",
    inputs: { contracts: fixture.generated.contracts, variables: fixture.generated.variables },
    fixtureHash: fixture.fixtureHash,
    full: { totalMs: computeDurationStats(fullTotal, IN_PROCESS_OPTS.warmupIterations), discoveryMs: computeDurationStats(fullDiscovery, IN_PROCESS_OPTS.warmupIterations) },
    scoped: { totalMs: computeDurationStats(scopedTotal, IN_PROCESS_OPTS.warmupIterations), discoveryMs: computeDurationStats(scopedDiscovery, IN_PROCESS_OPTS.warmupIterations) },
  };
}

async function runEdgeCases(definitionVersion) {
  const edgeCasesDir = path.join(exampleRoot, "edge-cases");
  const manifestPath = outputPath(edgeCasesDir, "env.manifest.ts");
  const exclude = [...DEFAULT_EXCLUDE, "**/ignored/**", "**/_benchmark-output/**"];

  const t0 = performance.now();
  const result = await generateEnvManifest({ root: edgeCasesDir, location: manifestPath, exclude, onIncompatibility: "warn" });
  const durationMs = Math.round(performance.now() - t0);
  const files = await discoverSchemaFiles({ root: edgeCasesDir, include: ["**/env.schema.ts"], exclude });

  return {
    id: benchmarkId("buildtime", "edge-cases", "fixed", definitionVersion),
    status: "completed",
    inputs: { filesDiscovered: files.length, contractsGenerated: result.contracts.length, parseWarnings: result.parseWarnings.length },
    durationMs,
    parseWarnings: result.parseWarnings.map((w) => ({ file: path.relative(edgeCasesDir, w.file), message: w.message })),
  };
}

async function main() {
  const startedAt = new Date();
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));

  const fixturesByTier = {};
  for (const tier of TIER_NAMES) {
    console.log(`[performance-buildtime] generating ${tier} fixtures ...`);
    fixturesByTier[tier] = await ensureTierFixtures(tier);
  }

  const results = {};

  results.artifacts = { tiers: {} };
  for (const tier of BUILDTIME_BENCHMARKS.artifacts.tiers) {
    console.log(`[performance-buildtime] artifacts.${tier} ...`);
    const entry = await runArtifactsTier(tier, BUILDTIME_BENCHMARKS.artifacts.definitionVersion, fixturesByTier[tier]);
    results.artifacts.tiers[tier] = entry;
    console.log(`[performance-buildtime] artifacts.${tier}: median ${entry.totalMs.medianMs.toFixed(2)}ms (discovery ${entry.discoveryMs.medianMs.toFixed(2)}ms), n=${entry.totalMs.iterations}`);
  }

  results.discovery = { tiers: {} };
  for (const tier of BUILDTIME_BENCHMARKS.discovery.tiers) {
    console.log(`[performance-buildtime] discovery.${tier} ...`);
    results.discovery.tiers[tier] = await runDiscoveryTier(tier, BUILDTIME_BENCHMARKS.discovery.definitionVersion, fixturesByTier[tier]);
  }

  console.log(`[performance-buildtime] standalone-vs-combined.stress ...`);
  results["standalone-vs-combined"] = { tiers: { stress: await runStandaloneVsCombined(BUILDTIME_BENCHMARKS["standalone-vs-combined"].definitionVersion, fixturesByTier.stress) } };

  console.log(`[performance-buildtime] documentation-payload.stress ...`);
  results["documentation-payload"] = { tiers: { stress: await runDocumentationPayload(BUILDTIME_BENCHMARKS["documentation-payload"].definitionVersion) } };

  console.log(`[performance-buildtime] scoped-include.extreme ...`);
  results["scoped-include"] = { tiers: { extreme: await runScopedInclude(BUILDTIME_BENCHMARKS["scoped-include"].definitionVersion, fixturesByTier.extreme) } };

  console.log(`[performance-buildtime] edge-cases.fixed ...`);
  results["edge-cases"] = { tiers: { fixed: await runEdgeCases(BUILDTIME_BENCHMARKS["edge-cases"].definitionVersion) } };

  const finishedAt = new Date();
  const metadata = buildMetadata({ repoRoot, startedAt, finishedAt, configuration: SHARED_CONFIGURATION, envCapVersion: packageJson.version });
  const benchmarkManifest = buildManifest("buildtime", BUILDTIME_BENCHMARKS);

  const output = { metadata, benchmarkManifest, results };
  await fs.writeFile(path.join(exampleRoot, "results.json"), JSON.stringify(output, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(exampleRoot, "RESULTS.md"), renderResultsMarkdown(output, "Build-time performance results"), "utf8");

  console.log(`\n[performance-buildtime] wrote results.json and RESULTS.md`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
