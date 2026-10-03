# 0048: The ESLint plugin does not vendor `@typescript-eslint/utils`

## Status

Accepted. Supersedes the "bundle it" note in `tsup.config.ts` and package.json's old devDependency comment.

## Context

`./eslint-plugin` used to inline `@typescript-eslint/utils` and `@typescript-eslint/types` into its
bundle. A consumer's `npm audit`, Dependabot and Socket then could not see those packages (an
advisory never reaches users), their versions were frozen at build time, and the vendored text was
most of what supply-chain scanners flagged in the published tarball. `./eslint-plugin` is a public
subpath, so changing it after 1.0.0 would be a breaking change.

## Decision

Keep the subpath. Declare `@typescript-eslint/utils` as an optional peer (`^8.0.0`), mark it
external in the bundle, and import `AST_NODE_TYPES` from it instead of from `@typescript-eslint/types`
(a dependency of utils). Anyone linting TypeScript with ESLint already has it through
`typescript-eslint`.

## Consequences

A project that uses `./eslint-plugin` must have `@typescript-eslint/utils` installed. The packed
`dist/eslint-plugin/*` shrinks by about 400 KB per format.
