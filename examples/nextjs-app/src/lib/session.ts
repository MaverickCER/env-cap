import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { serverEnv } from "@/features/todos/env.server.schema"

const DEMO_USER_ID = "demo-user"

function sign(value: string): string {
  return createHmac("sha256", serverEnv.SESSION_SECRET).update(value).digest("hex")
}

/** Real use of SESSION_SECRET: signs/verifies the demo session cookie. Deliberately single-user -- multi-user auth is out of scope for this example. */
export function signSessionCookie(): string {
  return `${DEMO_USER_ID}.${sign(DEMO_USER_ID)}`
}

export function verifySessionCookie(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined
  const [userId, signature] = cookie.split(".")
  if (!userId || !signature) return undefined
  const expected = sign(userId)
  const actual = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actual.length !== expectedBuffer.length) return undefined
  return timingSafeEqual(actual, expectedBuffer) ? userId : undefined
}

export const DEMO_SESSION_COOKIE_NAME = "session"
