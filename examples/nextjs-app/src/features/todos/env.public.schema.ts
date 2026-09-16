// Client-safe capability contract. Every key here is a real `NEXT_PUBLIC_*`
// variable: Next.js inlines these into the client bundle at build time
// (https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser),
// so nothing declared in this file may ever hold a secret -- unlike
// env.server.schema.ts, this module carries no "server-only" import and is
// imported directly by client components (see src/app/page.tsx).
import { createEnv, documentEnv } from "env-cap"

const schema = {
  NEXT_PUBLIC_APP_NAME: {
    default: "env-cap todos",
    processor: (value: unknown): string => String(value ?? "env-cap todos"),
  },
}

export const publicEnv = createEnv(schema, { name: "todos-public" })

documentEnv(schema, {
  owner: "platform-team",
  variables: {
    NEXT_PUBLIC_APP_NAME: {
      description: "Display name shown in the todo app's header. Safe to ship to the browser -- never move a secret into this file to reuse its NEXT_PUBLIC_ wiring.",
      sensitivity: "config",
    },
  },
})
