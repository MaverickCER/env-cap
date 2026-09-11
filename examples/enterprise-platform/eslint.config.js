import js from "@eslint/js";
import envCapPlugin from "env-cap/eslint-plugin";
import tseslint from "typescript-eslint";

/**
 * Wires up `env-cap/no-raw-process-env` across `src/server/**` -- the real
 * application code that reads environment values -- proving the rule
 * doesn't get in the way of correctly-structured code: every service/
 * function only ever reads the environment through a capability's own
 * generated contract (`src/capabilities/*\/env.schema.ts`), never a bare
 * `process.env.X`. `src/capabilities/**\/env.schema.ts` is covered by the
 * rule's default `env.schema.ts` allowlist.
 */
export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/generated", ".tanstack"] },
  {
    files: ["src/server/**/*.ts"],
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
