// Highlighting thresholds only -- never a gate. A named benchmark with no
// entry here (standalone-vs-combined, documentation-payload, scoped-include,
// edge-cases) is reported but never flagged; those are one-shot comparisons
// or fixed-input sanity checks, not tiered regression targets.

export const BUDGETS = {
  "cold-start": { maxRegressionPercent: 10 },
  artifacts: { maxRegressionPercent: 15 },
  discovery: { maxRegressionPercent: 15 },
  // `helpers` times raw in-process function calls (sub-millisecond to
  // low-double-digit-millisecond per tier, well below cold-start's
  // tens-of-milliseconds floor) with no child-process spawn to dominate and
  // stabilize the signal the way cold-start's own totalMs does. Measured
  // directly: repeated back-to-back local runs with zero code change swung
  // 10-80% tier-to-tier from ordinary system/GC jitter alone. 60% is set
  // deliberately above that observed noise band -- tight enough to still
  // catch a genuine multi-x regression, loose enough not to cry wolf on
  // every PR. Revisit once real CI history accumulates (CI runners are
  // typically less contended than a dev machine mid-benchmark-run).
  helpers: { maxRegressionPercent: 60 },
  // `evidence-projection`'s dominant cost (generateEvidenceModel()) is only
  // sampled 5-8 times per tier (EVIDENCE_MODEL_OPTS) -- deliberately fewer
  // than artifacts/discovery's up-to-30, since each call does strictly more
  // work (all six canonical fact models, not three renders off one shared
  // pass) and a full 30-sample series here would multiply the whole suite's
  // wall-clock cost. Fewer samples means a noisier median: measured directly
  // across three consecutive local runs, medians swung 25-240% tier-to-tier
  // with zero code change. 60% is set above that observed band for the same
  // "highlight real regressions, don't cry wolf" reasoning as `helpers`
  // above.
  "evidence-projection": { maxRegressionPercent: 60 },
};
