# Migrating from direct `process.env` usage

Many applications begin by reading environment variables directly from Node's built-in environment object:

```ts
const databaseUrl = process.env.DATABASE_URL
const stripeKey = process.env.STRIPE_SECRET_KEY
```

This approach is flexible and requires no additional tooling. However, as applications grow, direct `process.env` access creates several challenges:

- Environment requirements are scattered throughout the codebase.
- Validation logic is repeated across capabilities.
- It is difficult to identify which part of the application owns a variable.
- Removing unused configuration requires manually searching for references.
- Platform teams lack a reliable inventory of application configuration.

`env-cap` does not replace `process.env`. It creates an ownership and validation layer around it.

The relationship is:

```text
process.env
    |
    v
env-cap validation
    |
    v
capability-owned environment contract
    |
    v
application code
```

## Migration goals

The recommended migration path is incremental:

1. Find existing environment variable usage.
2. Group variables by the capability that consumes them.
3. Create capability-owned environment contracts.
4. Replace direct `process.env` reads with validated access.
5. Generate project-wide configuration artifacts through build tooling.

The goal is not to centralize configuration. The goal is to make ownership explicit.

## Before: direct process.env access

A typical application:

```ts
// payments/stripe.ts

const stripeKey = process.env.STRIPE_SECRET_KEY

if (!stripeKey) {
  throw new Error("Missing Stripe key")
}

initializeStripe(stripeKey)
```

Another module:

```ts
// database/connection.ts

const databaseUrl = process.env.DATABASE_URL

connect(databaseUrl)
```

The application works, but configuration ownership is implicit.

The environment variables exist globally:

```text
process.env

├── STRIPE_SECRET_KEY
├── DATABASE_URL
├── REDIS_URL
├── SMTP_PASSWORD
└── INTERNAL_API_KEY
```

Any file can access any value.

## After: capability-owned environment contracts

Move configuration definitions next to the capability that uses them.

Example:

```ts
// features/payments/env.schema.ts

import { createEnv, documentEnv } from "@maverickcer/env-cap"

const paymentsSchema = {
  STRIPE_SECRET_KEY: {
    validator(value: string) {
      return value.startsWith("sk_")
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

The capability now owns its requirement:

```ts
import { paymentsEnv } from "./env.schema"

initializeStripe(paymentsEnv.STRIPE_SECRET_KEY)
```

The dependency becomes explicit.

A payments module depends on payment configuration instead of depending on an application-wide environment object.

## Migrating existing variables

### Step 1: Find environment usage

Search the application:

```ts
process.env
```

Create an inventory:

```text
STRIPE_SECRET_KEY
    used by:
    - features/payments
    - scripts/refund-job

DATABASE_URL
    used by:
    - database module
    - migrations
```

Do not move variables based only on their names. Move them based on the code that consumes them.

## Step 2: Create capability schemas

Create schemas alongside existing modules:

```text
src/

├── features/
│   ├── payments/
│   │   └── env.schema.ts
│   │
│   ├── notifications/
│   │   └── env.schema.ts
│   │
│   └── reporting/
│       └── env.schema.ts
```

Each schema defines only the variables required by that capability.

## Step 3: Replace direct reads

Before:

```ts
const apiKey = process.env.STRIPE_SECRET_KEY
```

After:

```ts
const apiKey = paymentsEnv.STRIPE_SECRET_KEY
```

The application no longer receives an unknown value. It receives a value that has passed the capability's validation rules.

## Step 4: Add startup validation

Generate a manifest:

```ts
await generateEnvManifest({
  location: "src/generated/env.manifest.ts",
})
```

Validate once during startup:

```ts
import { validateEnv } from "@maverickcer/env-cap"
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

returns the processed value.

Before validation completes:

```ts
paymentsEnv.STRIPE_SECRET_KEY
```

throws an `EnvNotReadyError`.

## Handling existing validation logic

Many applications already have inline validation:

```ts
const port = Number(process.env.PORT)

if (Number.isNaN(port)) {
  throw new Error("Invalid PORT")
}
```

Move that logic into the contract:

```ts
const serverSchema = {
  PORT: {
    processor(value: string) {
      return Number(value)
    },
    validator(value: number) {
      return (Number.isInteger(value) && value > 0) || "Expected a positive integer."
    },
  },
}
```

The validation remains near the code that understands the variable's purpose.

## Handling shared environment variables

A common concern during migration is:

> "What if multiple capabilities use the same environment variable?"

The answer depends on whether the variable represents the same concept.

If multiple capabilities truly share the same configuration meaning:

```env
LOG_LEVEL=info
```

multiple contracts may reference it:

```ts
loggingEnv.LOG_LEVEL
apiEnv.LOG_LEVEL
```

If capabilities process the same raw value differently, each capability can define its own contract:

```env
CACHE_TIMEOUT=60000
```

One capability may need:

```ts
cacheEnv.CACHE_TIMEOUT
// number
```

while another may need:

```ts
monitoringEnv.CACHE_TIMEOUT
// string for reporting
```

A centralized object would have to choose one global interpretation. Feature-owned contracts keep processing decisions local.

## Coexisting with existing environment files

`env-cap` does not require changing how environments are provided.

Existing systems continue to work:

```text
Docker
    |
Kubernetes
    |
Cloud provider secrets
    |
CI/CD variables
    |
process.env
    |
env-cap
```

The package validates and organizes values after they enter the application process.

## Removing the old environment object

After migration:

Before:

```text
src/

├── env.ts
│   ├── DATABASE_URL
│   ├── STRIPE_SECRET_KEY
│   └── REDIS_URL
```

After:

```text
src/

├── database/
│   └── env.schema.ts
│
├── payments/
│   └── env.schema.ts
│
└── cache/
    └── env.schema.ts
```

The environment requirements move with the capabilities that own them.

## When direct process.env usage may be enough

Direct `process.env` access can be appropriate when:

- the application is small
- there are few environment variables
- configuration ownership is obvious
- validation requirements are minimal

`env-cap` is intended for applications where configuration management becomes a coordination problem between developers and platform teams.

## Summary

Migrating from `process.env` changes configuration from an implicit global dependency into an explicit capability dependency.

Before:

```text
capability
   |
   v
process.env.SOME_VARIABLE
```

After:

```text
capability
   |
   v
capabilityEnv.SOME_VARIABLE
   |
   v
validated configuration contract
```

`process.env` remains the source of configuration values.

`env-cap` provides the structure needed to safely manage those values as applications and teams scale.
