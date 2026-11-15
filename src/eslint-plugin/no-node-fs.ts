import { createNoNodeFs } from "../_ipc/no-node-fs.js"

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
export const noNodeFs = createNoNodeFs({
  docsUrl: () => "https://github.com/MaverickCER/env-cap/blob/main/GUIDE.md#eslint-plugin",
  adr: "ADR 0040",
  guide: "the README's ESLint section",
})
