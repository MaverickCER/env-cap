# Migrating from a Centralized Environment Schema

This guide explains how to migrate from a centralized environment configuration model into capability-owned environment contracts.

Examples of centralized schemas include:

```text
src/config/env.ts
src/env/schema.ts
src/config/environment.ts
src/config/settings.ts
```

where one file defines every environment variable used by the application:

```ts
export const env = createConfig({
  DATABASE_URL: ...,
  STRIPE_SECRET_KEY: ...,
  REDIS_URL: ...,
  API_TIMEOUT: ...,
});
```

Centralized schemas are a reasonable starting point. They provide a clear location for configuration and make small applications easy to understand.

As applications grow, however, the centralized file becomes a shared ownership boundary:

- Every capability change modifies the same file.
- Teams become dependent on whoever owns the schema.
- Removing capabilities requires finding unused configuration manually.
- Configuration ownership becomes separated from capability ownership.
- Merge conflicts increase as the application grows.

`env-cap` does not replace your validation system. It changes where environment ownership lives.

You can continue using Zod, Valibot, Joi, custom validators, or simple functions inside capability contracts.

The migration goal is:

```
centralized configuration
          |
          v
capability-owned contracts
          |
          v
generated project-wide visibility
```

The runtime becomes modular while build tooling provides the centralized view when needed.

---

## Before migration

A centralized schema commonly looks like:

```ts
// env.ts

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  REDIS_URL: process.env.REDIS_URL,
}
```

or:

```ts
// env.schema.ts

export const env = createConfig({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string(),
  REDIS_URL: z.string(),
})
```

Every capability imports the same object:

```ts
import { env } from "./env"

await connectDatabase(env.DATABASE_URL)

stripe.configure(env.STRIPE_SECRET_KEY)

redis.connect(env.REDIS_URL)
```

The problem is not the validation.

The problem is ownership.

The database capability owns `DATABASE_URL`, but the database configuration lives somewhere else.

---

## Migration strategy

Migrate one capability at a time.

Do not move every variable into `env-cap` immediately.

A gradual migration works best:

```
Before:

src/
├── env.ts
├── payments/
├── database/
└── reports/


After:

src/
├── env.ts                 (remaining legacy variables)
├── payments/
│   └── env.schema.ts
├── database/
│   └── env.schema.ts
└── reports/
    └── env.schema.ts
```

The application can temporarily support both approaches.

---

# Step 1: Identify ownership

For each variable, determine which capability requires it.

Example centralized schema:

```ts
{
  DATABASE_URL,
  STRIPE_SECRET_KEY,
  REPORT_TIMEOUT,
  CACHE_TTL,
}
```

Move ownership:

| Variable          | New owner |
| ----------------- | --------- |
| DATABASE_URL      | database  |
| STRIPE_SECRET_KEY | payments  |
| REPORT_TIMEOUT    | reports   |
| CACHE_TTL         | cache     |

Ownership should follow usage, not technical category.

A variable is not "database configuration" because it contains `DATABASE`.

It belongs to the capability that defines how it is consumed.

---

# Step 2: Create capability schemas

Create a schema next to the capability.

Example:

```
features/
└── payments/
    ├── env.schema.ts
    └── stripe.ts
```

Move the relevant variable:

```ts
import { createEnv, documentEnv } from "env-cap"

const paymentsSchema = {
  STRIPE_SECRET_KEY: {
    validator(value: string) {
      return value.startsWith("sk_") || 'Expected a value starting with "sk_".'
    },
  },
}

export const paymentsEnv = createEnv(paymentsSchema, {
  name: "payments",
})

documentEnv(paymentsSchema, {
  owner: "payments-team",
})
```

The capability now owns its configuration.

---

# Step 3: Replace global imports

Before:

```ts
import { env } from "../env"

stripe.configure(env.STRIPE_SECRET_KEY)
```

After:

```ts
import { paymentsEnv } from "./env.schema"

stripe.configure(paymentsEnv.STRIPE_SECRET_KEY)
```

The dependency becomes explicit:

```
payment code
      |
      v
paymentsEnv
      |
      v
payments schema
```

The capability no longer depends on a global configuration object.

