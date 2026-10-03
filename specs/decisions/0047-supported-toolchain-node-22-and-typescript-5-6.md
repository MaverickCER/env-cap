# 0047: Supported toolchain is Node 22+ and TypeScript 5 or 6

## Status

Accepted.

## Context

Node 20 reached end-of-life on 2026-04-30, so advertising it would commit the package to a runtime
nobody patches. Separately, the build-time scanner (`src/build/parse.ts`, `scan-dependencies.ts`)
uses TypeScript's classic compiler API (`createSourceFile`). TypeScript 6 still has it; TypeScript 7
moved the syntax-tree API to `typescript/unstable/*`, and the optional peer `^5.0.0` also made
`npm i typescript@latest @maverickcer/env-cap` fail with `ERESOLVE`.

## Decision

- `engines.node` is `>=22.0.0`; `@types/node` is `^22`; bundles for Node target `node22`; CI tests 22
  and 24 (26 non-blocking).
- The optional `typescript` peer is `^5.0.0 || ^6.0.0`.
- TypeScript 7 is unsupported for the build step. Migrating to `typescript/unstable/*` is deferred
  until that API is stable. `assertCompilerApi` makes the scanner fail with a message that names
  the installed version and the workaround (install `typescript@6` for the build step) rather than
  `ts.createSourceFile is not a function`.
- The runtime entry points never import TypeScript and are unaffected.

## Consequences

Dropping Node 20 is a breaking change, released as a pre-1.0 minor. `VERSIONING.md` lists the
toolchain as Stable.
