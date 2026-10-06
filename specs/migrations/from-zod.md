# Migrating from Zod environment validation

Zod is an excellent schema validation library. Many applications use Zod to create a single validated environment object:

```ts
// env.ts

import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  PORT: z.coerce.number().default(3000),
})

export const env = envSchema.parse(process.env)
```

This approach provides:

- runtime validation
- type inference
- clear validation rules
- a single access point for configuration

`env-cap` does not replace Zod. It addresses a different architectural concern: configuration ownership.

A centralized environment object works well when the entire application has one configuration owner. As applications grow, especially across teams or domains, the environment schema often becomes a shared dependency that every capability must modify.

`env-cap` moves configuration ownership to the capability that consumes it while allowing teams to continue using their preferred validation approach.

## Migration goals

A migration from Zod does not require rewriting every validation rule.

The recommended approach is incremental:

1. Identify which capability owns each environment variable.
2. Move variables from the centralized schema into capability-owned schemas.
3. Keep existing validation logic where possible.
4. Replace global environment access with capability-owned contracts.
5. Generate project-wide documentation and visibility through build tooling.

## Before: centralized environment schema

A common pattern:

```ts
// env.ts

import { z } from "zod"

export const env = z
  .object({
    DATABASE_URL: z.string().url(),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    REDIS_URL: z.string(),
  })
  .parse(process.env)
```

Usage:

```ts
import { env } from "./env"

await connectDatabase(env.DATABASE_URL)
await stripe.connect(env.STRIPE_SECRET_KEY)
```

The challenge is not validation. The challenge is ownership.

As capabilities grow:

```text
env.ts

├── database variables
├── payments variables
├── authentication variables
├── notifications variables
├── analytics variables
└── internal tooling variables
```

Every capability now depends on the same configuration file.

## After: capability-owned contracts

Move configuration next to the capability that owns it.

Example:

```ts
// features/payments/env.schema.ts

import { createEnv, documentEnv } from "@maverickcer/env-cap"
import { z } from "zod"

const paymentsSchema = {
  STRIPE_SECRET_KEY: {
    validator(value: string) {
      return (
        z.string().startsWith("sk_").safeParse(value).success ||
        'Expected a value starting with "sk_".'
      )
    },
  },
}

export const paymentsEnv = createEnv(paymentsSchema, {
  name: "payments",
})

documentEnv(paymentsSchema, {
  owner: "payments-team",
  variables: {
    STRIPE_SECRET_KEY: {
      description: "Stripe API credential used for payment processing",
    },
  },
})
```

Usage:

```ts
import { paymentsEnv } from "./env.schema"

stripe.connect(paymentsEnv.STRIPE_SECRET_KEY)
```

The validation rule remains owned by the payments capability.

## Keeping Zod validators

`env-cap` intentionally does not require a specific validation library.

Existing Zod schemas can be reused:

```ts
import { z } from "zod"

const portSchema = z.coerce.number().int().positive()

const serverSchema = {
  PORT: {
    processor(value: string) {
      return portSchema.parse(value)
    },
    validator(value: number) {
      return value > 0 || "Expected a positive integer."
    },
  },
}
```

The responsibilities become:

| Responsibility          | Tool                       |
| ----------------------- | -------------------------- |
| Schema validation       | Zod                        |
| Value processing        | Zod or custom processors   |
| Capability ownership    | env-cap                    |
| Runtime access          | Capability-owned contracts |
| Documentation           | documentEnv                |
| Configuration inventory | Build tooling              |

## Handling the generated global environment object

Many Zod implementations expose:

```ts
env.DATABASE_URL
env.STRIPE_SECRET_KEY
```

During migration, replace this with imports from the owning capability:

```ts
// Before

import { env } from "@/env"

env.STRIPE_SECRET_KEY
```

```ts
// After

import { paymentsEnv } from "@/features/payments/env.schema"

paymentsEnv.STRIPE_SECRET_KEY
```

This makes dependencies explicit.

A payments module that requires Stripe credentials should import the payments configuration instead of depending on an application-wide environment object.

## Migrating gradually

A full migration does not need to happen at once.

A practical sequence:

### Step 1: Keep the existing Zod schema

Continue validating existing variables.

### Step 2: Split variables by ownership

Move one capability at a time:

```text
features/
├── payments/
│   └── env.schema.ts
├── database/
│   └── env.schema.ts
└── authentication/
    └── env.schema.ts
```

### Step 3: Replace imports

Move consumers from:

```ts
env.SOME_VARIABLE
```

to:

```ts
capabilityEnv.SOME_VARIABLE
```

### Step 4: Add documentation metadata

Once ownership is clear:

```ts
documentEnv(schema, {
  owner: "team-name",
  variables: {
    SOME_VARIABLE: {
      description: "Purpose of this configuration value",
    },
  },
})
```

### Step 5: Remove the centralized schema

After all consumers migrate, the original global environment object can be removed.

## When to keep Zod alone

`env-cap` may not provide significant value if:

- the application is small
- one team owns all configuration
- environment variables are few and stable
- a centralized schema is not creating friction

Zod remains an excellent choice for these applications.

`env-cap` is designed for applications where configuration ownership becomes difficult to manage as the system grows.

## Summary

Migrating from Zod does not mean replacing Zod.

The migration changes the ownership model:

Before:

```text
application
    |
    └── env.ts
          |
          ├── DATABASE_URL
          ├── STRIPE_SECRET_KEY
          └── REDIS_URL
```

After:

```text
application

database
    └── env.schema.ts

payments
    └── env.schema.ts

cache
    └── env.schema.ts
```

Validation remains where it belongs. Configuration ownership becomes modular. Build tooling provides the global visibility needed by platform teams without making the runtime depend on a global configuration object.
