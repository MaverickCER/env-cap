# 0003: No Global `env` Object — Only Capability-Owned Contracts

## Status

Accepted.

Implemented in `src/runtime/create.ts` and reflected throughout the documentation. Capabilities expose their own environment contracts, such as `paymentsEnv.STRIPE_KEY`, rather than accessing variables through a global namespace such as `env.payments.STRIPE_KEY`.

## Context

Many environment-validation libraries create a single global environment object:

```ts
env.DATABASE_URL
env.STRIPE_KEY
```

All variables are declared within one shared schema, often in one central file. While this approach is simple initially, it creates ownership and scalability problems as an application grows.

A centralized schema becomes a shared modification point that every capability must update when adding configuration. This creates several issues:

- **Capability development becomes coupled to unrelated code.** Adding a new capability requires modifying a file owned by another area of the application, increasing merge conflicts and creating unnecessary coordination.
- **Capability removal becomes incomplete.** Removing a capability requires someone to identify and delete all associated variables from a shared schema. Unused configuration can remain indefinitely because ownership is unclear.
- **Configuration ownership becomes ambiguous.** A global object does not communicate which capability owns, validates, or depends on a variable.

`env-cap` treats environment configuration as part of capability ownership rather than application-wide shared state.

## Decision

`createEnv()` creates an environment contract scoped to the schema that defines it.

A capability owns its environment schema and exports the resulting contract from the same module:

```ts
// features/payments/env.schema.ts

export const paymentsEnv = createEnv({
  STRIPE_KEY: {
    processor: processors.string(),
    validator: validators.required(),
  },
})
```

Application code accesses configuration through the capability contract that owns it:

```ts
paymentsEnv.STRIPE_KEY
```

The package intentionally does not provide a mechanism for merging multiple contracts into a single global environment object.

The only systems that operate across multiple contracts are build-time or lifecycle systems:

- `generateEnvManifest()` can discover and describe contracts.
- `validateEnv()` can initialize validation across contracts.

Neither exposes a flattened runtime value object. `validateEnv()` returns execution metadata (`validateEnvResult`), not the resolved environment values.

## Consequences

### Capability ownership remains explicit

Two capabilities may define the same environment variable name without creating runtime collisions:

```ts
postgresEnv.DATABASE_URL
mongoEnv.DATABASE_URL
```

Each contract applies its own processor and validator rules to the raw environment value.

There is no merge operation where conflicting definitions must be resolved.

Potential overlaps are treated as an architectural concern and can be surfaced through build-time analysis such as `detectCompatibilityIssues()`, allowing developers to decide whether the duplication is intentional.

### Accidental cross-capability coupling is reduced

A developer cannot access another capability's configuration through a global namespace:

```ts
env.someOtherCapabilityVariable
```

Access requires importing the contract that owns the variable:

```ts
import { paymentsEnv } from "./payments/env.schema"

paymentsEnv.STRIPE_KEY
```

This creates a structural relationship between a capability and its configuration instead of relying on naming conventions.

### Runtime does not maintain a centralized configuration inventory

There is intentionally no runtime object containing every environment variable in the application.

This is a deliberate tradeoff.

A global inventory is useful for:

- documentation
- auditing
- dependency analysis
- lifecycle reporting

Those concerns belong to build-time tooling, where `env-cap` can generate artifacts without forcing runtime code to carry application-wide metadata.

The generated contract and documentation systems provide visibility without reintroducing a centralized runtime dependency.

### Contracts remain globally accessible only through normal module semantics

A capability contract can be imported throughout an application:

```ts
import { paymentsEnv } from "./payments/env.schema"
```

Multiple imports reference the same module instance through the JavaScript module system.

This provides consistent runtime behavior without requiring a package-managed singleton registry. The package does not own global state; the application module system provides the appropriate sharing behavior.

## Alternatives Considered

### Global namespaced registry

Example:

```ts
env.payments.STRIPE_KEY
```

Rejected.

A global registry recreates the same ownership problem at another level. Every capability must now register itself into shared mutable state, introducing additional concerns:

- Who owns namespace naming?
- How are collisions handled?
- What happens when two capabilities expose the same name?
- When is the registry considered complete?
- Does initialization order affect behavior?

Additionally, automatic registration requires every capability module to be imported before the registry is complete, creating hidden dependency requirements.

### Automatic discovery that builds a global runtime object

Rejected.

Discovery is a build-time concern, not a runtime execution concern.

Automatically scanning files and creating runtime state would:

- introduce filesystem/build assumptions
- create implicit side effects
- make application startup behavior harder to reason about
- blur the boundary between development tooling and runtime code

`env-cap` uses explicit build-time discovery to generate artifacts while keeping runtime behavior deterministic and framework-independent.

## Summary

`env-cap` treats environment configuration as capability-owned infrastructure rather than a global application resource.

The runtime model intentionally favors:

- explicit ownership over convenience access
- composition over centralization
- build-time visibility over runtime metadata
- deterministic imports over implicit discovery

The result is a configuration system that scales with capability boundaries instead of creating a larger shared dependency as the application grows.
