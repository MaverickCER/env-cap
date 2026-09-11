import { createEnv, documentEnv } from "env-cap";

function emailAddress(value: unknown): string {
  return String(value ?? "");
}

/**
 * One secret credential (RESEND_API_KEY) paired with one non-secret
 * companion config value (EMAIL_FROM_ADDRESS) -- a mixed sensitivity
 * within a single capability, distinct from every other capability here.
 * Both are optional: `email.service.ts` falls back to console-logging the
 * notification instead of sending it when unset, genuinely exercised as
 * "declared, gracefully degraded" in its own tests.
 */
const emailSchema = {
  RESEND_API_KEY: {},
  EMAIL_FROM_ADDRESS: {
    default: "notifications@example.invalid",
    processor: emailAddress,
    validator: (value: string) => value.includes("@") || "EMAIL_FROM_ADDRESS must contain an \"@\".",
  },
};

export const emailEnv = createEnv(emailSchema, { name: "email", source: import.meta.url });

documentEnv(emailSchema, {
  category: "notifications",
  owner: "platform-team",
  variables: {
    RESEND_API_KEY: {
      description: "Resend API key for sending case-update notification emails to staff. Unset: notifications are logged to console instead of sent.",
      sensitivity: "secret",
      required: false,
      purpose: "Notify assigned staff when a matter or task they own changes.",
      legalBasis: "Legitimate interest -- operational notifications, not marketing.",
      metadata: {
        documentation: "https://resend.com/api-keys",
      },
    },
    EMAIL_FROM_ADDRESS: {
      description: "\"From\" address on outgoing case-notification emails.",
      required: false,
    },
  },
});
