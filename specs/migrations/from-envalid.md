# Migrating from envalid

This guide explains how to migrate an application using
[`envalid`](https://github.com/af/envalid) to `env-cap`.

The migration is not a replacement of validation capabilities. `envalid` and
`env-cap` solve different problems:

- `envalid` focuses on validating environment variables and producing a typed
  configuration object.
- `env-cap` focuses on configuration ownership, lifecycle visibility,
  modular architecture, and runtime access boundaries.

`env-cap` can use the same validation approach you already have today,
including custom validators and processors. The primary change is moving
from a centralized configuration object to capability-owned environment
contracts.

## Before: centralized environment validation

A typical `envalid` setup looks like:

```ts
import { cleanEnv, str, num } from "envalid"

export const env = cleanEnv(process.env, {
  DATABASE_URL: str(),
  PORT: num(),
  STRIPE_SECRET_KEY: str(),
})
```

Application code accesses everything through one shared object:

```ts
env.DATABASE_URL
env.PORT
env.STRIPE_SECRET_KEY
```

This works well for small applications. As applications grow, the environment
configuration becomes a shared ownership boundary:

```
src/
├── env.ts
├── payments/
├── database/
├── reports/
└── notifications/
```

Every capability that requires configuration modifies the same file.

Common consequences:

- configuration ownership becomes unclear
- unrelated capabilities modify the same schema
- removing capabilities requires cleaning up centralized variables
- platform teams need separate tooling to understand ownership

## After: capability-owned contracts

With `env-cap`, move configuration ownership into the capability that uses
it.

Example:

```
src/
├── database/
│   └── env.schema.ts
├── payments/
│   └── env.schema.ts
└── reports/
    └── env.schema.ts
```

The database capability owns database configuration:

```ts
// database/env.schema.ts

import { createEnv } from "@maverickcer/env-cap"

const databaseSchema = {
  DATABASE_URL: {
    validator(value: string) {
      return value.startsWith("postgres://") || 'Expected a value starting with "postgres://".'
    },
  },
}

export const databaseEnv = createEnv(databaseSchema, {
  name: "database",
})
```

The payments capability owns payment configuration:

```ts
// payments/env.schema.ts

import { createEnv } from "@maverickcer/env-cap"

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
```

Application code imports configuration from the capability that owns it:

```ts
import { databaseEnv } from "./database/env.schema"

databaseEnv.DATABASE_URL
```

There is no global:

```ts
env.DATABASE_URL
```

The import relationship becomes the ownership relationship.

---

# Migration strategy

The migration can happen incrementally.

You do not need to convert every environment variable at once.

## Step 1: Keep your existing environment loading

`env-cap` does not replace dotenv, deployment secrets, or your existing
environment provider.

Continue loading values however your application currently does:

```ts
dotenv.config()
```

or:

```ts
process.env
```

The package only validates and exposes configuration.

---

## Step 2: Identify capability ownership

Start by grouping existing variables by the code that consumes them.

Example existing configuration:

```ts
DATABASE_URL
PORT
STRIPE_SECRET_KEY
REDIS_URL
SMTP_HOST
```

Move toward:

```
database/
  DATABASE_URL

server/
  PORT

payments/
  STRIPE_SECRET_KEY

cache/
  REDIS_URL

email/
  SMTP_HOST
```

The goal is not fewer environment variables.

The goal is clear ownership.

---

## Step 3: Convert validators

Most `envalid` validators map directly to `env-cap` processors and
validators.

### String validation

Before:

```ts
import { str } from "envalid"

STRIPE_SECRET_KEY: str()
```

After:

```ts
STRIPE_SECRET_KEY: {
  validator(value: string) {
    return value.length > 0 || "This variable is required.";
  },
}
```

---

### Number conversion

Before:

```ts
import { num } from "envalid"

PORT: num()
```

After:

```ts
PORT: {
  processor(value: string) {
    return Number(value);
  },
  validator(value: number) {
    return Number.isInteger(value) || "Expected an integer.";
  },
}
```

The important distinction is that transformation and validation are explicit.

The runtime contract defines how the capability consumes the value.

---

### Default values

Before:

```ts
PORT: num({
  default: 3000,
})
```

After:

```ts
PORT: {
  default: 3000,
  processor(value: string) {
    return Number(value);
  },
}
```

---

## Step 4: Add documentation metadata

`envalid` validates configuration, but it does not create an ownership model.

Add operational metadata separately:

```ts
import { documentEnv } from "@maverickcer/env-cap"

documentEnv(databaseSchema, {
  owner: "platform",
  variables: {
    DATABASE_URL: {
      description: "Primary PostgreSQL connection string",
      expiresAt: "2027-01-01T00:00:00Z",
    },
  },
})
```

This enables generated documentation without adding metadata to runtime
configuration.

---

## Step 5: Replace centralized imports gradually

Before:

```ts
import { env } from "./env"

export function createPayment() {
  return stripe(env.STRIPE_SECRET_KEY)
}
```

After:

```ts
import { paymentsEnv } from "./payments/env.schema"

export function createPayment() {
  return stripe(paymentsEnv.STRIPE_SECRET_KEY)
}
```

Continue migrating capability by capability until the centralized environment object
is no longer needed.

---

# Differences from envalid

## Environment validation

Both packages support:

- required variables
- defaults
- transformations
- custom validation
- startup validation

The difference is the ownership model.

`envalid` answers:

> "Are all environment variables valid?"

`env-cap` answers:

> "Which capability owns this configuration, how is it validated, and how is it
> operated over time?"

---

## Multiple consumers with different requirements

A centralized environment object often requires choosing one representation:

```ts
env.TIMEOUT
```

Should `TIMEOUT` be:

```ts
string
```

or:

```ts
number
```

Different consumers may have different needs.

Example:

```ts
// HTTP client configuration
timeout: "5000"
```

A library integration may require a string because it serializes directly into
headers or configuration.

Another capability may require:

```ts
timeout: 5000
```

for arithmetic:

```ts
timeout + retryDelay
```

The environment value is the same. The consumer requirement is different.

`env-cap` allows each owning capability to define its own processing boundary:

```ts
apiClientEnv.TIMEOUT
// string

jobRunnerEnv.TIMEOUT
// number
```

The build system can identify these situations for review without assuming
that one interpretation is universally correct.

---

# What stays the same

Migrating from envalid does not require changing:

- deployment secrets
- Docker configuration
- CI environment variables
- hosting provider configuration
- secret managers
- `.env` loading

The same environment values continue entering the application.

The change is where configuration ownership and validation logic live.

---

# When not to migrate

`envalid` may be the better choice when:

- the application is small
- one team owns all configuration
- a centralized config object is desirable
- operational documentation is managed elsewhere

`env-cap` is designed for applications where configuration ownership
becomes a scaling concern:

- large applications
- multiple teams
- monorepos
- platform engineering workflows
- long-lived services
- environments with operational lifecycle requirements

---

# Related approaches

`env-cap` is designed as a modular complement to validation libraries, not
as a replacement for every environment solution.

Similar centralized approaches include:

- `envalid`
- `t3-env`
- `zod`-based environment wrappers
- `dotenv` + custom configuration objects

These tools solve environment parsing and validation.

`env-cap` adds the organizational layer:

- capability ownership
- static discovery
- generated documentation
- lifecycle visibility
- configuration dependency mapping

The validation library answers whether a value is valid.

The contract system answers who owns that value and how it is maintained.
