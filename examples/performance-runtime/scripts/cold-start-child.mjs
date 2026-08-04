// Runs inside a fresh child process, spawned once per cold-start sample by
// ../scripts/run-benchmark.mjs. Everything from process start to this
// script's own top-level `validateEnv` import is the process-boot floor the
// parent attributes separately (see PERFORMANCE.md); everything measured
// below is createEnv's and validateEnv's own cost.

import { validateEnv } from "@maverickcer/env-cap";
import { pathToFileURL } from "node:url";

const [, , indexPath] = process.argv;

const t0 = performance.now();
const mod = await import(pathToFileURL(indexPath).href);
const t1 = performance.now();

const contracts = Object.values(mod);
const memoryBefore = process.memoryUsage();
const result = await validateEnv({ values: {}, manifest: contracts });
const t2 = performance.now();
const memoryAfter = process.memoryUsage();

function byteSnapshot(m) {
  return { rssBytes: m.rss, heapUsedBytes: m.heapUsed, heapTotalBytes: m.heapTotal, externalBytes: m.external, arrayBuffersBytes: m.arrayBuffers ?? 0 };
}

process.stdout.write(
  JSON.stringify({
    createEnvMs: t1 - t0,
    validateEnvMs: t2 - t1,
    contractCount: result.contractCount,
    variableCount: result.variableCount,
    memoryBeforeBytes: byteSnapshot(memoryBefore),
    memoryAfterBytes: byteSnapshot(memoryAfter),
  }),
);
