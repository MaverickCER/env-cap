import { createEnv, documentEnv } from "env-cap";

/**
 * Hand-rolled sessions (bcryptjs + jose), not a third-party auth library --
 * a real auth library pulls in its own env-var surface and its own Mongo-adapter
 * conventions, more moving parts that aren't about env-cap. This keeps `auth`'s
 * schema the whole story: one secret, signing/verifying session tokens.
 */
const authSchema = {
  SESSION_SECRET: {
    validator: (value: string) =>
      value.length >= 32 || "SESSION_SECRET must be at least 32 characters (used as an HMAC key).",
  },
};

export const authEnv = createEnv(authSchema, { name: "auth", source: import.meta.url });

documentEnv(authSchema, {
  category: "auth",
  owner: "security-team",
  variables: {
    SESSION_SECRET: {
      description: "Signs and verifies staff session tokens (jose, HS256).",
      sensitivity: "secret",
      required: true,
      purpose: "Maintain authenticated staff sessions for access to confidential matter data.",
      legalBasis: "Necessary for providing the service -- without a session, no staff member can be authenticated to view privileged case data.",
      retention: "Rotated on security-team's own schedule; rotating invalidates every existing session.",
      auditRequired: true,
      metadata: {
        documentation: "https://vault.internal/security-team/session-secret",
      },
    },
  },
});
