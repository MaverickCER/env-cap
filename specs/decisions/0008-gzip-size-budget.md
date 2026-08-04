# 0008: A fixed 3KB gzip budget on the runtime and helpers entry points

## Status

Accepted. Implemented in `scripts/check-size.mjs`, run via `npm run size` and
wired into `prepublishOnly`, so it is enforced at publish time rather than
being an optional CI check a maintainer can ignore.

## Context

`env-cap` makes a specific claim in its own architecture: the runtime
stays "small and stable" while documentation, discovery, and reporting live
in build-time tooling that never ships to an application (0001). That claim
only holds because of a second decision — there is no `/client` or `/server`
split (0004). One runtime implementation, exported from the package root,
is what every consumer imports, including code that ends up in a browser
bundle. There is no smaller, trimmed-down client package to fall back on if
the shared runtime grows. Whatever size `dist/index.js` and `dist/helpers.js`
are, that is the size every browser-bound feature pays.

Left unchecked, that size is just a sentence in a README. Runtime code
accretes for reasonable-sounding reasons — a clearer error message, an extra
option field, a convenience helper — and none of those changes look like
"bloat" in the PR that introduces them. Without an automated check, the only
way to notice the runtime had grown would be to manually gzip the build
output and compare it to a number nobody had written down, which is to say:
nobody would notice until a consumer complained about bundle size, by which
point the growth would already be load-bearing and hard to revert.

`scripts/check-size.mjs` exists to make "the runtime stays small" a build
failure instead of a promise. The remaining question this decision addresses
is what the number should be, and specifically why it's 3KB gzipped rather
than something looser (5KB) or stricter (1KB).

## Decision

`scripts/check-size.mjs` gzips `dist/index.js` (the `.` entry point —
`createEnv`, `validateEnv`, error types, contract redaction) and
`dist/helpers.js` (the `./helpers` entry point — `processors`, `validators`)
and fails the build if either exceeds **3072 bytes (3KB) gzipped**. At the
time of writing, actual usage is 2081B (68% of budget) for the runtime and
1030B (34% of budget) for helpers — both comfortably under, neither close to
the edge by accident.

`dist/build.js` and `dist/cli/index.js` are deliberately **not** budgeted.
They are Node-only, dev-time-only tooling (0002) — `build.js` alone is
~53KB raw, almost an order of magnitude over the runtime's entire gzip
budget, because it embeds TypeScript-compiler-scale AST parsing that has no
reason to be small. That's fine, because it never runs inside an application
bundle; the tree-shaking and browser-platform-bundle tests are what
guarantee it stays isolated from `index.js`/`helpers.js`, not the size
budget. The size budget's job is narrower and more specific: bound exactly
the two artifacts that cross the boundary described in 0001 and 0004, and
nothing else.

### Why not 1KB

A 1KB ceiling isn't stricter in any useful sense — it's already broken by
functionality the architecture is explicitly committed to, not by bloat.
The runtime's 2081B includes per-key lazy getters, `EnvNotReadyError`,
aggregated `EnvValidationError` (0005 requires collecting _every_ failure
rather than throwing on the first, which costs more code than a fail-fast
check would), and the `Symbol.for("nodejs.util.inspect.custom")` /
`toString()` / `toJSON()` overrides that make `console.log(contract)` safe
by default (0006). None of that is incidental — each piece is the direct
implementation of a numbered decision. Fitting inside 1KB would mean cutting
one of them to satisfy the budget, which is backwards: the budget is
supposed to protect the architecture, not force a rewrite of it. A ceiling
the intended design can't pass under normal operation isn't a guardrail,
it's noise a team learns to route around — either by routinely waiving it or
by quietly stripping the features that made the number fail in the first
place.

### Why not 5KB

