import { createEnv, documentEnv } from "env-cap";

/**
 * Deliberately hand-written processors/validators, not `env-cap/helpers` --
 * this flagship exercises every public surface of the package except `helpers` (see
 * examples/enterprise-platform/README.md), so every capability schema writes its own.
 */
function mongodbUri(value: unknown): URL {
  return new URL(String(value ?? ""));
}

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
}

const databaseSchema = {
  MONGODB_URI: {
    processor: mongodbUri,
    validator: (url: URL) =>
      url.protocol === "mongodb:" ||
      url.protocol === "mongodb+srv:" ||
      `MONGODB_URI must use the mongodb:// or mongodb+srv:// scheme, got "${url.protocol}".`,
  },
  AUDIT_LOG_RETENTION_DAYS: {
    default: "365",
    processor: positiveInteger,
    validator: (days: number) => days > 0 || "AUDIT_LOG_RETENTION_DAYS must be a positive integer.",
  },
};

export const databaseEnv = createEnv(databaseSchema, {
  name: "database",
  source: import.meta.url,
});

documentEnv(databaseSchema, {
  category: "database",
  owner: "data-platform-team",
  variables: {
    MONGODB_URI: {
      description: "MongoDB connection string for the case-tracker's primary database.",
      sensitivity: "credential",
      required: true,
      purpose: "Store and retrieve matter, task, and user records.",
      legalBasis: "Contractual necessity -- the service cannot function without its database.",
      retention: "Connection string itself is never persisted outside the deployment's secret store.",
      auditRequired: true,
      metadata: {
        documentation: "https://www.mongodb.com/docs/manual/reference/connection-string/",
      },
    },
    AUDIT_LOG_RETENTION_DAYS: {
      description: "How many days of audit-log entries (who accessed which matter, when) are kept before rotation.",
      purpose: "Support the firm's record-keeping and audit obligations for client matters.",
      legalBasis: "Legal record-keeping obligation (attorney work-product / client file retention).",
      retention: "The audit log itself is retained for exactly this many days, then rotated out.",
    },
  },
});
