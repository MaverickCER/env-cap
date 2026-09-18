# Examples

Three flagship examples, each answering a different question — read them in order, since each
assumes the concepts the previous one already covered:

1. **[application](application/)** — *"How does this make my code better?"* The simplest
   possible starting point: one centralized `createEnv()` contract for a whole small app, still
   getting fail-fast startup validation, generated docs, a generated `.env.example`, and an
   ownership report. For an individual developer adopting `env-cap` in their own project.

2. **[team-service](team-service/)** — *"How does this help my team?"* Multiple
   capability-owned contracts spanning two real teams (`data-platform-team`, `security-team`),
   including two mutually-exclusive database alternatives (`postgres`/`mongodb`) gated by
   `exclusiveGroup`, a `classification: "secret"` variable that gives the generated security
   review something real to enumerate, and a `check` script demonstrating the `--check`
   CI-gate pattern (see [ADR 0016](../specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md))
   a real PR check would run.

3. **[enterprise-platform](enterprise-platform/)** — *"How does this help my organization?"* A
   real, running application — reports, manifests, evidence generation, and a configuration-governance
   evidence document built with `defineEvidenceProjection()` — showing what `env-cap` deliberately
   doesn't own (a database, auth, external services) alongside what it does.

Every flagship's own README documents exactly how to run it. All three are validated in CI (see
`.github/workflows/ci.yml`'s `examples` job and
[`test/integration/flagships/`](../test/integration/flagships/)) against the real,
currently-built `env-cap` package, so they stay in sync with the API rather than
drifting silently.

## Framework integration

[**nextjs-app**](nextjs-app/) — a deliberately minimal Next.js todo app, not a fourth flagship in
the above progression. Where the three flagships above grow one plain Node/TypeScript app from an
individual developer's project to an organization's, this one proves the fail-fast contract
mechanism inside a real framework's build/request lifecycle — a real `NEXT_PUBLIC_*` (client) vs.
server-only environment variable boundary, and what it actually took to make `validateEnv()`'s
module-level "ready" state survive a bundler that code-splits the app into multiple chunks. See its
own README for what that took.

## Looking for something specific?

The three flagships above are for humans exploring `env-cap` for the first time — they're not
meant to be an exhaustive catalog of every scenario the library handles. Every other behavior
(the packaged CLI binary, cross-package schema discovery, tsconfig path-alias resolution, the
`liveExpirationDates` callback, per-variable validation contexts, and more) is still fully tested,
just relocated to [`test/integration/`](../test/integration/) as a behavioral fixture rather than
presented as a fourteenth (or fifteenth) example to read through. Each fixture directory still
has its own runnable `package.json`, the same as a flagship does — see its own `package.json`
`description` field for what it proves, or the corresponding test file under
`test/integration/positive/` / `test/integration/negative/`. Examples are for humans; integration
fixtures are for correctness — zero coverage was dropped in that split, only what's presented as
"start here" reading.

## Golden regression testing

The three flagships have **no `expected/` mirror**. Their committed
`docs/ENVIRONMENT.md`, `docs/OWNERSHIP.md`, `docs/env.evidence.json`,
`.env.example`, and `src/generated/env.manifest.ts` *are* the golden — a reader
opening the example sees exactly the bytes CI asserts on. `test/examples/*.test.ts`
verifies each one by running that example's own `check` script (`env-cap --check`),
the same command its README tells you to run in CI, so a drifted artifact fails
the build and the drift guard itself gets exercised at the same time.

A parallel `expected/` tree used to duplicate every artifact here. It was
removed: each file existed twice with nothing marking which copy was
authoritative, so a stale mirror could sit next to correct output indefinitely.
(`enterprise-platform/expected/output.json` remains — that's the example's own
runtime self-check, not a copy of anything `env-cap` generates.)

The integration fixtures under `test/integration/positive/` and
`test/integration/negative/` **do** keep `expected/` mirrors
(`multiple-active-exclusive-capabilities` excepted, which by design never
successfully generates anything). Those have no human reader, and an explicit
side-by-side diff of generator output is exactly their point. CI regenerates
each for real and compares byte-for-byte, after normalizing the wall-clock-relative
parts (the docs Markdown's generation timestamp and any "expiring soon"/"expired"
annotations). This is what actually catches a regression in the library's output
formatting, ordering, or serialization — not just "does it still typecheck."

When a change to `env-cap` intentionally changes generated output (a new field, a
reordered section, a wording change), regenerate everything and review the diff:

```bash
npm run examples:update-golden
```

This is deliberately **not** part of `npm run verify` or CI — it's a human-invoked "I meant to
change the output, here's the new baseline" step, not something that should ever run silently.

## Looking for the performance benchmarks?

They've moved to [`/benchmark`](../benchmark/) — project confidence tooling, not an adoption
sample like the three flagships above, so it lives as a top-level sibling of `examples/` rather
than inside it. See [`benchmark/README.md`](../benchmark/README.md) for methodology, tier
definitions, and what's deliberately not measured and why.
