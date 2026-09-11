import { defineEvidenceProjection } from "env-cap/evidence";
import { effectiveOwner } from "env-cap/build";

/**
 * The "Joined Variable View" reference projection -- an eleventh, added after the original ten
 * (see README.md's "This is the tenth and last..." note, now superseded by this one). Not part of
 * ADR 0024's original plan: added to give a `defineEvidenceProjection()` author a working,
 * copyable example of the join every one of the ten projections above performs its own version of
 * (Contract Model + Dependency Model + Lifecycle Model, correlated by `${file}#${exportName}#${key}`
 * identity), instead of each author re-deriving it from scratch.
 *
 * Deliberately **not** shipped as a package export -- see ADR 0033's "Alternatives considered":
 * a 6th public entry point exporting ready-made projections was rejected precisely to avoid
 * committing env-cap to a Stable-track output shape before real usage validates it. This
 * projection is an examples/-pattern to copy, the same as the other ten, not an importable
 * convenience function.
 *
 * One row per declared variable, with a fixed, deliberately narrow field list -- resist widening
 * it ad hoc; a genuinely new need is a new projection, not a growing "everything view":
 *
 * - identity: `file`, `exportName`, `contractName`, `key` (Contract Model)
 * - `description`, `hasDefault`, `hasProcessor`, `hasValidator` (Contract Model, as declared)
 * - `owner`: `effectiveOwner()` (`env-cap/build`, public) -- variable's own value,
 *   falling back to the contract's.
 * - `sensitivity`: the same fallback, computed inline (`variable.sensitivity ??
 *   contract.sensitivity`) since -- unlike `owner` -- no `effectiveSensitivity()` is part of
 *   the public `env-cap/build` surface (only `effectiveOwner()` is; see
 *   `inventory.mjs`'s own doc comment for this same asymmetry). A real consumer hitting this gap
 *   would have to do the same inline fallback this projection does.
 * - `expiresAt`: `variable.expiresAt` exactly as Contract Model stores it -- **not** a fallback to
 *   `contract.expiresAt`. No `effectiveExpiresAt()` exists anywhere in `env-cap/build`,
 *   and nothing else in env-cap treats contract-/variable-level `expiresAt` as one falling back to
 *   the other (`docs.ts`'s own catalog/lifecycle rendering reports them as two independent facts).
 *   Inventing fallback semantics here that don't exist upstream would make this projection an
 *   interpretation layer instead of a faithful reshape.
 * - `dependencyStatus`/`dependencyPositions`: Dependency Model's own `status`
 *   (`"used"|"unconsumed"|"indeterminate"`) and, when used, every member-access position.
 * - `deprecated`/`deprecatedReason`/`removeBy`/`renamedFrom`: Lifecycle Model's per-variable
 *   fields, present only for a variable Lifecycle Model itself tracks (it only includes a variable
 *   at all when at least one lifecycle field is set) -- absent here means genuinely absent
 *   upstream, never synthesized into a default like `deprecated: false`.
 */
export const joinedVariablesProjection = defineEvidenceProjection({
  rows: (evidence) => {
    const dependencyByIdentity = new Map(
      evidence.dependency.contracts.map((contract) => [
        `${contract.file}#${contract.exportName}`,
        contract,
      ]),
    );
    const lifecycleByIdentity = new Map(
      evidence.lifecycle.contracts.map((contract) => [
        `${contract.file}#${contract.exportName}`,
        contract,
      ]),
    );

    const rows = [];
    for (const contract of evidence.contract.contracts) {
      const identity = `${contract.file}#${contract.exportName}`;
      const dependencyContract = dependencyByIdentity.get(identity);
      const lifecycleContract = lifecycleByIdentity.get(identity);
      const dependencyVariables = new Map(
        (dependencyContract?.variables ?? []).map((variable) => [variable.key, variable]),
      );
      const lifecycleVariables = new Map(
        (lifecycleContract?.variables ?? []).map((variable) => [variable.key, variable]),
      );

      for (const variable of contract.variables) {
        const dependencyVariable = dependencyVariables.get(variable.key);
        const lifecycleVariable = lifecycleVariables.get(variable.key);

        rows.push({
          file: contract.file,
          exportName: contract.exportName,
          contractName: contract.contractName,
          key: variable.key,
          description: variable.description,
          owner: effectiveOwner(contract, variable),
          sensitivity: variable.sensitivity ?? contract.sensitivity,
          hasDefault: variable.hasDefault,
          hasProcessor: variable.hasProcessor,
          hasValidator: variable.hasValidator,
          expiresAt: variable.expiresAt,
          dependencyStatus: dependencyVariable?.status,
          dependencyPositions: dependencyVariable?.positions ?? [],
          deprecated: lifecycleVariable?.deprecated,
          deprecatedReason: lifecycleVariable?.deprecatedReason,
          removeBy: lifecycleVariable?.removeBy,
          renamedFrom: lifecycleVariable?.renamedFrom,
        });
      }
    }

    rows.sort((a, b) => {
      const identityA = `${a.file}#${a.exportName}#${a.key}`;
      const identityB = `${b.file}#${b.exportName}#${b.key}`;
      return identityA < identityB ? -1 : identityA > identityB ? 1 : 0;
    });

    return rows;
  },
});
