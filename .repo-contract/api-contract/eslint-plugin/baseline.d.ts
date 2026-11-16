/**
 * Lint rules that keep environment reads inside contracts (`@maverickcer/env-cap/eslint-plugin`).
 *
 * `no-raw-process-env` flags direct `process.env` reads outside `env.schema.ts` files. `no-node-fs` flags
 * `node:fs` imports in library code, which should take its file system from the caller. The plugin runs
 * inside the project's ESLint. The `eslint-compat` CI job tests it on the lowest and newest release of each
 * ESLint major in the peer range.
 *
 * @packageDocumentation
 */

import { RuleListener } from '@typescript-eslint/utils/ts-eslint';
import { RuleModule } from '@typescript-eslint/utils/ts-eslint';

/**
 * Flags any `import`, `require` or dynamic `import()` of `node:fs` in library code. A library surface then
 * receives its filesystem capability from the caller instead of importing `node:fs`.
 *
 * @remarks
 * Nothing is exempt by default. A package's config allows its CLI folder (for example `src/cli/**`), which
 * builds the `node:fs/promises` adapter. A consuming project sets the `allow` option for its CLI or script
 * entry points. The rule itself lives in `../_ipc/no-node-fs.ts`, a managed copy of
 * internal-package-contract's `runtime/no-node-fs.ts`; this supplies env-cap's documentation link and the decision
 * record the message cites.
 */
export declare const noNodeFs: RuleModule<"noNodeFs", [RuleOptions_2], unknown, RuleListener> & {
    name: string;
};

/**
 * Flags any direct `process.env.X`/`process.env["X"]` read in application code, so environment
 * access always goes through the `createEnv()` contract of the feature that owns the variable.
 *
 * @remarks
 * `env.schema.ts`/`env.schema.tsx` files are always exempt, because `createEnv()` reads
 * `process.env` there. The rule's `allow` option extends that exemption to a consuming
 * project's trusted bootstrap code.
 */
export declare const noRawProcessEnv: RuleModule<"noRawProcessEnv", [RuleOptions], unknown, RuleListener> & {
    name: string;
};

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
declare const plugin: {
    /** Every rule this plugin ships, keyed by its flat-config rule name. */
    rules: {
        /** See {@link noRawProcessEnv}. */
        "no-raw-process-env": RuleModule<"noRawProcessEnv", [RuleOptions], unknown, RuleListener> & {
            name: string;
        };
        /** See {@link noNodeFs}. */
        "no-node-fs": RuleModule<"noNodeFs", [RuleOptions_2], unknown, RuleListener> & {
            name: string;
        };
    };
};
export default plugin;

declare interface RuleOptions {
    /** Glob-array of files this rule doesn't apply to, beyond the built-in
     *  env.schema.ts allowance below. It is for a consuming project's own
     *  Node-only, build-time bootstrap code. The README section this rule
     *  ships with has the canonical worked example: a live-expiration
     *  resolver authenticating to a secrets manager. Empty by default:
     *  MUST be populated explicitly by the consuming project; env-cap never
     *  guesses at what counts as "trusted bootstrap code." */
    allow?: string[];
}

declare interface RuleOptions_2 {
    /** Glob-array of files this rule doesn't apply to: a project's own
     *  executable entry points (a CLI, a script) that legitimately construct
     *  the concrete filesystem adapter. Empty by default: populate it
     *  explicitly; the rule never guesses at what counts as an executable
     *  capability boundary. */
    allow?: string[];
}

export { }
