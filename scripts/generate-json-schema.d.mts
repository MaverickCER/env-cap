// Hand-written type declaration for generate-json-schema.mjs, kept as plain,
// dependency-free-at-runtime JS (same convention as report.d.mts/report.mjs --
// see ADR 0013 decision 7). Exists purely so test/build/json-schema.test.ts
// gets real type-checking instead of treating the import as `any`; not
// shipped (outside `files` in package.json) and never affects the published
// package's types.

export function generateReportSchema(): object
export function generateContractModelSchema(): object
