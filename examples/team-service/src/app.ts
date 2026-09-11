import "./startup.js"; // side-effect import: throws and halts startup if validation fails

// Capability code imports its OWN contract directly -- never through the contract,
// and never through a global env object. mongoEnv is intentionally NOT
// imported here: it's active: false in features/mongodb/env.schema.ts, so
// generateEnvManifest() excluded it from the contract passed to
// validateEnv() -- reading mongoEnv.DATABASE_URL would throw
// EnvNotReadyError. Application code should only ever reference the backend
// that's actually active.
import { authEnv } from "../features/auth/env.schema.js";
import { postgresEnv } from "../features/postgres/env.schema.js";
import { prismaEnv } from "../features/prisma/env.schema.js";

console.log(`Prisma provider: ${prismaEnv.DATABASE_PROVIDER}`);
console.log(`Database URL: ${postgresEnv.DATABASE_URL}`);
console.log(`Session secret configured: ${authEnv.SESSION_SECRET.length > 0}`);
