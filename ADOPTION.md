# Adoption guide for technical decision-makers

This document exists for one purpose: to let a Principal/Staff engineer,
architect, or security reviewer evaluate `env-cap` for adoption at
organizational scale without having to reconstruct the picture from
`SECURITY.md`, `specs/architecture.md`, twenty-plus ADRs, and six migration
guides scattered across the repository tree. Everything here links back to
the primary source it summarizes — nothing here is a new claim.

## What problem this solves

Most environment-variable tooling (`dotenv`, `zod`, `envalid`, `t3-env`)
solves _validation_: is this value the right shape? None of them solve
_ownership_: which team owns `STRIPE_WEBHOOK_SECRET`, what breaks if it
disappears, and is it actually still read anywhere? As an application grows
past a handful of features, environment configuration tends to converge on
one growing, centrally-owned schema file that nobody wants to touch because
nobody's sure what depends on what. `env-cap` lets each capability declare
and validate the variables _it_ consumes, and adds a static-analysis layer
that answers the ownership/blast-radius questions a validation-only library
never asks. See [`specs/migrations/README.md`](specs/migrations/README.md)
and its six per-tool guides for an honest, specific comparison — including
when _not_ to switch.

## Security & threat model

Full detail: [`SECURITY.md`](SECURITY.md). The summary a security reviewer
needs:

- **Zero runtime dependencies.** `package.json` has no `dependencies` key.
  Nothing is pulled transitively into a consumer's production `node_modules`.
- **The runtime never persists, retrieves, rotates, or logs secrets**, and
  never inserts raw or processed values into a thrown error — only variable
  names, contract names, and the _developer's own_ validator/processor
  message strings ever reach an `EnvValidationError`.
- **Contracts self-redact.** `console.log`, `JSON.stringify`, and template-
  literal interpolation of a contract object all produce a redacted
  `EnvContract("name")` marker, never resolved values ([ADR
  0006](specs/decisions/0006-self-redacting-contracts.md)).
- **The build tool never executes discovered code.** Schema files are parsed
  as TypeScript ASTs (`ts.createSourceFile`), never `import()`ed, `require()`d,
  or `eval()`d — a build tool meant to run in CI against a team's own source
  tree does not become a second execution path for that source
  ([ADR 0002](specs/decisions/0002-static-analysis-never-execution.md)).
  This guarantee is enforced by a regression test proving a schema file with
  a throwing top-level statement never actually runs during discovery.
- **Cross-package discovery (ADR 0014, Experimental) does not weaken the
  above.** It is opt-in (an explicit `packages` allowlist, never an implicit
  scan of installed dependencies), never walks `node_modules` via `readdir`,
  and validates a resolved file's path, extension, symlink target, and size
  before ever parsing it — see
  [ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md) and the
  updated `SECURITY.md` section for the exact bounds.
- **Supply-chain posture:** dependency-free at runtime; CI enforces
  typecheck, lint, tests with coverage thresholds, cross-runtime conformance
  (Node/Bun/Deno), and a hard gzip size budget on every change; releases
  publish via npm's OIDC trusted publishing (no long-lived `NPM_TOKEN`) with
  provenance attestation, so a consumer can verify a published artifact was
  built by this repository's own CI, not a maintainer's laptop.

## Versioning, stability, and long-term support

Full detail: [`VERSIONING.md`](VERSIONING.md). The three-tier model —
**Stable** (semver-covered public runtime/build APIs, CLI flags, the `--json`
schema, the generated manifest format), **Experimental** (explicitly labeled
new surfaces, currently just cross-package discovery, that may still change
shape before being promoted), and **Private** (internal implementation,
never covered) — is what the eventual 1.0 stability promise will cover.

**The honest gap or long-term support question, answered directly:**
`env-cap` has not reached a 1.0 release, and today, per `SECURITY.md`,
security fixes target the latest published `0.x` version only — there is
no backport branch yet. **Starting at `1.0`**, `SECURITY.md` commits to
backporting security fixes to the latest minor release of the previous
major version for a minimum of six months after a new major ships (a
window that can be extended, never shortened, once stated). An
organization with a hard LTS/backport requirement today should treat the
_current_ state as a real limitation — the `1.0` commitment is a forward
policy, not something already exercised in production. It is offset by the
same two structural factors as before: zero runtime dependencies, and a
fully automated, OIDC-attested release pipeline plus documented governance
that lower the bar for a successor maintainer or fork.

