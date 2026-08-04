# Duplicate variable metadata example

Two independently-owned, both-active features -- `notifications` and `audit-log` -- each need to
receive webhook deliveries and both happen to declare a variable named `WEBHOOK_URL`. That's a
naming coincidence, not a shared contract: each processes its own copy of the raw value, and each
documents it differently (different `owner`, different `description`; `notifications` marks it
`required`, `audit-log` sets an `expiresAt` instead).

Unlike `examples/missing-env-var` and `examples/multiple-active-exclusive-capabilities`, **this
example is not broken** -- `generate:env` succeeds. The divergence is reported as a
`duplicate-variable-documentation` warning, not an error: static analysis can prove two
`processor`s declare conflicting return types (that's an error, see
`examples/missing-env-var`'s sibling case), but it can never prove two English descriptions are
"wrong" -- only that they differ. The warning exists so a human notices and decides: align the
documentation, or confirm these really are two unrelated variables that happen to share a name.

```
features/
  notifications/env.schema.ts   <- documents WEBHOOK_URL one way
  audit-log/env.schema.ts        <- documents WEBHOOK_URL a different way
src/
  app.ts
  generated/env.manifest.ts      <- generated, do not edit
docs/
  ENVIRONMENT.md                  <- generated
```

## Run it

```bash
npm install
cp .env.example .env
npm start
```

`npm start` runs `generate:env` (which succeeds, printing the warning) and then boots `src/app.ts`.

## See both sides of the `onIncompatibility` gate

```bash
# Default ("warn"): succeeds, prints the warning.
npm run generate:env

# Escalated ("throw", via ENV_CAP_STRICT=1 -- see scripts/generate-manifest.mjs): fails.
npm run generate:env:strict
```

The warning's `code` field is `"duplicate-variable-documentation"` -- a stable, machine-readable
identifier (see the root README's manifest change-tracking section) a CI job could filter on
without parsing the human-readable `reason` text.
