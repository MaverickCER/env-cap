---
name: env-cap
description: Load when a task creates or edits an env.schema.ts, calls createEnv, documentEnv or validateEnv, or generates env-cap manifests, docs or reports. Skip it for other environment work.
---

# @maverickcer/env-cap

env-cap gives each capability (a feature, service or package) its own environment contract: declared once as a static schema, validated at startup, and documented and aggregated at build time.

Not for: loading .env files, storing secrets, or a single global env object.

## Use it

```ts
const prismaSchema = {
  DATABASE_PROVIDER: {
    validator: (value: string) =>
      ["postgresql", "mongodb"].includes(value) || "Unsupported provider.",
  },
};

export const prismaEnv = createEnv(prismaSchema, { name: "prisma", source: import.meta.url });

documentEnv(prismaSchema, {
  category: "orm",
  owner: "data-platform-team",
  metadata: {
    docs: "https://www.prisma.io/docs/orm/reference/connection-urls",
  },
  variables: {
    DATABASE_PROVIDER: { description: "Which database provider Prisma should target." },
  },
});
```

From `examples/team-service/features/prisma/env.schema.ts`.

## Import from

| Import | For |
| --- | --- |
| `@maverickcer/env-cap` | `createEnv`, `documentEnv`, `validateEnv`, `resetEnvCache`, the error types |
| `@maverickcer/env-cap/build` | Node only: discovery, analysis and generating the manifest, docs and reports |
| `@maverickcer/env-cap/helpers` | `processors` and `validators` |
| `@maverickcer/env-cap/node` | Node only: `nodeBuildFileSystem`, the file system a build script hands to `/build` |
| `@maverickcer/env-cap/evidence` | `defineEvidenceProjection`, pure transforms over the evidence model |
| `@maverickcer/env-cap/eslint-plugin` | Node only: the `no-raw-process-env` and `no-node-fs` lint rules |
| `@maverickcer/env-cap/schema` | The JSON Schema for `env-cap --json` output |

## Rules

- Write each schema as a static literal in the module that owns it: schemas are parsed as source, never executed, so spreads, factories and re-exports are not understood.
- Put `description`, `owner`, `expiresAt` and `category` in `documentEnv`. `createEnv` entries take `default`, `processor`, `validator`, `context`; its options `name` and `source: import.meta.url`.
- Read a value through its owning contract (`paymentsEnv.STRIPE_KEY`). Never build a merged env object.
- Call `validateEnv` once at startup, directly. Run the `generate*` functions only in a build script or CI.
- Import only from package.json exports; `/build`, `/node` and `/eslint-plugin` are Node-only, never in browser code.

## Rely on

- Reading a contract before `validateEnv` has run throws `EnvNotReadyError`.
- Errors never contain values. Keep raw values out of your own processor and validator messages, and do not spread a contract.
- `required: true` in `documentEnv` only documents a variable as required. Enforcement is the validator rejecting an empty value.
- `context` is a plain string your application activates, not a security boundary.
- Two contracts may declare one variable name. Conflicting processor return types and exclusive-group violations are errors; differing processor or validator sources warn, and block under `onIncompatibility: "throw"`.

## Common mistakes

| Instead of | Do this |
| --- | --- |
| `createEnv({ ...base })`, or a schema built by a function | Declare the schema as a literal object in the module that owns it, then pass that one binding to `createEnv` and `documentEnv`. |
| `transformer` | `processor`. There is no alias. |
| A live expiry fetched inside `env.schema.ts` | Keep a static `expiresAt`; pass `liveExpirationDates` to the generator. |

## Verify

1. Run the project's type check and tests.
2. After changing an `env.schema.ts`, update its `documentEnv()` entry and run `generate:env`. Commit generated files only if the project does; never hand-edit one.
3. Check imports against package.json exports.

Report any check you could not run, and any assumption you made.

## Go deeper

- [Every option of the generators and the CLI](https://github.com/MaverickCER/env-cap/blob/main/GUIDE.md)
- [Moving off dotenv, raw process.env, Zod, envalid or t3-env](https://github.com/MaverickCER/env-cap/blob/main/specs/migrations)
- [Why each rule exists](https://github.com/MaverickCER/env-cap/blob/main/specs/decisions)
- [Every public signature](https://github.com/MaverickCER/env-cap/blob/main/skills/env-cap/references/api.md)

## Authority

Target `@maverickcer/env-cap@0.7.2`. The installed package's exports and type declarations are the API: do not invent exports, options or return values. Behaviour is established by its tests and examples. If this skill and the code disagree, say so rather than guessing.
