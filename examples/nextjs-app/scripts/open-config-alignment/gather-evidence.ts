import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { configurationReference, expiringSoonReport, ownershipSummary } from "env-cap/build"
import type { EvidenceModel } from "env-cap/build"
import type { ItemEvidence } from "./types.js"

/**
 * @param id - The item id.
 * @param name - The item's display name.
 * @param summary - What the evidence shows.
 * @returns An `"evidence-found"` `ItemEvidence` entry.
 */
function found(id: string, name: string, summary: string): ItemEvidence {
  return { id, name, status: "evidence-found", summary }
}

/**
 * @param id - The item id.
 * @param name - The item's display name.
 * @param why - Why this app's evidence has nothing to say about this item.
 * @returns A `"no-evidence"` `ItemEvidence` entry.
 */
function none(id: string, name: string, why: string): ItemEvidence {
  return { id, name, status: "no-evidence", summary: why }
}

/**
 * Loads this example's own generated `docs/env.evidence.json` and runs it
 * through env-cap's three published reference evidence projections
 * (`env-cap/build`) plus its raw Finding/Change models, to assemble the
 * ISO 10007 and ISO/IEC 27001 evidence sets in one pass (both read the same
 * underlying evidence, just group it differently).
 * @param root - This example's own root directory.
 * @returns The loaded `EvidenceModel` and the three projection results.
 */
function loadEvidence(root: string): {
  readonly evidence: EvidenceModel
  readonly configRef: ReturnType<typeof configurationReference>
  readonly ownership: ReturnType<typeof ownershipSummary>
  readonly expiring: ReturnType<typeof expiringSoonReport>
} {
  const evidencePath = path.join(root, "docs/env.evidence.json")
  if (!existsSync(evidencePath)) {
    throw new Error(
      `${evidencePath} does not exist -- run \`npm run docs\` first (this generator's own run.ts already does, in order, before reading it).`,
    )
  }
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as EvidenceModel
  return {
    evidence,
    configRef: configurationReference(evidence),
    ownership: ownershipSummary(evidence),
    expiring: expiringSoonReport(evidence),
  }
}

/**
 * Maps this app's real evidence against ISO 10007:2017's five configuration
 * management process activities (configuration management planning,
 * configuration identification, change control, configuration status
 * accounting, configuration audit -- see this generator's own README for
 * sourcing).
 * @param root - This example's own root directory.
 * @returns One `ItemEvidence` entry per CM activity.
 */
export function gather10007Evidence(root: string): readonly ItemEvidence[] {
  const { evidence, configRef, ownership, expiring } = loadEvidence(root)
  const findingCount = evidence.finding?.findings.length ?? 0

  return [
    configRef.entries.length > 0
      ? found(
          "planning",
          "Configuration Management Planning",
          `Every one of this app's ${String(configRef.entries.length)} declared environment variable(s) is defined through env-cap's \`createEnv\`/\`documentEnv\` contract (see src/features/todos/) -- the contract itself is the configuration management plan: what exists, who owns it, and what validates it, declared before any value is read.`,
        )
      : none("planning", "Configuration Management Planning", "No env-cap contract declared yet."),
    configRef.entries.length > 0
      ? found(
          "identification",
          "Configuration Identification",
          `env-cap's own Configuration Reference projection uniquely identifies all ${String(configRef.entries.length)} declared variable(s) by contract and key (e.g. "${configRef.entries[0] ? `${configRef.entries[0].contractName}.${configRef.entries[0].key}` : ""}") -- a real, generated configuration-item identifier, not a hand-maintained list.`,
        )
      : none("identification", "Configuration Identification", "No env-cap contract declared yet."),
    found(
      "change-control",
      "Change Control",
      `env-cap's own Change Model (docs/env.evidence.json's \`change\` field) tracks what changed since the last persisted evidence snapshot -- added/removed/updated variables are a real, diffable fact (this run: ${String(evidence.change.manifest.addedVariables.length)} added, ${String(evidence.change.manifest.removedVariables.length)} removed, ${String(evidence.change.manifest.updatedVariables.length)} updated), not a manually maintained changelog.`,
    ),
    found(
      "status-accounting",
      "Configuration Status Accounting",
      `env-cap's own Ownership Summary projection accounts for ${String(ownership.owners.length)} distinct owner(s) and ${String(ownership.unowned.length)} unowned variable(s); its Expiring-Soon report accounts for ${String(expiring.entries.length)} variable(s) inside their expiry window (${String(expiring.expiredCount)} already expired) -- a real, generated status record of every configuration item's ownership and lifecycle state.`,
    ),
    findingCount > 0
      ? found(
          "audit",
          "Configuration Audit",
          `env-cap's own Finding Model recorded ${String(findingCount)} finding(s) this run (e.g. undocumented variables, unconsumed owned variables, compatibility conflicts) -- a real, mechanically-produced audit trail comparing declared configuration against actual source usage, not a self-report.`,
        )
      : none(
          "audit",
          "Configuration Audit",
          "No findings were recorded this run (a clean audit is still a real result, but there is no finding-level detail to cite as evidence of the audit process itself beyond \"zero findings\").",
        ),
  ]
}

/**
 * Maps this app's real evidence against ISO/IEC 27001:2022 Annex A's four
 * control-theme categories (Organizational, People, Physical,
 * Technological -- see this generator's own README for sourcing). Each
 * category is one row; env-cap's own evidence is granular enough to cite a
 * specific, real fact for Organizational and Technological, but has
 * nothing to say about People or Physical controls.
 * @param root - This example's own root directory.
 * @returns One `ItemEvidence` entry per Annex A category.
 */
export function gather27001Evidence(root: string): readonly ItemEvidence[] {
  const { configRef, ownership } = loadEvidence(root)
  const secretCount = configRef.entries.filter(
    (e) => e.sensitivity === "secret" || e.sensitivity === "credential",
  ).length

  return [
    ownership.owners.length > 0
      ? found(
          "organizational",
          "Organizational controls",
          `env-cap's own Ownership Summary projection found ${String(ownership.owners.length)} distinct declared owner(s) responsible for this app's environment configuration -- a real information-security-governance fact (who is accountable for a given configuration item), the same kind of record Annex A's organizational controls (e.g. "roles and responsibilities") ask an organization to maintain.`,
        )
      : none("organizational", "Organizational controls", "No variable in this app declares an owner yet."),
    none(
      "people",
      "People controls",
      "Out of scope: personnel screening, security awareness training records, and disciplinary procedures are not facts an environment-variable contract establishes.",
    ),
    none(
      "physical",
      "Physical controls",
      "Out of scope: this app has no physical asset (building, equipment) for a physical-security control to apply to.",
    ),
    secretCount > 0
      ? found(
          "technological",
          "Technological controls",
          `env-cap's own Configuration Reference projection found ${String(secretCount)} of ${String(configRef.entries.length)} declared variable(s) marked \`sensitivity: "secret"\` or \`"credential"\` -- a real, declared classification of which configuration values require technological protection (encryption, access control), presence only, never a claim that protection is actually implemented.`,
        )
      : none(
          "technological",
          "Technological controls",
          "No declared variable in this app is marked secret/credential sensitivity yet.",
        ),
  ]
}
