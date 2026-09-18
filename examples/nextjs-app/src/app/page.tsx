// Side-effect import, first -- see route.ts's identical comment for why:
// this page is its own Turbopack chunk with its own bundled copy of
// env-cap/env.public.schema.ts, so it needs its own validation trigger too.
import "@/env"

import { publicEnv } from "@/features/todos/env.public.schema"
import { TodoApp } from "./todo-app"

// Forces this route to render per-request rather than being statically
// prerendered at `next build` time. Not just a performance choice: this
// page's session cookie is inherently per-request, but more importantly,
// static prerendering runs in a build-time worker that never calls
// instrumentation.ts's register() (confirmed empirically: prerendering this
// page without `force-dynamic` throws env-cap's own EnvNotReadyError).
// Forcing dynamic rendering defers every environment read to real request
// time, after the `import "@/env"` above has genuinely resolved.
export const dynamic = "force-dynamic"

export default function Page() {
  // Read server-side, once, and passed down as a prop rather than
  // `todo-app.tsx` (a client component) importing `publicEnv` itself: the
  // browser bundle has no `process.env` and no validated contract state, so
  // a client-side read would either throw or silently misbehave depending on
  // bundler dead-code elimination. Reading here and passing a plain string
  // down is the same "read server-side, pass as a prop" pattern the App
  // Router already expects for any server-only data a client component needs.
  return <TodoApp appName={publicEnv.NEXT_PUBLIC_APP_NAME} />
}
