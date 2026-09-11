import { defineEvidenceProjection } from "env-cap/evidence";

/**
 * The "unified filterable Finding list" reference projection (plan
 * Phase 21) -- "the actual queryable presentation (by severity/model/code/
 * contract) over Finding Model." Finding Model (ADR 0026) is already a
 * flat `Finding[]`; this projection's job is indexing that list so a
 * consumer can look a bucket up directly (`bySeverity.error`,
 * `byCode["UNDOCUMENTED_VARIABLE"]`) instead of filtering the whole array
 * on every query. The indexes stay plain JSON-serializable data (arrays of
 * findings, not closures), matching Evidence Model's own portability goal.
 *
 * `byContract` needs a model-aware key, since `EvidenceReference`'s three
 * variants (ADR 0026) don't share one identity field: `"contract"` findings
 * carry `exportName`, `"ownership"` findings carry `contractName` (a
 * resolved display name, not the same kind of key), and `"change"`
 * findings carry neither (they're about a generated artifact's path, not a
 * declared contract at all).
 *
 * `ContractEvidenceReference.file` is documented as an absolute path (its
 * own doc comment: "when known") -- an intentional convention, unchanged
 * here, matching every source `buildFindingModel()` adapts (`CompatibilityIssue`,
 * `DocumentationFindings`, ...), all of which need real filesystem paths for
 * their own direct consumers. Left as-is, that machine-specific absolute
 * path would land straight in this projection's JSON output. This
 * projection normalizes it to Contract Model's portable, root-relative
 * convention instead (joined by `exportName`, the identity `"contract"`
 * findings carry) -- not a fix to Finding Model itself, which is behaving
 * exactly as documented, just this projection's own choice about what a
 * consumer of its output should see.
 */
function contractKey(finding) {
  const location = finding.location;
  if (location.model === "contract") return location.exportName ?? "(unknown contract)";
  if (location.model === "ownership") return location.contractName;
  return "(not contract-scoped)";
}

function normalizeLocation(location, relativeFileByExportName) {
  if (location.model !== "contract" || location.exportName === undefined) return location;
  const relativeFile = relativeFileByExportName.get(location.exportName);
  if (relativeFile === undefined) return location;
  return { ...location, file: relativeFile };
}

function groupBy(items, keyFor) {
  const groups = {};
  for (const item of items) {
    const key = keyFor(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}

export const findingsProjection = defineEvidenceProjection({
  findings: (evidence) => {
    const relativeFileByExportName = new Map(
      evidence.contract.contracts.map((contract) => [contract.exportName, contract.file]),
    );
    const all = evidence.finding.findings.map((finding) => ({
      ...finding,
      location: normalizeLocation(finding.location, relativeFileByExportName),
    }));
    return {
      all,
      bySeverity: groupBy(all, (finding) => finding.severity),
      byFamily: groupBy(all, (finding) => finding.family),
      byCode: groupBy(all, (finding) => finding.code),
      byContract: groupBy(all, contractKey),
    };
  },
});
