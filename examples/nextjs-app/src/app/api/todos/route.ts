// Side-effect import, first: guarantees `await validateEnv(...)` (env.ts) has
// resolved before any handler below reads `serverEnv`'s values, WITHIN this
// exact module's own bundle. Not redundant with instrumentation.ts:
// confirmed empirically that Turbopack code-splits this route into its own
// chunk, a SEPARATE module instance of env-cap (and of env.server.schema.ts's
// own `createEnv()` call) from the one instrumentation.ts's chunk validates
// -- so that validation never reaches this chunk's copy, and reading
// `serverEnv.SESSION_SECRET` here throws env-cap's own EnvNotReadyError
// without this import. `validateEnv()` is documented idempotent (env-cap's
// own `src/runtime/validate.ts`), so this costs nothing once already valid.
import "@/env"

import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { serverEnv } from "@/features/todos/env.server.schema"
import { addTodo, deleteTodo, listTodos, toggleTodo } from "@/lib/store"
import { DEMO_SESSION_COOKIE_NAME, signSessionCookie, verifySessionCookie } from "@/lib/session"

async function requireSession(): Promise<string> {
  const jar = await cookies()
  const userId = verifySessionCookie(jar.get(DEMO_SESSION_COOKIE_NAME)?.value)
  if (userId) return userId

  // First visit: mint a session. A route handler is exactly where
  // SESSION_SECRET (server-only, see env.server.schema.ts) is meant to be
  // read -- never in a client component, which is what `import "server-only"`
  // in that file mechanically prevents.
  const cookie = signSessionCookie()
  const jarForSet = await cookies()
  jarForSet.set(DEMO_SESSION_COOKIE_NAME, cookie, { httpOnly: true, sameSite: "lax" })
  const restored = verifySessionCookie(cookie)
  if (!restored) throw new Error("Freshly signed session cookie failed to verify.")
  return restored
}

export async function GET(): Promise<NextResponse> {
  const userId = await requireSession()
  return NextResponse.json({ todos: listTodos(userId) })
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await requireSession()
  const body = (await request.json()) as { title?: unknown }
  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }
  return NextResponse.json({ todo: addTodo(userId, body.title.trim()) }, { status: 201 })
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const userId = await requireSession()
  const body = (await request.json()) as { id?: unknown }
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }
  const todo = toggleTodo(userId, body.id)
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ todo })
}

/**
 * Admin-only: deletes any todo regardless of owner. Gated on
 * INTERNAL_API_KEY (server-only, see env.server.schema.ts) rather than the
 * per-user session -- a second, independent real use of a server-only
 * declared variable, distinct from SESSION_SECRET's use above.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const providedKey = request.headers.get("x-internal-api-key")
  if (providedKey !== serverEnv.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const body = (await request.json()) as { id?: unknown }
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }
  const deleted = deleteTodo(body.id)
  return NextResponse.json({ deleted })
}
