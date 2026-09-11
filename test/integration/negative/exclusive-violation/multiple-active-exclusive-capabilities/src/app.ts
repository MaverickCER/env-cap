import "./startup.js"; // side-effect import: throws and halts startup if validation fails

// Never reached in this example: both postgres and mongodb ship active: true
// while sharing exclusiveGroup "database" (see both schemas), so
// generate:env -- which "start" always runs first -- fails at the manifest
// step before src/startup.js's validateEnv() ever runs, let alone this
// module's own top-level code. See README.md.
import { postgresEnv } from "../features/postgres/env.schema.js";
import { prismaEnv } from "../features/prisma/env.schema.js";

console.log(`Prisma provider: ${prismaEnv.DATABASE_PROVIDER}`);
console.log(`Database URL: ${postgresEnv.DATABASE_URL}`);
