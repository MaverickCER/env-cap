/**
 * Single source of truth for the "this file is generated" marker text, so it
 * can never drift out of sync between where it's written (`manifest.ts`,
 * `docs.ts`) and where it's read (`scan-dependencies.ts`, closing the
 * self-reference loop where a contract's own generated manifest would
 * otherwise make it look permanently "used"). Not configurable, not public.
 */

const GENERATED_FILE_MARKER = "AUTO-GENERATED FILE"

/** Banner lines for a generated `.ts` source file. */
export function tsBannerLines(): string[] {
  return [`// ${GENERATED_FILE_MARKER}.`, "// DO NOT EDIT."]
}

/** Banner line for a generated Markdown file. */
export function markdownBannerLine(): string {
  return `<!-- ${GENERATED_FILE_MARKER}. DO NOT EDIT. -->`
}

/**
 * True if the marker appears anywhere in the first 20 non-empty lines.
 * Deliberately not "line one" -- a shebang, a `"use strict"` pragma, or a
 * license header would push a real banner off the first line and defeat a
 * stricter check.
 */
export function hasGeneratedBanner(sourceText: string): boolean {
  const nonEmptyLines = sourceText.split("\n").filter((line) => line.trim().length > 0)
  return nonEmptyLines.slice(0, 20).some((line) => line.includes(GENERATED_FILE_MARKER))
}
