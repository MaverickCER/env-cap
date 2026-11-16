// Hand-written types for peer-range-versions.mjs, which stays plain JS like the other scripts (ADR 0013
// decision 7). The tests in test/scripts/ import it. Not shipped.

export function peerRangeBoundaries(range: string): string[]
export function eslintCompatPairs(
  eslintRange: string,
  utilsRange: string,
): { eslint: string; utils: string }[]
export function sortReleases(versions: string | string[]): string[]
export function nodeTypesFor(spec: string, enginesNode: string): string
