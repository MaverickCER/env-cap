---
"@maverickcer/env-cap": minor
---

Add an `optional()` validator to `@maverickcer/env-cap/helpers`: passes automatically when the value is `undefined`, otherwise delegates to the wrapped validator. Useful for validating optional environment variables (e.g. `validators.optional(validators.url())`) without hand-writing the `undefined` check.
