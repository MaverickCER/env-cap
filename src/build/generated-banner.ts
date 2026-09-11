/**
 * Single source of truth for the "this file is generated" marker text, so it
 * can never drift out of sync between where it's written (`manifest.ts`,
 * `docs.ts`, `usage-report.ts`) and where it's read (`scan-dependencies.ts`,
 * closing the self-reference loop where a contract's own generated manifest
 * would otherwise make it look permanently "used"). Not configurable, not
 * public.
 *
 * Also home to the two standing notices every governance-adjacent artifact
 * stamps near the top -- `evidenceDisclaimer()` and
 * `evidenceProjectionNote()`. They live here, next to the banner, because
 * they answer the same question the banner does ("what is this file, and how
 * much should I trust it?") and because a renderer that emits one must never
 * be able to emit the others from a stale, separately-maintained copy.
 */

/**
 * The literal marker embedded in every {@link generatedBanner}-produced
 * comment, and what {@link isGeneratedFile} looks for. A function, not a
 * module-level `const` -- a `const` string's mutants are evaluated once at
 * module load and can't be attributed to the test that covers them under
 * Stryker's `perTest` coverage analysis (a documented false-Survivor, not a
 * real gap); a function's return literal is evaluated per call, same as any
 * other code.
 */
function generatedFileMarker(): string {
  return "GENERATED FILE"
}

/** Renders the "do not edit by hand" marker in the given comment syntax. */
export function generatedBanner(format: "ts" | "markdown" = "ts"): string {
  const text = `${generatedFileMarker()} -- do not edit by hand. Run \`npx env-cap\` to regenerate.`
  // An object lookup, not a `format === "ts" ? ... : ...` ternary: with only
  // two checked literal values, a ternary's untaken branch is an "equivalent
  // mutant" magnet (mutating the "ts" comparison string still routes every
  // non-"ts" test case to the same markdown branch). A mutated key here
  // returns `undefined` instead, which every caller/test can observe.
  return { ts: `// ${text}`, markdown: `<!-- ${text} -->` }[format]
}

/**
 * Whether `content` carries a {@link generatedBanner}-produced marker, in
 * either format.
 *
 * @remarks
 * Deliberately not a bare `content.startsWith(generatedBanner(...))`: a
 * shebang, a `"use strict"` pragma, or a license header pushes a real banner
 * off line one, and a stricter check would then read a genuinely generated
 * file as hand-written -- which `dependency-graph.ts` would take as "a real
 * consumer imports this contract," permanently masking an abandoned one. The
 * marker is looked for across the first 20 non-empty lines instead, which
 * clears every realistic preamble without scanning a whole file.
 */
export function isGeneratedFile(content: string): boolean {
  const nonEmptyLines = content.split("\n").filter((line) => line.trim().length > 0)
  return nonEmptyLines.slice(0, 20).some((line) => line.includes(generatedFileMarker()))
}

/**
 * Short disclaimer stamped into every artifact that renders sensitivity/
 * ownership/expiry claims (the docs Catalog, the Dependency & Ownership
 * Report). Never omit this from an artifact that renders `documentEnv()`
 * metadata: it's what keeps "documented" from being misread as "verified" or
 * "compliant." Every fact in those artifacts is either a statically-provable
 * code fact or an author's own declaration -- env-cap never executes a schema
 * file and never validates a declaration against reality.
 */
export function evidenceDisclaimer(): string {
  return "Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard."
}

/**
 * States, by concept, that this artifact is a projection of env-cap's
 * Evidence Model (ADR 0031/0038) -- never a hardcoded path, since
 * `docs/env.evidence.json` only exists on a run that actually passed
 * `--evidence`; a project that never requests that flag would otherwise get
 * a note pointing at a file that doesn't exist. `evidencePath`, when this
 * same run's own options did include `--evidence <path>`, names that
 * concrete path in addition to the concept.
 */
export function evidenceProjectionNote(evidencePath?: string): string {
  const concept =
    "Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from."
  return evidencePath === undefined
    ? concept
    : `${concept} This run also wrote it to \`${evidencePath}\`.`
}
