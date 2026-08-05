---
"@maverickcer/env-cap": minor
---

Remove the `notDefault()` and `notOneOf()` validators from `@maverickcer/env-cap/helpers` -- rarely used, and part of bringing `dist/helpers.js` back under its 3072-byte gzip budget (see [ADR 0008](specs/decisions/0008-gzip-size-budget.md)). Equivalent behavior is still directly expressible with existing validators: `validators.not(validators.oneOf([...]))` covers both `notDefault` and `notOneOf`.

Every built entry point (`dist/index.js`, `dist/helpers.js`, `dist/build.js`, `dist/cli/index.js`, `dist/eslint-plugin/index.js`) also no longer ships source comments -- esbuild's unminified default otherwise preserved every JSDoc comment verbatim, which was pure dead weight against the gzip budget (declarations, and the IDE hover they drive, come from a separate `tsc` pass, never from these `.js` files). No identifiers are mangled and no syntax is rewritten, so a debugger stepping into `dist/*.js` still reads like the source.
