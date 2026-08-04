# Migrating from t3-env

[t3-env](https://github.com/t3-oss/t3-env) is a well-designed environment validation solution built around TypeScript and Zod.

Many applications use t3-env to create a centralized, type-safe environment object:

```ts
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.string().url(),
  },
  runtimeEnv: process.env,
})
```

This provides:

- runtime validation
- type inference
- server/client variable separation
- a single validated environment object

`env-cap` does not attempt to replace t3-env's validation model.

The difference is architectural:

- `t3-env` focuses on **validating an application's environment**.
- `env-cap` focuses on **organizing configuration ownership across application capabilities**.

Both approaches solve real problems. The correct choice depends on the scale and structure of the application.

## When t3-env works well

A centralized environment object is often the right choice when:

- one team owns the application
- configuration is relatively small
- all variables belong to the same deployment boundary
- a single application schema is easy to maintain

Example:

```text
src/

├── env.ts
│
├── app/
├── database/
└── api/
```

In this structure, a shared environment object is simple and effective.

## When capability ownership becomes important

As applications grow, configuration often follows business domains:

```text
src/

├── features/
│
├── payments/
├── authentication/
├── notifications/
├── reporting/
└── billing/
```

Each capability has different owners, deployment concerns, and operational requirements.

A centralized environment file becomes a shared coordination point:

```text
env.ts

├── DATABASE_URL
├── STRIPE_SECRET_KEY
├── AUTH_SECRET
├── SMTP_PASSWORD
├── ANALYTICS_KEY
├── REPORTING_API_URL
└── ...
```

The problem is not validation. The problem is ownership.

Every capability change now modifies shared configuration code.

## Migration strategy

Migrating from t3-env does not require removing Zod or rewriting validation logic.

The recommended migration is:

1. Keep existing validation rules.
2. Move variables into capability-owned contracts.
3. Replace global `env` imports with capability-owned imports.
4. Add documentation metadata where operational visibility is needed.
5. Remove the centralized environment object after migration.

## Before: centralized t3-env schema

Example:

```ts
// env.ts

import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    DATABASE_URL: z.string().url(),
  },
  runtimeEnv: process.env,
})
```

Usage:

```ts
import { env } from "@/env"

stripe.connect(env.STRIPE_SECRET_KEY)
```

The capability depends on the application-wide environment object.

## After: capability-owned env-cap schema

Move the configuration requirement into the owning capability:

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

The dependency is now explicit.

The payments capability depends on payments configuration, not the entire application's configuration object.

## Reusing Zod validation

You do not need to remove Zod.

`env-cap` intentionally does not require a specific validation library.

Existing Zod schemas can be reused:

```ts
import { z } from "zod"

const stripeKeySchema = z.string().startsWith("sk_")

const paymentsSchema = {
  STRIPE_SECRET_KEY: {
    validator(value: string) {
      return stripeKeySchema.safeParse(value).success || 'Expected a value starting with "sk_".'
    },
  },
}
```

The responsibilities become:

| Responsibility         | Tool                 |
| ---------------------- | -------------------- |
| Environment validation | Zod                  |
| Capability ownership   | env-cap              |
| Runtime access         | Capability contracts |
| Documentation metadata | `documentEnv()`      |
| Project inventory      | Build tooling        |

## Migrating client and server variables

t3-env provides explicit client/server separation:

```ts
createEnv({
  server: {
    DATABASE_URL: z.string(),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.string(),
  },
})
```

`env-cap` handles this boundary differently.

The runtime has no separate client/server implementation because validation behavior is the same in every runtime.

Instead, separation happens through generated contract:

```text
server.contract.ts

    server-only contracts


client.contract.ts

    client-safe contracts
```

The application build decides which contracts are included.

This keeps the runtime small and avoids creating artificial package boundaries.

## Migrating a Next.js application

A common t3-env usage:

```ts
import { env } from "@/env"

export async function createPayment() {
  return stripe(env.STRIPE_SECRET_KEY)
}
```

Becomes:

```ts
import { paymentsEnv } from "@/features/payments/env.schema"

export async function createPayment() {
  return stripe(paymentsEnv.STRIPE_SECRET_KEY)
}
```

The capability now declares its own configuration dependency.

## Handling shared variables

A centralized environment object assumes one global interpretation:

```ts
env.SOME_VARIABLE
```

However, different capabilities may require different transformations.

Example:

```env
CACHE_TIMEOUT=60000
```

A caching capability may require:

```ts
cacheEnv.CACHE_TIMEOUT
// number
```

because it performs calculations.

A monitoring capability may require:

```ts
monitoringEnv.CACHE_TIMEOUT
// string
```

because it reports configuration values.

A single global object cannot represent both interpretations without choosing one as the default.

Capability-owned contracts allow each capability to define the meaning it requires.

## Generating project-wide visibility

One advantage of centralized systems is visibility:

```ts
env.DATABASE_URL
env.STRIPE_SECRET_KEY
env.REDIS_URL
```

Developers can quickly see available configuration.

`env-cap` provides the same visibility through build artifacts instead of runtime structure.

The build system can generate:

- environment contract
- documentation
- `.env.example` files
- configuration reports

The runtime remains modular while platform teams still have a complete inventory.

## When to keep t3-env

t3-env may remain the better choice when:

- your application has one configuration owner
- the centralized schema is easy to maintain
- capability boundaries are not important
- documentation and lifecycle tracking are handled elsewhere

`t3-env` is an excellent validation solution.

`env-cap` is designed for applications where configuration ownership becomes an architectural concern.

## Summary

Migrating from t3-env changes the organization model, not the validation strategy.

Before:

```text
application

    env.ts

        DATABASE_URL
        STRIPE_SECRET_KEY
        AUTH_SECRET
```

After:

```text
application

    database
        env.schema.ts

    payments
        env.schema.ts

    authentication
        env.schema.ts
```

`t3-env` answers:

> "Are these environment variables valid?"

`env-cap` answers:

> "Who owns these environment variables, where are they used, and how do we operate them as the system grows?"

The two approaches can also coexist. Existing validation logic can remain while configuration ownership gradually moves closer to the capabilities that depend on it.
