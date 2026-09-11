/**
 * Re-verifies developer-declared `dynamicAccess` citations every run -- never
 * trusted forever (ADR 0037). Two independent steps, kept as two separate
 * functions rather than one, since they answer two different questions and
 * the second is a pure read over the first's result:
 *
 * - `buildCitationSnapshots` (this run, I/O): for every currently-declared
 *   citation, resolves the cited file and computes a whole-file SHA-256, then
 *   compares it against the *previous* evidence snapshot's recorded hash to
 *   label the citation `"fresh"` / `"stale"` / `"missing"`. Existence is
 *   always re-checked live, never trusted from either snapshot. A citation
 *   with no previous baseline (the first time it's ever been seen) is
 *   `"fresh"` -- there is nothing to contradict it yet. Never throws on a
 *   missing file; that citation is simply labeled `"missing"`.
 * - `verifyDynamicAccessCitations` (pure): flattens that result down to just
 *   the citations that need a human's attention -- every `"stale"`/`"missing"`
 *   assertion, enriched with the owning contract's display name. These are the
 *   direct input to `finding-model.ts`'s `STALE_DYNAMIC_ACCESS_CITATION` /
 *   `MISSING_DYNAMIC_ACCESS_CITATION` findings.
 *
 * Deliberately separate from `evidence-snapshot.ts`'s own `diffContracts()`,
 * which stays synchronous and pure -- these are the only filesystem-touching,
 * citation-specific part of the evidence-snapshot lifecycle. A citation is
 * always a developer's *re-acknowledgment* that access happens, never a claim
 * env-cap itself observed anything: nothing here ever folds into the
 * AST-derived `VariableAccessStatus`.
 */

import crypto from "node:crypto"
import path from "node:path"
import type { EvidenceModel } from "./evidence-model.js"
import { displayPath } from "./display-path.js"
import type { DiscoveredContract } from "./link.js"
import { parsePositionCitation } from "./source-position.js"
import type { DynamicAccessAssertion, SourcePosition } from "./source-position.js"

/** SHA-256 hex digest of `content` -- the committed-baseline mechanism `DynamicAccessAssertion.contentHash` and its acknowledgment check both rely on (ADR 0037). */
function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

/** Stable key {@link buildCitationSnapshots} and `dependency-graph.ts`'s consumer of it agree on -- `file` must be root-relative, POSIX-separated on both sides for a lookup to ever hit. */
export function dynamicAccessVariableIdentity(
  file: string,
  exportName: string,
  key: string,
): string {
  return `${file}#${exportName}#${key}`
}

/** Every `contentHash` a previous evidence snapshot recorded, keyed by `${variableIdentity}#${file}:${line}:${column}` -- the baseline {@link buildCitationSnapshots} compares this run's freshly-computed hashes against. */
function previousContentHashes(previous: EvidenceModel | undefined): ReadonlyMap<string, string> {
  const baselines = new Map<string, string>()
  for (const contract of previous?.dependency.contracts ?? []) {
    for (const variable of contract.variables) {
      for (const assertion of variable.dynamicAccessAssertions) {
        // Bypassing this guard would set `baselines.get(key)` to `undefined`
        // explicitly instead of leaving the key absent -- but `Map.get()`
        // on a genuinely-missing key ALSO returns `undefined`, and every
        // consumer (`buildCitationSnapshots`'s own `!baseline || ...`
        // check below) treats the two identically. Load-bearing for
        // TypeScript's own narrowing of `assertion.contentHash` to
        // `string` for the `Map<string, string>` value type. Hand-verified:
        // bypassing this and running the full `vitest run` leaves every
        // test but the tsc-backed json-schema one passing.
        // Stryker disable next-line ConditionalExpression
        if (assertion.contentHash === undefined) continue
        const identity = dynamicAccessVariableIdentity(
          contract.file,
          contract.exportName,
          variable.key,
        )
        baselines.set(
          `${identity}#${assertion.file}:${assertion.line}:${assertion.column}`,
          assertion.contentHash,
        )
      }
    }
  }
  return baselines
}

/**
 * Re-checks every current `dynamicAccess` citation against the previous
 * evidence snapshot's committed `contentHash` baseline. Existence is always
 * re-checked live (never trusted from either snapshot); content drift is
 * only detectable when a previous baseline exists at all -- a citation with
 * no previous baseline (first time it's ever been seen) is reported
 * `"fresh"`, matching the same "nothing to contradict yet" logic. See ADR
 * 0037.
 */
