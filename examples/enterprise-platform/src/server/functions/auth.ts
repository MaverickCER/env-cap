import { createServerFn } from "@tanstack/react-start";
import { oauthGithubEnv } from "../../capabilities/oauth-github/env.schema.js";
import { User } from "../db/models/user.model.js";
import { createSessionToken, hashPassword, verifyPassword } from "../services/auth.service.js";

/**
 * Whether this deployment even offers GitHub login -- both capability
 * variables are required together, so checking one is enough. Drives the
 * login page's conditional rendering; real-tested (unlike the actual GitHub
 * handshake itself, which needs a live GitHub app -- see the README).
 */
export function githubLoginAvailable(): boolean {
  return oauthGithubEnv.GITHUB_CLIENT_ID.length > 0;
}

/** Real-tested: pure string construction, no network call. */
export function githubAuthorizeUrl(redirectUri: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", oauthGithubEnv.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  return url.toString();
}

/**
 * Builds the token-exchange request body GitHub's OAuth endpoint expects --
 * real construction, genuinely reading `GITHUB_CLIENT_SECRET`, but (like
 * `githubAuthorizeUrl()`) never actually sent over the network in this
 * flagship's own tests: no local GitHub emulator exists to complete the
 * handshake against. See the README.
 */
export function githubTokenExchangeBody(code: string): URLSearchParams {
  return new URLSearchParams({
    client_id: oauthGithubEnv.GITHUB_CLIENT_ID,
    client_secret: oauthGithubEnv.GITHUB_CLIENT_SECRET,
    code,
  });
}

/**
 * The actual business logic, kept as plain, directly-callable async
 * functions -- `createServerFn()`-wrapped functions below can only run
 * inside TanStack Start's own request context (an `AsyncLocalStorage` the
 * framework sets up per-request), so they can't be invoked directly from
 * src/main-headless.ts's in-process smoke test. Separating logic from the
 * RPC wrapper keeps both the client-callable path and the headless test
 * exercising the exact same code.
 */
export async function signupLogic(data: {
  email: string;
  name: string;
  password: string;
}): Promise<{ userId: string; token: string }> {
  const passwordHash = await hashPassword(data.password);
  const user = await User.create({ email: data.email, name: data.name, passwordHash });
  const token = await createSessionToken({ userId: user.id, email: user.email });
  return { userId: user.id as string, token };
}

export async function loginLogic(data: {
  email: string;
  password: string;
}): Promise<{ userId: string; token: string }> {
  const user = await User.findOne({ email: data.email });
  if (!user?.passwordHash || !(await verifyPassword(data.password, user.passwordHash))) {
    throw new Error("Invalid email or password.");
  }
  const token = await createSessionToken({ userId: user.id, email: user.email });
  return { userId: user.id as string, token };
}

export const signup = createServerFn({ method: "POST" })
  .validator((data: { email: string; name: string; password: string }) => data)
  .handler(({ data }) => signupLogic(data));

export const login = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(({ data }) => loginLogic(data));
