import js from "@eslint/js";
import envCapPlugin from "env-cap/eslint-plugin";
import tseslint from "typescript-eslint";

/**
 * Wires up `env-cap/no-raw-process-env` (see the package README's "ESLint
 * plugin" section) across this example's own real application code -- not a
 * synthetic fixture -- so `npm run lint` proves the rule doesn't get in the
 * way of correctly-structured code: `server.ts`/`startup.ts` only ever read
 * the environment through `env.ts`'s generated contract (or, for
 * `startup.ts`, pass the whole `process.env` object straight into
 * `validateEnv()`, never a specific key off it), and `features/**\/env.schema.ts`
 * are covered by the rule's default `env.schema.ts` allowlist. See
 * test/eslint-plugin/no-raw-process-env.test.ts in the main repo for the
 * companion regression test proving this rule actually *catches* a
 * violation too, using a synthetic snippet rather than a real file that
 * would otherwise have to fail `npm run lint` on purpose.
 */
export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/generated"] },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "env-cap": envCapPlugin },
    rules: {
      "env-cap/no-raw-process-env": "error",
    },
  },
);
