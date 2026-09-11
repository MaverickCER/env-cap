import "./startup.js"; // side-effect import: throws and halts startup if validation fails

import { auditLogEnv } from "../features/audit-log/env.schema.js";
import { notificationsEnv } from "../features/notifications/env.schema.js";

// Each contract's WEBHOOK_URL is its own independent copy -- duplicate
// variable names across contracts are never merged at runtime, each
// contract processes its own copy of the raw value. Both read the same
// underlying process.env value here only because nothing in this toy
// example distinguishes them; in a real app they'd typically come from
// different upstream systems entirely.
console.log(`Notifications webhook: ${notificationsEnv.WEBHOOK_URL}`);
console.log(`Audit log webhook: ${auditLogEnv.WEBHOOK_URL}`);
