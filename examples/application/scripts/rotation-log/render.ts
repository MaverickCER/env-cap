// The default Markdown renderer for a `RotationLogModel` -- NOT the only
// possible one. `build-model.ts` is the real seam: an org that wants a
// different shape (a CSV for a spreadsheet import, a row per authenticator
// TYPE instead of per variable, an HTML page) renders `RotationLogModel`
// however it likes; this file is just this example's own choice, written
// out in full so a reader can see exactly what "an IA-5 rotation-compliance
// document" can look like end to end.
//
// There is no single official NIST-published template for this -- IA-5
// (Authenticator Management) states the *control* ("change or refresh
// authenticators [by an organization-defined time period, by authenticator
// type] or when [organization-defined events] occur," NIST SP 800-53 Rev.
// 5, IA-5, control statement (f)) but never prescribes a reporting format
// for demonstrating compliance with it. The table below is this generator's
// own judgment call about which columns matter, not a reproduction of a
// NIST-provided layout.
//
// Only the IA-5 main statement is implemented here -- not IA-5(13)
// ("Expiration of Cached Authenticators"), a control enhancement about
// prohibiting use of a *cached* authenticator copy past a time limit. That's
// a distinct concern from rotating the primary authenticator value itself
// (what `rotationPeriod`/`lastRotatedAt`/`rotationTriggerEvents` model
// here), so IA-5(13) is deliberately not cited below -- citing a control
// this document doesn't actually speak to would be worse than citing none.
import type { RotationLogModel } from "./types.js"

function statusLabel(status: "compliant" | "overdue" | "expired"): string {
  switch (status) {
    case "compliant":
      return "Compliant"
    case "overdue":
      return "**Overdue**"
    case "expired":
      return "**Expired**"
  }
}

function cell(value: string | undefined): string {
  return value ?? "--"
}

/**
 * Renders a `RotationLogModel` as a Markdown document -- the default shape
 * `run.ts` writes to `docs/SECRETS-ROTATION-LOG.md`. See this file's own
 * header comment for why this exact layout is a judgment call, not a
 * NIST-mandated one.
 */
export function renderRotationLog(model: RotationLogModel): string {
  const lines: string[] = []

  lines.push("# Secrets Rotation Log")
  lines.push("")
  lines.push(
    "Internal rotation-compliance artifact for NIST SP 800-53 Rev. 5 **IA-5** " +
      '(Authenticator Management), control statement (f): "Change or refresh authenticators ' +
      "[organization-defined time period by authenticator type] or when [organization-defined " +
      'events] occur." Generated from `env-cap`\'s own evidence artifact -- see `scripts/' +
      "rotation-log/README.md` for how.",
  )
  lines.push("")
  lines.push(
    "> **Not NIST certification or ATO evidence.** This is an internal engineering artifact for " +
      "tracking secrets-rotation hygiene, not a compliance attestation, an authorization package " +
      "exhibit, or a substitute for your organization's own IA-5 assessment procedures.",
  )
  lines.push("")
  lines.push(`Generated at: ${model.generatedAt}`)
  lines.push("")

  if (model.entries.length === 0) {
    lines.push(
      "No variable in this project declares `authenticatorType`, `rotationPeriod`, " +
        "`lastRotatedAt`, or `rotationTriggerEvents` -- nothing to report.",
    )
    lines.push("")
    return lines.join("\n")
  }

  lines.push(
    "| Variable | Authenticator type | Rotation period | Last rotated | Status | Time-based trigger | Event-based triggers declared |",
  )
  lines.push("| --- | --- | --- | --- | --- | --- | --- |")
  for (const entry of model.entries) {
    const timeBasedCell = entry.timeBasedTriggerFired ? "Fired" : "Not fired"
    const eventBasedCell =
      entry.rotationTriggerEvents.length > 0 ? entry.rotationTriggerEvents.join(", ") : "--"
    lines.push(
      `| \`${entry.variable}\` | ${cell(entry.authenticatorType)} | ${cell(entry.rotationPeriod)} | ` +
        `${cell(entry.lastRotatedAt)} | ${statusLabel(entry.status)} | ${timeBasedCell} | ${eventBasedCell} |`,
    )
  }
  lines.push("")

  lines.push("## Entries")
  lines.push("")
  for (const entry of model.entries) {
    lines.push(`### \`${entry.variable}\` (${entry.contractName})`)
    lines.push("")
    lines.push(`- File: \`${entry.file}\``)
    lines.push(`- Status: ${statusLabel(entry.status)}`)
    if (entry.expiresAt) lines.push(`- Expires at: ${entry.expiresAt}`)
    if (entry.refreshInstructions) lines.push(`- Refresh instructions: ${entry.refreshInstructions}`)
    lines.push("")
  }

  return lines.join("\n")
}
