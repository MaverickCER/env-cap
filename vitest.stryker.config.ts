import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "./vitest.config.js"

/**
 * Vitest config used ONLY by Stryker (`stryker.config.mjs`'s `vitest.configFile`),
 * never by `npm test`/CI -- the real suite (`vitest.config.ts`) is untouched and
 * still runs every one of `test/integration/**`/`test/examples/**` normally.
 *
 * Both directories are excluded from Stryker's OWN test run wholesale. Root
 * cause, found by chasing individual failures one at a time before realizing
 * they all share one source: `computeSourceFingerprint()`
 * (`src/build/evidence-cache.ts`) folds each discovered schema file's own
 * path string into the `docs/env.evidence.json.fingerprint` hash it computes
 * -- and that path is rooted at the fixture's real, absolute location on
 * disk. Stryker physically copies the whole repo into
 * `.stryker-tmp/sandbox-<id>/` to run mutants, so a fresh fingerprint
 * computed from inside the sandbox is hashed from a DIFFERENT absolute root
 * than the one baked into every committed `expected/**\/*.fingerprint` --
 * changing the path changes the hash even though the source content is
 * byte-identical. Nearly every fixture under both directories calls
 * `compareGoldenArtifacts()` with `docs/env.evidence.json.fingerprint` in its
 * `ARTIFACTS` list, so this isn't a one-off: it's structural to the whole
 * "compare a fresh generation against a committed golden copy" test shape
 * these two directories are built on, once the generation happens from a
 * relocated directory. (Two further sandbox-only quirks were found and fixed
 * piecemeal before this broader cause became clear, both now subsumed by
 * this wholesale exclusion: the 3 flagship examples' `finding.findings[]
 * .location.file` is ALSO an absolute path for the same "fresh generation
 * embeds the sandbox's own root" reason; and `tsconfig-aliases-consumer`/
 * `paypal-consumer` additionally hit Stryker's `symlinkNodeModules`
 * optimization junction-symlinking a nested `node_modules` back to the real
 * location, which `fs.realpath()`-based package resolution
 * then walks through, producing a `../../../../../../../test/integration/...`
 * path instead of the clean one every golden fixture pins.)
 *
 * None of this reflects a real regression -- confirmed repeatedly by running
 * the same generation directly inside a surviving `.stryker-tmp/sandbox-*`
 * copy and diffing path-normalized content. And it costs nothing in mutation
 * coverage: every `src/build/*.ts` module these fixtures exercise already has
 * its own dedicated `test/build/*.test.ts` unit-level coverage (41 files) --
 * `test/integration/**`/`test/examples/**` are a second, wholly-real,
 * environment-sensitive confidence layer on top (see
 * [[feedback-examples-as-e2e-tests]]), not the only place any `src/` line is
 * exercised. Any wiring-only line that turns out to be covered solely by an
 * excluded integration/example test will show as Stryker `NoCoverage` rather
 * than a false `Killed` -- the correct signal to add a direct unit test for
 * it, same as every other file in this drive.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [
        "test/cross-runtime/**",
        "**/node_modules/**",
        "test/examples/**",
        "test/integration/**",
      ],
    },
  }),
)
