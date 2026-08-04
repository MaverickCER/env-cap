import { noRawProcessEnv } from "./no-raw-process-env.js"

/**
 * `@maverickcer/env-cap/eslint-plugin` -- a flat-config-shaped plugin object
 * ({ rules: { ... } }), consumed as:
 *
 *   import envCapPlugin from "@maverickcer/env-cap/eslint-plugin";
 *   export default [{ plugins: { "env-cap": envCapPlugin }, rules: { "env-cap/no-raw-process-env": "error" } }];
 *
 * A 4th public entry point alongside `.`, `./build`, `./helpers` -- see ADR 0017.
 */
const plugin = {
  /** Every rule this plugin ships, keyed by its flat-config rule name. */
  rules: {
    /** See {@link noRawProcessEnv}. */
    "no-raw-process-env": noRawProcessEnv,
  },
}
export default plugin
export { noRawProcessEnv }
