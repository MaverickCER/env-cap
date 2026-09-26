# Migrating from dotenv

`dotenv` is one of the most common ways applications load environment variables.

A typical application starts with:

```ts
import "dotenv/config"

const databaseUrl = process.env.DATABASE_URL
```

This approach is intentionally simple:

- load values from a `.env` file
- expose them through `process.env`
- allow application code to consume them

`dotenv` solves environment loading. It does not solve:

- validation
- ownership
- discoverability
- lifecycle tracking
- configuration documentation

`env-cap` is designed to add those capabilities while allowing existing environment loading workflows to remain unchanged.

## Migration goals

Migrating from `dotenv` does not require replacing how secrets are injected.

You can continue using:

- `.env` files locally
- Docker environment variables
- Kubernetes secrets
- cloud provider environment configuration
- CI/CD injected variables

`env-cap` operates after values are loaded.

The migration path is:

1. Keep `dotenv` responsible for loading values.
2. Create capability-owned environment schemas.
3. Replace direct `process.env` access with validated contracts.
4. Add documentation metadata when needed.
5. Generate configuration artifacts through build tooling.

## Before: direct process.env access

A common application structure:

```ts
import "dotenv/config"

const stripeKey = process.env.STRIPE_SECRET_KEY

if (!stripeKey) {
  throw new Error("Missing Stripe key")
}

initializeStripe(stripeKey)
```

As applications grow, environment usage becomes distributed:

```text
src/

├── payments/
│   └── stripe.ts          -> process.env.STRIPE_SECRET_KEY

├── database/
│   └── connection.ts      -> process.env.DATABASE_URL

├── cache/
│   └── redis.ts           -> process.env.REDIS_URL
```

This creates several problems:

- validation logic is duplicated
- ownership is unclear
- variables can disappear from documentation
- unused variables remain after capabilities are removed

## After: capability-owned environment contracts

Move configuration requirements alongside the capability that uses them.

Example:

```ts
// features/payments/env.schema.ts

import { createEnv, documentEnv } from "env-cap"

const paymentsSchema = {
  STRIPE_SECRET_KEY: {
    validator(value: string) {
      return value.startsWith("sk_") || 'Expected a key starting with "sk_".'
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

The capability now owns its configuration:

```ts
import { paymentsEnv } from "./env.schema"

initializeStripe(paymentsEnv.STRIPE_SECRET_KEY)
```

## dotenv still loads the values

`env-cap` does not replace `dotenv`.

The loading flow remains:

```text
.env file
    |
    v
dotenv
    |
    v
process.env
    |
    v
env-cap validation
    |
    v
capability-owned environment contract
```

Example startup:

```ts
import "dotenv/config"
import { validateEnv } from "env-cap"
import { manifest } from "./generated/env.manifest"

await validateEnv({
  manifest,
  values: process.env,
})
```

After validation:

```ts
paymentsEnv.STRIPE_SECRET_KEY
```

returns the validated value.

## Migrating incrementally

A complete rewrite is unnecessary.

### Step 1: Find existing environment usage

Search for:

```ts
process.env
```

Identify which capability owns each variable.

Example:

```ts
process.env.STRIPE_SECRET_KEY
```

belongs with:

```text
features/payments/
```

not a global configuration file.

### Step 2: Create capability schemas

Move variables into capability-owned schemas:

```text
features/

├── payments/
│   └── env.schema.ts

├── database/
│   └── env.schema.ts

└── notifications/
    └── env.schema.ts
```

### Step 3: Replace direct access

Before:

```ts
const key = process.env.STRIPE_SECRET_KEY
```

After:

```ts
const key = paymentsEnv.STRIPE_SECRET_KEY
```

The capability now receives a validated value instead of an unknown string.

### Step 4: Add documentation metadata

Once ownership is established:

```ts
documentEnv(paymentsSchema, {
  owner: "payments-team",
  variables: {
    STRIPE_SECRET_KEY: {
      description: "Stripe production API credential",
      expiresAt: "2027-01-01T00:00:00Z",
    },
  },
})
```

The same source that defines ownership can now generate operational documentation.

## Handling existing `.env.example` files

Many projects maintain:

```text
.env.example
```

manually:

```env
DATABASE_URL=
STRIPE_SECRET_KEY=
REDIS_URL=
```

As contracts are migrated, `env-cap` can generate this artifact from discovered schemas.

This allows:

- fewer missing variables
- fewer stale entries
- documentation closer to implementation

The generated file should be treated as a development artifact, not a source of secret values.

## Handling validation libraries

If your project already uses another validator, you do not need to remove it immediately.

Examples:

- Zod
- Joi
- Yup
- custom validators

The migration can focus first on ownership:

```ts
createEnv({
  STRIPE_SECRET_KEY: {
    validator(value) {
      return existingValidationFunction(value)
    },
  },
})
```

The purpose of `env-cap` is not to replace every validation strategy. It provides a structure for organizing configuration ownership and visibility.

## When to keep dotenv alone

`dotenv` may be sufficient when:

- the application is small
- environment variables are few
- one team owns the entire application
- configuration changes are infrequent

Adding additional structure has a cost.

`env-cap` is designed for applications where configuration management becomes a coordination problem between developers, teams, and platform operations.

## Summary

Migrating from `dotenv` changes the role of environment variables.

Before:

```text
.env
 |
 v
process.env
 |
 v
application code
```

After:

```text
.env
 |
 v
dotenv
 |
 v
process.env
 |
 v
capability-owned env contracts
 |
 v
validated application code
```

`dotenv` remains responsible for loading configuration.

`env-cap` adds ownership, validation, and operational visibility without requiring a new secret-management system or deployment workflow.