## Bundle size and performance

Runtime and helpers entry points each carry a **hard 3&nbsp;KB gzip budget**,
enforced at `prepublishOnly` — not an aspirational CI check a maintainer can
ignore, a publish-blocking one ([ADR
0008](specs/decisions/0008-gzip-size-budget.md)). `sideEffects: false` is set
and verified by a dedicated test that bundles the real `dist/helpers.js`
output with esbuild and asserts unused exports are actually tree-shaken, not
just assumed to be.

## Architectural guarantees worth knowing before you adopt

Each of these is a locked-in product decision, not an implementation detail
that might silently change:

| Guarantee                                                   | Why it matters for adoption                                                                                                                                                                                  | ADR                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| No global `env` object — only per-capability contracts      | Prevents the "one giant schema file nobody owns" failure mode this package exists to solve                                                                                                                   | [0003](specs/decisions/0003-no-global-env-object.md)               |
| One runtime, no `/client`/`/server` split                   | Works identically in Node, browser, edge, and serverless — no framework-specific build variant to maintain                                                                                                   | [0004](specs/decisions/0004-no-client-server-package-split.md)     |
| Warn, not throw, by default                                 | Adopting incrementally in a large codebase doesn't require fixing every finding on day one; `onIncompatibility`/`onUndocumented`/`onOwnershipIssue: "throw"` opt into stricter CI gates when a team is ready | [0005](specs/decisions/0005-warn-not-throw-by-default.md)          |
| Exclusive-group violations are always hard errors           | A safety guarantee (e.g. "never activate two database backends at once") that can't be silently downgraded to a warning by a lenient CI setting                                                              | [0009](specs/decisions/0009-exclusive-groups-are-always-errors.md) |
| `--json` output is a versioned, additive-only wire contract | Safe to build dashboards/CI integrations against; a `schemaVersion` bump is the only breaking-change signal to watch for                                                                                     | [0013](specs/decisions/0013-json-output-is-a-versioned-mirror.md)  |

Full list: [`specs/architecture.md`](specs/architecture.md)'s decision table.

## Migration cost from what you likely have today

| Coming from                      | Migration guide                                                           | One-line take                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Raw `process.env`                | [from-process-env.md](specs/migrations/from-process-env.md)               | Lowest-friction starting point; adds validation and ownership where there was none                                              |
| `dotenv`                         | [from-dotenv.md](specs/migrations/from-dotenv.md)                         | `dotenv` still loads `.env` files; `env-cap` validates and documents what's in them                                             |
| `zod`-based validation           | [from-zod.md](specs/migrations/from-zod.md)                               | Keep Zod for request/response validation; only adopt `env-cap` if ownership/discovery, not validation, is the actual pain point |
| `envalid`                        | [from-envalid.md](specs/migrations/from-envalid.md)                       | Similar validation ergonomics; the real delta is per-capability ownership vs. one central schema                                |
| `t3-env`                         | [from-t3-env.md](specs/migrations/from-t3-env.md)                         | Both are type-safe; `t3-env` centralizes, `env-cap` deliberately doesn't                                                        |
| A hand-rolled centralized schema | [from-centralized-schema.md](specs/migrations/from-centralized-schema.md) | The most direct fit for what this package changes about your architecture                                                       |

Every guide above includes an explicit "when to keep what you have"
section — these are not one-directional sales pitches; several actively
recommend staying put for small or single-team applications.

## Questions this document doesn't answer

If you need something not covered here — a specific compliance framework
mapping, a formal SLA, or an LTS commitment beyond what `SECURITY.md`
states — that is a real gap today, not an oversight in this document. Open
an issue or reach the maintainer through the channels in `SECURITY.md`
rather than assuming an answer either way.
