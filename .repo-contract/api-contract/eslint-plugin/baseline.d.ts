import { RuleListener } from '@typescript-eslint/utils/ts-eslint';
import { RuleModule } from '@typescript-eslint/utils/ts-eslint';

/**
 * Flags any `import`/`require`/dynamic `import()` of `node:fs` in library
 * code, so a library surface acquires its filesystem capability from the
 * caller instead of reaching for `node:fs` itself (the same discipline
 * `repo-contract`'s ADR-0011 established for `child_process`/`process.env`).
 * See ADR 0040.
 *
 * @remarks
 * Nothing is exempt by default. env-cap's own config allows `src/cli/**`
 * (the executable capability boundary that builds the `node:fs/promises`
 * adapter); a consuming project sets its own `allow` for its own entry
 * points.
 */
export declare const noNodeFs: RuleModule<"noNodeFs", [RuleOptions_2], unknown, RuleListener> & {
    name: string;
};

/**
 * Flags any direct `process.env.X`/`process.env["X"]` read in application code, so environment
 * access always goes through a capability's own `createEnv()` contract instead.
 *
 * @remarks
 * `env.schema.ts`/`env.schema.tsx` files are always exempt (that's where `createEnv()` itself
 * reads `process.env`); the rule's `allow` option extends that exemption to a consuming
 * project's own trusted bootstrap code.
 */
export declare const noRawProcessEnv: RuleModule<"noRawProcessEnv", [RuleOptions], unknown, RuleListener> & {
    name: string;
};

/**
 * `env-cap/eslint-plugin` -- a flat-config-shaped plugin object
 * ({ rules: { ... } }), consumed as:
 *
 *   import envCapPlugin from "env-cap/eslint-plugin";
 *   export default [{ plugins: { "env-cap": envCapPlugin }, rules: { "env-cap/no-raw-process-env": "error" } }];
 *
 * A 4th public entry point alongside `.`, `./build`, `./helpers` -- see ADR 0017.
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
     *  env.schema.ts allowance below -- for a consuming project's own
     *  Node-only, build-time bootstrap code (see the README section this
     *  rule ships with for the canonical worked example: a live-expiration
     *  resolver authenticating to a secrets manager). Empty by default --
     *  MUST be populated explicitly by the consuming project; env-cap never
     *  guesses at what counts as "trusted bootstrap code." */
    allow?: string[];
}

declare interface RuleOptions_2 {
    /** Glob-array of files this rule doesn't apply to -- a project's own
     *  executable entry points (a CLI, a script) that legitimately construct
     *  the concrete filesystem adapter. Empty by default -- populate it
     *  explicitly; the rule never guesses at what counts as an executable
     *  capability boundary. */
    allow?: string[];
}

export { }
