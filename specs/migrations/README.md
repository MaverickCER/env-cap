# Migrating to env-cap

`env-cap` is not a replacement for environment validation libraries.

If your application already uses Zod, envalid, t3-env, Joi, or another validation system, those tools solve an important problem: ensuring environment values are valid.

`env-cap` solves a different problem: ensuring environment configuration has clear ownership, discoverability, and lifecycle visibility as applications grow.

Migration does not require replacing your validation approach immediately. The recommended path is to move configuration ownership into capability boundaries first, then adopt the runtime validation features that best fit your application.

## Guides

- [From `dotenv`](from-dotenv.md) -- keep `dotenv` loading values, add capability-owned contracts on top.
- [From raw `process.env`](from-process-env.md) -- replace scattered `process.env.X` access with owned, validated contracts.
- [From a centralized environment schema](from-centralized-schema.md) -- split a single `env.ts`/`env.schema.ts` file into capability-owned schemas.
- [From Zod](from-zod.md) -- keep Zod for validation, move ownership to capabilities.
- [From envalid](from-envalid.md) -- keep envalid's validators, move ownership to capabilities.
- [From t3-env](from-t3-env.md) -- keep t3-env's client/server split conceptually, replace the centralized object with capability-owned contracts.

## Migration strategy

Migrate incrementally:

1. Identify capability boundaries.
2. Move environment requirements next to the capability that uses them.
3. Replace direct `process.env` access with capability-owned contracts.
4. Generate project-wide configuration artifacts through build tooling.
5. Remove the centralized schema when no longer needed.

The goal is not fewer environment variables. The goal is clearer ownership.
