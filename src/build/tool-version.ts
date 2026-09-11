/**
 * Substituted at bundle time by `tsup`'s `define` (and by vitest's, for
 * tests) with a string literal read once from `package.json` -- see
 * `tsup.config.ts`. A module-scoped `declare` (not an ambient `.d.ts`) so
 * every tool that type-checks this file, including `ts-json-schema-
 * generator`, sees the name. See ADR 0040.
 */
declare const __PACKAGE_VERSION__: string

/**
 * env-cap's own installed version -- stamped onto
 * `EvidenceModel.provenance.toolVersion` and mixed into
 * `computeSourceFingerprint()`. `./build` never reads its own manifest from
 * disk (ADR 0040).
 */
export function readToolVersion(): string {
  return __PACKAGE_VERSION__
}
