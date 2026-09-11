import { createEnv, documentEnv } from "env-cap";

/** See ../notifications/env.schema.ts's header comment -- this is the other half of the pair. */
const schema = {
  WEBHOOK_URL: {},
};

export const auditLogEnv = createEnv(schema, { name: "audit-log", source: import.meta.url });

documentEnv(schema, {
  variables: {
    WEBHOOK_URL: {
      description: "Webhook endpoint audit events are POSTed to.",
      owner: "team-security",
      expiresAt: "2027-01-01",
    },
  },
});
