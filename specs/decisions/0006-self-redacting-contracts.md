# 0006: Contracts redact themselves; only explicit per-key access reveals a value

## Status

Accepted. Implemented in `src/runtime/create.ts`.

## Context

A common way secrets reach logs or monitoring systems is through accidental
object serialization rather than intentional exposure. Examples include
debugging statements such as `console.log(config)` or serializing request
context objects that happen to contain resolved environment values.

A traditional environment library often returns a plain object containing
resolved values:

```ts
{
  STRIPE_KEY: "sk_live_...",
  DATABASE_URL: "postgres://..."
}
```

This creates an unsafe default because the easiest way to inspect the object
is also the easiest way to expose every secret it contains. Reading one
specific variable and dumping the entire configuration object require the
same action.

## Decision

The object returned by `createEnv()` is intentionally not a plain value
object. It is a protected contract object that exposes values only through
explicit property access.

The returned object overrides:

- `Symbol.for("nodejs.util.inspect.custom")`
- `toString()`
- `toJSON()`

Each returns a redacted representation containing only contract metadata:

```text
EnvContract("payments") { 3 variable(s) }
```

The underlying environment values are never included.

As a result:

- `console.log(paymentsEnv)` is safe.
- `util.inspect(paymentsEnv)` is safe.
- `` `${paymentsEnv}` `` is safe.
- `JSON.stringify(paymentsEnv)` is safe.

Explicit access to a known variable remains unchanged:

```ts
paymentsEnv.STRIPE_KEY
```

returns the validated, processed value required by application code.

The contract object is also frozen with `Object.freeze()` to prevent runtime
mutation of the redaction methods or replacement of the protected behavior.

## Consequences

- **The safe path becomes easier than the unsafe path.**
  Accidentally dumping an entire environment contract no longer exposes every
  variable. Retrieving a secret requires an intentional property access to a
  specific key rather than a generic object serialization.

- **Protection ends once a value is extracted.**
  This design protects the contract object itself, not arbitrary values after
  application code retrieves them.

  For example:

  ```ts
  console.log({ key: paymentsEnv.STRIPE_KEY })
  ```

  intentionally creates a new object containing the secret. The package
  cannot prevent application code from re-exposing values after extraction.

- **Processors and validators remain responsible for their own error
  handling.**
  If custom processing code includes sensitive values in thrown errors, such
  as:

  ```ts
  throw new Error(`Invalid value: ${value}`)
  ```

  that information may appear in validation failures. The contract
  redaction boundary cannot protect values that custom code has already
  placed into an error message.

- **The design intentionally avoids turning environment access into a secret
  management system.**
  There is no `.reveal()`, `.unwrap()`, access auditing, or permission layer.
  The goal is narrowly defined: prevent the most common accidental exposure
  pattern while preserving normal developer ergonomics.

- **Per-variable access remains intentionally simple.**
  Developers should not need additional ceremony for the normal case of
  reading a required configuration value. Security is improved at the object
  boundary without making legitimate access cumbersome.

## Alternatives considered

- **A `Proxy`-based lazy contract with an explicit `.reveal()` or
  `.unwrap()` method.**
  Rejected. This adds API complexity and introduces a second access model
  without meaningfully improving the primary protection target. The main
  risk is accidental whole-object serialization, which the existing
  inspection overrides already address.

- **Return a normal object and rely on documentation to prevent leaks.**
  Rejected. A warning in documentation does not change the default behavior
  of serialization. Since this package exists specifically around handling
  sensitive configuration values, the safer default should be enforced by
  the object design itself rather than developer discipline alone.
