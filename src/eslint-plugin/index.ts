/**
 * Lint rules that keep environment reads inside contracts (`@maverickcer/env-cap/eslint-plugin`).
 *
 * `no-raw-process-env` flags direct `process.env` reads outside `env.schema.ts` files. `no-node-fs` flags
 * `node:fs` imports in library code, which should take its file system from the caller. The plugin runs
 * inside the project's own ESLint; CI runs the rules on ESLint 10 only.
 *
 * @packageDocumentation
 */
import { noNodeFs } from "./no-node-fs.js"
import { noRawProcessEnv } from "./no-raw-process-env.js"

/**
 * The ESLint plugin, as a flat-config plugin object (`{ rules }`). Register it under the `env-cap`
 * prefix:
 *
 * ```js
 * import envCapPlugin from "@maverickcer/env-cap/eslint-plugin"
 * export default [{ plugins: { "env-cap": envCapPlugin }, rules: { "env-cap/no-raw-process-env": "error" } }]
 * ```
 *
 * ADR 0017 explains why the rules ship as their own entry point.
 */
const plugin = {
  /** Every rule this plugin ships, keyed by its flat-config rule name. */
  rules: {
    /** See {@link noRawProcessEnv}. */
    "no-raw-process-env": noRawProcessEnv,
    /** See {@link noNodeFs}. */
    "no-node-fs": noNodeFs,
  },
}
export default plugin
export { noNodeFs, noRawProcessEnv }
