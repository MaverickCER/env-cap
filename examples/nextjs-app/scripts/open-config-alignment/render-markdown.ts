import { ANNEX_A_CATEGORIES, CM_ACTIVITIES } from "./standard-map.js"
import type { ItemEvidence } from "./types.js"

function renderTable(
  items: readonly { readonly id: string; readonly name: string }[],
  entries: readonly ItemEvidence[],
): string {
  const lines: string[] = []
  lines.push("| Item | Status | Evidence |")
  lines.push("| --- | --- | --- |")
  for (const item of items) {
    const entry = entries.find((e) => e.id === item.id)
    const status = entry?.status === "evidence-found" ? "Evidence found" : "No evidence"
    const summary = (entry?.summary ?? "Not evaluated by this generator.")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ")
    lines.push(`| ${item.name} | ${status} | ${summary} |`)
  }
  return lines.join("\n")
}

/**
 * Renders `docs/ISO-10007-2017.md`. ISO 10007:2017 itself is a copyrighted,
 * purchasable standard this document never quotes -- what it actually maps
 * this app's real evidence against is its published PROCESS STRUCTURE (five
 * named configuration management activities, a table-of-contents-level
 * fact, corroborated across independent public summaries -- see
 * standard-map.ts and this directory's own README).
 * @param input - What to render.
 * @param input.entries - Every CM activity's evidence status.
 * @param input.generatedAt - ISO 8601 timestamp of this render.
 * @returns The full Markdown document.
 */
export function render10007Markdown(input: {
  readonly entries: readonly ItemEvidence[]
  readonly generatedAt: string
}): string {
  const { entries, generatedAt } = input
  const found = entries.filter((e) => e.status === "evidence-found").length
  return [
    "# ISO 10007:2017 evidence and alignment report",
    "",
    '> **Informational Evidence and Alignment Report -- not a certification, conformity assessment, or reproduction of the standard.** ISO 10007:2017 ("Quality management -- Guidelines for configuration management") is itself a copyrighted, purchasable standard this document never quotes or reproduces. What this document maps this application\'s own, real evidence against is the standard\'s published process STRUCTURE -- its five named configuration management activities (configuration management planning, configuration identification, change control, configuration status accounting, configuration audit), a factual, table-of-contents-level fact about the standard\'s organization, corroborated across independent public summaries (see [`scripts/open-config-alignment/standard-map.ts`](../scripts/open-config-alignment/standard-map.ts)). **This does not claim conformance with ISO 10007**, and is not a certification of any kind. Every "Evidence found" entry traces to a specific, named source -- one of `env-cap`\'s own published reference evidence projections (`env-cap/build`), applied to this application\'s own generated `docs/env.evidence.json` -- no claim here is made without a traceable evidence source.',
    "",
    `_Generated ${generatedAt} against this example's own \`docs/env.evidence.json\`._`,
    "",
    `**${String(found)} of ${String(entries.length)} activities have evidence-backed entries below.**`,
    "",
    renderTable(CM_ACTIVITIES, entries),
    "",
  ].join("\n")
}

/**
 * Renders `docs/ISO-IEC-27001-2022.md`. Same reasoning as
 * {@link render10007Markdown}, applied to ISO/IEC 27001:2022's published
 * Annex A control-theme structure (four categories: Organizational,
 * People, Physical, Technological) instead of ISO 10007's process
 * activities.
 * @param input - What to render.
 * @param input.entries - Every Annex A category's evidence status.
 * @param input.generatedAt - ISO 8601 timestamp of this render.
 * @returns The full Markdown document.
 */
export function render27001Markdown(input: {
  readonly entries: readonly ItemEvidence[]
  readonly generatedAt: string
}): string {
  const { entries, generatedAt } = input
  const found = entries.filter((e) => e.status === "evidence-found").length
  return [
    "# ISO/IEC 27001:2022 evidence and alignment report",
    "",
    '> **Informational Evidence and Alignment Report -- not a certification, conformity assessment, or reproduction of the standard.** ISO/IEC 27001:2022 ("Information security, cybersecurity and privacy protection -- Information security management systems -- Requirements") is itself a copyrighted, purchasable standard this document never quotes or reproduces. What this document maps this application\'s own, real evidence against is the standard\'s published Annex A control-theme STRUCTURE -- its four named categories (Organizational, People, Physical, Technological controls), a factual, table-of-contents-level fact about the standard\'s organization, corroborated across independent public summaries (see [`scripts/open-config-alignment/standard-map.ts`](../scripts/open-config-alignment/standard-map.ts)). **This does not claim conformance with ISO/IEC 27001, does not claim any Annex A control is actually implemented**, and is not a certification of any kind. Every "Evidence found" entry traces to a specific, named source -- one of `env-cap`\'s own published reference evidence projections (`env-cap/build`), applied to this application\'s own generated `docs/env.evidence.json` -- no claim here is made without a traceable evidence source.',
    "",
    `_Generated ${generatedAt} against this example's own \`docs/env.evidence.json\`._`,
    "",
    `**${String(found)} of ${String(entries.length)} categories have evidence-backed entries below.**`,
    "",
    renderTable(ANNEX_A_CATEGORIES, entries),
    "",
  ].join("\n")
}
