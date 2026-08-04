# Examples

Ten runnable projects, each demonstrating a distinct part of `env-cap`. Read them in this
order — each one assumes the concepts the previous ones already covered:

1. **[basic-node](basic-node/)** — the simplest possible starting point: one centralized
   `createEnv()` contract for a whole small app, still getting fail-fast startup
   validation, generated docs, a generated `.env.example`, and an ownership report.
   Capability-owned contracts are an adoption target, not a requirement — start here if
   your app doesn't have (or doesn't yet need) more than one.

2. **[cli-usage](cli-usage/)** and **[split-generators](split-generators/)** — the same
   contract as `basic-node`, generated two different ways: `cli-usage` invokes the packaged
   `env-cap` CLI binary directly (no custom script at all — `generate:env`/`--check`/`--json`
   all as plain `package.json` scripts), and `split-generators` calls the three standalone
   generator functions (`generateEnvManifest`/`generateDocumentation`/`generateUsageReport`)
   separately instead of the combined `generateEnvArtifacts()` every other example uses. Both
   produce byte-for-byte identical artifacts to `basic-node`'s own.

3. **[composable-boilerplates](composable-boilerplates/)** — multiple capability-owned
   contracts in one app, including two mutually-exclusive alternatives
   (`postgres`/`mongodb`) gated by `exclusiveGroup`, and a dormant contract shipped but
   never wired in via `active: false`.

4. **[paypal-addon](paypal-addon/)** and **[paypal-consumer](paypal-consumer/)** — a
   capability shipped as its own installable package, installed by a consuming
   application from a real packed tarball (not a monorepo/workspace reference), and
   discovered across that real package boundary via the Experimental `packages` option
   (see [ADR 0014](../specs/decisions/0014-cross-package-schema-discovery.md)). Read
   `paypal-addon`'s README first, then `paypal-consumer`'s.

5. **[aws-secrets-manager](aws-secrets-manager/)** — implementing the
   `liveExpirationDates` callback to source a variable's `expiresAt` from a live external
   system (AWS Secrets Manager's rotation metadata) instead of only the static value set
   in `documentEnv()`.

6. **[duplicate-variable-metadata](duplicate-variable-metadata/)** — two independently-owned,
   both-active contracts document the same variable name differently. Unlike the two examples
   below, this one is **not broken**: it's a warning (`duplicate-variable-documentation`),
   never a hard error, unless escalated via `onIncompatibility: "throw"`.

7. **[missing-env-var](missing-env-var/)** and
   **[multiple-active-exclusive-capabilities](multiple-active-exclusive-capabilities/)** —
   deliberately, permanently broken, unlike everything above. Each fixes one specific
   failure mode in place — a missing required variable, and two active contracts sharing
   an `exclusiveGroup` — so that exact failure has a committed fixture and a regression
   test asserting on its real error content, instead of only being demonstrated as prose
   in another example's README.

Every example's own README documents exactly how to run it. All ten are validated in CI
(see `.github/workflows/ci.yml`'s `examples` job and [`test/examples/`](../test/examples/),
one file per example, mirroring this directory 1:1) against the real, currently-built
`@maverickcer/env-cap` package, so they stay in sync with the API rather than drifting
silently — the nine that succeed are asserted on for their expected runtime output, and
`multiple-active-exclusive-capabilities` is asserted on for its expected failure.

## `expected/` — golden regression fixtures

Nine of the ten examples (every one except `multiple-active-exclusive-capabilities`, which by
design never successfully generates anything) carry an `expected/` directory mirroring their
own generated-artifact paths — e.g. `basic-node/expected/src/generated/env.manifest.ts`
alongside the real `basic-node/src/generated/env.manifest.ts`. CI regenerates each example for
real and compares the live output against its `expected/` copy byte-for-byte (after normalizing
the one wall-clock-relative artifact — the docs Markdown's generation timestamp and any
"expiring soon"/"expired" annotations). This is what actually catches a regression in the
library's output formatting, ordering, or serialization — not just "does it still typecheck."

`expected/` is a committed regression fixture, not something to hand-edit. When a change to
`env-cap` intentionally changes generated output (a new field, a reordered section, a wording
change), regenerate every example's goldens and review the diff:

```bash
npm run examples:update-golden
```

This is deliberately **not** part of `npm run verify` or CI — it's a human-invoked "I meant to
change the output, here's the new baseline" step, not something that should ever run silently.

## Performance benchmarks

[`performance-runtime/`](performance-runtime/) and [`performance-buildtime/`](performance-buildtime/)
are project confidence tooling, not "start here" adoption samples like the ten above — they exist
to answer "does this scale," "did this regress," and "did that architectural decision actually pay
off," for maintainers and prospective adopters evaluating env-cap at monorepo scale. Run via
`npm run benchmark` from the repo root, or `npm run benchmark` inside either directory.
[`benchmark-fixtures/`](benchmark-fixtures/) is shared support code the two benchmark scripts
import from — plain `.mjs`, no `package.json` of its own, never run directly. See
[`PERFORMANCE.md`](../PERFORMANCE.md) for methodology, tier definitions, and what's deliberately
*not* measured and why.
