// Server-only capability contract -- declares and validates
// DATABASE_URL/SESSION_SECRET/INTERNAL_API_KEY, but deliberately does NOT
// import the "server-only" package itself (unlike src/lib/session.ts and
// src/lib/store.ts, its two real consumers). This file has to stay importable
// from plain Node: scripts/validate-env.ts (the `next build`-time gate, run
// via `tsx`, outside Next's own bundler) and the generated manifest both
// import it, and "server-only" unconditionally throws the instant it's
// required outside Next's webpack/Turbopack pipeline -- confirmed
// empirically, not assumed (see scripts/validate-env.ts's own history in
// this example's git log for the exact error).
//
// The mechanical, build-time "never ships to the client" guarantee instead
// lives on session.ts/store.ts -- the modules that actually read `serverEnv`'s
// values -- which both DO import "server-only". This file's own values are
// inert until read, and this example's one client component (src/app/page.tsx)
// imports env.public.schema.ts only, never this file; but that boundary here
// is enforced by code review/lint discipline, not by a mechanical guard on
// this declaration itself. Documented as a real, deliberate tradeoff, not
// silently assumed safe.
import { createEnv, documentEnv } from "env-cap"

const schema = {
  DATABASE_URL: {
    validator: (value: string) =>
      value.startsWith("postgres://") || value.startsWith("sqlite://") ||
      'Expected a connection string starting with "postgres://" or "sqlite://".',
  },
  SESSION_SECRET: {
    validator: (value: string) =>
      value.length >= 32 || "Session secret must be at least 32 characters.",
  },
  INTERNAL_API_KEY: {
    validator: (value: string) => value.length > 0 || "Internal API key must not be empty.",
  },
}

export const serverEnv = createEnv(schema, { name: "todos-server" })

documentEnv(schema, {
  owner: "platform-team",
  variables: {
    DATABASE_URL: {
      description:
        "Connection string for the todo store. This example's actual storage is in-memory (see src/lib/store.ts) -- the variable is still declared, validated, and documented for real, exactly as a production DATABASE_URL would be.",
      sensitivity: "secret",
      setupInstructions: "Provision a datastore and paste its connection string.",
      required: true,
    },
    SESSION_SECRET: {
      description: "Signs the demo session cookie that distinguishes one browser session from another.",
      sensitivity: "secret",
      setupInstructions: "Generate 32+ random bytes, e.g. `openssl rand -base64 32`.",
      required: true,
    },
    INTERNAL_API_KEY: {
      description: "Shared secret required on the internal admin API route (src/app/api/todos/route.ts's DELETE handler).",
      sensitivity: "credential",
      setupInstructions: "Generate any non-empty random string for local development.",
      required: true,
    },
  },
})
