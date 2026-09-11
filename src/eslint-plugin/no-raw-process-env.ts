// Deliberately narrow imports -- `@typescript-eslint/utils`'s main entry
// (`ESLintUtils`) re-exports its `ts-eslint` namespace, which includes
// FlatESLint/ESLint wrapper classes that do a runtime `require("eslint")`.
// Bundled into an ESM output (this package ships dependency-free, so
// `@typescript-eslint/utils` is inlined at build time -- see tsup.config.ts),
// that `require()` has no real CJS `require` to call and throws "Dynamic
// require of eslint is not supported". `RuleCreator` alone lives at the
// `eslint-utils` subpath and `AST_NODE_TYPES` in `@typescript-eslint/types`,
// neither of which touch `eslint` at all.
import { RuleCreator } from "@typescript-eslint/utils/eslint-utils"
import { AST_NODE_TYPES } from "@typescript-eslint/types"
import { globToRegExp } from "./glob.js"

const createRule = RuleCreator(
  (name) => `https://github.com/maverickcer/env-cap#eslint-plugin-${name}`,
)

export interface RuleOptions {
  /** Glob-array of files this rule doesn't apply to, beyond the built-in
   *  env.schema.ts allowance below -- for a consuming project's own
   *  Node-only, build-time bootstrap code (see the README section this
   *  rule ships with for the canonical worked example: a live-expiration
   *  resolver authenticating to a secrets manager). Empty by default --
   *  MUST be populated explicitly by the consuming project; env-cap never
   *  guesses at what counts as "trusted bootstrap code." */
  allow?: string[]
}

const DEFAULT_SCHEMA_ALLOWLIST = ["**/env.schema.ts", "**/env.schema.tsx"]

/**
 * Flags any direct `process.env.X`/`process.env["X"]` read in application code, so environment
 * access always goes through a capability's own `createEnv()` contract instead.
 *
 * @remarks
 * `env.schema.ts`/`env.schema.tsx` files are always exempt (that's where `createEnv()` itself
 * reads `process.env`); the rule's `allow` option extends that exemption to a consuming
 * project's own trusted bootstrap code.
 */
export const noRawProcessEnv = createRule<[RuleOptions], "noRawProcessEnv">({
  name: "no-raw-process-env",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow direct process.env reads in application code; use a capability-owned createEnv() contract instead.",
    },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      noRawProcessEnv:
        "Direct process.env access bypasses this capability's owned contract. Read this value through createEnv()'s validated contract instead (see README's ESLint plugin section for the allow-list escape hatch for legitimate build-time bootstrap code).",
    },
  },
  defaultOptions: [{ allow: [] }],
  create(context, [options]) {
    const filename = context.filename
    // `?? []` is provably unreachable through the public API: `@typescript-
    // eslint/utils`'s `RuleCreator` always deep-merges `context.options`
    // onto `defaultOptions` (`allow: []`) before `create()` sees them, so
    // `options.allow` is never actually `undefined` here -- see the test
    // file's own comment on the `options: [{}]` case for the same finding.
    // Stryker disable next-line ArrayDeclaration
    const allowPatterns = [...DEFAULT_SCHEMA_ALLOWLIST, ...(options.allow ?? [])]
    if (allowPatterns.some((p) => globToRegExp(p).test(filename))) return {}

    return {
      MemberExpression(node) {
        const obj = node.object
        if (
          obj.type === AST_NODE_TYPES.MemberExpression &&
          // These two `.type === AST_NODE_TYPES.Identifier` checks exist for
          // TS narrowing (so `.object.name`/`.property.name` below type-check
          // at all -- neither is a property every `Expression` union member
          // has) more than for a real runtime distinction: `.name` is
          // specifically an `Identifier`/`PrivateIdentifier`'s own field in
          // the ESTree shape, and no `Expression` node reachable at this
          // position through valid, parseable syntax (`MemberExpression`,
          // `CallExpression`, `ThisExpression`, `Super`, `TSNonNullExpression`,
          // a computed-access `Literal`, ...) carries a `.name` that could
          // coincidentally equal "process"/"env" while having some OTHER
          // `.type`. Tried constructing a counterexample via several exotic
          // node shapes (all of the above) before concluding there
          // genuinely isn't one for this AST position.
          // Stryker disable next-line ConditionalExpression
          obj.object.type === AST_NODE_TYPES.Identifier &&
          obj.object.name === "process" &&
          // Stryker disable next-line ConditionalExpression
          obj.property.type === AST_NODE_TYPES.Identifier &&
          obj.property.name === "env"
        ) {
          context.report({ node, messageId: "noRawProcessEnv" })
        }
      },
    }
  },
})
