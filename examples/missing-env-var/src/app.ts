import "./startup.js"; // side-effect import: throws and halts startup if validation fails

// Never reached in this example: the committed .env is missing payments'
// required STRIPE_KEY, so validateEnv() above always throws an aggregated
// EnvValidationError before this module's own top-level code runs -- not
// even databaseEnv.DATABASE_URL, which has nothing wrong with it, ever gets
// read. That's the point: one deterministic startup boundary validates every
// capability together, so a working contract doesn't get to run just because
// it wasn't the one that failed.
import { databaseEnv } from "../features/database/env.schema.js";
import { paymentsEnv } from "../features/payments/env.schema.js";

console.log(`Database URL: ${databaseEnv.DATABASE_URL}`);
console.log(`Stripe key: ${paymentsEnv.STRIPE_KEY}`);
