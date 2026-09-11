import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { authEnv } from "../../capabilities/auth/env.schema.js";

const secretKey = () => new TextEncoder().encode(authEnv.SESSION_SECRET);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface SessionPayload {
  userId: string;
  email: string;
}

/** Signs a session token (HS256, jose) -- fully real, local crypto, no external dependency. */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | undefined> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload["userId"] !== "string" || typeof payload["email"] !== "string") {
      return undefined;
    }
    return { userId: payload["userId"], email: payload["email"] };
  } catch {
    return undefined;
  }
}
