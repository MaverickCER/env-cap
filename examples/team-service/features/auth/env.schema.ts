import { createEnv, documentEnv } from "env-cap";

/**
 * Owned by a different team than the database/orm capabilities on purpose
 * (`security-team`, not `data-platform-team`) -- this is what makes the
 * generated ownership matrix and security review actually have something to
 * show: a real, multi-team contract list, not one team's name repeated
 * three times. `SESSION_SECRET` is `sensitivity: "secret"` -- the kind
 * of variable a security review specifically exists to enumerate.
 */
const authSchema = {
  SESSION_SECRET: {},
};

export const authEnv = createEnv(authSchema, { name: "auth", source: import.meta.url });

documentEnv(authSchema, {
  category: "auth",
  owner: "security-team",
  variables: {
    SESSION_SECRET: {
      description: "Signs and verifies user session cookies.",
      sensitivity: "secret",
      required: true,
      setupInstructions: "Generate with `openssl rand -base64 32`; security-team keeps the canonical copy in the shared vault.",
      expiresAt: "2026-10-01",
      refreshInstructions: "Rotate via the vault, then redeploy -- existing sessions are invalidated on rotation, so schedule outside peak hours.",
    },
  },
});
