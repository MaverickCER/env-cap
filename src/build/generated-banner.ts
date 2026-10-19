/**
 * The "this file is generated" marker, and the two standing notices every governance-adjacent artifact
 * stamps near the top (`evidenceDisclaimer()` and `evidenceProjectionNote()`), bound to env-cap.
 *
 * The behavior is shared with every MaverickCER package: it lives in `../_ipc/generated-banner.ts`, a
 * managed copy of internal-package-contract's `runtime/generated-banner.ts`. Only what is env-cap's own is
 * written here, together with the documentation of the public functions.
 */
import { createGeneratedBanner } from "../_ipc/generated-banner.js"
import type { GeneratedBannerOptions } from "../_ipc/generated-banner.js"

/** @returns what is env-cap's own; a function so each literal is evaluated per call. */
function envCap(): GeneratedBannerOptions {
  return {
    product: "env-cap",
    guideUrl: "https://github.com/MaverickCER/env-cap/blob/main/GUIDE.md",
    cliCommand: "npx env-cap",
    reportRegenerateHint:
      "Regenerate it by re-running the script that calls `generateDocumentation()` / `generateUsageReport()` from `@maverickcer/env-cap/build`.",
  }
}

const banner = createGeneratedBanner(envCap)

/**
 * Regeneration instruction for a report the CLI does not write (ADR 0046) -- it is produced by the project's own
 * script calling the `@maverickcer/env-cap/build` generators, so naming `npx env-cap` there would send a reader to a command that
 * cannot regenerate it.
 * @returns The instruction, as a sentence.
 */
export function reportRegenerateHint(): string {
  return banner.reportRegenerateHint()
}

/**
 * Renders the "do not edit by hand" marker in the given comment syntax.
 * @param format - Comment syntax to render in.
 * @param regenerate - How to regenerate; defaults to the CLI, which writes the manifest.
 * @returns The comment line.
 */
export function generatedBanner(format?: "ts" | "markdown", regenerate?: string): string {
  return banner.generatedBanner(format, regenerate)
}

/**
 * Whether `content` carries a {@link generatedBanner}-produced marker, in either format.
 *
 * @remarks
 * Deliberately not a bare `content.startsWith(generatedBanner(...))`: a shebang, a `"use strict"` pragma, or a
 * license header pushes a real banner off line one, and a stricter check would then read a genuinely
 * generated file as hand-written, which the dependency scan would take as "a real consumer imports this" and
 * so permanently mask an abandoned one. The marker is looked for across the first 20 non-empty lines instead,
 * which clears every realistic preamble without scanning a whole file.
 * @param content - A file's text.
 * @returns `true` when the file is generated.
 */
export function isGeneratedFile(content: string): boolean {
  return banner.isGeneratedFile(content)
}

/**
 * Short disclaimer stamped into every artifact that renders sensitivity, ownership or expiry claims. Never omit
 * it from an artifact that renders such metadata: it is what keeps "documented" from being misread as
 * "verified" or "compliant". Every fact in those artifacts is either a statically-provable code fact or an
 * author's own declaration; env-cap never validates a declaration against reality.
 * @returns The disclaimer.
 */
export function evidenceDisclaimer(): string {
  return banner.evidenceDisclaimer()
}

/**
 * States, by concept, that an artifact is a projection of env-cap's Evidence Model, and by path when one is known.
 * It never hardcodes a path, because the evidence file only exists on a run that passed `--evidence`.
 * @param evidencePath - The path the evidence was also written to, when this run wrote it.
 * @returns The note.
 */
export function evidenceProjectionNote(evidencePath?: string): string {
  return banner.evidenceProjectionNote(evidencePath)
}
