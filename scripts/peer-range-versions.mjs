// The versions the `typescript-compat` and `eslint-compat` jobs install, derived from the peer ranges and
// `engines.node` in package.json. Deriving them keeps each job and the declared ranges in step: narrowing or
// widening a range changes what CI tests in the same commit.

const CARET = /^\^(\d+)\.(\d+)\.(\d+)$/
const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/
const AT_LEAST = /^>=(\d+)\.\d+\.\d+$/

/**
 * Two versions for each `^X.Y.Z` alternative of a peer range: the floor `X.Y.Z` and the bare major `X`. The
 * bare major resolves to the newest `X.x` release on npm.
 *
 * @param {string} range - the peer range, such as `^8.57.0 || ^9.0.0`.
 * @returns {string[]} the install specifiers, floor first, in range order.
 */
export function peerRangeBoundaries(range) {
  const versions = []
  for (const alternative of range.split("||").map((part) => part.trim())) {
    const match = CARET.exec(alternative)
    if (match === null) {
      throw new Error(
        `"${alternative}" in the peer range "${range}" is not a ^X.Y.Z range. ` +
          "Teach scripts/peer-range-versions.mjs which versions bound it.",
      )
    }
    versions.push(`${match[1]}.${match[2]}.${match[3]}`, match[1])
  }
  return versions
}

/**
 * The `eslint` and `@typescript-eslint/utils` pairs the `eslint-compat` job installs. Every ESLint boundary
 * gets the newest utils release. Each utils floor then runs beside the ESLint floor, the oldest pair a
 * consumer may hold.
 *
 * @param {string} eslintRange - the `eslint` peer range.
 * @param {string} utilsRange - the `@typescript-eslint/utils` peer range.
 * @returns {{ eslint: string, utils: string }[]} the install specifiers, in test order.
 */
export function eslintCompatPairs(eslintRange, utilsRange) {
  const eslint = peerRangeBoundaries(eslintRange)
  const utils = peerRangeBoundaries(utilsRange)
  const newestUtils = utils.at(-1)
  return [
    ...eslint.map((version) => ({ eslint: version, utils: newestUtils })),
    ...utils
      .filter((version) => version.includes("."))
      .map((floor) => ({ eslint: eslint[0], utils: floor })),
  ]
}

/**
 * Releases in ascending version order. npm lists a package's versions in publish order, so a backported
 * patch can sit after a newer minor.
 *
 * @param {string | string[]} versions - the output of `npm view <name>@<range> version --json`, which is a
 *   bare string when one release matches.
 * @returns {string[]} the releases, lowest first.
 */
export function sortReleases(versions) {
  const list = typeof versions === "string" ? [versions] : versions
  if (!Array.isArray(list) || list.length === 0 || !list.every((v) => RELEASE.test(v))) {
    throw new Error(`Expected X.Y.Z releases; got ${JSON.stringify(versions)}.`)
  }
  const parts = (version) => RELEASE.exec(version).slice(1, 4).map(Number)
  return [...list].sort((a, b) => {
    const [x, y] = [parts(a), parts(b)]
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
  })
}

/**
 * The `@types/node` to install beside one TypeScript specifier. A floor gets the types of the Node.js floor
 * (`22` for `>=22.0.0`), because the newest `@types/node` clashes with an older compiler's DOM library. The
 * newest release of a major gets the newest types.
 *
 * @param {string} spec - a boundary from {@link peerRangeBoundaries}.
 * @param {string} enginesNode - package.json's `engines.node`, a `>=X.Y.Z` range.
 * @returns {string} the version or dist-tag to install.
 */
export function nodeTypesFor(spec, enginesNode) {
  const match = AT_LEAST.exec(enginesNode)
  if (match === null) {
    throw new Error(
      `Expected engines.node to be a ">=X.Y.Z" range; got ${JSON.stringify(enginesNode)}.`,
    )
  }
  return spec.includes(".") ? match[1] : "latest"
}
