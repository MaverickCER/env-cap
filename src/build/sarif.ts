/**
 * SARIF export: an adapter over Finding Model, not a new fact source.
 * Produces a minimal, spec-conformant SARIF 2.1.0 log
 * (https://docs.oasis-open.org/sarif/sarif/v2.1.0/). Any SARIF-aware tool can
 * then read env-cap's findings, such as GitHub code scanning or a CI security
 * dashboard.
 *
 * Pure and synchronous: every input is computed before this runs. It never
 * re-derives a finding, reads the filesystem or decides what is a problem.
 * It only re-shapes what `buildFindingModel()` concluded.
 */

import type { Finding, FindingModel } from "./finding-model.js"
import type { SourcePosition } from "./source-position.js"
import { readToolVersion } from "./tool-version.js"

/** SARIF's `level` enum: see the SARIF 2.1.0 spec, section 3.27.10. */
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

/** A root-relative path as a SARIF `uri-reference`: percent-encoded, with `#` and `?` encoded too. */
function uriReference(file: string): string {
  return encodeURI(file).replace(/#/g, "%23").replace(/\?/g, "%3F")
}

/**
 * A finding's location as SARIF's physical-location shape, or `undefined`
 * when the finding names no file at all.
 *
 * @remarks
 * `region` is emitted only when a real `SourcePosition` exists. Most of
 * env-cap's finding families deliberately carry `position: undefined` today
 * (see `finding-model.ts`'s `NO_POSITION` note). Synthesizing a
 * `startLine: 1` for those would be a fabricated claim about where the
 * problem is, and a code-scanning UI would anchor an annotation to it.
 */
function sarifLocations(finding: Finding): readonly SarifLocation[] | undefined {
  const location = finding.location
  // A change-model location (a generated artifact) has no position inside it.
  const { position } = location as { readonly position?: SourcePosition | undefined }
  // A position names its file: a stale citation's line is in the cited file, not the contract file.
  // So the artifact is the file the line belongs to.
  const file = position?.file ?? (location.model === "change" ? location.path : location.file)
  if (file === undefined) return undefined
  return [
    {
      physicalLocation: {
        artifactLocation: { uri: uriReference(file) },
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

/** A minimal SARIF 2.1.0 log: only the properties this adapter actually populates, not the full spec surface. */
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
 * sorted: not the full `FindingCode` union. A SARIF consumer reads the rules
 * array as "what this tool reported". Rules with no result would make a clean
 * run look like it has unexplained silent rules. `results` preserves Finding Model's own order, which a caller wanting
 * a different one sorts themselves.
 */
export function buildSarifLog(findingModel: FindingModel): SarifLog {
  const ruleIds = [...new Set(findingModel.findings.map((f) => f.code))].sort()

  return {
    $schema:
      "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
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
        // Under `exactOptionalPropertyTypes` the key must be absent, never
        // `undefined`. So `locations` is spread in only when
        // `sarifLocations()` has one.
        results: findingModel.findings.map((finding) => {
          const locations = sarifLocations(finding)
          return {
            ruleId: finding.code,
            level: sarifLevel(finding.severity),
            message: { text: finding.message },
            ...(locations === undefined ? {} : { locations }),
          }
        }),
      },
    ],
  }
}
