/**
 * SARIF export -- an adapter over Finding Model, not a new fact source.
 * Produces a minimal, spec-conformant SARIF 2.1.0 log
 * (https://docs.oasis-open.org/sarif/sarif/v2.1.0/) so env-cap's findings can
 * be consumed by any SARIF-aware tool (GitHub code scanning, most CI security
 * dashboards) without a bespoke integration.
 *
 * Pure and synchronous: every input is already computed by the time this
 * runs, so this never re-derives a finding, never reads the filesystem, and
 * never decides what is or isn't a problem -- it only re-shapes what
 * `buildFindingModel()` already concluded.
 */

import type { Finding, FindingModel } from "./finding-model.js"
import { readToolVersion } from "./tool-version.js"

/** SARIF's `level` enum -- see the SARIF 2.1.0 spec, section 3.27.10. */
type SarifLevel = "none" | "note" | "warning" | "error"

/** env-cap's `"info"` has no SARIF counterpart of the same name; `"note"` is the spec's advisory level, and is what every SARIF consumer renders as "informational". `"warning"`/`"error"` map through unchanged. */
function sarifLevel(severity: Finding["severity"]): SarifLevel {
  return severity === "info" ? "note" : severity
}

interface SarifLocation {
  readonly physicalLocation: {
    readonly artifactLocation: { readonly uri: string }
    readonly region?: { readonly startLine: number; readonly startColumn: number }
  }
}

/**
 * A finding's location as SARIF's physical-location shape, or `undefined`
 * when the finding names no file at all.
 *
 * @remarks
 * `region` is emitted only when a real `SourcePosition` exists -- most of
 * env-cap's finding families deliberately carry `position: undefined` today
 * (see `finding-model.ts`'s `NO_POSITION` note), and synthesizing a
 * `startLine: 1` for those would be a fabricated claim about where the
 * problem is, which is exactly what a code-scanning UI would then anchor an
 * annotation to.
 */
function sarifLocations(finding: Finding): readonly SarifLocation[] | undefined {
  const location = finding.location
  const uri = location.model === "change" ? location.path : location.file
  if (uri === undefined) return undefined
  // Genuinely equivalent either way this ternary's condition is mutated:
  // `ChangeEvidenceReference` has no `position` field at all (by type --
  // see `evidence-reference.ts`), so `location.position` is already
  // `undefined` for a change-model location without this check; and every
  // OTHER model already fails the `=== "change"` comparison for real, so
  // routing them to the same branch a mutated condition would pick changes
  // nothing observable there either.
  // Stryker disable next-line ConditionalExpression,StringLiteral
  const position = location.model === "change" ? undefined : location.position
  return [
    {
      physicalLocation: {
        artifactLocation: { uri },
        ...(position === undefined
          ? {}
          : { region: { startLine: position.line, startColumn: position.column } }),
      },
    },
  ]
}

interface SarifResult {
  readonly ruleId: string
  readonly level: SarifLevel
  readonly message: { readonly text: string }
  readonly locations?: readonly SarifLocation[]
}

/** A minimal SARIF 2.1.0 log -- only the properties this adapter actually populates, not the full spec surface. */
export interface SarifLog {
  readonly $schema: string
  readonly version: "2.1.0"
  readonly runs: readonly {
    readonly tool: {
      readonly driver: {
        readonly name: string
        readonly informationUri: string
        readonly version: string
        readonly rules: readonly { readonly id: string }[]
      }
    }
    readonly results: readonly SarifResult[]
  }[]
}

/**
 * Projects Finding Model into a SARIF 2.1.0 log.
 *
 * @remarks
 * `rules` lists every distinct `FindingCode` actually present in this run,
 * sorted -- not the full `FindingCode` union. A SARIF consumer treats the
 * rules array as "what this tool reported", and advertising rules that
 * produced no result makes a clean run look like it has unexplained silent
 * rules. `results` preserves Finding Model's own order, which a caller wanting
 * a different one sorts themselves.
 */
export function buildSarifLog(findingModel: FindingModel): SarifLog {
  const ruleIds = [...new Set(findingModel.findings.map((f) => f.code))].sort()

  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "env-cap",
            informationUri: "https://github.com/maverickcer/env-cap#readme",
            version: readToolVersion(),
            rules: ruleIds.map((id) => ({ id })),
          },
        },
        results: findingModel.findings.map((finding) => ({
          ruleId: finding.code,
          level: sarifLevel(finding.severity),
          message: { text: finding.message },
          locations: sarifLocations(finding),
        })),
      },
    ],
  }
}