5KB is loose enough to stop working as a forcing function. Measured against
today's actual size, a 5KB ceiling would leave roughly 4KB — about
two-thirds of the entire budget — as slack the check would never flag: room
enough to vendor a small validation dependency, inline logic that belongs in
`helpers` instead of the runtime core, or let the redaction/error-handling
code duplicate itself across a couple of code paths, all without the build
ever turning red. `env-cap`'s pitch is explicitly "no unnecessary
runtime complexity" (README) — the budget's entire job is to catch that kind
of drift automatically, before a maintainer has to notice it by hand in a
bundle analyzer. Note also that this was never primarily about shaving
load time in absolute terms: 3–5KB gzipped is negligible next to a typical
application bundle (hundreds of KB to several MB). The budget is a proxy for
"did the runtime's shape change," not a user-facing performance target — and
a looser number quietly stops measuring that, even while technically still
"passing."

### Why 3KB

3KB sits meaningfully above current usage — enough headroom (roughly 1KB
above the runtime's actual 2081B, about half again its current size) that
ordinary maintenance doesn't force a budget renegotiation on every PR. A new
processor, a clearer error message, an extra `CreateEnvOptions` field can
land without anyone touching `check-size.mjs`. But the amount of growth that
would exhaust that headroom — roughly 50% growth in a module whose entire
job is to stay minimal — is bigger than any single feature the runtime is
expected to gain at once. Hitting the ceiling is meant to prompt a question
("does this belong in the runtime, or in `helpers`/`build`/`documentEnv()`
metadata?"), not a reflex to raise the number.

The same 3KB ceiling is applied to both entry points rather than tuning two
separate numbers per module. That's intentional, not laziness: `helpers`
(processors/validators) is optional sugar most contracts don't even import,
so it earns no larger allowance than the runtime core every contract
depends on. One number, applied uniformly, also keeps the check itself
trivial to read and hard to quietly special-case.

## Consequences

- **"The runtime stays small" has teeth.** `npm run size` — and by
  extension `prepublishOnly` — fails the build the moment either entry
  point crosses 3072 bytes gzipped, turning the Consequences section of
  0001 from a claim into an enforced property of every published release.

- **The check is self-explanatory.** `scripts/check-size.mjs` prints the
  measured gzip size against the fixed budget for both entry points, so a
  contributor who trips it sees exactly how much they added and against
  what limit, without needing to consult this document to understand what
  "too big" means.

- **The number is calibrated to the implementation, not to an external
  performance target.** 3KB was not derived from a Core Web Vitals
  threshold or a competitive benchmark against other environment-validation
  libraries; it was set relative to what the intended architecture actually
  costs today, plus deliberate headroom. If the runtime's legitimate,
  necessary scope grows substantially, the budget will need a conscious
  revision — that's an accepted cost, preferable to a budget that's either
  unenforceable (1KB) or too loose to catch drift (5KB).

- **Genuinely necessary growth can still hit the ceiling.** A contributor
  adding a real, justified few hundred bytes may need to trim elsewhere or
  open a follow-up decision to raise the budget rather than merging past it
  silently. That friction is the point, not a flaw to design around.

## Alternatives considered

- **No automated budget; rely on code review to notice growth.**
  Rejected. Growth by a hundred bytes at a time across many reasonable-
  looking PRs is exactly what review reliably misses. Nothing would catch a
  single large accidental addition (an inlined dependency, a duplicated
  utility) until a consumer noticed the bundle size themselves.

- **One shared budget across all four `dist` outputs
  (`index.js`, `helpers.js`, `build.js`, `cli/index.js`).**
  Rejected. This conflates dev-time-only Node tooling — which already
  depends on TypeScript-compiler-scale machinery per 0002 — with the two
  artifacts that actually ship to applications. A shared number would
  either force the CLI to be unrealistically small or let the runtime hide
  its growth inside a much larger combined ceiling.

- **A raw-byte budget instead of gzip.**
  Rejected. Gzip (or an equivalent) is what actually crosses the network
  for essentially every real consumer — bundlers and CDNs compress by
  default — so it's the more accurate proxy for real-world cost, and it's
  the unit comparable packages conventionally report their size in.

- **A budget expressed as a percentage of a typical application bundle.**
  Rejected. That number depends on the size of a consuming application's
  own bundle, which `env-cap` has no visibility into and no control
  over. An absolute gzip ceiling is the only kind of budget the package
  itself can actually own and enforce.
