// Tier and named-benchmark definitions shared by both performance-runtime and
// performance-buildtime. Plain JS, not TypeScript: nothing here needs type
// checking, and keeping it dependency-free/tsx-free avoids any transpilation
// cost leaking into what the runtime example measures. See ../README.md
// for why these particular tiers and benchmarks exist.

export const BENCHMARK_SUITE_VERSION = 1;

/**
 * `baseline`/`stress`/`extreme` are a deliberately uniform scaling ladder --
 * three points make a curve, so a regression that changes the shape (not
 * just the slope) of the cost curve is visible. `enterprise` is a separate,
 * non-uniform realism spot-check, never compared numerically against the
 * other three (see ../README.md's "never compare" rule).
 */
export const TIERS = {
  baseline: { contracts: 10, varsPerContract: 10, style: "uniform" },
  stress: { contracts: 100, varsPerContract: 10, style: "uniform" },
  extreme: { contracts: 800, varsPerContract: 10, style: "uniform" },
  enterprise: { contracts: 250, style: "enterprise" },
};

export const TIER_NAMES = Object.keys(TIERS);

/**
 * Deterministic (pure function of contract index, no RNG): first 40% of
 * contracts get 2-4 variables ("tiny"), next 35% get 8-15 ("medium"), next
 * 20% get 20-40 ("large"), last 5% get 100-149 ("huge"). For 250 contracts
 * this is exactly 100/88/50/12, which sums to 250.
 */
export function enterpriseContractSizes(totalContracts) {
  const tinyCount = Math.round(totalContracts * 0.4);
  const mediumCount = Math.round(totalContracts * 0.35);
  const largeCount = Math.round(totalContracts * 0.2);
  const hugeCount = totalContracts - tinyCount - mediumCount - largeCount;

  const sizes = [];
  for (let i = 0; i < tinyCount; i++) sizes.push(2 + (i % 3));
  for (let i = 0; i < mediumCount; i++) sizes.push(8 + (i % 8));
  for (let i = 0; i < largeCount; i++) sizes.push(20 + (i % 21));
  for (let i = 0; i < hugeCount; i++) sizes.push(100 + (i % 50));
  return sizes;
}

/** Variable count for each contract in a tier, in generation order. */
export function tierContractSizes(tierName) {
  const tier = TIERS[tierName];
  if (!tier) throw new Error(`Unknown tier "${tierName}"`);
  if (tier.style === "enterprise") return enterpriseContractSizes(tier.contracts);
  return Array(tier.contracts).fill(tier.varsPerContract);
}

export function tierTotalVariables(tierName) {
  return tierContractSizes(tierName).reduce((a, b) => a + b, 0);
}

/**
 * `id` embeds both the suite version (methodology, at generation time) and
 * this specific (category, name, tier)'s own definition version -- an id
 * pasted into an issue or dashboard stays unambiguous even out of context.
 */
export function benchmarkId(category, name, tier, definitionVersion) {
  return `${category}-${name}-${tier}-s${BENCHMARK_SUITE_VERSION}-v${definitionVersion}`;
}

// Runtime: cold-start only. See ../README.md for why validation-failures,
// startup-validation, and first/cached-access were considered and cut.
export const RUNTIME_BENCHMARKS = {
  "cold-start": { tiers: TIER_NAMES, definitionVersion: 1 },
};

// Build-time: the 6 named benchmarks the plan settled on.
export const BUILDTIME_BENCHMARKS = {
  artifacts: { tiers: TIER_NAMES, definitionVersion: 1 },
  discovery: { tiers: TIER_NAMES, definitionVersion: 1 },
  "standalone-vs-combined": { tiers: ["stress"], definitionVersion: 1 },
  "documentation-payload": { tiers: ["stress"], definitionVersion: 1 },
  "scoped-include": { tiers: ["extreme"], definitionVersion: 1 },
  "edge-cases": { tiers: ["fixed"], definitionVersion: 1 },
};

/** Every (category, name, tier) the suite declares, independent of whether a given run produced a result for it. */
export function buildManifest(category, benchmarks) {
  const manifest = [];
  for (const [name, def] of Object.entries(benchmarks)) {
    for (const tier of def.tiers) {
      manifest.push({
        id: benchmarkId(category, name, tier, def.definitionVersion),
        category,
        name,
        tier,
        suiteVersion: BENCHMARK_SUITE_VERSION,
        definitionVersion: def.definitionVersion,
      });
    }
  }
  return manifest;
}
