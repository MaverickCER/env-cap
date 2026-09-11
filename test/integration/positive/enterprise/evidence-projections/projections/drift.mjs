import { defineEvidenceProjection } from "env-cap/evidence";

/**
 * The "Configuration Drift" reference projection (plan Phase 22) -- "maps
 * existing ArtifactCheckFinding/check-artifacts.ts drift data through the
 * projection API." Unlike every projection before it, this one's data
 * genuinely can't come from `EvidenceModel` alone: drift is "does the
 * committed file on disk match what a real run would generate right now,"
 * and `EvidenceModel` is a snapshot of *discovered* reality, never a
 * comparison against previously-written output (`checkEnvArtifacts()`
 * does its own separate discovery pass specifically to read and compare
 * against committed files -- see ADR 0016).
 *
 * `artifactCheckFindings` is a factory parameter, the same pattern
 * `config-reference.mjs`'s `expiringWithinDays` already establishes for
 * "a real caller closes over context `defineEvidenceProjection()`'s own
 * `(evidence) => T` signature (ADR 0032) has no room for." A real caller
 * runs `checkEnvArtifacts()` (or `--check`) itself and passes the result in
 * (see scripts/project-drift.mjs, which also relativizes
 * `ArtifactCheckFinding.path` there -- it's documented as absolute, and
 * `root` is available at that call site but not inside this projection) --
 * this projection's own job is reshaping the result, and correlating it
 * with `evidence.change` to note when drift is plausibly explained by a
 * schema change that hasn't been regenerated into the committed artifact
 * yet, not computing drift itself.
 */
export function createDriftProjection(artifactCheckFindings) {
  return defineEvidenceProjection({
    drift: (evidence) => {
      const stale = artifactCheckFindings.filter((finding) => finding.status === "stale");
      const missing = artifactCheckFindings.filter((finding) => finding.status === "missing");
      const ok = artifactCheckFindings.filter((finding) => finding.status === "ok");

      const changedContractCount =
        evidence.change.manifest.addedContracts.length +
        evidence.change.manifest.removedContracts.length +
        evidence.change.manifest.updatedContracts.length;
      const changedVariableCount =
        evidence.change.manifest.addedVariables.length +
        evidence.change.manifest.removedVariables.length +
        evidence.change.manifest.updatedVariables.length;

      return {
        hasDrift: stale.length > 0 || missing.length > 0,
        stale,
        missing,
        ok,
        likelyExplanation:
          stale.length > 0 && (changedContractCount > 0 || changedVariableCount > 0)
            ? `${changedContractCount} contract change(s) and ${changedVariableCount} variable change(s) since the committed manifest snapshot -- regenerate to clear this drift.`
            : undefined,
      };
    },
  });
}
