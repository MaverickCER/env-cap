// Highlighting thresholds only -- never a gate. A named benchmark with no
// entry here (standalone-vs-combined, documentation-payload, scoped-include,
// edge-cases) is reported but never flagged; those are one-shot comparisons
// or fixed-input sanity checks, not tiered regression targets.

export const BUDGETS = {
  "cold-start": { maxRegressionPercent: 10 },
  artifacts: { maxRegressionPercent: 15 },
  discovery: { maxRegressionPercent: 15 },
};
