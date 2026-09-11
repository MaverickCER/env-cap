import { createEnv, documentEnv } from "env-cap";

function nonEmptyString(value: unknown): string {
  return String(value ?? "");
}

/**
 * Real in CI: `s3rver` (a pure-JS embedded S3-compatible server) gives a
 * genuine local S3-compatible target, so case-file attachment upload/download
 * is actually exercised, not merely declared -- the one place this flagship
 * deliberately goes further than data-cap's own tier-3 service list, which
 * cut storage for lacking exactly this. `S3_ENDPOINT` is optional (unset:
 * the real AWS endpoint; set: s3rver's local endpoint for tests).
 */
const storageSchema = {
  S3_BUCKET: { processor: nonEmptyString },
  S3_REGION: { default: "us-east-1", processor: nonEmptyString },
  S3_ACCESS_KEY_ID: {},
  S3_SECRET_ACCESS_KEY: {},
  // No processor -- passed through unprocessed (string | undefined), unlike
  // every other variable here, so an unset S3_ENDPOINT stays genuinely
  // undefined rather than being coerced to "" by nonEmptyString().
  S3_ENDPOINT: {},
};

export const storageEnv = createEnv(storageSchema, { name: "storage", source: import.meta.url });

documentEnv(storageSchema, {
  category: "storage",
  owner: "compliance-team",
  purpose: "Store case-file attachments -- potentially privileged, client-confidential documents.",
  legalBasis: "Attorney-client privilege and contractual necessity -- the firm must retain and produce case documents.",
  dataResidency: "us-east-1",
  variables: {
    S3_BUCKET: { description: "Bucket holding case-file attachments.", required: true },
    S3_REGION: { description: "AWS region the bucket lives in." },
    S3_ACCESS_KEY_ID: {
      description: "Access key ID for the case-file attachment bucket.",
      sensitivity: "credential",
      required: true,
      auditRequired: true,
      metadata: {
        documentation: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
      },
    },
    S3_SECRET_ACCESS_KEY: {
      description: "Secret access key for the case-file attachment bucket -- gates access to potentially privileged client documents.",
      sensitivity: "pii",
      required: true,
      retention: "Rotated quarterly per compliance-team's key-rotation schedule.",
      auditRequired: true,
      metadata: {
        documentation: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
      },
    },
    S3_ENDPOINT: {
      description: "Override endpoint for a local/test S3-compatible server (s3rver). Unset in production -- the real AWS endpoint is used.",
    },
  },
});
