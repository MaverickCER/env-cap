// Hand-written type declaration for generate-json-schema.mjs, kept as plain,
// dependency-free-at-runtime JS (same convention as report.d.mts/report.mjs:
// see ADR 0013 decision 7). It gives test/build/json-schema.test.ts real
// type-checking instead of an `any` import. It sits outside `files` in
// package.json, so it never ships or affects the published types.

export function generateReportSchema(): object
export function generateContractModelSchema(): object