---

# Step 4: Preserve existing validators

`env-cap` does not require replacing your validation library.

Existing logic can be moved directly.

## Zod example

Before:

```ts
export const env = z
  .object({
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  })
  .parse(process.env)
```

After:

```ts
import { z } from "zod"

const stripeKey = z.string().startsWith("sk_")

const paymentsSchema = {
  STRIPE_SECRET_KEY: {
    validator(value: string) {
      return stripeKey.safeParse(value).success || 'Expected a value starting with "sk_".'
    },
  },
}
```

The validation implementation is still yours.

`env-cap` provides:

- ownership boundaries
- lifecycle metadata
- static discovery
- generated artifacts
- runtime access patterns

It is not intended to replace schema validation libraries.

---

# Step 5: Generate project visibility

A centralized schema gave visibility because everything existed in one file.

Replace that visibility with generated artifacts.

Example:

```ts
await generateEnvManifest({
  location: "src/generated/env.manifest.ts",
})
```

This allows tooling to answer:

- Which variables exist?
- Which capability owns them?
- Which variables are undocumented?
- Which variables are expiring?
- Which variables have possible conflicts?

The runtime stays modular.

The platform view remains centralized.

---

# Handling shared variables

A common migration concern is:

> "What happens if multiple capabilities use the same environment variable?"

The answer depends on whether the value has the same meaning.

If multiple capabilities consume the same value with identical requirements, create a shared ownership module:

```
features/
└── database/
    └── env.schema.ts
```

Other capabilities import the database contract:

```ts
import { databaseEnv } from "../database/env.schema"

databaseEnv.DATABASE_URL
```

If different capabilities interpret the same raw value differently, keep those interpretations local.

Example:

```ts
// metrics capability
REPORT_INTERVAL_MS -> number

// logging capability
REPORT_INTERVAL_MS -> string identifier
```

Both consume the same underlying environment value, but their application requirements differ.

A centralized schema must choose one global representation.

Capability contracts allow each consumer to define its own validated view.

---

# Removing the centralized schema

After migration:

```
src/
├── env.ts                 remove
├── payments/
│   └── env.schema.ts
├── database/
│   └── env.schema.ts
└── reports/
    └── env.schema.ts
```

Remove:

- global exports
- centralized validation calls
- unused configuration helpers

The generated contract becomes the project-wide configuration inventory.

The application runtime no longer depends on a global environment object.

---

# Common migration mistakes

## Moving variables by technical category

Avoid:

```
config/
├── database.env.ts
├── payments.env.ts
└── cache.env.ts
```

These recreate centralized ownership.

Prefer:

```
features/
├── checkout/
│   └── env.schema.ts
├── reporting/
│   └── env.schema.ts
└── notifications/
    └── env.schema.ts
```

Configuration should follow capability ownership.

---

## Creating a new global wrapper

Avoid recreating:

```ts
export const env = {
  payments: paymentsEnv,
  database: databaseEnv,
}
```

This recreates the same coupling:

```ts
env.payments.STRIPE_SECRET_KEY
```

The capability import itself should define the dependency.

---

## Migrating documentation separately

Avoid creating:

```
docs/
└── environment.md
```

as the only source of configuration information.

Documentation becomes stale when it is disconnected from code.

Use:

```ts
documentEnv(schema, {
  owner: "payments-team",
})
```

so tooling can verify documentation coverage.

---

# When not to migrate

`env-cap` may not provide significant value for:

- small applications with few variables
- single-team projects with no ownership boundaries
- applications where all configuration truly belongs to one module

A centralized schema is not inherently wrong.

The value appears when configuration ownership becomes difficult to maintain.

---

# Migration complete

After migration:

| Responsibility     | Location            |
| ------------------ | ------------------- |
| Variable ownership | Capability schema   |
| Validation logic   | Capability schema   |
| Runtime access     | Capability contract |
| Documentation      | `documentEnv()`     |
| Project visibility | Generated artifacts |
| Platform reporting | Build tooling       |

The application moves from:

```
one configuration object shared everywhere
```

to:

```
many owned contracts with a generated system view
```

without requiring a rewrite of existing validation logic.
