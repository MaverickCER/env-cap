---
"@maverickcer/env-cap": minor
---

Audit fixes ahead of 1.0.

- Breaking (pre-1.0 minor): Node.js `>=22` (Node 20 is end-of-life) and an optional `typescript` peer of `^5 || ^6`, so `npm i typescript@6 @maverickcer/env-cap` no longer fails with `ERESOLVE`. With TypeScript 7 the build step now says so instead of failing with `ts.createSourceFile is not a function` (ADR 0047).
- Breaking (pre-1.0 minor): `@maverickcer/env-cap/eslint-plugin` no longer vendors `@typescript-eslint/utils`; it is an optional peer (ADR 0048). The entry shrinks from ~400 KB to ~7 KB per format.
- Breaking (pre-1.0 minor): `init` scaffolds `docs/ENV-OWNERSHIP.md` so it can no longer collide with data-cap's `docs/OWNERSHIP.md`.
- Generated Markdown reports now tell the reader how they are really produced and regenerated (the script that calls `generateDocumentation()` / `generateUsageReport()`), not `npx env-cap --docs`; internal ADR numbers are gone from them.
- The composite GitHub Action passes every input through environment variables, uses the project's own install, and requires `version` otherwise instead of running an unpinned `latest`.
- Source maps no longer embed `sourcesContent` (about 60% of the unpacked package).
- Every documented import now uses the published `@maverickcer/env-cap` name; `./node` is documented as Stable and in the API reference; `--help` links are absolute URLs.
- Landing page: keyboard-focusable code blocks, a high-contrast theme toggle, forced-colors support.
- Every `Stryker disable` now says why, 79 mutation exception records are gone, and mutation runs the full suite; `init` scaffolds an https check with `URL` instead of a string prefix.