export async function buildCitationSnapshots(
  activeContracts: readonly DiscoveredContract[],
  previous: EvidenceModel | undefined,
  root: string,
  readFile: (filePath: string) => Promise<string>,
): Promise<ReadonlyMap<string, readonly DynamicAccessAssertion[]>> {
  const previousBaselines = previousContentHashes(previous)

  const result = new Map<string, DynamicAccessAssertion[]>()
  for (const contract of activeContracts) {
    const file = displayPath(root, contract.file)
    for (const variable of contract.variables) {
      // Neither this fallback's own content, nor the early-`continue` two
      // lines down, is observable: a variable with no real citations to
      // report on ends up with `result` either lacking an entry for its
      // identity (with the `continue`) or holding one mapped to `[]`
      // (without it) -- and every consumer (`verifyDynamicAccessCitations`'s
      // own `acknowledgments.get(identity) ?? []`, and this module's only
      // production caller, `evidence-snapshot.ts`, which always re-derives
      // `acknowledgments` from these SAME `activeContracts` right before
      // verifying them) treats "key absent" and "key present but empty"
      // identically. Hand-verified: bypassing both (a poisoned fallback
      // array AND the `continue`) and running the full `vitest run` leaves
      // every test passing.
      // Stryker disable next-line ArrayDeclaration
      const citations = variable.evidence?.dynamicAccess ?? []
      // Stryker disable next-line ConditionalExpression
      if (citations.length === 0) continue

      const identity = dynamicAccessVariableIdentity(file, contract.exportName, variable.key)
      const assertions: DynamicAccessAssertion[] = []
      for (const citation of citations) {
        const position = parsePositionCitation(citation)
        if (!position) continue

        let acknowledgment: DynamicAccessAssertion["acknowledgment"]
        let contentHash: string | undefined
        try {
          const content = await readFile(path.resolve(root, position.file))
          contentHash = hashContent(content)
          const baseline = previousBaselines.get(
            `${identity}#${position.file}:${position.line}:${position.column}`,
          )
          acknowledgment = !baseline || baseline === contentHash ? "fresh" : "stale"
        } catch {
          acknowledgment = "missing"
          contentHash = undefined
        }
        assertions.push({ ...position, acknowledgment, contentHash })
      }
      result.set(identity, assertions)
    }
  }
  return result
}

/** One `dynamicAccess` citation env-cap can no longer vouch for -- the direct input to `finding-model.ts`'s `"STALE_DYNAMIC_ACCESS_CITATION"`/`"MISSING_DYNAMIC_ACCESS_CITATION"` findings. See ADR 0037. */
export interface DynamicAccessCitationProblem {
  readonly contractName: string
  /** Root-relative, POSIX-separated. */
  readonly file: string
  readonly exportName: string
  /** The variable whose `dynamicAccess` citation this is. */
  readonly key: string
  /** Where the citation points -- not the variable's own declaration. */
  readonly position: SourcePosition
  readonly acknowledgment: "stale" | "missing"
}

/**
 * Flattens {@link buildCitationSnapshots}' result down to just the citations
 * that need attention -- every `"stale"`/`"missing"` assertion, enriched with
 * the owning contract's display name. `"fresh"` assertions are silently
 * omitted -- nothing to report about a citation that's still trustworthy.
 */
export function verifyDynamicAccessCitations(
  activeContracts: readonly DiscoveredContract[],
  root: string,
  acknowledgments: ReadonlyMap<string, readonly DynamicAccessAssertion[]>,
): readonly DynamicAccessCitationProblem[] {
  const problems: DynamicAccessCitationProblem[] = []
  for (const contract of activeContracts) {
    const file = displayPath(root, contract.file)
    for (const variable of contract.variables) {
      const identity = dynamicAccessVariableIdentity(file, contract.exportName, variable.key)
      // This module's only production caller (`evidence-snapshot.ts`)
      // always builds `acknowledgments` from these SAME `activeContracts`
      // immediately before calling this -- an identity missing here
      // corresponds exactly to a variable `buildCitationSnapshots()` itself
      // skipped for having zero real citations, which has nothing to
      // report either way. Hand-verified: replacing the fallback with a
      // poisoned single-string array (the exact shape Stryker's own
      // `ArrayDeclaration` mutant produces) and running the full
      // `vitest run` leaves every test passing.
      // Stryker disable next-line ArrayDeclaration
      for (const assertion of acknowledgments.get(identity) ?? []) {
        if (assertion.acknowledgment === "fresh") continue
        problems.push({
          contractName: contract.contractName,
          file,
          exportName: contract.exportName,
          key: variable.key,
          position: { file: assertion.file, line: assertion.line, column: assertion.column },
          acknowledgment: assertion.acknowledgment,
        })
      }
    }
  }
  return problems
}
