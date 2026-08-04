import { createEnv, documentEnv } from "@maverickcer/env-cap";

/**
 * Two unrelated features, `notifications` (here) and `audit-log` (see
 * ../audit-log/env.schema.ts), independently need to receive webhook
 * deliveries and happen to both reach for the name WEBHOOK_URL -- a naming
 * coincidence, not a shared contract. There is no `exclusiveGroup` here;
 * both are active and both are meant to run together, unlike
 * `examples/composable-boilerplates`'s postgres/mongodb pair.
 *
 * Each documents WEBHOOK_URL with different metadata (different
 * `description`/`owner`, one sets `required`, the other sets `expiresAt`).
 * `generateEnvManifest()` reports that divergence as a
 * `duplicate-variable-documentation` warning -- never a hard error, since
 * static analysis can't prove two descriptions are "wrong," only that they
 * differ -- so generation still succeeds by default. See README.md.
 */
const schema = {
  WEBHOOK_URL: {},
};

export const notificationsEnv = createEnv(schema, { name: "notifications", source: import.meta.url });

documentEnv(schema, {
  variables: {
    WEBHOOK_URL: {
      description: "Slack webhook for notification delivery.",
      owner: "team-notifications",
      required: true,
    },
  },
});
