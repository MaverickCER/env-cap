import { defineEvidenceProjection } from "env-cap/evidence";

/**
 * The "Configuration Migration" reference projection (plan Phase 23).
 *
 * No existing report type or `env-cap/build` renderer anchors
 * this one -- flagged as such in the plan itself. This implements the
 * rename-correlation-checklist interpretation: for every variable rename
 * Change Model correlated from an authored `renamedFrom` (ADR 0029/0030 --
 * never guessed from name similarity), a concrete, actionable instruction
 * ("update your `.env` and any code reading `process.env.OLD_KEY`
 * directly"). Also lists variables removed *without* a matching rename
 * correlation -- a real migration signal Change Model already carries
 * (`manifest.removedVariables` minus whatever `renamedVariables` explains),
 * distinct from a rename: something a consumer needs to stop referencing
 * entirely, not update to a new name.
 */
export const migrationProjection = defineEvidenceProjection({
  migration: (evidence) => {
    const renames = evidence.change.renamedVariables.map((rename) => ({
      contractName: rename.contractName,
      file: rename.file,
      exportName: rename.exportName,
      previousKey: rename.previousKey,
      currentKey: rename.currentKey,
      instructions: `Rename "${rename.previousKey}" to "${rename.currentKey}" in your .env file and any code reading process.env.${rename.previousKey} directly.`,
    }));

    const renamedPreviousKeys = new Set(evidence.change.renamedVariables.map((r) => r.previousKey));
    const removedWithoutRename = evidence.change.manifest.removedVariables
      .filter((removed) => !renamedPreviousKeys.has(removed.key))
      .map((removed) => ({
        contractName: removed.contractName,
        file: removed.file,
        key: removed.key,
        instructions: `"${removed.key}" was removed with no correlated rename -- remove any reference to it, including process.env.${removed.key}.`,
      }));

    return { renames, removedWithoutRename };
  },
});
