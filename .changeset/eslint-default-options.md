---
"@maverickcer/env-cap": patch
---

The `no-raw-process-env` ESLint rule passes its default options through `meta.defaultOptions`, so linting the plugin no longer reports a deprecation with `@typescript-eslint/utils` 8.72 and later. It still passes the legacy top-level property for releases before 8.55, so the `^8.0.0` peer range is unchanged.
