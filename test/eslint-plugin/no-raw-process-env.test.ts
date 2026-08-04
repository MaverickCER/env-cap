import { RuleTester } from "eslint"
import type { Rule } from "eslint"
import { describe, it } from "vitest"
import { noRawProcessEnv } from "../../src/eslint-plugin/no-raw-process-env.js"

// RuleTester's own `run()` registers cases via Mocha-style global
// `describe`/`it` by default -- vitest doesn't inject those as true globals
// (this repo doesn't set `test.globals: true`), so without this, vitest
// reports "No test suite found in file". Wiring RuleTester's documented
// static describe/it setters to vitest's own imports is the supported way
// to integrate it with a non-Mocha runner.
RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module" } })

// `noRawProcessEnv` is built via `@typescript-eslint/utils`'s `ESLintUtils.RuleCreator`,
// whose generated type is structurally stricter than -- and not assignable
// to -- plain `eslint`'s own `Rule.RuleModule` type that `RuleTester.run()`
// expects. Both describe the same rule shape at runtime (this is a type-only
// mismatch between the two packages' definitions), so a narrow cast here
// avoids pulling in `@typescript-eslint/rule-tester` as a second, dedicated
// test dependency just to align the types.
ruleTester.run("no-raw-process-env", noRawProcessEnv as unknown as Rule.RuleModule, {
  valid: [
    { code: "const x = process.env.NODE_ENV;", filename: "features/payments/env.schema.ts" },
    { code: "const x = process.env.NODE_ENV;", filename: "features/payments/env.schema.tsx" },
    {
      code: "const t = process.env.VAULT_TOKEN;",
      filename: "scripts/bootstrap-secrets.ts",
      options: [{ allow: ["**/bootstrap-secrets.ts"] }],
    },
    { code: "// eslint-disable-next-line\nconst x = process.env.FOO;", filename: "src/app.ts" },
    // Not a process.env access at all -- some other object's .env property.
    { code: "const x = config.env.FOO;", filename: "src/app.ts" },
  ],
  invalid: [
    {
      code: "const x = process.env.STRIPE_KEY;",
      filename: "src/features/payments/service.ts",
      errors: [{ messageId: "noRawProcessEnv" }],
    },
    {
      code: 'const x = process.env["STRIPE_KEY"];',
      filename: "src/features/payments/service.ts",
      errors: [{ messageId: "noRawProcessEnv" }],
    },
    // allow-listed for a DIFFERENT file must not leak to this one:
    {
      code: "const t = process.env.VAULT_TOKEN;",
      filename: "src/app.ts",
      options: [{ allow: ["**/bootstrap-secrets.ts"] }],
      errors: [{ messageId: "noRawProcessEnv" }],
    },
    // The default env.schema.ts allowance doesn't extend to a differently-named file.
    {
      code: "const x = process.env.STRIPE_KEY;",
      filename: "src/env.ts",
      errors: [{ messageId: "noRawProcessEnv" }],
    },
    // An explicit options object that omits `allow` entirely (distinct from
    // no options at all, which uses `defaultOptions` wholesale). Note this
    // does NOT exercise the `?? []` fallback on `options.allow` in the rule
    // itself: `@typescript-eslint/utils`'s `RuleCreator` always deep-merges
    // `context.options` onto `defaultOptions` (see `applyDefault`/`deepMerge`
    // in its dist), so `allow` is already `[]` by the time `create()` sees
    // it -- that fallback is unreachable through the public API given the
    // current `defaultOptions: [{ allow: [] }]`. Kept anyway as a real,
    // distinct input shape worth covering on its own.
    {
      code: "const x = process.env.STRIPE_KEY;",
      filename: "src/other.ts",
      options: [{}],
      errors: [{ messageId: "noRawProcessEnv" }],
    },
  ],
})
